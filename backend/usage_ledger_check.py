"""Self-check for the usage ledger. Plain asserts, no test framework.

    python backend/usage_ledger_check.py

Part 1 (always runs, no database): the two pure rules that decide whether money
changes hands — the idempotency key and the success-only filter.

Part 2 (live database): proves against real Postgres that

    * the idempotency key actually prevents a double count — the SECOND write
      of the same key adds no row, because of the UNIQUE index, not because the
      application remembered;
    * a FAILED processing event writes no ledger row at all;
    * the ledger is immutable — UPDATE and DELETE are refused;
    * RLS isolates it — an anon-key SELECT returns zero rows.

Part 2 writes real rows and CANNOT delete them afterwards (that is the point of
an immutable ledger), so it only runs when you ask for it explicitly:

    NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=... KYRIQ_LEDGER_SELFCHECK=1 \
    python backend/usage_ledger_check.py

Without those it prints exactly why it skipped and exits 0.
"""

import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from usage_rules import ledger_idempotency_key, is_billable

PASS = []


def ok(label):
    PASS.append(label)
    print(f"  ok   {label}")


# ──────────────────────────────────────────────────────────────────────────────
# Part 1 — pure logic, always runs
# ──────────────────────────────────────────────────────────────────────────────
def check_pure():
    print("Pure rules:")

    # A retry of the same cheque in the same job must produce the same key, or
    # the unique index never fires and the retry bills twice.
    assert ledger_idempotency_key("job1", "chk1") == ledger_idempotency_key("job1", "chk1")
    ok("idempotency key is stable for the same job + cheque")

    # Several cheques on one page are distinct events.
    assert ledger_idempotency_key("job1", "chk1") != ledger_idempotency_key("job1", "chk2")
    ok("two cheques in one job get different keys (several on a page count individually)")

    # A repeat upload is a new job, so it counts again.
    assert ledger_idempotency_key("job1", "chk1") != ledger_idempotency_key("job2", "chk1")
    ok("a repeat upload (new job_id) gets a different key, so it counts again")

    # Success only.
    assert is_billable({"check_id": "c1", "extraction": {"payee": {"value": "ACME"}}}) is True
    ok("a cheque with an extraction is billable")

    assert is_billable({"check_id": "c1", "extraction": None}) is False
    ok("failed OCR (extraction None) is NOT billable")

    assert is_billable({"check_id": "c1", "extraction": {}}) is False
    ok("empty extraction is NOT billable")

    assert is_billable({"check_id": "c1"}) is False
    ok("a cheque with no extraction key at all is NOT billable")

    assert is_billable({"extraction": {"payee": 1}}) is False
    ok("a cheque with no check_id is NOT billable (cannot be made idempotent)")

    assert is_billable(None) is False and is_billable("nope") is False
    ok("non-dict input is NOT billable")

    # Count detected cheques, not pages: a 40-page statement with 6 detected
    # cheques, of which 5 extracted, bills 5 — never 40 and never 6.
    statement = [{"check_id": f"c{i}", "page": i * 7, "extraction": {"amount": {"value": 1}}}
                 for i in range(5)]
    statement.append({"check_id": "c5", "page": 39, "extraction": None})
    billable = [c for c in statement if is_billable(c)]
    assert len(billable) == 5, billable
    assert len({ledger_idempotency_key("stmt", c["check_id"]) for c in billable}) == 5
    ok("40-page statement, 6 detected, 5 extracted -> 5 billable rows, 5 distinct keys")


# ──────────────────────────────────────────────────────────────────────────────
# Part 2 — live database
# ──────────────────────────────────────────────────────────────────────────────
def check_database():
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip().rstrip("/")
    service_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or ""
    ).strip()
    anon_key = (os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or "").strip()

    if not (url and service_key):
        print("\nDatabase checks SKIPPED: NEXT_PUBLIC_SUPABASE_URL and "
              "SUPABASE_SERVICE_ROLE_KEY are not both set.")
        return
    if os.environ.get("KYRIQ_LEDGER_SELFCHECK") != "1":
        print("\nDatabase checks SKIPPED: set KYRIQ_LEDGER_SELFCHECK=1 to run them.")
        print("  They write real usage_ledger rows, and an immutable ledger cannot")
        print("  delete them again, so they never run by accident.")
        return

    import requests

    def hdr(key):
        return {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def rpc(fn, params, key=service_key):
        r = requests.post(f"{url}/rest/v1/rpc/{fn}", headers=hdr(key), json=params, timeout=30)
        return r

    print("\nDatabase checks:")
    stamp = int(time.time())
    slug = f"ledger-selfcheck-{stamp}"

    r = requests.post(
        f"{url}/rest/v1/tenants",
        headers=hdr(service_key),
        json={"name": f"__ledger_selfcheck__{stamp}", "slug": slug, "plan": "essential"},
        timeout=30,
    )
    assert r.status_code < 300, f"tenant insert failed: {r.status_code} {r.text[:400]}"
    tenant_id = r.json()[0]["id"]
    print(f"  (throwaway tenant {tenant_id}, slug {slug})")

    def ledger_count():
        q = (f"{url}/rest/v1/usage_ledger?select=id&tenant_id=eq.{tenant_id}")
        rr = requests.get(q, headers=hdr(service_key), timeout=30)
        assert rr.status_code < 300, rr.text[:300]
        return len(rr.json())

    try:
        # ── the plan constraint was widened, not replaced ────────────────────
        for plan in ("essential", "professional", "scale", "starter", "free"):
            rr = requests.patch(
                f"{url}/rest/v1/tenants?id=eq.{tenant_id}",
                headers=hdr(service_key), json={"plan": plan}, timeout=30,
            )
            assert rr.status_code < 300, f"plan {plan} rejected: {rr.text[:200]}"
        ok("tenants.plan accepts the new plans AND the legacy ones")

        # ── 1. the idempotency key prevents a double count ───────────────────
        key = ledger_idempotency_key("selfcheck-job", "selfcheck-chk-1")
        first = rpc("record_check_processed", {
            "p_tenant_id": tenant_id,
            "p_check_id": "selfcheck-chk-1",
            "p_idempotency_key": key,
            "p_job_id": None,
        })
        assert first.status_code < 300, f"first write failed: {first.text[:400]}"
        body = first.json()
        assert body.get("recorded") is True, body
        assert body.get("billing_period_start"), body
        assert ledger_count() == 1, ledger_count()
        ok("first write of a key records one row")

        second = rpc("record_check_processed", {
            "p_tenant_id": tenant_id,
            "p_check_id": "selfcheck-chk-1",
            "p_idempotency_key": key,
            "p_job_id": None,
        })
        assert second.status_code < 300, second.text[:400]
        body2 = second.json()
        assert body2.get("recorded") is False, body2
        assert body2.get("duplicate") is True, body2
        assert body2.get("ledger_id") == body.get("ledger_id"), (body, body2)
        assert ledger_count() == 1, f"retry double-counted: {ledger_count()} rows"
        ok("SECOND write of the same key adds no row (retry cannot double-count)")

        # A raw INSERT with the same key must be refused by the index itself,
        # so the guarantee does not depend on the function's ON CONFLICT.
        raw = requests.post(
            f"{url}/rest/v1/usage_ledger",
            headers=hdr(service_key),
            json={
                "tenant_id": tenant_id, "check_id": "selfcheck-chk-1",
                "idempotency_key": key,
                "billing_period_start": body["billing_period_start"],
                "billing_period_end": body["billing_period_end"],
            },
            timeout=30,
        )
        assert raw.status_code >= 400, "duplicate raw INSERT was accepted"
        assert "23505" in raw.text or "duplicate key" in raw.text.lower(), raw.text[:300]
        assert ledger_count() == 1
        ok("a raw duplicate INSERT is refused by the UNIQUE constraint (23505)")

        # ── 2. a failed processing event writes no row ────────────────────────
        failed = [
            {"check_id": "selfcheck-failed-1", "page": 1, "extraction": None},
            {"check_id": "selfcheck-failed-2", "page": 1, "extraction": {}},
            {"page": 2, "extraction": {"amount": 1}},
        ]
        before = ledger_count()
        for c in failed:
            if is_billable(c):
                rpc("record_check_processed", {
                    "p_tenant_id": tenant_id,
                    "p_check_id": c["check_id"],
                    "p_idempotency_key": ledger_idempotency_key("selfcheck-job", c["check_id"]),
                })
        assert ledger_count() == before, "a failed processing event wrote a ledger row"
        ok("failed OCR writes NO ledger row")

        # ── 3. immutability ──────────────────────────────────────────────────
        lid = body["ledger_id"]
        upd = requests.patch(
            f"{url}/rest/v1/usage_ledger?id=eq.{lid}",
            headers=hdr(service_key), json={"quantity": 99}, timeout=30,
        )
        assert upd.status_code >= 400, "UPDATE of quantity was accepted"
        assert "append-only" in upd.text, upd.text[:300]
        ok("UPDATE of a billing column is refused (append-only trigger)")

        dele = requests.delete(
            f"{url}/rest/v1/usage_ledger?id=eq.{lid}", headers=hdr(service_key), timeout=30
        )
        assert dele.status_code >= 400, "DELETE was accepted"
        assert "append-only" in dele.text, dele.text[:300]
        assert ledger_count() == 1
        ok("DELETE is refused even for the service role")

        stripe_ok = requests.patch(
            f"{url}/rest/v1/usage_ledger?id=eq.{lid}",
            headers=hdr(service_key),
            json={"stripe_event_id": f"evt_selfcheck_{stamp}"}, timeout=30,
        )
        assert stripe_ok.status_code < 300, f"stripe stamp refused: {stripe_ok.text[:300]}"
        ok("stripe_event_id may be stamped once by the service role")

        stripe_again = requests.patch(
            f"{url}/rest/v1/usage_ledger?id=eq.{lid}",
            headers=hdr(service_key),
            json={"stripe_event_id": "evt_different"}, timeout=30,
        )
        assert stripe_again.status_code >= 400, "stripe_event_id was overwritten"
        ok("stripe_event_id is write-once")

        # ── 4. RLS: the anon key must see nothing ────────────────────────────
        if anon_key:
            for table in ("usage_ledger", "upload_fingerprints", "comp_grants"):
                rr = requests.get(
                    f"{url}/rest/v1/{table}?select=id", headers=hdr(anon_key), timeout=30
                )
                rows = rr.json() if rr.status_code < 300 else []
                assert not rows, f"anon key read {len(rows)} rows from {table}"
            ok("anon key reads zero rows from usage_ledger, upload_fingerprints, comp_grants")
        else:
            print("  skip NEXT_PUBLIC_SUPABASE_ANON_KEY not set, RLS check not run")

        # ── 5. trial gate and comp override ──────────────────────────────────
        rr = rpc("tenant_usage_state", {"p_tenant_id": tenant_id})
        assert rr.status_code < 300, rr.text[:300]
        st = rr.json()
        assert st["processing_allowed"] is True, st
        assert st["trial_checks_used"] >= 1, st
        ok("tenant_usage_state reports usage and allows processing inside the trial")

        requests.patch(
            f"{url}/rest/v1/tenants?id=eq.{tenant_id}",
            headers=hdr(service_key),
            json={"subscription_status": "trialing", "trial_check_limit": 1}, timeout=30,
        )
        st = rpc("tenant_usage_state", {"p_tenant_id": tenant_id}).json()
        assert st["processing_allowed"] is False, st
        assert st["block_reason"] == "trial_check_limit_reached", st
        ok("trial cheque limit blocks processing server-side")

        grant = requests.post(
            f"{url}/rest/v1/comp_grants",
            headers=hdr(service_key),
            json={
                "tenant_id": tenant_id,
                "granted_by_email": "selfcheck@kyriq.com",
                "reason": "ledger self-check",
                "expires_at": "2099-01-01T00:00:00Z",
            },
            timeout=30,
        )
        assert grant.status_code < 300, grant.text[:400]
        st = rpc("tenant_usage_state", {"p_tenant_id": tenant_id}).json()
        assert st["is_comped"] is True, st
        assert st["processing_allowed"] is True, st
        ok("a comp grant overrides the exhausted trial")

        audit = requests.get(
            f"{url}/rest/v1/audit_logs?select=action&tenant_id=eq.{tenant_id}"
            f"&action=eq.comp_account.granted",
            headers=hdr(service_key), timeout=30,
        )
        assert audit.status_code < 300 and audit.json(), audit.text[:300]
        ok("the comp grant was written to audit_logs by trigger")

        no_reason = requests.post(
            f"{url}/rest/v1/comp_grants",
            headers=hdr(service_key),
            json={"tenant_id": tenant_id, "granted_by_email": "x@y.z",
                  "reason": "  ", "expires_at": "2099-01-01T00:00:00Z"},
            timeout=30,
        )
        assert no_reason.status_code >= 400, "a comp grant with a blank reason was accepted"
        ok("a comp grant with no real reason is refused")

        # ── 6. the ledger survives tenant deletion attempts ──────────────────
        dele_t = requests.delete(
            f"{url}/rest/v1/tenants?id=eq.{tenant_id}", headers=hdr(service_key), timeout=30
        )
        assert dele_t.status_code >= 400, "tenant with ledger rows was deleted"
        ok("a tenant with ledger rows cannot be deleted (ON DELETE RESTRICT)")

    finally:
        print(f"\n  NOTE: tenant {tenant_id} (slug {slug}) and its ledger rows were left")
        print("  in place on purpose — the ledger is immutable. Archive it manually.")


if __name__ == "__main__":
    check_pure()
    check_database()
    print(f"\n{len(PASS)} checks passed.")
