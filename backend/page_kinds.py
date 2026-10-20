"""
What each page of an upload is: statement text, cheque images, both, or other.

Rules first, from the PDF's own text layer (pdf_pages.read) and the cheque
boxes detection found; an AI call only for the pages the rules cannot read
(no text layer, no boxes, but ink on the page), via an optional callback so
this module stays importable without network or keys.

  cheque-images   boxes were detected on the page
  statement       a transaction table: a section heading banks print above
                  their tables, or three or more lines carrying a date and
                  an amount (deposits, withdrawals, checks, daily balances)
  both            a page with cheque images AND a table heading
  other           covers, terms and conditions, adverts, blank pages

Captions beside cheque images also carry dates and amounts, so a page with
boxes only counts as "both" on a real heading, never on row count.
"""
import re

KINDS = ("statement", "cheque-images", "both", "other")

HEADING_RE = re.compile(
    r"^\s*(checks(\s+cleared|\s+paid)?(\s*[-(]\s*continued\)?)?\s*$|account activity|account summary|"
    r"(withdrawals|deposits) and other (debits|credits)|daily balances|"
    r"transaction detail)",
    re.I | re.M,
)
DATE_RE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b")
AMOUNT_RE = re.compile(r"-?\$?[\d,]+\.\d{2}\b")
MIN_ROWS = 3


def table_lines(page, tol=3):
    """Lines (words bucketed by y) that carry both a date and an amount."""
    lines = {}
    for x0, y0, x1, y1, text in page["words"]:
        lines.setdefault(round(y0 / tol), []).append(text)
    return [ws for _, ws in sorted(lines.items())
            if any(DATE_RE.fullmatch(w) for w in ws) and any(AMOUNT_RE.fullmatch(w) for w in ws)]


def classify_page(page, n_boxes, ai=None):
    heading = bool(HEADING_RE.search(page["text"]))
    if n_boxes > 0:
        return "both" if heading else "cheque-images"
    if heading or len(table_lines(page)) >= MIN_ROWS:
        return "statement"
    if not page["has_text"] and ai is not None:
        kind = ai(page["index"])
        if kind in KINDS:
            return kind
    return "other"


def classify_pages(pages, boxes_per_page, ai=None):
    """One kind per page. boxes_per_page[i] = cheques detected on page i."""
    return [classify_page(p, boxes_per_page[i] if i < len(boxes_per_page) else 0, ai)
            for i, p in enumerate(pages)]


def summarize(page_kinds, total_checks):
    """'Statement + 227 cheque images' — the line the UI shows. Mirrors
    summarizeKinds() in frontend/lib/document-kind.ts."""
    kinds = set(page_kinds or [])
    has_statement = bool(kinds & {"statement", "both"})
    has_images = bool(kinds & {"cheque-images", "both"}) or total_checks > 0
    images = f"{total_checks} cheque image{'s' if total_checks != 1 else ''}"
    if has_statement and has_images:
        return f"Statement + {images}"
    if has_statement:
        return "Statement only"
    if has_images:
        return images
    return "No statement or cheques found"


AI_PROMPT = (
    "This is one page of a document uploaded to a cheque-processing app. "
    "Answer with exactly one word: 'statement' if it is a bank statement page "
    "listing transactions, 'cheque-images' if it shows images of cheques, "
    "'both' if it has both, or 'other' for anything else."
)


if __name__ == "__main__":
    import sys
    import pdf_pages
    for path in sys.argv[1:]:
        pages = pdf_pages.read(path)
        boxes = [len(pdf_pages.bind_captions(p)) for p in pages]
        kinds = classify_pages(pages, boxes)
        print(path, summarize(kinds, sum(boxes)))
        print("  " + " ".join(f"{i + 1}:{k[:4]}" for i, k in enumerate(kinds)))
