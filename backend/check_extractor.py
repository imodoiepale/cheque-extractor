#!/usr/bin/env python3
"""
Check Extractor v3 – Triple OCR: Tesseract + NuMarkdown + Gemini Flash.

Architecture:
  Phase 1: Extract all check images (fast OpenCV crop)
  Phase 2: Run all 3 OCR engines in PARALLEL (ThreadPoolExecutor)
  Phase 3: Cross-validate & merge into hybrid result

Output per check:
  <check_id>/tesseract.json   – raw Tesseract result
  <check_id>/numarkdown.json  – raw NuMarkdown result
  <check_id>/gemini.json      – raw Gemini Flash result
  <check_id>/hybrid.json      – merged best-of-all result

Backend schema (from backend/src/types/extraction.ts):
  Required: payee, amount, checkDate, checkNumber
  Optional: bankName, memo, amountWritten, micr (routing, account, serial)
"""

import os
import re
import sys
import cv2
import json
import base64
import time
import requests
import numpy as np
from io import BytesIO
from datetime import datetime
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pdf2image import convert_from_path
from PIL import Image
import pytesseract

# Optional GUI imports (only needed for desktop preview mode)
try:
    from PIL import ImageTk
    import tkinter as tk
    from tkinter import ttk, messagebox
    GUI_AVAILABLE = True
except ImportError:
    GUI_AVAILABLE = False
    # Headless mode - no GUI available (e.g., Docker, Railway)

# Set Tesseract path explicitly for Windows
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# NuMarkdown via Gradio client (HuggingFace Spaces)
NUMARKDOWN_ENABLED = True
try:
    from gradio_client import Client as GradioClient, handle_file
    NUMARKDOWN_CLIENT = None  # lazy init
except ImportError:
    NUMARKDOWN_ENABLED = False
    print("WARNING: gradio_client not installed. NuMarkdown disabled.")

# Gemini Flash API keys (from env, comma-separated, rotated round-robin)
_env_gemini = os.environ.get("GEMINI_API_KEYS", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_KEYS = list(dict.fromkeys([k.strip() for k in _env_gemini.split(",") if k.strip()]))
if not GEMINI_KEYS:
    print("WARNING: No GEMINI_API_KEY(S) set in environment. Gemini OCR will be disabled.")
_gemini_key_idx = 0


# ═════════════════════════════════════════════════════════════════════
#  AUTOMATIC VISION DETECTOR (OpenCV)
# ═════════════════════════════════════════════════════════════════════

def determine_predominant_format(pages, sample_count=3):
    """
    Analyze the first few pages of a PDF to determine the predominant
    detection format used throughout the document.
    Returns 'A' (contour/bordered), 'B' (line-grid), or None (unknown).
    """
    votes = {"A": 0, "B": 0}
    sample = pages[:min(sample_count, len(pages))]

    for page in sample:
        img = np.array(page)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        h, w = gray.shape
        _, bw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

        contour_boxes = _deduplicate_boxes(_detect_by_contours(bw, h, w))
        grid_boxes = _detect_by_line_grid(bw, gray, h, w)

        avg_cw = 0
        if contour_boxes:
            avg_cw = np.mean([b[2] - b[0] for b in contour_boxes]) / w

        if len(contour_boxes) >= 2 and avg_cw > 0.25:
            votes["A"] += 1
        elif len(grid_boxes) >= 4:
            votes["B"] += 1

    if votes["A"] > votes["B"]:
        return "A"
    elif votes["B"] > votes["A"]:
        return "B"
    return None


def detect_checks_on_page(pil_page, format_hint=None):
    """
    Smart hybrid detection with predominant format awareness.
    format_hint: 'A' (contour/bordered), 'B' (line-grid), or None (auto-detect).
    Returns list of (x1, y1, x2, y2) in original-pixel coords.
    """
    img = np.array(pil_page)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    _, bw = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # ── Run both detection methods ────────────────────────────────
    contour_boxes = _deduplicate_boxes(_detect_by_contours(bw, h, w))
    grid_boxes = _detect_by_line_grid(bw, gray, h, w)

    # ── Format selection (use hint if available) ──────────────────
    avg_contour_w = 0
    if contour_boxes:
        avg_contour_w = np.mean([b[2] - b[0] for b in contour_boxes]) / w

    if format_hint == "A":
        # Predominant format is contour/bordered — use contours on this page
        if contour_boxes:
            merged = list(contour_boxes)
        else:
            merged = list(grid_boxes)  # fallback if no contours at all
    elif format_hint == "B":
        # Predominant format is line-grid — use full grid cells
        # Filter out full-width cells (summary/header rows on non-check pages)
        # Real FORMAT B checks are half-width (split by vertical divider)
        half_w = w * 0.55
        valid_grid = [b for b in grid_boxes if (b[2] - b[0]) < half_w]
        if len(valid_grid) >= 4:
            merged = list(valid_grid)
        else:
            # No half-width grid cells = not a check page in FORMAT B
            merged = []
    else:
        # Auto-detect per page (no hint available)
        if len(contour_boxes) >= 2 and avg_contour_w > 0.30:
            merged = list(contour_boxes)
        elif len(grid_boxes) >= 8:
            merged = list(grid_boxes)
        elif len(contour_boxes) >= 2:
            merged = list(contour_boxes)
        elif len(grid_boxes) >= 4:
            merged = list(grid_boxes)
        else:
            merged = list(contour_boxes) + list(grid_boxes)

    merged = _deduplicate_boxes(merged)

    # ── Final validation ──────────────────────────────────────────
    good = []
    for (x1, y1, x2, y2) in merged:
        roi = gray[y1:y2, x1:x2]
        if roi.size == 0:
            continue
        if np.mean(roi) > 250:
            continue
        if (x2 - x1) < w * 0.10 or (y2 - y1) < h * 0.03:
            continue
        dark_px = np.sum(roi < 180)
        if dark_px / max(roi.size, 1) < 0.02:
            continue
        good.append((x1, y1, x2, y2))

    good.sort(key=lambda r: (r[1], r[0]))

    # Page-level validation: skip pages with no real checks
    # Allow even 1 check per page — many documents have 1-3 cheques per page
    if len(good) < 1:
        return []

    return good


def _box_overlaps_any(box, others, threshold=0.20):
    """Check if box overlaps with any box in others."""
    for ob in others:
        ox1, oy1 = max(box[0], ob[0]), max(box[1], ob[1])
        ox2, oy2 = min(box[2], ob[2]), min(box[3], ob[3])
        if ox1 < ox2 and oy1 < oy2:
            overlap_area = (ox2 - ox1) * (oy2 - oy1)
            box_area = max((box[2] - box[0]) * (box[3] - box[1]), 1)
            if overlap_area > threshold * box_area:
                return True
    return False


def _add_sub_contour(grid_box, bw, merged):
    """Find the best check contour inside a grid cell and add to merged."""
    gx1, gy1, gx2, gy2 = grid_box
    cell_bw = bw[gy1:gy2, gx1:gx2]
    cell_h, cell_w = cell_bw.shape[:2]
    if cell_h < 50 or cell_w < 50:
        return
    sub_boxes = _detect_by_contours(cell_bw, cell_h, cell_w)
    if sub_boxes:
        best = max(sub_boxes, key=lambda b: (b[2]-b[0])*(b[3]-b[1]))
        bw2, bh2 = best[2]-best[0], best[3]-best[1]
        if bw2 > cell_w * 0.4 and bh2 > cell_h * 0.3:
            merged.append((gx1 + best[0], gy1 + best[1],
                           gx1 + best[2], gy1 + best[3]))


def _snap_to_contour_edges(boxes, bw, h, w):
    """
    Self-correct box positions by finding the actual bordered rectangle
    edges near each box boundary. This fixes partial crops.
    """
    corrected = []
    for (x1, y1, x2, y2) in boxes:
        bh, bw2 = y2 - y1, x2 - x1
        pad = max(int(bh * 0.15), 10)

        # Expand search area slightly
        sx1 = max(x1 - pad, 0)
        sy1 = max(y1 - pad, 0)
        sx2 = min(x2 + pad, w)
        sy2 = min(y2 + pad, h)

        roi = bw[sy1:sy2, sx1:sx2]
        if roi.size == 0:
            corrected.append((x1, y1, x2, y2))
            continue

        # Find contours in the expanded region
        cnts, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best_rect = None
        best_area = 0
        for c in cnts:
            rx, ry, rw, rh = cv2.boundingRect(c)
            area = rw * rh
            if area > best_area and rw > bw2 * 0.7 and rh > bh * 0.7:
                best_area = area
                best_rect = (sx1 + rx, sy1 + ry, sx1 + rx + rw, sy1 + ry + rh)

        if best_rect and best_area > bw2 * bh * 0.5:
            corrected.append(best_rect)
        else:
            corrected.append((x1, y1, x2, y2))

    return corrected


def _filter_check_backs(boxes, gray):
    """
    Filter out check backs (endorsement side) by detecting vertical text.
    Check fronts have horizontal text (payee, amount, bank name).
    Check backs have mostly vertical/rotated text (endorsement stamps).
    """
    fronts = []
    for (x1, y1, x2, y2) in boxes:
        roi = gray[y1:y2, x1:x2]
        if roi.size == 0:
            continue
        bh, bw2 = roi.shape

        _, roi_bw = cv2.threshold(roi, 200, 255, cv2.THRESH_BINARY_INV)

        # Horizontal projection — count rows with significant ink
        h_proj = np.sum(roi_bw, axis=1) / 255
        h_text_rows = np.sum(h_proj > bw2 * 0.05)

        # Vertical projection — count columns with significant ink
        v_proj = np.sum(roi_bw, axis=0) / 255
        v_text_cols = np.sum(v_proj > bh * 0.10)

        # Check fronts: more horizontal text spread, fewer dense vertical columns
        # Check backs: lots of vertical text columns (rotated endorsement)
        h_ratio = h_text_rows / max(bh, 1)
        v_ratio = v_text_cols / max(bw2, 1)

        # Front checks have MICR line at bottom (dense horizontal ink)
        bottom_strip = roi_bw[-max(int(bh * 0.15), 10):, :]
        bottom_ink = np.sum(bottom_strip > 0) / max(bottom_strip.size, 1)

        # Heuristic: if vertical text dominates AND no MICR line → it's a back
        is_back = (v_ratio > 0.15 and v_ratio > h_ratio * 1.5 and bottom_ink < 0.15)

        if not is_back:
            fronts.append((x1, y1, x2, y2))

    return fronts


def _detect_by_contours(bw, h, w):
    """Find check rectangles using contour detection."""
    contours, _ = cv2.findContours(bw, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    min_w = int(w * 0.15)
    min_h_box = int(h * 0.04)
    max_h_box = int(h * 0.25)  # checks are never >25% of page height
    min_area = w * h * 0.005

    candidates = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        if cw >= min_w and min_h_box <= ch <= max_h_box and cw * ch >= min_area:
            # Aspect ratio: checks are wider than tall (ratio 1.5-6)
            ar = cw / max(ch, 1)
            if 1.2 < ar < 7.0:
                # Must have enough ink inside (handwriting/print, not empty table cell)
                roi = bw[y:y+ch, x:x+cw]
                ink = np.sum(roi > 0) / max(roi.size, 1)
                if ink > 0.03:  # at least 3% ink
                    candidates.append((x, y, x + cw, y + ch))
    return candidates


def _detect_by_line_grid(bw, gray, h, w):
    """Find check cells using horizontal/vertical line detection."""
    # Horizontal lines
    horiz_k = cv2.getStructuringElement(cv2.MORPH_RECT, (w // 3, 1))
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, horiz_k, iterations=1)
    row_sums = np.sum(horiz, axis=1) / 255
    line_rows = np.where(row_sums > w * 0.20)[0]
    h_lines = _cluster_positions(line_rows, min_gap=15)

    # Need enough horizontal lines to form a check grid
    if len(h_lines) < 5:
        return []

    # Find vertical centre split (line or white gap)
    centre, two_col = _find_centre_split(bw, h, w)

    boundaries_y = sorted(set([0] + h_lines + [h]))
    min_cell_h = int(h * 0.03)
    filtered_y = [boundaries_y[0]]
    for y in boundaries_y[1:]:
        if y - filtered_y[-1] >= min_cell_h:
            filtered_y.append(y)
    if filtered_y[-1] != h:
        filtered_y.append(h)

    # Build cells — only half-width when 2-column detected
    cells = []
    for i in range(len(filtered_y) - 1):
        y1, y2 = filtered_y[i], filtered_y[i + 1]
        if y2 - y1 < min_cell_h:
            continue
        if two_col and centre:
            cells.append((0, y1, centre, y2))
            cells.append((centre, y1, w, y2))
        else:
            cells.append((0, y1, w, y2))

    # Merge small adjacent cells in same column to check-sized boxes
    min_check_h = int(h * 0.08)
    merged = _merge_small_cells(cells, min_check_h)
    return merged


def _find_centre_split(bw, h, w):
    """Find vertical centre: line or white gap."""
    # Method 1: vertical line
    vert_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 4))
    vert = cv2.morphologyEx(bw, cv2.MORPH_OPEN, vert_k, iterations=1)
    col_sums = np.sum(vert, axis=0) / 255
    vert_cols = np.where(col_sums > h * 0.15)[0]
    v_lines = _cluster_positions(vert_cols, min_gap=20)
    centre_lines = [v for v in v_lines if w * 0.35 < v < w * 0.65]
    if centre_lines:
        return min(centre_lines, key=lambda v: abs(v - w // 2)), True

    # Method 2: white gap
    ink_per_col = np.sum(bw, axis=0) / 255
    mid_s, mid_e = int(w * 0.30), int(w * 0.70)
    mid_ink = ink_per_col[mid_s:mid_e]
    avg_ink = np.mean(ink_per_col)
    gap_cols = np.where(mid_ink < avg_ink * 0.15)[0] + mid_s
    if len(gap_cols) >= 10:
        return int(np.mean(gap_cols)), True

    return None, False


def _merge_small_cells(cells, min_h):
    """Merge vertically-adjacent cells in same column until >= min_h."""
    if not cells:
        return cells
    cols = defaultdict(list)
    for (x1, y1, x2, y2) in cells:
        cols[(x1, x2)].append((y1, y2))
    merged = []
    for (x1, x2), rows in cols.items():
        rows.sort()
        i = 0
        while i < len(rows):
            y_start, y_end = rows[i]
            while y_end - y_start < min_h and i + 1 < len(rows):
                i += 1
                y_end = rows[i][1]
            merged.append((x1, y_start, x2, y_end))
            i += 1
    return merged


def _cluster_positions(positions, min_gap=10):
    if len(positions) == 0:
        return []
    clusters = []
    start = prev = positions[0]
    for p in positions[1:]:
        if p - prev > min_gap:
            clusters.append(int((start + prev) / 2))
            start = p
        prev = p
    clusters.append(int((start + prev) / 2))
    return clusters


def _deduplicate_boxes(boxes):
    """Remove overlapping boxes, keeping the largest."""
    if not boxes:
        return boxes
    boxes.sort(key=lambda r: (r[2] - r[0]) * (r[3] - r[1]), reverse=True)
    kept = []
    for r in boxes:
        overlap = False
        for f in kept:
            ox1, oy1 = max(r[0], f[0]), max(r[1], f[1])
            ox2, oy2 = min(r[2], f[2]), min(r[3], f[3])
            if ox1 < ox2 and oy1 < oy2:
                overlap_area = (ox2 - ox1) * (oy2 - oy1)
                r_area = (r[2] - r[0]) * (r[3] - r[1])
                if overlap_area > 0.35 * r_area:
                    overlap = True
                    break
        if not overlap:
            kept.append(r)
    return kept


def _expand_to_metadata(boxes, gray, page_h, page_w):
    """Expand each check box DOWNWARD only to include metadata row below."""
    expanded = []
    for (x1, y1, x2, y2) in boxes:
        box_h = y2 - y1

        # Only look BELOW for metadata (check#, date, amount row)
        # Keep expansion modest — max 25% of box height
        search_below = min(int(box_h * 0.25), page_h - y2)
        if search_below > 10:
            below_roi = gray[y2:y2 + search_below, x1:x2]
            if below_roi.size > 0 and np.mean(below_roi) < 250:
                row_means = np.mean(below_roi, axis=1)
                content_rows = np.where(row_means < 245)[0]
                if len(content_rows) > 0:
                    extend = content_rows[-1] + 5
                    y2 = min(y2 + extend, page_h)

        expanded.append((x1, y1, x2, y2))
    return expanded


# ═════════════════════════════════════════════════════════════════════
#  EMPTY FIELD TEMPLATE
# ═════════════════════════════════════════════════════════════════════

def _empty_fields():
    return {
        "payee": None, "amount": None, "amountWritten": None,
        "checkDate": None, "checkNumber": None, "bankName": None,
        "memo": None,
        "micr": {"routing": None, "account": None, "serial": None},
    }


# ═════════════════════════════════════════════════════════════════════
#  1. TESSERACT
# ═════════════════════════════════════════════════════════════════════

def extract_with_tesseract(img_path):
    """Run Tesseract OCR on an image file."""
    t0 = time.time()
    try:
        img = cv2.imread(img_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        text = pytesseract.image_to_string(gray)
        fields = _parse_check_text(text)
        return {
            "source": "tesseract",
            "raw_text": text.strip(),
            "fields": fields,
            "processing_time_ms": int((time.time() - t0) * 1000),
        }
    except Exception as e:
        return {"source": "tesseract", "error": str(e), "fields": _empty_fields(),
                "processing_time_ms": int((time.time() - t0) * 1000)}


def _parse_check_text(text):
    r = _empty_fields()
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    for line in lines:
        lu = line.upper()

        if "POST DATE" in lu or "DATE" in lu:
            dates = re.findall(r'\d{1,2}/\d{1,2}/\d{2,4}', line)
            if dates:
                r["checkDate"] = dates[0]

        if "$" in line and r["amount"] is None:
            m = re.search(r'\$\s*([\d,]+\.?\d*)', line)
            if m:
                r["amount"] = m.group(1).replace(",", "")

        if "CHECK NUMBER" in lu or "CHECK NO" in lu:
            nums = re.findall(r'\d{3,6}', line)
            if nums:
                r["checkNumber"] = nums[-1]

        if "ACCOUNT" in lu:
            nums = re.findall(r'\d{7,12}', line)
            if nums:
                r["micr"]["account"] = nums[0]

        bank_kw = ["JPMORGAN", "CHASE", "BANK OF AMERICA", "WELLS FARGO",
                    "CITIBANK", "US BANK", "PNC", "CAPITAL ONE", "BANK"]
        for kw in bank_kw:
            if kw in lu:
                r["bankName"] = line.strip()
                break

        if "PAY TO" in lu:
            after = line[lu.find("PAY TO"):].replace("PAY TO", "").replace("THE ORDER OF", "").strip()
            if len(after) > 2:
                r["payee"] = after

        if "MEMO" in lu or "FOR" == lu[:3]:
            memo_text = line.replace("MEMO", "").replace("FOR", "").strip()
            if len(memo_text) > 1:
                r["memo"] = memo_text

    if not r["checkDate"]:
        dates = re.findall(r'\d{1,2}/\d{1,2}/\d{2,4}', text)
        if dates:
            r["checkDate"] = dates[0]

    if not r["checkNumber"]:
        m = re.search(r'(?:Check\s*(?:Number)?:?\s*#?\s*)(\d{3,6})', text, re.IGNORECASE)
        if m:
            r["checkNumber"] = m.group(1)
        else:
            nums = re.findall(r'\b(\d{4,6})\b', text)
            if nums:
                r["checkNumber"] = nums[-1]

    routing_match = re.search(r'\b(\d{9})\b', text)
    if routing_match:
        r["micr"]["routing"] = routing_match.group(1)

    return r


# ═════════════════════════════════════════════════════════════════════
#  2. NUMARKDOWN (HuggingFace Spaces)
# ═════════════════════════════════════════════════════════════════════

def _get_numarkdown_client():
    global NUMARKDOWN_CLIENT
    if NUMARKDOWN_CLIENT is None:
        print("    [NuMarkdown] Connecting to HuggingFace Space...")
        NUMARKDOWN_CLIENT = GradioClient("numind/NuMarkdown-8B-Thinking")
    return NUMARKDOWN_CLIENT


def extract_with_numarkdown(img_path):
    """Send check image to NuMarkdown and parse the structured markdown."""
    t0 = time.time()
    if not NUMARKDOWN_ENABLED:
        return {"source": "numarkdown", "error": "gradio_client not installed",
                "fields": _empty_fields(), "processing_time_ms": 0}
    try:
        client = _get_numarkdown_client()
        result = client.predict(
            image=handle_file(img_path),
            temperature=0.4,
            api_name="/query_vllm_api"
        )
        # result is tuple: (thinking, answer, rendered_markdown)
        if isinstance(result, (list, tuple)) and len(result) >= 2:
            md = result[1]
        else:
            md = str(result)
        if "<answer>" in md:
            md = md.split("<answer>")[1].split("</answer>")[0]

        fields = _parse_numarkdown_output(md)
        return {"source": "numarkdown", "raw_markdown": md.strip(),
                "fields": fields, "processing_time_ms": int((time.time() - t0) * 1000)}
    except Exception as e:
        return {"source": "numarkdown", "error": str(e),
                "fields": _empty_fields(), "processing_time_ms": int((time.time() - t0) * 1000)}


def _parse_numarkdown_output(text):
    r = _empty_fields()

    date_m = re.search(r'(?:Post\s*date|Date)[:\s]*(\d{1,2}/\d{1,2}/\d{2,4})', text, re.I)
    if date_m: r["checkDate"] = date_m.group(1)

    amt_m = re.search(r'(?:Amount)[:\s]*\$?\s*([\d,]+\.?\d*)', text, re.I)
    if amt_m:
        r["amount"] = amt_m.group(1).replace(",", "")
    else:
        amt_m = re.search(r'\$\s*([\d,]+\.?\d*)', text)
        if amt_m: r["amount"] = amt_m.group(1).replace(",", "")

    cn_m = re.search(r'(?:Check\s*Number|Check\s*No|Check\s*#)[:\s]*(\d{3,6})', text, re.I)
    if cn_m: r["checkNumber"] = cn_m.group(1)

    acc_m = re.search(r'(?:Account)[:\s]*(\d{7,12})', text, re.I)
    if acc_m: r["micr"]["account"] = acc_m.group(1)

    for kw in ["JPMorgan Chase", "Chase", "Bank of America", "Wells Fargo",
               "Citibank", "US Bank", "PNC", "Capital One"]:
        if kw.lower() in text.lower():
            r["bankName"] = kw; break

    # Payee: look for "PAY TO THE ORDER OF\n<name>" pattern
    pay_m = re.search(r'PAY\s*TO\s*(?:THE\s*ORDER\s*OF)?\s*\n?\s*(.+?)(?:\s*\$|\n)', text, re.I)
    if pay_m:
        payee = pay_m.group(1).strip()
        if len(payee) > 2 and "order of" not in payee.lower():
            r["payee"] = payee

    # Amount written
    written_m = re.search(r'(?:dollars|DOLLARS).*?\n|(.+?)\s*(?:dollars|DOLLARS)', text, re.I)
    if written_m and written_m.group(0):
        written = written_m.group(0).replace("DOLLARS", "").replace("dollars", "").strip()
        if len(written) > 3:
            r["amountWritten"] = written

    memo_m = re.search(r'(?:Memo|MEMO|For)[:\s]*(.*?)(?:\n|$)', text, re.I)
    if memo_m and len(memo_m.group(1).strip()) > 1:
        r["memo"] = memo_m.group(1).strip()

    routing_m = re.search(r'\b(\d{9})\b', text)
    if routing_m: r["micr"]["routing"] = routing_m.group(1)

    return r


# ═════════════════════════════════════════════════════════════════════
#  3. GEMINI FLASH (REST API with key rotation)
# ═════════════════════════════════════════════════════════════════════

GEMINI_PROMPT = """Analyze this bank check image carefully. Extract ALL of the following fields.
Pay special attention to HANDWRITTEN text — the payee name is often handwritten on the "PAY TO THE ORDER OF" line.

Return ONLY a JSON object with these exact keys:
{
  "payee": "full name of person/company the check is made out to (handwritten on PAY TO line)",
  "amount": "numeric dollar amount (e.g. 1200.00)",
  "amountWritten": "the amount written in words (e.g. Twelve hundred)",
  "checkDate": "date on the check in MM/DD/YYYY format",
  "checkNumber": "check number (usually top right, 4-6 digits)",
  "bankName": "name of the bank",
  "memo": "memo line text if any, null otherwise",
  "micr_routing": "9-digit routing number from MICR line at bottom",
  "micr_account": "account number from MICR line",
  "micr_serial": "serial/check number from MICR line"
}

Important: For the payee field, read the HANDWRITTEN name carefully. It is the name written after "PAY TO THE ORDER OF". Do NOT return "THE ORDER OF" as the payee."""


def _next_gemini_key():
    global _gemini_key_idx
    key = GEMINI_KEYS[_gemini_key_idx % len(GEMINI_KEYS)]
    _gemini_key_idx += 1
    return key


def extract_with_gemini(img_path):
    """Call Gemini Flash 2.0 API with image. Tries all keys before giving up."""
    t0 = time.time()
    with open(img_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/png", "data": img_b64}},
                {"text": GEMINI_PROMPT}
            ]
        }],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024}
    }

    last_err = None
    for attempt in range(len(GEMINI_KEYS)):
        key = _next_gemini_key()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
        try:
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code in (403, 429):
                last_err = f"{resp.status_code} for key ...{key[-6:]}"
                time.sleep(1)
                continue
            resp.raise_for_status()
            data = resp.json()

            text = data["candidates"][0]["content"]["parts"][0]["text"]
            json_str = text
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0]
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0]

            parsed = json.loads(json_str.strip())

            fields = _empty_fields()
            fields["payee"] = parsed.get("payee")
            fields["amount"] = str(parsed.get("amount", "")).replace(",", "") or None
            fields["amountWritten"] = parsed.get("amountWritten")
            fields["checkDate"] = parsed.get("checkDate")
            fields["checkNumber"] = str(parsed.get("checkNumber", "")) or None
            fields["bankName"] = parsed.get("bankName")
            fields["memo"] = parsed.get("memo")
            fields["micr"]["routing"] = parsed.get("micr_routing")
            fields["micr"]["account"] = parsed.get("micr_account")
            fields["micr"]["serial"] = parsed.get("micr_serial")

            return {"source": "gemini", "raw_text": text.strip(), "raw_json": parsed,
                    "fields": fields, "processing_time_ms": int((time.time() - t0) * 1000)}

        except Exception as e:
            last_err = str(e)
            time.sleep(0.5)
            continue

    return {"source": "gemini", "error": f"All keys failed. Last: {last_err}",
            "fields": _empty_fields(), "processing_time_ms": int((time.time() - t0) * 1000)}


# ═════════════════════════════════════════════════════════════════════
#  HYBRID MERGE (3 engines)
# ═════════════════════════════════════════════════════════════════════

def merge_all(tess, numd, gemini):
    """
    Merge 3 engine results. Priority for handwritten fields (payee):
      Gemini > NuMarkdown > Tesseract
    For structured/printed fields (amount, date, checkNumber):
      Cross-validate all 3; majority wins.
    """
    t_f = tess.get("fields", {})
    n_f = numd.get("fields", {})
    g_f = gemini.get("fields", {})

    merged = {
        "payee": {"value": None, "confidence": 0, "source": "none"},
        "amount": {"value": None, "confidence": 0, "source": "none"},
        "amountWritten": {"value": None, "confidence": 0, "source": "none"},
        "checkDate": {"value": None, "confidence": 0, "source": "none"},
        "checkNumber": {"value": None, "confidence": 0, "source": "none"},
        "bankName": {"value": None, "confidence": 0, "source": "none"},
        "memo": {"value": None, "confidence": 0, "source": "none"},
        "micr": {
            "routing": {"value": None, "confidence": 0, "source": "none"},
            "account": {"value": None, "confidence": 0, "source": "none"},
            "serial": {"value": None, "confidence": 0, "source": "none"},
        },
    }

    simple_fields = ["payee", "amount", "amountWritten", "checkDate",
                     "checkNumber", "bankName", "memo"]

    for field in simple_fields:
        vals = {}
        for src_name, src_fields in [("tesseract", t_f), ("numarkdown", n_f), ("gemini", g_f)]:
            v = src_fields.get(field)
            if v and str(v).strip() and str(v).strip().lower() not in ["none", "null", "the order of"]:
                vals[src_name] = str(v).strip()

        if not vals:
            continue

        # For payee (handwritten): prefer Gemini > NuMarkdown > Tesseract
        if field == "payee":
            if "gemini" in vals:
                conf = 0.92
                if "numarkdown" in vals and vals["numarkdown"].lower() == vals["gemini"].lower():
                    conf = 0.97
                merged[field] = {"value": vals["gemini"], "confidence": conf, "source": "gemini"}
            elif "numarkdown" in vals:
                merged[field] = {"value": vals["numarkdown"], "confidence": 0.80, "source": "numarkdown"}
            elif "tesseract" in vals:
                merged[field] = {"value": vals["tesseract"], "confidence": 0.60, "source": "tesseract"}
            continue

        # For other fields: majority vote
        all_vals = list(vals.values())
        norm_vals = [v.lower().strip() for v in all_vals]

        # Check if all agree
        if len(set(norm_vals)) == 1 and len(norm_vals) >= 2:
            merged[field] = {"value": all_vals[0], "confidence": 0.97, "source": "hybrid"}
        elif len(set(norm_vals)) == 1:
            src = list(vals.keys())[0]
            merged[field] = {"value": all_vals[0], "confidence": 0.85, "source": src}
        else:
            # Find majority
            counts = Counter(norm_vals)
            best_norm, best_count = counts.most_common(1)[0]
            if best_count >= 2:
                # Majority wins
                for src_name, v in vals.items():
                    if v.lower().strip() == best_norm:
                        merged[field] = {"value": v, "confidence": 0.90, "source": "hybrid"}
                        break
            else:
                # No majority — prefer gemini > numarkdown > tesseract
                for pref in ["gemini", "numarkdown", "tesseract"]:
                    if pref in vals:
                        merged[field] = {"value": vals[pref], "confidence": 0.70, "source": pref}
                        break

    # MICR fields
    for mf in ["routing", "account", "serial"]:
        vals = {}
        for src_name, src_fields in [("tesseract", t_f), ("numarkdown", n_f), ("gemini", g_f)]:
            v = (src_fields.get("micr") or {}).get(mf)
            if v and str(v).strip():
                vals[src_name] = str(v).strip()
        if not vals:
            continue
        all_vals = list(vals.values())
        norm_vals = [v.lower() for v in all_vals]
        if len(set(norm_vals)) == 1 and len(norm_vals) >= 2:
            merged["micr"][mf] = {"value": all_vals[0], "confidence": 0.97, "source": "hybrid"}
        elif len(set(norm_vals)) == 1:
            src = list(vals.keys())[0]
            merged["micr"][mf] = {"value": all_vals[0], "confidence": 0.85, "source": src}
        else:
            for pref in ["gemini", "numarkdown", "tesseract"]:
                if pref in vals:
                    merged["micr"][mf] = {"value": vals[pref], "confidence": 0.70, "source": pref}
                    break

    return merged


# ═════════════════════════════════════════════════════════════════════
#  MAIN APP
# ═════════════════════════════════════════════════════════════════════

class CheckExtractorApp:
    def __init__(self, pdf_path, output_dir="extracted_checks"):
        self.pdf_path = pdf_path
        self.output_dir = output_dir
        self.pages = []
        self.page_boxes = {}

        os.makedirs(f"{output_dir}/images", exist_ok=True)

        self.convert_pdf_to_images()
        self.auto_detect_all()

    def convert_pdf_to_images(self, dpi=300):
        print(f"Converting PDF to images at {dpi} DPI...")
        _script_dir = os.path.dirname(os.path.abspath(__file__))
        poppler_path = os.path.join(
            _script_dir, "poppler", "poppler-23.11.0", "Library", "bin"
        )
        if not os.path.isdir(poppler_path):
            # Fallback: try cwd-based path
            poppler_path = os.path.join(
                os.getcwd(), "poppler", "poppler-23.11.0", "Library", "bin"
            )
        print(f"  Poppler path: {poppler_path} (exists={os.path.isdir(poppler_path)})")
        self.pages = convert_from_path(self.pdf_path, dpi=dpi, poppler_path=poppler_path)
        print(f"Converted {len(self.pages)} pages")

    def auto_detect_all(self):
        """Detect checks on all pages in parallel, using predominant format."""
        # Determine the predominant format from the first few pages
        self.doc_format = determine_predominant_format(self.pages)
        if self.doc_format:
            print(f"  Document format: {'Contour/Bordered' if self.doc_format == 'A' else 'Line-Grid'}")

        total = 0
        fmt = self.doc_format

        def _detect(idx_page):
            idx, page = idx_page
            boxes = detect_checks_on_page(page, format_hint=fmt)
            return idx, boxes

        if not self.pages:
            print("  No pages to detect checks on")
            return

        with ThreadPoolExecutor(max_workers=min(8, max(1, len(self.pages)))) as pool:
            results = pool.map(_detect, enumerate(self.pages))

        for idx, boxes in sorted(results, key=lambda x: x[0]):
            self.page_boxes[idx] = boxes
            if boxes:
                total += len(boxes)
                print(f"  Page {idx+1}: {len(boxes)} checks detected")
            else:
                print(f"  Page {idx+1}: SKIPPED (no checks found)")
        print(f"Total auto-detected: {total} checks across {len(self.pages)} pages")

    # ── PHASE 1: Extract all images ──────────────────────────────────
    def extract_all_images(self):
        """Crop all detected checks and save as PNGs. Fast.
        Flat images: images/check_XXXX.png (for API serving).
        Per-page copies: images/page_X/cheque_Y.png (well-labeled).
        """
        img_dir = f"{self.output_dir}/images"
        os.makedirs(img_dir, exist_ok=True)
        counter = 1
        manifest = []  # list of (check_id, img_path, page_num)

        for pg in range(len(self.pages)):
            boxes = self.page_boxes.get(pg, [])
            if not boxes:
                continue
            page_num = pg + 1
            page_dir = os.path.join(img_dir, f"page_{page_num}")
            os.makedirs(page_dir, exist_ok=True)
            cheque_on_page = 0
            page_img = self.pages[pg]
            for (x1, y1, x2, y2) in boxes:
                x1, y1 = max(0, x1), max(0, y1)
                x2, y2 = min(page_img.width, x2), min(page_img.height, y2)
                if x2 <= x1 or y2 <= y1:
                    continue
                crop = page_img.crop((x1, y1, x2, y2))
                arr = np.array(crop.convert("L"))
                if np.mean(arr) > 252:
                    continue
                cheque_on_page += 1
                cid = f"check_{counter:04d}"
                img_path = os.path.join(img_dir, f"{cid}.png")
                crop.save(img_path)
                # Also save well-labeled copy in per-page subfolder
                crop.save(os.path.join(page_dir, f"cheque_{cheque_on_page}.png"))
                manifest.append((cid, img_path, page_num))
                counter += 1

        print(f"\nPhase 1 complete: {len(manifest)} check images saved to {img_dir}/")
        return manifest

    # ── PHASE 2: Parallel OCR ────────────────────────────────────────
    def run_parallel_ocr(self, manifest, methods=None, progress_callback=None):
        """Run selected OCR engines in parallel for each check.
        methods: list of engine names. Supported values:
          'hybrid' = all 3 engines + merge
          'ocr'    = tesseract only
          'ai'     = gemini only
          'tesseract', 'numarkdown', 'gemini' = individual engines
        Default (None or ['hybrid']) = run all 3 + merge.
        progress_callback: optional callable(info_dict) called after each check completes.
        """
        results_dir = f"{self.output_dir}/ocr_results"
        os.makedirs(results_dir, exist_ok=True)

        # Resolve which engines to run
        if not methods or "hybrid" in methods:
            run_tess = run_numd = run_gemi = True
        else:
            run_tess = "ocr" in methods or "tesseract" in methods
            run_numd = "numarkdown" in methods
            run_gemi = "ai" in methods or "gemini" in methods

        engine_names = []
        if run_tess: engine_names.append("tesseract")
        if run_numd: engine_names.append("numarkdown")
        if run_gemi: engine_names.append("gemini")

        total = len(manifest)
        print(f"\nPhase 2: Running engines [{', '.join(engine_names)}] on {total} checks...")

        # Notify callback of start
        if progress_callback:
            progress_callback({
                "event": "start",
                "total": total,
                "engines": engine_names,
            })

        for idx, (cid, img_path, page_num) in enumerate(manifest):
            check_dir = os.path.join(results_dir, cid)
            os.makedirs(check_dir, exist_ok=True)

            print(f"  [{idx+1}/{total}] {cid} (page {page_num})...", end="", flush=True)

            # Notify callback of check start
            if progress_callback:
                progress_callback({
                    "event": "check_start",
                    "check_id": cid,
                    "page": page_num,
                    "index": idx,
                    "total": total,
                })

            # Submit only selected engines
            workers = sum([run_tess, run_numd, run_gemi])
            tess_result = {"source": "tesseract", "fields": _empty_fields(), "processing_time_ms": 0}
            numd_result = {"source": "numarkdown", "fields": _empty_fields(), "processing_time_ms": 0}
            gemi_result = {"source": "gemini", "fields": _empty_fields(), "processing_time_ms": 0}

            with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
                futures = {}
                if run_tess:
                    futures["tesseract"] = pool.submit(extract_with_tesseract, img_path)
                if run_numd:
                    futures["numarkdown"] = pool.submit(extract_with_numarkdown, img_path)
                if run_gemi:
                    futures["gemini"] = pool.submit(extract_with_gemini, img_path)

                if "tesseract" in futures:
                    tess_result = futures["tesseract"].result()
                if "numarkdown" in futures:
                    numd_result = futures["numarkdown"].result()
                if "gemini" in futures:
                    gemi_result = futures["gemini"].result()

            # Save individual engine results
            if run_tess:
                with open(os.path.join(check_dir, "tesseract.json"), "w") as f:
                    json.dump(tess_result, f, indent=2)
            if run_numd:
                with open(os.path.join(check_dir, "numarkdown.json"), "w") as f:
                    json.dump(numd_result, f, indent=2)
            if run_gemi:
                with open(os.path.join(check_dir, "gemini.json"), "w") as f:
                    json.dump(gemi_result, f, indent=2)

            # Merge (works even if some engines returned empty fields)
            hybrid = merge_all(tess_result, numd_result, gemi_result)
            hybrid_out = {
                "check_id": cid,
                "page": page_num,
                "image_file": f"{cid}.png",
                "timestamp": datetime.now().isoformat(),
                "extraction": hybrid,
                "methods_used": engine_names,
                "engine_times_ms": {
                    "tesseract": tess_result.get("processing_time_ms", 0),
                    "numarkdown": numd_result.get("processing_time_ms", 0),
                    "gemini": gemi_result.get("processing_time_ms", 0),
                },
            }
            with open(os.path.join(check_dir, "hybrid.json"), "w") as f:
                json.dump(hybrid_out, f, indent=2)

            t_ms = tess_result.get("processing_time_ms", 0)
            n_ms = numd_result.get("processing_time_ms", 0)
            g_ms = gemi_result.get("processing_time_ms", 0)
            payee = hybrid["payee"]["value"] or "?"
            parts = []
            if run_tess: parts.append(f"T:{t_ms}ms")
            if run_numd: parts.append(f"N:{n_ms}ms")
            if run_gemi: parts.append(f"G:{g_ms}ms")
            print(f" {' '.join(parts)} | payee={payee}")

            # Notify callback of check completion with details
            if progress_callback:
                progress_callback({
                    "event": "check_done",
                    "check_id": cid,
                    "page": page_num,
                    "index": idx,
                    "total": total,
                    "payee": payee,
                    "engine_times_ms": {
                        "tesseract": t_ms,
                        "numarkdown": n_ms,
                        "gemini": g_ms,
                    },
                    "engines": engine_names,
                    "has_error": bool(
                        tess_result.get("error") or numd_result.get("error") or gemi_result.get("error")
                    ),
                })

        print(f"\nPhase 2 complete: results in {results_dir}/")

    # ── Summary ──────────────────────────────────────────────────────
    def save_summary(self, manifest):
        checks = []
        results_dir = f"{self.output_dir}/ocr_results"
        for cid, img_path, page_num in manifest:
            hybrid_path = os.path.join(results_dir, cid, "hybrid.json")
            entry = {"check_id": cid, "page": page_num, "image_file": f"{cid}.png"}
            if os.path.exists(hybrid_path):
                try:
                    with open(hybrid_path) as f:
                        entry["extraction"] = json.load(f).get("extraction", {})
                except Exception:
                    pass
            checks.append(entry)

        summary = {
            "pdf_file": self.pdf_path,
            "total_pages": len(self.pages),
            "total_checks": len(checks),
            "engines": ["tesseract", "numarkdown", "gemini"],
            "checks": checks,
            "timestamp": datetime.now().isoformat(),
        }
        out_path = f"{self.output_dir}/extraction_summary.json"
        with open(out_path, "w") as f:
            json.dump(summary, f, indent=2)
        print(f"\nSummary -> {out_path}")

    # ── Run (headless) ───────────────────────────────────────────────
    def run(self):
        manifest = self.extract_all_images()
        if not manifest:
            print("No checks found.")
            return
        self.run_parallel_ocr(manifest)
        self.save_summary(manifest)

    # ── GUI Preview ──────────────────────────────────────────────────
    def run_preview(self):
        """Show Tkinter GUI to preview detected boxes, then extract."""
        if not GUI_AVAILABLE:
            raise RuntimeError("GUI not available in headless mode. Use run_headless() instead.")
        self.root = tk.Tk()
        self.root.title(f"Check Extractor – {os.path.basename(self.pdf_path)}")
        self.root.state("zoomed")
        self.current_page = 0

        tb = ttk.Frame(self.root)
        tb.pack(side=tk.TOP, fill=tk.X, padx=4, pady=4)

        ttk.Button(tb, text="< Prev", command=self._prev).pack(side=tk.LEFT, padx=2)
        self.page_label = ttk.Label(tb, text="")
        self.page_label.pack(side=tk.LEFT, padx=4)
        ttk.Button(tb, text="Next >", command=self._next).pack(side=tk.LEFT, padx=2)

        ttk.Separator(tb, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(tb, text="Re-detect Page", command=self._redetect).pack(side=tk.LEFT, padx=4)

        ttk.Separator(tb, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(tb, text="Extract ALL (headless)", command=self._gui_extract).pack(side=tk.LEFT, padx=4)

        ttk.Separator(tb, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(tb, text="Close", command=self.root.quit).pack(side=tk.LEFT, padx=4)

        container = ttk.Frame(self.root)
        container.pack(fill=tk.BOTH, expand=True)

        self.vscroll = ttk.Scrollbar(container, orient=tk.VERTICAL)
        self.hscroll = ttk.Scrollbar(container, orient=tk.HORIZONTAL)
        self.canvas = tk.Canvas(container, xscrollcommand=self.hscroll.set,
                                yscrollcommand=self.vscroll.set)
        self.vscroll.config(command=self.canvas.yview)
        self.hscroll.config(command=self.canvas.xview)
        self.vscroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.hscroll.pack(side=tk.BOTTOM, fill=tk.X)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.status = ttk.Label(self.root, text="Preview mode. Check detection boxes.",
                                relief=tk.SUNKEN, anchor=tk.W)
        self.status.pack(side=tk.BOTTOM, fill=tk.X)

        self._show_page()
        self.root.mainloop()

    def _show_page(self):
        if not self.pages:
            return
        page_img = self.pages[self.current_page]
        img_w, img_h = page_img.size
        screen_h = self.root.winfo_screenheight() * 0.85
        self.scale_factor = min(screen_h / img_h, 1.0)
        dw = int(img_w * self.scale_factor)
        dh = int(img_h * self.scale_factor)

        self._disp = page_img.resize((dw, dh), Image.Resampling.LANCZOS)
        self._photo = ImageTk.PhotoImage(self._disp)

        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor=tk.NW, image=self._photo)
        self.canvas.config(scrollregion=(0, 0, dw, dh))

        self.page_label.config(text=f"Page {self.current_page+1} / {len(self.pages)}")

        boxes = self.page_boxes.get(self.current_page, [])
        for idx, (x1, y1, x2, y2) in enumerate(boxes):
            dx1, dy1 = x1 * self.scale_factor, y1 * self.scale_factor
            dx2, dy2 = x2 * self.scale_factor, y2 * self.scale_factor
            self.canvas.create_rectangle(dx1, dy1, dx2, dy2, outline="blue", width=2)
            self.canvas.create_text(dx1 + 4, dy1 + 2, anchor=tk.NW,
                                    text=f"#{idx+1}", fill="blue", font=("Arial", 10, "bold"))

        skipped = " (SKIPPED)" if not boxes else ""
        self.status.config(text=f"Page {self.current_page+1}: {len(boxes)} checks{skipped}")

    def _prev(self):
        if self.current_page > 0:
            self.current_page -= 1
            self._show_page()

    def _next(self):
        if self.current_page < len(self.pages) - 1:
            self.current_page += 1
            self._show_page()

    def _redetect(self):
        boxes = detect_checks_on_page(self.pages[self.current_page])
        self.page_boxes[self.current_page] = boxes
        self._show_page()

    def _gui_extract(self):
        self.root.quit()
        self.root.destroy()
        self.run()


# ═════════════════════════════════════════════════════════════════════
#  CLI
# ═════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("Usage: python check_extractor.py <pdf_file> [--preview]")
        return
    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(f"File not found: {pdf_path}")
        return

    preview = "--preview" in sys.argv

    name = os.path.splitext(os.path.basename(pdf_path))[0]
    app = CheckExtractorApp(pdf_path, output_dir=f"extracted_{name}")

    if preview:
        app.run_preview()
    else:
        app.run()


if __name__ == "__main__":
    main()
