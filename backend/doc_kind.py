"""
Python port of frontend/lib/document-kind.ts :: classifyDocument.

Same thresholds, same order of rules, same four verdicts. Keep the two in
lockstep: frontend/scripts/check-doc-kind-parity.ts runs this file with
--samples and asserts the TS function agrees on every case.
"""
import json
import sys

PAGE_HAS_CHEQUES = 1
SHEET_COVERAGE = 0.8
SHEET_DENSITY = 2
STATEMENT_MIN_PAGES = 4

KINDS = ("cheque-sheet", "bank-statement", "single-cheque", "no-cheques")


def classify_document(total_pages, total_checks, checks_per_page=None, page_kinds=None):
    """Return one of KINDS. Mirrors classifyDocument() in document-kind.ts."""
    pages = max(0, int(total_pages or 0))
    cheques = max(0, int(total_checks or 0))
    per_page = list(checks_per_page or [])

    # Page kinds (backend/page_kinds.py) read the statement's own text, so a
    # transaction page anywhere settles it, even with no cheque images at all.
    if any(k in ("statement", "both") for k in (page_kinds or [])):
        return "bank-statement"
    if cheques == 0:
        return "no-cheques"
    if pages == 1 and cheques <= 2:
        return "single-cheque"

    counted = len(per_page) if per_page else pages
    with_cheques = sum(1 for n in per_page if n >= PAGE_HAS_CHEQUES) if per_page else pages
    coverage = with_cheques / counted if counted > 0 else 0
    density = cheques / with_cheques if with_cheques > 0 else 0

    if coverage >= SHEET_COVERAGE and density >= SHEET_DENSITY:
        return "cheque-sheet"
    if pages >= STATEMENT_MIN_PAGES and coverage < SHEET_COVERAGE:
        return "bank-statement"
    return "cheque-sheet"


def checks_per_page_from_manifest(total_pages, manifest):
    """manifest rows are (check_id, image_path, page_num); page_num is 1-based."""
    counts = [0] * max(0, int(total_pages or 0))
    for row in manifest or []:
        page = int(row[2]) if len(row) > 2 and row[2] is not None else 0
        if 1 <= page <= len(counts):
            counts[page - 1] += 1
    return counts


# The four shapes frontend/scripts/check-document-kind.ts was written against.
SAMPLES = [
    {"total_pages": 30, "total_checks": 223, "checks_per_page": [20] * 11 + [0] * 19},
    {"total_pages": 5, "total_checks": 100, "checks_per_page": [20] * 5},
    {"total_pages": 1, "total_checks": 1, "checks_per_page": [1]},
    {"total_pages": 12, "total_checks": 0, "checks_per_page": [0] * 12},
    # A statement whose cheque images are on a separate upload: page kinds
    # alone make it a statement, where counts alone would say no-cheques.
    {"total_pages": 5, "total_checks": 0, "checks_per_page": [0] * 5,
     "page_kinds": ["other", "statement", "statement", "statement", "other"]},
]

if __name__ == "__main__":
    if "--samples" in sys.argv:
        print(json.dumps([
            {**s, "kind": classify_document(s["total_pages"], s["total_checks"], s["checks_per_page"], s.get("page_kinds"))}
            for s in SAMPLES
        ]))
    else:
        kinds = [classify_document(s["total_pages"], s["total_checks"], s["checks_per_page"], s.get("page_kinds")) for s in SAMPLES]
        assert kinds == ["bank-statement", "cheque-sheet", "single-cheque", "no-cheques", "bank-statement"], kinds
        assert checks_per_page_from_manifest(3, [("a", "p", 1), ("b", "p", 1), ("c", "p", 3)]) == [2, 0, 1]
        print("doc_kind self-check OK")
