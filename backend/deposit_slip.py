"""
A deposit slip is not a cheque. The detector finds its box like a cheque's
(same size, a printed band), so it was extracted, counted and billed as one
(Michael, 18 Nov: 16 "cheques" from 13 cheques and 3 deposit slips).

Decided from what the engines read: Gemini's documentType when it gives one,
otherwise the slip's printed words. `python backend/deposit_slip.py` checks it.
"""
import re

_SLIP_WORDS = re.compile(r"deposit\s*slip|total\s*deposit|deposit\s*ticket", re.I)


def is_deposit_slip(raw_texts, document_types=()):
    """True when an engine says this image is a deposit slip, not a cheque."""
    if any(str(t or "").strip().lower().replace(" ", "_") in ("deposit_slip", "deposit") for t in document_types):
        return True
    return any(_SLIP_WORDS.search(str(t or "")) for t in raw_texts)


if __name__ == "__main__":
    assert is_deposit_slip(["DEPOSIT SLIP\nPinnacle Ridge\nTOTAL DEPOSIT: $1500.00"])
    assert is_deposit_slip([""], ["deposit_slip"])
    assert not is_deposit_slip(["PAY TO THE ORDER OF Cedar Supply $1250.00 Memo: deposit refund"], ["check"])
    assert not is_deposit_slip([None, ""], [None])
    print("deposit_slip self-check OK")
