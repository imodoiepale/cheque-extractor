#!/usr/bin/env python3
"""
Which Gemini Flash model should Kyriq run? Measured on Kyriq's own tasks.

    set GEMINI_API_KEY=...            (PowerShell: $env:GEMINI_API_KEY = "...")
    python backend/bench_gemini_models.py                 # every Flash model your key can see
    python backend/bench_gemini_models.py --models gemini-3.8-flash,gemini-3.5-flash
    python backend/bench_gemini_models.py --n 15 --list   # --list: just show the models

The key is read from the environment and never printed or written anywhere.
Models are discovered from the API (models.list), so newer Flash models appear
without editing this file. Image-generation, audio, live and embedding variants
are skipped.

Ground truth never comes from a model:
  A  cheque fields   Each embedded cheque image on the three real PDFs has the
                     bank's own printed caption (check number, amount, date).
                     The production prompt (check_extractor.GEMINI_PROMPT) is run
                     on the image; checkNumber, amount and checkDate are scored.
  B  page kind       One word per page (statement / cheque-images / both / other),
                     scored against the rule-based classification.
  C  statement rows  The statement-row prompt on a rendered BofA page and a Bank
                     of the West page, scored (F1) against the text-layer parser.
                     Skipped if backend/statement_rows.py is not on this branch.

Reported per model: accuracy per task, median and p90 latency, errors, tokens.
"Best value" is the fastest model within 2 points of the top overall accuracy.
Sequential calls on purpose: latency is the thing being measured.
"""
import argparse
import base64
import io
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path

import pymupdf
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pdf_pages  # noqa: E402
import page_kinds  # noqa: E402

API = "https://generativelanguage.googleapis.com/v1beta"
SKIP = ("image", "tts", "audio", "live", "embedding", "aqa", "imagen", "veo", "robotics", "computer-use", "thinking-exp")
TESTFILES = Path(os.environ.get("KYRIQ_TESTFILES") or HERE.parent / "docs" / "testfiles")   # the four client PDFs


def api_key():
    key = os.environ.get("GEMINI_API_KEY") or (os.environ.get("GEMINI_API_KEYS", "").split(",")[0].strip())
    if not key:
        sys.exit("Set GEMINI_API_KEY in your shell first (it is not read from any file).")
    return key


def list_flash_models(key):
    out, token = [], None
    while True:
        r = requests.get(f"{API}/models", params={"pageSize": 200, **({"pageToken": token} if token else {})},
                         headers={"x-goog-api-key": key}, timeout=30)
        r.raise_for_status()
        data = r.json()
        for m in data.get("models", []):
            name = m["name"].split("/", 1)[1]
            if ("flash" in name and "generateContent" in m.get("supportedGenerationMethods", [])
                    and not any(s in name for s in SKIP)):
                out.append(name)
        token = data.get("nextPageToken")
        if not token:
            return sorted(set(out))


def call(key, model, prompt, png, max_tokens, retries=3):
    """(text, seconds, tokens) or (None, seconds, 0) on failure."""
    payload = {
        "contents": [{"parts": [{"inline_data": {"mime_type": "image/png", "data": base64.b64encode(png).decode()}},
                                {"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": max_tokens},
    }
    t0 = time.time()
    for attempt in range(retries):
        try:
            r = requests.post(f"{API}/models/{model}:generateContent", json=payload,
                              headers={"x-goog-api-key": key}, timeout=90)
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if r.status_code in (429, 500, 503):
            time.sleep(2 ** attempt * 2)
            continue
        if r.status_code >= 400:
            return None, time.time() - t0, 0
        d = r.json()
        try:
            text = d["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            return None, time.time() - t0, 0
        return text, time.time() - t0, d.get("usageMetadata", {}).get("totalTokenCount", 0)
    return None, time.time() - t0, 0


def parse_json(text):
    if not text:
        return None
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0]
    elif "```" in text:
        text = text.split("```")[1]
    try:
        return json.loads(text.strip())
    except ValueError:
        return None


def png_of(page, rect=None, dpi=200):
    pix = page.get_pixmap(dpi=dpi, clip=rect)
    return pix.tobytes("png")


# ── test sets ────────────────────────────────────────────────────────────────
def cheque_samples(n):
    """n captioned cheque crops from each of Chase, BofA and Bank of the West."""
    samples = []
    for fname in ("Apr Check Images.pdf", "3117 June.pdf", "9440 June.pdf"):
        path = str(TESTFILES / fname)
        pages = pdf_pages.read(path)
        pool = [(p["index"], rect, cap) for p in pages for rect, cap in pdf_pages.bind_captions(p) if cap["amount"]]
        step = max(1, len(pool) // n)
        doc = pymupdf.open(path)
        for idx, rect, cap in pool[::step][:n]:
            samples.append({"png": png_of(doc[idx], pymupdf.Rect(*rect)), "truth": cap, "src": fname})
    return samples


def digits(v):
    return re.sub(r"\D", "", str(v or "")).lstrip("0")


def norm_date(v):
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", str(v or ""))
    if m:
        mo, d, y = (int(x) for x in m.groups())
        return (mo, d, y % 100)
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", str(v or ""))
    return (int(m.group(2)), int(m.group(3)), int(m.group(1)) % 100) if m else None


def score_cheque(parsed, truth):
    """(number_ok, amount_ok, date_ok), each None when the truth has no value."""
    def amount(v):
        try:
            return round(abs(float(str(v).replace("$", "").replace(",", ""))), 2)
        except ValueError:
            return None
    got = parsed or {}
    return (
        None if not truth["check_number"] else digits(got.get("checkNumber")) == digits(truth["check_number"]),
        None if truth["amount"] is None else amount(got.get("amount")) == truth["amount"],
        None if not truth["date"] else norm_date(got.get("checkDate")) == norm_date(truth["date"]),
    )


def page_samples():
    """One of each kind, with the rule-based answer as truth."""
    out = []
    for fname, wanted in (("3117 June.pdf", {"statement": 5, "other": 1, "cheque-images": 15}),
                          ("9440 June.pdf", {"statement": 7, "other": 29, "cheque-images": 14})):
        path = str(TESTFILES / fname)
        pages = pdf_pages.read(path)
        kinds = page_kinds.classify_pages(pages, [len(pdf_pages.bind_captions(p)) for p in pages])
        doc = pymupdf.open(path)
        for kind, idx in wanted.items():
            if kinds[idx] == kind:
                out.append({"png": png_of(doc[idx], dpi=80), "truth": kind})
    return out


def row_samples():
    try:
        import statement_rows as sr
    except ImportError:
        return [], None
    out = []
    for fname, idx in (("3117 June.pdf", 5), ("9440 June.pdf", 7)):
        path = str(TESTFILES / fname)
        pages = pdf_pages.read(path)
        p = pages[idx]
        table, _ = sr.parse_page(p["words"], p["width"])
        doc = pymupdf.open(path)
        out.append({"png": png_of(doc[idx], dpi=130),
                    "truth": [(r["check_number"], r["amount"]) for r in table]})
    return out, sr


def f1(pred_rows, truth):
    from collections import Counter
    pred = Counter((r["check_number"], r["amount"]) for r in pred_rows)
    true = Counter(truth)
    hit = sum((pred & true).values())
    if not pred or not true or not hit:
        return 0.0
    p, r = hit / sum(pred.values()), hit / sum(true.values())
    return 2 * p * r / (p + r)


# ── run ──────────────────────────────────────────────────────────────────────
def bench(key, model, cheques, pages, rows, sr, prompt):
    lat, tokens, errors = [], 0, 0
    a = {"number": [], "amount": [], "date": []}
    for s in cheques:
        text, secs, tok = call(key, model, prompt, s["png"], 1024)
        lat.append(secs); tokens += tok
        parsed = parse_json(text)
        if text is None or parsed is None:
            errors += 1
        for k, ok in zip(a, score_cheque(parsed, s["truth"])):
            if ok is not None:
                a[k].append(bool(ok))
    b = []
    for s in pages:
        text, secs, tok = call(key, model, page_kinds.AI_PROMPT, s["png"], 16)
        tokens += tok
        errors += text is None
        b.append((text or "").strip().lower().strip(".'\" ") == s["truth"])
    c = []
    if sr:
        for s in rows:
            text, secs, tok = call(key, model, sr.AI_PROMPT, s["png"], 8192)
            tokens += tok
            errors += text is None
            c.append(f1(sr.parse_ai_rows(text), s["truth"]))
    pct = lambda xs: 100 * sum(xs) / len(xs) if xs else None
    return {
        "model": model,
        "number": pct(a["number"]), "amount": pct(a["amount"]), "date": pct(a["date"]),
        "page_kind": pct(b), "rows_f1": (100 * sum(c) / len(c)) if c else None,
        "median_s": statistics.median(lat) if lat else None,
        "p90_s": sorted(lat)[int(0.9 * (len(lat) - 1))] if lat else None,
        "errors": errors, "tokens": tokens,
    }


def overall(r):
    parts = [r[k] for k in ("number", "amount", "date", "page_kind", "rows_f1") if r[k] is not None]
    return sum(parts) / len(parts) if parts else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", help="comma-separated; default: every Flash model the key can see")
    ap.add_argument("--n", type=int, default=10, help="cheque images per PDF (3 PDFs)")
    ap.add_argument("--list", action="store_true", help="only list the models found")
    args = ap.parse_args()
    key = api_key()
    models = [m.strip() for m in args.models.split(",")] if args.models else list_flash_models(key)
    if args.list:
        print("\n".join(models)); return
    from check_extractor import GEMINI_PROMPT
    cheques, pages = cheque_samples(args.n), page_samples()
    rows, sr = row_samples()
    print(f"{len(models)} models; {len(cheques)} cheque images, {len(pages)} pages, {len(rows)} statement pages\n")

    results = []
    for m in models:
        print(f"... {m}", flush=True)
        results.append(bench(key, m, cheques, pages, rows, sr, GEMINI_PROMPT))

    fmt = lambda v: "  n/a" if v is None else f"{v:5.1f}"
    print(f"\n{'model':<34}{'num%':>6}{'amt%':>6}{'date%':>6}{'page%':>6}{'rowF1':>6}{'med s':>7}{'p90 s':>7}{'err':>4}{'tokens':>9}")
    for r in sorted(results, key=lambda r: -overall(r)):
        print(f"{r['model']:<34}{fmt(r['number'])}{fmt(r['amount'])}{fmt(r['date'])}{fmt(r['page_kind'])}{fmt(r['rows_f1'])}"
              f"{fmt(r['median_s']):>7}{fmt(r['p90_s']):>7}{r['errors']:>4}{r['tokens']:>9}")
    usable = [r for r in results if r["median_s"] is not None]
    if usable:
        top = max(overall(r) for r in usable)
        value = min((r for r in usable if overall(r) >= top - 2), key=lambda r: r["median_s"])
        best = max(usable, key=overall)
        print(f"\nMost accurate overall: {best['model']} ({overall(best):.1f})")
        print(f"Best value (fastest within 2 points of the top): {value['model']} ({overall(value):.1f}, median {value['median_s']:.1f}s)")
    Path("bench_gemini_results.json").write_text(json.dumps(results, indent=1))
    print("full results: bench_gemini_results.json (no keys inside)")


if __name__ == "__main__":
    main()
