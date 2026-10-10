"""Smallest check that fails if the agent's tool layer breaks. No network.

    python voice/selfcheck.py
"""
import json
import os
import sys

os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
sys.path.insert(0, os.path.dirname(__file__))
import app  # noqa: E402

# Every tool has a schema and every schema has a tool.
names = {s["function"]["name"] for s in app.TOOL_SCHEMAS}
assert names == set(app.TOOLS), (names, set(app.TOOLS))
json.dumps(app.TOOL_SCHEMAS)  # serialisable

# search_checks builds the right PostgREST filter, as the caller, read-only.
seen = {}
app._rest = lambda token, path, params: seen.update(token=token, path=path, params=params) or []
app.search_checks("tok", payee="Harbor*", amount_min=100, amount_max=500.5, date_from="2026-08-01", limit=999)
p = seen["params"]
assert seen["token"] == "tok" and seen["path"] == "checks"
assert p["payee"] == "ilike.*Harbor*", p["payee"]          # '*' stripped from user input
assert p["and"] == "(amount.gte.100.0,amount.lte.500.5,check_date.gte.2026-08-01)", p["and"]
assert p["limit"] == "50"                                   # capped
app.list_issues("tok", kind="low_confidence")
assert seen["path"] == "matches" and seen["params"]["confidence_score"] == "lt.90"
print("voice selfcheck: ok")

# PROPOSE tools never write: they only append a confirm action for the browser.
fake_card = [{"check_number": "1042", "payee": "Harbor", "amount": "2450.00",
              "matches": [{"id": "m1", "confidence_score": 86}]}]
app.get_check = lambda token, n: fake_card
act = app._Act()
app.approve_match("tok", act, "1042")
assert act.items == [{"kind": "confirm", "action": "approve_match", "matchId": "m1",
                      "label": "Approve check #1042 to Harbor for $2,450.00 (86% match)"}], act.items
app.flag_check("tok", act, "1042", "amount looks wrong")
assert act.items[-1]["action"] == "flag" and act.items[-1]["matchId"] == "m1"
print("voice selfcheck: propose tools ok")

# An action's own fields never overwrite its kind.
app.list_issues = lambda token, kind="x", limit=10: [{"id": "m2"}]
act = app._Act()
app.show_list("tok", act, kind="discrepancy")
assert act.items[0]["kind"] == "show_list" and act.items[0]["list_kind"] == "discrepancy", act.items
print("voice selfcheck: actions ok")

# Voice allowlist: an unknown id never reaches Fish.
assert len(app.VOICES) == 8 and len({v["id"] for v in app.VOICES}) == 8
sent = {}
app.FISH_KEY = "k"
class _R: status_code = 200; content = b"mp3"
app.requests.post = lambda url, json=None, headers=None, timeout=None: sent.update(json) or _R()
app._speak("hello", "not-a-real-voice")
assert sent["reference_id"] == app.DEFAULT_VOICE
app._speak("hello", app.VOICES[5]["id"])
assert sent["reference_id"] == app.VOICES[5]["id"]
print("voice selfcheck: voices ok")
