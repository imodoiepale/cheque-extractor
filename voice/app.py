"""
Kyriq Voice: a conversational reconciliation agent over a firm's own data.

    POST /chat   {messages: [{role, content}], speak?: bool, focus?: {check_number}}
                 Authorization: Bearer <user's Supabase access token>
    ->           {reply, tools, actions, audio}

Three kinds of tools:
  LOOK UP  search_checks, get_check, summarize, list_issues. Read-only
           PostgREST calls made with the CALLER's token, so RLS scopes them to
           the caller's firm.
  SHOW     show_check, show_list, next_check, previous_check. They only drive
           the screen (actions returned to the browser).
  PROPOSE  approve_match, approve_all_exact, flag_check, generate_report. They
           change nothing here. The browser shows a confirmation card, and only
           the user's click calls the app's own approve / flag / report routes
           under the user's session and role. The agent can never mutate data.

Self-contained (own Dockerfile, no import from backend/) so it can run on
Railway today and move to a VPS unchanged. Conversation design: SCRIPT.md.
"""
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any, Callable

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
FISH_MODEL = os.environ.get("FISH_MODEL", "s2.1-pro")  # s2.1-pro-free works without API credit

# Curated Fish Audio voices users can pick from. Server-side allowlist: a
# voice id from the client is only used if it is on this list. Celebrity
# imitations from the public library are deliberately excluded.
VOICES = [
    {"id": "536d3a5e000945adb7038665781a4aca", "name": "Ethan", "gender": "male", "style": "Calm, clear, professional"},
    {"id": "c5f56a6cc2ec4fa8920cb4c5889a3fb7", "name": "Slax", "gender": "male", "style": "Precise and measured"},
    {"id": "bf322df2096a46f18c579d0baa36f41d", "name": "Adrian", "gender": "male", "style": "Deep, steady narrator"},
    {"id": "0b74ead073f2474a904f69033535b98e", "name": "Calm", "gender": "male", "style": "Warm and gentle"},
    {"id": "933563129e564b19a115bedd57b7406a", "name": "Sarah", "gender": "female", "style": "Soft and conversational"},
    {"id": "0af969cba6c24e74b5600d6df78e8975", "name": "Narration", "gender": "female", "style": "Authoritative, documentary"},
    {"id": "2a9605eeafe84974b5b20628d42c0060", "name": "Serene", "gender": "female", "style": "Calm, smooth, friendly"},
    {"id": "e107ce68d2a64e928c3a674781ce9d56", "name": "Upbeat", "gender": "female", "style": "Bright and confident"},
]
_VOICE_IDS = {v["id"] for v in VOICES}
DEFAULT_VOICE = FISH_VOICE if FISH_VOICE in _VOICE_IDS else VOICES[0]["id"]
MAX_TOOL_ROUNDS = 5

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


# ── Data access: read-only, as the caller ──────────────────────────────────
# Live checks columns (the live table differs from 001_schema.sql: no job_id,
# check_id or amount_written; the image is file_url).
CHECK_COLS = "id,check_number,payee,amount,check_date,status,confidence_summary,file_url,batch_id"
DETAIL_COLS = (
    f"{CHECK_COLS},memo,bank_name,payee_confidence,amount_confidence,"
    "check_date_confidence,check_number_confidence,"
    "matches(id,confidence_score,status,discrepancy_type,discrepancy_amount,flagged_reason)"
)
ISSUE_SELECT = (
    "id,confidence_score,status,discrepancy_type,discrepancy_amount,flagged_reason,"
    "checks(id,check_number,payee,amount,check_date,file_url)"
)


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


def _limit(n: Any, cap: int = 50) -> str:
    try:
        return str(max(1, min(int(n), cap)))
    except (TypeError, ValueError):
        return "10"


def search_checks(token: str, payee: str | None = None, check_number: str | None = None,
                  amount_min: float | None = None, amount_max: float | None = None,
                  date_from: str | None = None, date_to: str | None = None,
                  status: str | None = None, limit: int = 10) -> list[dict]:
    """Builds the PostgREST filter from whatever the user asked for.
    ponytail: structured filters only, no free-form SQL. Upgrade path is a
    read-only Postgres role over tenant views with a statement_timeout."""
    p: dict[str, str] = {"select": CHECK_COLS, "order": "check_date.desc.nullslast", "limit": _limit(limit)}
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
    return _rest(token, "checks", {"select": DETAIL_COLS, "check_number": f"eq.{check_number}", "limit": "5"})


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
    p = {"select": ISSUE_SELECT, "limit": _limit(limit), "order": "confidence_score.asc"}
    if kind == "low_confidence":
        p["confidence_score"] = "lt.90"
    elif kind == "exact":
        p["confidence_score"] = "gte.100"
        p["order"] = "created_at.desc"
    elif kind in ("discrepancy", "flagged", "unmatched", "pending", "matched", "approved"):
        p["status"] = f"eq.{kind}"
    return _rest(token, "matches", p)


# ── SHOW and PROPOSE: return actions for the browser, change nothing ───────
class _Act:
    """Collects the actions a turn produces; each tool call appends to it."""

    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, kind: str, **data: Any) -> dict:
        self.items.append({"kind": kind, **data})
        return {"ok": True, "shown_to_user": kind}


def _check_card(token: str, check_number: str) -> dict | None:
    rows = get_check(token, check_number)
    return rows[0] if rows and "error" not in rows[0] else None


def show_check(token: str, act: _Act, check_number: str) -> list[dict]:
    card = _check_card(token, check_number)
    if not card:
        return [{"error": f"no check {check_number} in this firm"}]
    act.add("show_check", check=card)
    return [card]


def show_list(token: str, act: _Act, kind: str = "discrepancy", limit: int = 20) -> list[dict]:
    rows = list_issues(token, kind, limit)
    if rows and "error" in rows[0]:
        return rows
    act.add("show_list", title=_LIST_TITLES.get(kind, kind), list_kind=kind, rows=rows)
    return [{"count": len(rows), "first": rows[0] if rows else None}]


def next_check(token: str, act: _Act) -> list[dict]:
    return [act.add("nav", direction="next")]


def previous_check(token: str, act: _Act) -> list[dict]:
    return [act.add("nav", direction="previous")]


def approve_match(token: str, act: _Act, check_number: str) -> list[dict]:
    card = _check_card(token, check_number)
    match = (card or {}).get("matches") or []
    match = match[0] if isinstance(match, list) and match else (match or None)
    if not card or not match:
        return [{"error": f"check {check_number} has no match to approve"}]
    act.add("confirm", action="approve_match", matchId=match["id"],
            label=f"Approve check #{check_number} to {card.get('payee') or 'unknown payee'} for ${float(card.get('amount') or 0):,.2f} ({float(match.get('confidence_score') or 0):.0f}% match)")
    return [{"proposed": True, "awaiting_user_confirmation": True}]


def approve_all_exact(token: str, act: _Act) -> list[dict]:
    exact = list_issues(token, "exact", 1000)
    exact = [m for m in exact if "error" not in m and m.get("status") not in ("approved",)]
    if not exact:
        return [{"proposed": False, "reason": "no unapproved 100% matches"}]
    act.add("confirm", action="approve_all_exact", minConfidence=100,
            label=f"Approve all {len(exact)} exact (100%) matches together")
    return [{"proposed": True, "count": len(exact), "awaiting_user_confirmation": True}]


def flag_check(token: str, act: _Act, check_number: str, reason: str) -> list[dict]:
    card = _check_card(token, check_number)
    match = (card or {}).get("matches") or []
    match = match[0] if isinstance(match, list) and match else (match or None)
    if not match:
        return [{"error": f"check {check_number} has no match to flag"}]
    act.add("confirm", action="flag", matchId=match["id"], reason=reason[:200],
            label=f"Flag check #{check_number}: {reason[:120]}")
    return [{"proposed": True, "awaiting_user_confirmation": True}]


_LIST_TITLES = {
    "discrepancy": "Discrepancies", "flagged": "Flagged", "unmatched": "Unmatched", "pending": "Pending review",
    "low_confidence": "Below 90% confidence", "exact": "Exact (100%) matches", "matched": "Matched", "approved": "Approved",
}
_REPORTS = {
    "discrepancies": ("Discrepancy report", "discrepancy"),
    "needs_attention": ("Needs-attention report", "low_confidence"),
    "exact_matches": ("Exact-match report", "exact"),
    "approved": ("Approved checks report", "approved"),
    "flagged": ("Flagged checks report", "flagged"),
}


def generate_report(token: str, act: _Act, report: str = "needs_attention", email: bool = False) -> list[dict]:
    """Rows come from the database; the browser renders the PDF (jsPDF) and,
    on confirmation, emails it to the signed-in user only."""
    title, kind = _REPORTS.get(report, _REPORTS["needs_attention"])
    rows = list_issues(token, kind, 1000)
    if rows and "error" in rows[0]:
        return rows
    summary = summarize(token)[0]
    act.add("report", report=report, title=title, rows=rows, summary=summary, email=bool(email))
    return [{"rows": len(rows), "title": title, "email": bool(email)}]


Tool = Callable[..., list[dict]]
READ_TOOLS: dict[str, Tool] = {"search_checks": search_checks, "get_check": get_check, "summarize": summarize, "list_issues": list_issues}
ACT_TOOLS: dict[str, Tool] = {
    "show_check": show_check, "show_list": show_list, "next_check": next_check, "previous_check": previous_check,
    "approve_match": approve_match, "approve_all_exact": approve_all_exact, "flag_check": flag_check,
    "generate_report": generate_report,
}
TOOLS: dict[str, Tool] = {**READ_TOOLS, **ACT_TOOLS}

_KINDS = ["discrepancy", "flagged", "unmatched", "pending", "low_confidence", "exact", "matched", "approved"]


def _fn(name: str, description: str, props: dict | None = None, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {"name": name, "description": description, "parameters": {
        "type": "object", "properties": props or {}, **({"required": required} if required else {})}}}


TOOL_SCHEMAS = [
    _fn("search_checks", "Find the firm's checks by any mix of payee (partial), check number, amount range, date range (YYYY-MM-DD) and review status.", {
        "payee": {"type": "string"}, "check_number": {"type": "string"},
        "amount_min": {"type": "number"}, "amount_max": {"type": "number"},
        "date_from": {"type": "string"}, "date_to": {"type": "string"},
        "status": {"type": "string", "enum": ["pending_review", "approved", "rejected", "exported", "duplicate", "error"]},
        "limit": {"type": "integer", "minimum": 1, "maximum": 50}}),
    _fn("get_check", "Full details of one check by number: extracted fields with confidences, and its QuickBooks match score, status and discrepancy.",
        {"check_number": {"type": "string"}}, ["check_number"]),
    _fn("summarize", "Counts of the firm's matches by status, how many are exact (100%) and how many are below 90%."),
    _fn("list_issues", "Matches by category: discrepancy, flagged, unmatched, pending, low_confidence (<90%), exact (100%), matched, approved.", {
        "kind": {"type": "string", "enum": _KINDS}, "limit": {"type": "integer", "minimum": 1, "maximum": 50}}),
    _fn("show_check", "Put one check on screen: its image and extracted fields. Use whenever the user wants to see, open, pull up or read a check.",
        {"check_number": {"type": "string"}}, ["check_number"]),
    _fn("show_list", "Put a list of checks on screen so the user can step through them with next/previous.", {
        "kind": {"type": "string", "enum": _KINDS}, "limit": {"type": "integer", "minimum": 1, "maximum": 50}}),
    _fn("next_check", "Move the on-screen list to the next check."),
    _fn("previous_check", "Move the on-screen list to the previous check."),
    _fn("approve_match", "PROPOSE approving one check's match. Shows a confirmation card; nothing changes unless the user confirms.",
        {"check_number": {"type": "string"}}, ["check_number"]),
    _fn("approve_all_exact", "PROPOSE approving every unapproved 100% match together. Shows a confirmation card; nothing changes unless the user confirms."),
    _fn("flag_check", "PROPOSE flagging a check's match for review with a reason. Shows a confirmation card.",
        {"check_number": {"type": "string"}, "reason": {"type": "string"}}, ["check_number", "reason"]),
    _fn("generate_report", "Build a PDF report on screen (downloadable); with email=true, offer to email it to the signed-in user.", {
        "report": {"type": "string", "enum": list(_REPORTS)}, "email": {"type": "boolean"}}),
]

_SCRIPT = os.path.join(os.path.dirname(__file__), "SCRIPT.md")
SYSTEM = open(_SCRIPT, encoding="utf-8").read() if os.path.exists(_SCRIPT) else "You are Kyriq Voice."


# ── TTS ────────────────────────────────────────────────────────────────────
def _speak(text: str, voice_id: str | None = None) -> str | None:
    if not FISH_KEY or not text:
        return None  # the browser falls back to speechSynthesis
    voice = voice_id if voice_id in _VOICE_IDS else DEFAULT_VOICE
    body: dict[str, Any] = {"text": text[:1500], "format": "mp3", "latency": "balanced", "reference_id": voice}
    try:
        r = requests.post("https://api.fish.audio/v1/tts", json=body,
                          headers={"Authorization": f"Bearer {FISH_KEY}", "model": FISH_MODEL}, timeout=30)
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
    focus: dict | None = None  # the check currently on screen, so "approve this one" works
    voice_id: str | None = None  # one of VOICES; anything else falls back to the default


@app.get("/health")
def health():
    return {"ok": True, "llm": bool(_llm), "tts": bool(FISH_KEY), "tts_model": FISH_MODEL if FISH_KEY else None}


@app.get("/voices")
def voices():
    return {"voices": VOICES, "default": DEFAULT_VOICE, "tts": bool(FISH_KEY)}


class SpeakIn(BaseModel):
    voice_id: str


@app.post("/speak")
def speak(body: SpeakIn, request: Request):
    """Voice preview for the picker. Fixed sample text, so it cannot be used as
    a general text-to-speech endpoint on Kyriq's credit."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing session")
    _user(auth[7:])
    if body.voice_id not in _VOICE_IDS:
        raise HTTPException(400, "Unknown voice")
    name = next(v["name"] for v in VOICES if v["id"] == body.voice_id)
    return {"audio": _speak(f"Hi, I'm {name}. You have three ninety-one exact matches ready, and thirty-seven that need a closer look.", body.voice_id)}


def run_turn(token: str, body: ChatIn) -> dict:
    if not _llm:
        raise HTTPException(503, "OPENAI_API_KEY is not configured")
    system = SYSTEM
    if body.focus and body.focus.get("check_number"):
        system += f"\n\nOn screen right now: check #{body.focus['check_number']}. 'This one', 'it' or 'that check' means this check."
    # ponytail: history comes from the client (last 12 turns); persistent
    # per-tenant memory (memory_entities / memory_edges in Supabase) is next.
    msgs: list[dict[str, Any]] = [{"role": "system", "content": system}]
    msgs += [{"role": m.role, "content": m.content[:2000]} for m in body.messages[-12:] if m.role in ("user", "assistant")]

    act = _Act()
    used: list[dict] = []
    for _ in range(MAX_TOOL_ROUNDS):
        try:
            resp = _llm.chat.completions.create(model=MODEL, messages=msgs, tools=TOOL_SCHEMAS, temperature=0.3)
        except Exception as e:  # quota, auth or network: say so instead of a 500
            raise HTTPException(503, f"The AI provider is unavailable ({type(e).__name__}). Check the OpenAI key and credits.")
        msg = resp.choices[0].message
        if not msg.tool_calls:
            reply = (msg.content or "").strip()
            return {"reply": reply, "tools": used, "actions": act.items, "audio": _speak(reply, body.voice_id) if body.speak else None}
        msgs.append({"role": "assistant", "content": msg.content, "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
                if name in READ_TOOLS:
                    result = READ_TOOLS[name](token, **args)
                elif name in ACT_TOOLS:
                    result = ACT_TOOLS[name](token, act, **args)
                else:
                    result = [{"error": "unknown tool"}]
            except (TypeError, ValueError, KeyError) as e:
                args, result = {}, [{"error": f"bad arguments: {e}"}]
            used.append({"name": name, "args": args, "rows": len(result)})
            msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result[:25], default=str)})
    return {"reply": "That took too many steps. Could you ask a narrower question?", "tools": used, "actions": act.items, "audio": None}


@app.post("/chat")
def chat(body: ChatIn, request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing session")
    token = auth[7:]
    _user(token)
    return run_turn(token, body)
