"""
Kyriq Voice: a conversational agent over a firm's own reconciliation data.

    POST /chat   {messages: [{role, content}], speak?: bool}
                 Authorization: Bearer <user's Supabase access token>
    ->           {reply, tools: [{name, args, rows}], audio: base64 mp3 | null}

Self-contained on purpose (own Dockerfile, no import from backend/), so it can
run on Railway today and move to a VPS unchanged.

Isolation: every tool queries Supabase PostgREST with the CALLER's token and
the anon key, never the service role, so row-level security (tenant_id =
user_tenant_id()) decides what the agent can see. The tools are read-only;
nothing here can approve, clear or change a check.

Run locally:  uvicorn app:app --port 3095   (env: see README in this folder)
"""
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SB_ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
MODEL = os.environ.get("VOICE_MODEL", "gpt-4.1-mini")
FISH_KEY = os.environ.get("FISH_AUDIO_API_KEY", "")
FISH_VOICE = os.environ.get("FISH_VOICE_ID", "")
MAX_TOOL_ROUNDS = 4

app = FastAPI(title="Kyriq Voice")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("VOICE_CORS_ORIGINS", "").split(",") if o],
    allow_methods=["POST"],
    allow_headers=["Authorization", "Content-Type"],
)
_llm = OpenAI() if os.environ.get("OPENAI_API_KEY") else None


# ── Auth ───────────────────────────────────────────────────────────────────
_auth_cache: dict[str, tuple[float, dict]] = {}


def _user(token: str) -> dict:
    """Live session check against Supabase Auth (works for any signing key type)."""
    hit = _auth_cache.get(token)
    if hit and hit[0] > time.time():
        return hit[1]
    r = requests.get(f"{SB_URL}/auth/v1/user", headers={"Authorization": f"Bearer {token}", "apikey": SB_ANON}, timeout=8)
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")
    user = r.json()
    if len(_auth_cache) > 5000:
        _auth_cache.clear()
    _auth_cache[token] = (time.time() + 60, user)
    return user


# ── Tools: read-only, as the caller ────────────────────────────────────────
CHECK_COLS = "check_number,payee,amount,check_date,status,confidence_summary,job_id"


def _rest(token: str, path: str, params: dict[str, str]) -> list[dict]:
    r = requests.get(
        f"{SB_URL}/rest/v1/{path}",
        params=params,
        headers={"Authorization": f"Bearer {token}", "apikey": SB_ANON},
        timeout=15,
    )
    if r.status_code >= 400:
        return [{"error": f"{path}: {r.status_code}"}]
    return r.json()


def search_checks(token: str, payee: str | None = None, check_number: str | None = None,
                  amount_min: float | None = None, amount_max: float | None = None,
                  date_from: str | None = None, date_to: str | None = None,
                  status: str | None = None, limit: int = 10) -> list[dict]:
    """Builds the PostgREST filter from whatever the user asked for.
    ponytail: structured filters only, no free-form SQL. Upgrade path is a
    read-only Postgres role over tenant views with a statement_timeout."""
    p: dict[str, str] = {"select": CHECK_COLS, "order": "check_date.desc.nullslast", "limit": str(max(1, min(int(limit), 50)))}
    if payee:
        p["payee"] = f"ilike.*{payee.replace('*', '')}*"
    if check_number:
        p["check_number"] = f"eq.{check_number}"
    if status:
        p["status"] = f"eq.{status}"
    rng = []
    if amount_min is not None:
        rng.append(f"amount.gte.{float(amount_min)}")
    if amount_max is not None:
        rng.append(f"amount.lte.{float(amount_max)}")
    if date_from:
        rng.append(f"check_date.gte.{date_from}")
    if date_to:
        rng.append(f"check_date.lte.{date_to}")
    if rng:
        p["and"] = f"({','.join(rng)})"
    return _rest(token, "checks", p)


def get_check(token: str, check_number: str) -> list[dict]:
    return _rest(token, "checks", {
        "select": f"{CHECK_COLS},memo,bank_name,matches(confidence_score,status,discrepancy_type,discrepancy_amount,flagged_reason)",
        "check_number": f"eq.{check_number}",
        "limit": "5",
    })


def summarize(token: str) -> list[dict]:
    """Counts by match result. ponytail: counts client-side over up to 5,000
    rows; switch to a GROUP BY RPC when a firm outgrows that."""
    rows = _rest(token, "matches", {"select": "status,confidence_score", "limit": "5000"})
    if rows and "error" in rows[0]:
        return rows
    out: dict[str, Any] = {"total": len(rows), "by_status": {}, "exact_100": 0, "below_90": 0}
    for r in rows:
        out["by_status"][r["status"]] = out["by_status"].get(r["status"], 0) + 1
        score = float(r.get("confidence_score") or 0)
        out["exact_100"] += score >= 100
        out["below_90"] += score < 90
    return [out]


def list_issues(token: str, kind: str = "discrepancy", limit: int = 10) -> list[dict]:
    sel = "confidence_score,status,discrepancy_type,discrepancy_amount,flagged_reason,checks(check_number,payee,amount,check_date)"
    p = {"select": sel, "limit": str(max(1, min(int(limit), 50))), "order": "confidence_score.asc"}
    if kind == "low_confidence":
        p["confidence_score"] = "lt.90"
    elif kind in ("discrepancy", "flagged", "unmatched", "pending"):
        p["status"] = f"eq.{kind}"
    return _rest(token, "matches", p)


TOOLS = {"search_checks": search_checks, "get_check": get_check, "summarize": summarize, "list_issues": list_issues}

TOOL_SCHEMAS = [
    {"type": "function", "function": {
        "name": "search_checks",
        "description": "Find the firm's checks by any mix of payee (partial), check number, amount range, date range (YYYY-MM-DD) and review status.",
        "parameters": {"type": "object", "properties": {
            "payee": {"type": "string"}, "check_number": {"type": "string"},
            "amount_min": {"type": "number"}, "amount_max": {"type": "number"},
            "date_from": {"type": "string"}, "date_to": {"type": "string"},
            "status": {"type": "string", "enum": ["pending_review", "approved", "rejected", "exported", "duplicate", "error"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 50}}}}},
    {"type": "function", "function": {
        "name": "get_check",
        "description": "Full details of one check by its number, including its QuickBooks match score, status and any discrepancy.",
        "parameters": {"type": "object", "properties": {"check_number": {"type": "string"}}, "required": ["check_number"]}}},
    {"type": "function", "function": {
        "name": "summarize",
        "description": "Counts of the firm's matches by status, how many are exact (100%) and how many score below 90%.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "list_issues",
        "description": "Matches that need attention: discrepancies, flagged, unmatched, pending, or low confidence (below 90%).",
        "parameters": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ["discrepancy", "flagged", "unmatched", "pending", "low_confidence"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 50}}}}},
]

SYSTEM = (
    "You are Kyriq Voice, a reconciliation assistant for a bookkeeping firm. Answer only from tool results; "
    "never invent checks, amounts or counts. Replies are spoken aloud: keep them to two or three short sentences, "
    "say amounts like 'twelve hundred eighty-four dollars and sixty cents' only when asked to read a check, otherwise "
    "use plain numbers. You can look things up but cannot approve, clear or change anything; if asked to, say the "
    "user can do it on the Review screen. If a tool returns an error, say you could not reach the data."
)


# ── TTS ────────────────────────────────────────────────────────────────────
def _speak(text: str) -> str | None:
    if not FISH_KEY:
        return None  # the browser falls back to speechSynthesis
    body: dict[str, Any] = {"text": text, "format": "mp3"}
    if FISH_VOICE:
        body["reference_id"] = FISH_VOICE
    try:
        r = requests.post("https://api.fish.audio/v1/tts", json=body,
                          headers={"Authorization": f"Bearer {FISH_KEY}", "model": "s1"}, timeout=30)
        return base64.b64encode(r.content).decode() if r.status_code == 200 else None
    except requests.RequestException:
        return None


# ── Endpoint ───────────────────────────────────────────────────────────────
class Msg(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    messages: list[Msg]
    speak: bool = True


@app.get("/health")
def health():
    return {"ok": True, "llm": bool(_llm), "tts": bool(FISH_KEY)}


@app.post("/chat")
def chat(body: ChatIn, request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing session")
    token = auth[7:]
    _user(token)
    if not _llm:
        raise HTTPException(503, "OPENAI_API_KEY is not configured")

    # ponytail: history comes from the client (last 12 turns); persistent
    # per-tenant memory (memory_entities / memory_edges in Supabase) is next.
    msgs: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM}]
    msgs += [{"role": m.role, "content": m.content[:2000]} for m in body.messages[-12:] if m.role in ("user", "assistant")]

    used: list[dict] = []
    for _ in range(MAX_TOOL_ROUNDS):
        try:
            resp = _llm.chat.completions.create(model=MODEL, messages=msgs, tools=TOOL_SCHEMAS, temperature=0.2)
        except Exception as e:  # quota, auth or network: say so instead of a 500
            raise HTTPException(503, f"The AI provider is unavailable ({type(e).__name__}). Check the OpenAI key and credits.")
        msg = resp.choices[0].message
        if not msg.tool_calls:
            reply = (msg.content or "").strip()
            return {"reply": reply, "tools": used, "audio": _speak(reply) if body.speak else None}
        msgs.append({"role": "assistant", "content": msg.content, "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            fn = TOOLS.get(tc.function.name)
            try:
                args = json.loads(tc.function.arguments or "{}")
                result = fn(token, **args) if fn else [{"error": "unknown tool"}]
            except (TypeError, ValueError) as e:
                result = [{"error": f"bad arguments: {e}"}]
            used.append({"name": tc.function.name, "args": args if fn else {}, "rows": result[:20]})
            msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result[:20], default=str)})
    return {"reply": "That took too many lookups. Could you ask a narrower question?", "tools": used, "audio": None}
