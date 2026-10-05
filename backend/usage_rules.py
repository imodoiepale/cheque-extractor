"""Billing rules for the usage ledger — pure functions, no dependencies.

Kept separate from api_server.py so the two rules that decide whether money
changes hands can be checked without importing FastAPI, OpenCV and Pillow.
See supabase/migrations/027_usage_ledger.sql and CHECKLIST section 8.
"""


def ledger_idempotency_key(job_id: str, check_id: str) -> str:
    """Stable identifier for one processing event.

    Same job + same cheque = same key, so an automatic retry or a re-extraction
    of the same job cannot double-count. A repeat UPLOAD creates a new job_id,
    so it produces a new key and counts again — which is what the checklist
    asks for, after the user has confirmed the duplicate warning.

    The no-double-count guarantee is the UNIQUE index on
    (tenant_id, idempotency_key); this function only has to be deterministic.
    """
    return f"{job_id}:{check_id}"


def is_billable(check: dict) -> bool:
    """True when this cheque was processed successfully and should be counted.

    Count on success only: a cheque the engines produced no extraction for is
    a failed OCR and must not bill. A cheque with no id cannot be made
    idempotent, so it is not counted either.
    """
    if not isinstance(check, dict):
        return False
    if not check.get("check_id"):
        return False
    return bool(check.get("extraction"))
