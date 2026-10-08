"""
Self-check for cheque-page detection on bank statements.

Covers the three things wired up for section 10 of CHECKLIST.md:
  1. a page of ruled statement rows must not yield cheques,
  2. a page of actual cheques must,
  3. the format vote must sample across the document, not just the opening pages.

Run: python check_detection_check.py   (needs cv2, numpy, PIL)
"""
import numpy as np
import cv2
from PIL import Image

import check_extractor as ce

W, H = 1200, 1600


def blank():
    return np.full((H, W, 3), 255, np.uint8)


def cheque_page(n=3):
    """n bordered cheque blocks, each with sparse fields and a MICR strip."""
    img = blank()
    bw, bh = int(W * 0.72), int(H * 0.17)
    x = (W - bw) // 2
    for i in range(n):
        y = int(H * 0.05) + i * int(bh * 1.25)
        cv2.rectangle(img, (x, y), (x + bw, y + bh), (0, 0, 0), 3)
        # A few sparse horizontal fields: payee, amount, signature.
        for fy in (0.25, 0.45, 0.62):
            cv2.line(img, (x + 40, y + int(bh * fy)), (x + bw - 200, y + int(bh * fy)), (40, 40, 40), 3)
        # MICR strip: dense ink along the bottom. This is the signal that most
        # separates a cheque from a statement row.
        for mx in range(x + 30, x + bw - 30, 9):
            cv2.line(img, (mx, y + int(bh * 0.88)), (mx, y + bh - 8), (0, 0, 0), 4)
    return Image.fromarray(img)


def statement_page(rows=22):
    """A ruled transaction table: the false-positive case."""
    img = blank()
    top, bot = int(H * 0.12), int(H * 0.92)
    rh = (bot - top) // rows
    for r in range(rows + 1):
        y = top + r * rh
        cv2.line(img, (int(W * 0.06), y), (int(W * 0.94), y), (0, 0, 0), 2)
    for cx in (0.06, 0.30, 0.55, 0.75, 0.94):
        cv2.line(img, (int(W * cx), top), (int(W * cx), bot), (0, 0, 0), 2)
    # Dense text in every row.
    for r in range(rows):
        y = top + r * rh + rh // 2
        cv2.line(img, (int(W * 0.08), y), (int(W * 0.28), y), (30, 30, 30), 4)
        cv2.line(img, (int(W * 0.33), y), (int(W * 0.52), y), (30, 30, 30), 4)
        cv2.line(img, (int(W * 0.58), y), (int(W * 0.72), y), (30, 30, 30), 4)
    return Image.fromarray(img)


failures = []


def expect(cond, msg):
    if not cond:
        failures.append(msg)


# ── 1. A statement page must yield no cheques ────────────────────────────
for hint in (None, "A", "B"):
    found = ce.detect_checks_on_page(statement_page(), format_hint=hint)
    expect(len(found) == 0,
           f"statement page yielded {len(found)} cheque(s) with format_hint={hint!r}; "
           "the confidence gate is not rejecting ruled table rows")

# ── 2. A cheque page must yield cheques ──────────────────────────────────
for hint in (None, "A"):
    found = ce.detect_checks_on_page(cheque_page(3), format_hint=hint)
    expect(len(found) >= 1,
           f"cheque page yielded nothing with format_hint={hint!r}; "
           "the confidence gate is too strict and real cheques are being dropped")

# ── 3. Confidence ranks a cheque above a statement row ───────────────────
cg = cv2.cvtColor(np.array(cheque_page(1)), cv2.COLOR_RGB2GRAY)
sg = cv2.cvtColor(np.array(statement_page()), cv2.COLOR_RGB2GRAY)
bw_, bh_ = int(W * 0.72), int(H * 0.17)
cx = (W - bw_) // 2
cy = int(H * 0.05)
c_conf = ce._region_confidence((cx, cy, cx + bw_, cy + bh_), cg, H, W)
row_h = int((H * 0.80) / 22)
s_conf = ce._region_confidence((int(W * 0.06), int(H * 0.12), int(W * 0.94), int(H * 0.12) + row_h), sg, H, W)
expect(c_conf > s_conf, f"a cheque region ({c_conf:.2f}) must score above a statement row ({s_conf:.2f})")
expect(c_conf >= ce.REGION_CONFIDENCE_PAGE_MIN,
       f"a clean cheque region scored {c_conf:.2f}, below the page gate "
       f"{ce.REGION_CONFIDENCE_PAGE_MIN}")

# ── 4. The format vote must look past the opening pages ──────────────────
# A real bank statement opens with text and reaches the cheque images later.
# Sampling pages[:3] saw only statement pages and set the wrong hint for the
# pages that actually carried cheques.
doc = [statement_page() for _ in range(6)] + [cheque_page(3) for _ in range(6)]
expect(ce.determine_predominant_format(doc) == "A",
       "the format vote missed the cheque pages; it is still weighted to the front of the document")
expect(ce.determine_predominant_format([]) is None, "an empty document must vote None")
expect(ce.determine_predominant_format([cheque_page(3)]) is not None,
       "a single-page cheque document must still produce a hint")

# ── 5. Endorsement backs are filtered, not extracted ─────────────────────
# _filter_check_backs existed and was never called. Confirm it is reachable and
# that passing a front through it keeps the front.
kept = ce._filter_check_backs([(cx, cy, cx + bw_, cy + bh_)], cg)
expect(len(kept) == 1, "the cheque front was filtered out as an endorsement back")

if failures:
    for f in failures:
        print(f"FAIL: {f}")
    raise SystemExit(1)
print("check detection: all checks passed")
