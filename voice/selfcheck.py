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
