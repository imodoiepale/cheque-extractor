"""
OCR Lab: run one document through several extraction engines side by side.

Admin-only test bench (api_server.py /api/lab/run). It never touches a
customer's jobs, checks or usage ledger: the file lives in memory for the
request and the result goes back to the caller.

Engines, each `run(data, mime, doc_type) -> dict` with the same shape:
  gemini     Gemini Flash, the production engine (same keys and model).
  chandra    Datalab hosted API (Chandra OCR). DATALAB_API_KEY.
  razor      Razor Extract, bank statements only. RAZOR_EXTRACT_API_KEY.
  unlimited  Baidu Unlimited-OCR on a self-hosted vLLM (OpenAI-compatible).
             UNLIMITED_OCR_URL (+ optional UNLIMITED_OCR_API_KEY).

Engines that return markdown (chandra, unlimited) are structured into the
same JSON as Gemini by one text-only Gemini call, so the comparison is about
what each engine *read*, not about who formats JSON best.

ponytail: results are not persisted. Upgrade path: a lab_runs table if the
team wants run history; the result dict is already JSON-serialisable.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

import requests

from check_extractor import GEMINI_KEYS, GEMINI_PROMPT

GEMINI_MODEL = os.getenv("LAB_GEMINI_MODEL", "gemini-2.0-flash")
POLL_SECONDS = 2.5
POLL_TIMEOUT = float(os.getenv("LAB_POLL_TIMEOUT", "240"))

STATEMENT_PROMPT = """You are reading a bank statement. Return ONLY a JSON object:
{
  "bank_name": string|null,
  "account_last4": string|null,
  "period_start": "MM/DD/YYYY"|null,
  "period_end": "MM/DD/YYYY"|null,
  "opening_balance": number|null,
  "closing_balance": number|null,
  "transactions": [
    {"date": "MM/DD/YYYY", "description": string, "check_number": string|null,
     "amount": number, "balance": number|null}
  ]
}
Withdrawals and checks are negative amounts, deposits positive. Include every
transaction on every page. Put a check number in check_number whenever the
line is a check (e.g. "CHECK 1042" or a checks-paid table)."""

ENGINES = ("gemini", "chandra", "razor", "unlimited")


# ── helpers ──────────────────────────────────────────────────────────────

def _json_from_text(text: str):
    """First JSON object in a model reply (models wrap it in ``` fences)."""
    text = (text or "").strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def _gemini(parts: list, max_tokens: int = 8192) -> str:
    if not GEMINI_KEYS:
        raise RuntimeError("GEMINI_API_KEYS is not set")
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": max_tokens},
    }
    last = None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    for key in GEMINI_KEYS:
        # Key in a header, not the query string, so it never lands in an error message.
        r = requests.post(url, json=payload, headers={"x-goog-api-key": key}, timeout=120)
        if r.status_code in (400, 403, 429):
            last = f"Gemini {r.status_code}: {(r.json().get('error') or {}).get('message', '')[:160]}"
            continue
        r.raise_for_status()
        cands = r.json().get("candidates") or []
        return "".join(p.get("text", "") for p in (cands[0]["content"].get("parts", []) if cands else []))
    raise RuntimeError(last or "Gemini failed on every key")


def _prompt(doc_type: str) -> str:
    return GEMINI_PROMPT if doc_type == "check" else STATEMENT_PROMPT


def _structure(markdown: str, doc_type: str):
    """Turn an engine's markdown into the Gemini JSON shape (text-only call)."""
    if not markdown.strip():
        return None
    return _json_from_text(_gemini([{"text": _prompt(doc_type) + "\n\nDocument text:\n" + markdown[:200_000]}]))


def _poppler_path():
    here = os.path.dirname(os.path.abspath(__file__))
    p = os.path.join(here, "poppler", "poppler-23.11.0", "Library", "bin")
    return p if os.path.isdir(p) else None


def _page_images(data: bytes, mime: str, dpi: int = 200) -> list[bytes]:
    if mime != "application/pdf":
        return [data]
    from pdf2image import convert_from_bytes
    pages = convert_from_bytes(data, dpi=dpi, poppler_path=_poppler_path())
    out = []
    for page in pages:
        buf = io.BytesIO()
        page.save(buf, format="PNG")
        out.append(buf.getvalue())
    return out


def _poll(url: str, headers: dict, done: Callable[[dict], bool], failed: Callable[[dict], bool]) -> dict:
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        body = r.json()
        if done(body):
            return body
        if failed(body):
            raise RuntimeError(body.get("error") or body.get("message") or "engine reported failure")
        time.sleep(POLL_SECONDS)
    raise TimeoutError(f"no result after {int(POLL_TIMEOUT)}s")


# ── engines ──────────────────────────────────────────────────────────────

def run_gemini(data: bytes, mime: str, doc_type: str) -> dict:
    # Gemini takes PDFs and images inline, so no rasterising here.
    text = _gemini([{"inline_data": {"mime_type": mime, "data": base64.b64encode(data).decode()}},
                    {"text": _prompt(doc_type)}])
    return {"raw": text, "fields": _json_from_text(text), "cost_usd": None}


def run_chandra(data: bytes, mime: str, doc_type: str) -> dict:
    key = os.getenv("DATALAB_API_KEY", "").strip()
    if not key:
        raise RuntimeError("DATALAB_API_KEY is not set")
    headers = {"X-API-Key": key}
    r = requests.post(
        "https://www.datalab.to/api/v1/convert",
        headers=headers,
        files={"file": ("document", data, mime)},
        data={"output_format": "markdown", "mode": os.getenv("DATALAB_MODE", "accurate")},
        timeout=60,
    )
    r.raise_for_status()
    first = r.json()
    body = first if first.get("status") == "complete" else _poll(
        first["request_check_url"], headers,
        done=lambda b: b.get("status") == "complete",
        failed=lambda b: b.get("status") == "failed" or bool(b.get("error")),
    )
    markdown = body.get("markdown") or ""
    cost = body.get("cost_breakdown") or {}
    cents = sum(v for v in cost.values() if isinstance(v, (int, float))) if isinstance(cost, dict) else None
    return {
        "raw": markdown,
        "fields": _structure(markdown, doc_type),
        "cost_usd": (cents / 100) if cents is not None else None,
        "meta": {"pages": body.get("page_count"), "parse_quality": body.get("parse_quality_score")},
    }


def run_razor(data: bytes, mime: str, doc_type: str) -> dict:
    if doc_type == "check":
        raise RuntimeError("Razor Extract reads bank statements, not single checks")
    key = os.getenv("RAZOR_EXTRACT_API_KEY", "").strip()
    if not key:
        raise RuntimeError("RAZOR_EXTRACT_API_KEY is not set")
    base = os.getenv("RAZOR_EXTRACT_URL", "https://api.razorextract.com").rstrip("/")
    headers = {"x-rzx-api-key": key}
    r = requests.post(f"{base}/api/v1/extract", headers=headers,
                      files={"file": ("statement.pdf", data, mime)}, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"Razor Extract {r.status_code}: {r.text[:300]}")
    job_id = r.json()["job_id"]
    _poll(f"{base}/api/v1/status/{job_id}", headers,
          done=lambda b: b.get("status") == "completed",
          failed=lambda b: b.get("status") == "failed")
    result = requests.get(f"{base}/api/v1/result/{job_id}", headers=headers, timeout=30)
    result.raise_for_status()
    urls = result.json()
    json_url = urls.get("processed_json_url") or urls.get("raw_json_url")
    processed = requests.get(json_url, timeout=60).json() if json_url else None
    return {"raw": processed, "fields": {"transactions": _razor_transactions(processed)},
            "cost_usd": None, "meta": {"job_id": job_id}}


def _razor_transactions(processed) -> list:
    """Map Razor's rows onto our transaction shape. Their column names vary by
    bank, so match loosely and keep the original row alongside."""
    rows = processed
    if isinstance(processed, dict):
        rows = next((v for v in processed.values() if isinstance(v, list)), [])
    out = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        low = {str(k).lower(): v for k, v in row.items()}
        pick = lambda *names: next((low[n] for n in names if n in low and low[n] not in (None, "")), None)
        debit, credit = _num(pick("debit", "withdrawal", "withdrawals")), _num(pick("credit", "deposit", "deposits"))
        amount = _num(pick("amount"))
        if amount is None and (debit or credit):
            amount = (credit or 0) - (debit or 0)
        desc = pick("description", "narration", "particulars", "details") or ""
        cheque = pick("check_number", "cheque_number", "chq/ref no", "ref no", "reference")
        if not cheque:
            m = re.search(r"\b(?:check|chk|cheque)\s*#?\s*(\d{3,6})\b", str(desc), re.I)
            cheque = m.group(1) if m else None
        out.append({"date": pick("date", "txn date", "transaction date", "value date"), "description": desc,
                    "check_number": cheque, "amount": amount, "balance": _num(pick("balance", "running balance"))})
    return out


def _num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("$", "").strip()
    neg = s.startswith("(") and s.endswith(")")
    try:
        n = float(s.strip("()"))
    except ValueError:
        return None
    return -n if neg else n


def run_unlimited(data: bytes, mime: str, doc_type: str) -> dict:
    url = os.getenv("UNLIMITED_OCR_URL", "").strip().rstrip("/")
    if not url:
        raise RuntimeError("UNLIMITED_OCR_URL is not set (self-hosted vLLM endpoint)")
    headers = {"Content-Type": "application/json"}
    if os.getenv("UNLIMITED_OCR_API_KEY"):
        headers["Authorization"] = f"Bearer {os.getenv('UNLIMITED_OCR_API_KEY')}"
    pages = []
    for img in _page_images(data, mime):
        body = {
            "model": os.getenv("UNLIMITED_OCR_MODEL", "baidu/Unlimited-OCR"),
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(img).decode()}},
                {"type": "text", "text": "Convert the document to markdown."},
            ]}],
            "temperature": 0,
        }
        r = requests.post(f"{url}/v1/chat/completions", headers=headers, json=body, timeout=180)
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"] or ""
        pages.append(re.sub(r"<\|det\|>.*?<\|/det\|>|<\|[^|>]+\|>", "", text, flags=re.S))
    markdown = "\n\n".join(pages)
    return {"raw": markdown, "fields": _structure(markdown, doc_type), "cost_usd": None, "meta": {"pages": len(pages)}}


RUNNERS: dict[str, Callable[[bytes, str, str], dict]] = {
    "gemini": run_gemini, "chandra": run_chandra, "razor": run_razor, "unlimited": run_unlimited,
}


def _timed(engine: str, data: bytes, mime: str, doc_type: str) -> dict:
    t0 = time.perf_counter()
    try:
        out = RUNNERS[engine](data, mime, doc_type)
        out.update(engine=engine, ok=True, error=None)
    except Exception as e:  # one engine failing must not hide the others
        out = {"engine": engine, "ok": False, "error": str(e)[:500], "raw": None, "fields": None, "cost_usd": None}
    out["latency_ms"] = int((time.perf_counter() - t0) * 1000)
    out["summary"] = summarize(out.get("fields"), doc_type)
    return out


def summarize(fields, doc_type: str) -> dict | None:
    """Small, comparable numbers per engine."""
    if not isinstance(fields, dict):
        return None
    if doc_type == "check":
        keys = ["payee", "amount", "checkDate", "checkNumber", "bankName", "memo", "micr_routing", "micr_account"]
        return {"filled": sum(1 for k in keys if fields.get(k) not in (None, "", "null")), "of": len(keys)}
    tx = [t for t in fields.get("transactions") or [] if isinstance(t, dict)]
    amounts = [a for a in (_num(t.get("amount")) for t in tx) if a is not None]
    return {
        "transactions": len(tx),
        "checks": sum(1 for t in tx if t.get("check_number")),
        "net_total": round(sum(amounts), 2),
    }


def compare(results: list[dict], doc_type: str, baseline: str = "gemini") -> dict:
    """Agreement of each engine with the baseline (Gemini, today's production)."""
    base = next((r for r in results if r["engine"] == baseline and r["ok"]), None)
    if not base or not isinstance(base.get("fields"), dict):
        return {}
    out = {}
    for r in results:
        if r is base or not isinstance(r.get("fields"), dict):
            continue
        if doc_type == "check":
            keys = ["payee", "amount", "checkDate", "checkNumber"]
            norm = lambda v: re.sub(r"[^a-z0-9.]", "", str(v or "").lower())
            same = [k for k in keys if norm(base["fields"].get(k)) and norm(base["fields"].get(k)) == norm(r["fields"].get(k))]
            out[r["engine"]] = {"agree": same, "of": keys}
        else:
            key = lambda t: (str(t.get("check_number") or ""), round(_num(t.get("amount")) or 0, 2))
            a = {key(t) for t in base["fields"].get("transactions") or [] if isinstance(t, dict)}
            b = {key(t) for t in r["fields"].get("transactions") or [] if isinstance(t, dict)}
            out[r["engine"]] = {"shared": len(a & b), "only_baseline": len(a - b), "only_engine": len(b - a)}
    return out


def run_lab(data: bytes, mime: str, doc_type: str, engines: list[str]) -> dict:
    engines = [e for e in engines if e in RUNNERS] or ["gemini"]
    with ThreadPoolExecutor(max_workers=len(engines)) as pool:
        results = list(pool.map(lambda e: _timed(e, data, mime, doc_type), engines))
    return {"doc_type": doc_type, "results": results, "agreement": compare(results, doc_type)}


if __name__ == "__main__":
    # Self-check: the pure parts (no network). python backend/ocr_lab.py
    assert _json_from_text('```json\n{"a": 1}\n```') == {"a": 1}
    assert _num("(1,234.50)") == -1234.5 and _num("$12") == 12.0
    tx = _razor_transactions({"rows": [{"Date": "08/12/26", "Description": "CHECK 1041", "Debit": "1,284.60"}]})
    assert tx[0]["check_number"] == "1041" and tx[0]["amount"] == -1284.6, tx
    s = summarize({"transactions": tx}, "statement")
    assert s == {"transactions": 1, "checks": 1, "net_total": -1284.6}, s
    res = [{"engine": "gemini", "ok": True, "fields": {"transactions": tx}},
           {"engine": "razor", "ok": True, "fields": {"transactions": tx + [{"amount": 5}]}}]
    assert compare(res, "statement")["razor"] == {"shared": 1, "only_baseline": 0, "only_engine": 1}
    print("ocr_lab self-check passed")
