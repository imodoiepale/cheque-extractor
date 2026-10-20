"""
Self-check for page_kinds against the four real files in docs/testfiles.

    python -I backend/check_page_kinds.py [docs/testfiles]

Rules only (the AI fallback needs keys and is exercised on kyriq.com).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pdf_pages  # noqa: E402
import page_kinds  # noqa: E402
from doc_kind import classify_document  # noqa: E402

root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parents[1] / "docs" / "testfiles")


def kinds_of(name):
    pages = pdf_pages.read(str(root / name))
    boxes = [len(pdf_pages.bind_captions(p)) for p in pages]
    return page_kinds.classify_pages(pages, boxes), sum(boxes)


S, C, O = "statement", "cheque-images", "other"

for name, total in (("Apr Check Images.pdf", 49), ("Feb Check Images.pdf", 51)):
    kinds, n = kinds_of(name)
    assert kinds == [O, C, C, C, C], (name, kinds)       # the cover is not a statement
    assert page_kinds.summarize(kinds, n) == f"{total} cheque images"
    assert classify_document(5, n, None, kinds) == "cheque-sheet"

kinds, n = kinds_of("3117 June.pdf")
assert kinds[:10] == [S, O, S, S, S, S, S, S, S, O], kinds[:10]   # p2 terms, p10 blank
assert kinds[10:] == [C] * 34, kinds[10:]
assert page_kinds.summarize(kinds, n) == "Statement + 339 cheque images"
assert classify_document(44, n, None, kinds) == "bank-statement"

kinds, n = kinds_of("9440 June.pdf")
assert kinds[:10] == [S, O, S, S, S, S, S, S, S, S], kinds[:10]   # p2 terms
assert kinds[10:29] == [C] * 19 and kinds[29] == O, kinds[10:]     # p30 "left intentionally blank"
assert page_kinds.summarize(kinds, n) == "Statement + 227 cheque images"

# A statement-only upload must still read as a statement, not "no cheques".
assert page_kinds.summarize([S, S], 0) == "Statement only"
assert classify_document(2, 0, [0, 0], [S, S]) == "bank-statement"
assert page_kinds.summarize([O], 0) == "No statement or cheques found"
# Rows on a page with cheque boxes do not make it "both"; only a heading does.
fake = {"index": 0, "text": "Check Number: 5320\n", "has_text": True,
        "words": [(0, 0, 10, 10, "04/01/2026"), (20, 0, 30, 10, "$600.00")] * 3}
assert page_kinds.classify_page(fake, 1) == C
assert page_kinds.classify_page({**fake, "text": "Checks Cleared (continued)\n"}, 1) == "both"
assert page_kinds.classify_page({**fake, "has_text": False, "text": ""}, 0, ai=lambda i: "statement") == S

print("check_page_kinds OK")
