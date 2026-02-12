#!/usr/bin/env python3
"""
Check Extractor API Server
FastAPI wrapper around check_extractor.py for the frontend to call.

Endpoints:
  POST /api/upload-pdf          Upload a PDF, detect & extract checks
  GET  /api/jobs/{job_id}       Get job status and results
  GET  /api/checks/{job_id}/{check_id}/image   Get cropped check image
  GET  /api/jobs/{job_id}/export Export job results as CSV
  GET  /api/health              Health check
"""

import os
import sys
import csv
import json
import uuid
import shutil
import threading
import traceback
import io
from datetime import datetime
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env.local")

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from PIL import Image as PILImage

from check_extractor import CheckExtractorApp

# ── Supabase REST (lightweight – no heavy SDK needed) ─────────────
import requests as _requests

_sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
_sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_SERVICE_KEY", "")
_supabase_ok = bool(_sb_url and _sb_key)
if _supabase_ok:
    print(f"✓ Supabase configured: {_sb_url[:40]}…")
else:
    print("⚠ Supabase not configured – results will NOT be saved to DB")


def _sb_headers():
    return {
        "apikey": _sb_key,
        "Authorization": f"Bearer {_sb_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _supabase_insert(table: str, row: dict):
    """Insert a row into a Supabase table via REST API. Returns inserted row or None."""
    if not _supabase_ok:
        return None
    resp = _requests.post(
        f"{_sb_url}/rest/v1/{table}",
        headers=_sb_headers(),
        json=row,
        timeout=15,
    )
    if resp.status_code >= 400:
        print(f"  Supabase insert error ({resp.status_code}): {resp.text[:300]}")
        return None
    try:
        data = resp.json()
        return data[0] if isinstance(data, list) and data else data
    except Exception:
        return None


def _supabase_update(table: str, match: dict, updates: dict):
    """Update rows in a Supabase table matching conditions."""
    if not _supabase_ok:
        return
    query = "&".join(f"{k}=eq.{v}" for k, v in match.items())
    resp = _requests.patch(
        f"{_sb_url}/rest/v1/{table}?{query}",
        headers=_sb_headers(),
        json=updates,
        timeout=15,
    )
    if resp.status_code >= 400:
        print(f"  Supabase update error ({resp.status_code}): {resp.text[:300]}")


def _supabase_upload_file(bucket: str, path: str, file_bytes: bytes, content_type: str = "application/octet-stream"):
    """Upload a file to Supabase Storage."""
    if not _supabase_ok:
        return None
    resp = _requests.post(
        f"{_sb_url}/storage/v1/object/{bucket}/{path}",
        headers={
            "apikey": _sb_key,
            "Authorization": f"Bearer {_sb_key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        data=file_bytes,
        timeout=30,
    )
    if resp.status_code >= 400:
        print(f"  Storage upload error ({resp.status_code}): {resp.text[:200]}")
        return None
    return f"{_sb_url}/storage/v1/object/public/{bucket}/{path}"


def _cleanup_local_files(job_id: str, pdf_path: str = None):
    """Remove local files after successful storage upload to Supabase.
    Deletes: uploaded PDF, output directory (pages, images, ocr_results).
    Only runs if Supabase storage is configured.
    """
    if not _supabase_ok:
        print(f"  Skipping cleanup for {job_id} — Supabase not configured, keeping local files")
        return

    cleaned = []
    # Remove uploaded PDF
    if pdf_path and os.path.exists(pdf_path):
        try:
            os.remove(pdf_path)
            cleaned.append(f"PDF: {os.path.basename(pdf_path)}")
        except Exception as e:
            print(f"  Cleanup: failed to remove PDF {pdf_path}: {e}")

    # Remove output directory (pages, images, ocr_results)
    out_dir = OUTPUT_DIR / job_id
    if out_dir.exists():
        try:
            shutil.rmtree(str(out_dir))
            cleaned.append(f"output/{job_id}/")
        except Exception as e:
            print(f"  Cleanup: failed to remove {out_dir}: {e}")

    if cleaned:
        print(f"  Cleanup {job_id}: removed {', '.join(cleaned)}")


app = FastAPI(title="Check Extractor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3080", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store
jobs: dict = {}
_SCRIPT_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = _SCRIPT_DIR / "uploads"
OUTPUT_DIR = _SCRIPT_DIR / "output"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


def _process_pdf(job_id: str, pdf_path: str, pdf_name: str):
    """Background worker: detect checks, extract images, run OCR, save to Supabase."""
    try:
        jobs[job_id]["status"] = "detecting"
        out_dir = str(OUTPUT_DIR / job_id)

        app_ext = CheckExtractorApp(pdf_path, output_dir=out_dir)
        jobs[job_id]["doc_format"] = (
            "Contour/Bordered" if app_ext.doc_format == "A"
            else "Line-Grid" if app_ext.doc_format == "B"
            else "Auto"
        )
        jobs[job_id]["total_pages"] = len(app_ext.pages)

        # ── Phase 1: Extract images ──────────────────────────────
        jobs[job_id]["status"] = "extracting"
        manifest = app_ext.extract_all_images()
        jobs[job_id]["total_checks"] = len(manifest)

        # Build check list
        checks = []
        for cid, img_path, page_num in manifest:
            im = PILImage.open(img_path)
            checks.append({
                "check_id": cid,
                "page": page_num,
                "image_file": os.path.basename(img_path),
                "image_path": img_path,
                "width": im.size[0],
                "height": im.size[1],
                "extraction": None,
            })
        jobs[job_id]["checks"] = checks

        # ── Create Supabase DB row (one row per PDF job) ─────────
        db_row = _supabase_insert("check_jobs", {
            "job_id": job_id,
            "pdf_name": pdf_name,
            "status": "processing",
            "doc_format": jobs[job_id]["doc_format"],
            "total_pages": jobs[job_id]["total_pages"],
            "total_checks": len(checks),
            "checks_data": json.dumps([]),
        })

        # ── Upload PDF to Supabase Storage ───────────────────────
        pdf_storage_url = None
        try:
            with open(pdf_path, "rb") as f:
                pdf_storage_url = _supabase_upload_file(
                    "checks", f"jobs/{job_id}/{pdf_name}", f.read(), "application/pdf"
                )
        except Exception as e:
            print(f"  PDF upload to storage failed: {e}")

        # ── Upload check images to Supabase Storage ──────────────
        for check in checks:
            try:
                img_p = check["image_path"]
                with open(img_p, "rb") as f:
                    url = _supabase_upload_file(
                        "checks",
                        f"jobs/{job_id}/images/{check['check_id']}.png",
                        f.read(),
                        "image/png",
                    )
                if url:
                    check["storage_url"] = url
            except Exception as e:
                print(f"  Image upload failed for {check['check_id']}: {e}")

        # ── Phase 2: Run OCR (Tesseract + Gemini) ────────────────
        jobs[job_id]["status"] = "ocr"
        try:
            app_ext.run_parallel_ocr(manifest)
            app_ext.save_summary(manifest)

            # Load hybrid results back into checks
            results_dir = os.path.join(out_dir, "ocr_results")
            for check in checks:
                hybrid_path = os.path.join(results_dir, check["check_id"], "hybrid.json")
                if os.path.exists(hybrid_path):
                    with open(hybrid_path) as f:
                        hybrid = json.load(f)
                    check["extraction"] = hybrid.get("extraction", {})
        except Exception as ocr_err:
            print(f"OCR phase error (non-fatal): {ocr_err}")
            traceback.print_exc()

        # ── Save final results to Supabase ───────────────────────
        # Build clean checks_data JSON (no local paths)
        checks_data = []
        for c in checks:
            checks_data.append({
                "check_id": c["check_id"],
                "page": c["page"],
                "width": c["width"],
                "height": c["height"],
                "image_url": c.get("storage_url", f"/api/checks/{job_id}/{c['check_id']}/image"),
                "extraction": c.get("extraction"),
            })

        _supabase_update("check_jobs", {"job_id": job_id}, {
            "status": "complete",
            "checks_data": json.dumps(checks_data),
            "pdf_url": pdf_storage_url,
            "completed_at": datetime.now().isoformat(),
        })

        # Remove local paths from in-memory job
        for c in checks:
            c.pop("image_path", None)

        jobs[job_id]["status"] = "complete"
        jobs[job_id]["completed_at"] = datetime.now().isoformat()
        jobs[job_id]["checks"] = checks

        # ── Cleanup local files after successful DB save ───────────
        _cleanup_local_files(job_id, pdf_path)

    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)
        _supabase_update("check_jobs", {"job_id": job_id}, {
            "status": "error",
            "error_message": str(e)[:500],
        })
        print(f"Job {job_id} failed: {e}")
        traceback.print_exc()


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file, start detection + extraction in background."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("pdf",):
        raise HTTPException(400, "Only PDF files are supported")

    job_id = str(uuid.uuid4())[:8]
    pdf_path = str(UPLOAD_DIR / f"{job_id}.pdf")

    with open(pdf_path, "wb") as f:
        content = await file.read()
        f.write(content)

    file_size = len(content)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "pdf_name": file.filename,
        "pdf_path": pdf_path,
        "file_size": file_size,
        "doc_format": None,
        "total_pages": 0,
        "total_checks": 0,
        "checks": [],
        "pages": [],
        "error": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
    }

    thread = threading.Thread(target=_process_pdf, args=(job_id, pdf_path, file.filename))
    thread.daemon = True
    thread.start()

    return {"job_id": job_id, "status": "pending", "message": "Processing started"}


@app.post("/api/upload-analyze")
async def upload_analyze(file: UploadFile = File(...)):
    """Upload a PDF, detect cheques, return page info with dimensions — no OCR yet."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("pdf",):
        raise HTTPException(400, "Only PDF files are supported")

    job_id = str(uuid.uuid4())[:8]
    pdf_path = str(UPLOAD_DIR / f"{job_id}.pdf")

    with open(pdf_path, "wb") as f:
        content = await file.read()
        f.write(content)

    file_size = len(content)

    # Synchronously analyze the PDF: load pages, detect cheques
    try:
        out_dir = str(OUTPUT_DIR / job_id)
        app_ext = CheckExtractorApp(pdf_path, output_dir=out_dir)

        doc_format = (
            "Contour/Bordered" if app_ext.doc_format == "A"
            else "Line-Grid" if app_ext.doc_format == "B"
            else "Auto"
        )

        # Build page info with dimensions and check counts
        pages_info = []
        total_checks = 0
        for idx, page_img in enumerate(app_ext.pages):
            boxes = app_ext.page_boxes.get(idx, [])
            checks_on_page = len(boxes) if boxes else 0
            total_checks += checks_on_page
            pages_info.append({
                "page_number": idx + 1,
                "width": page_img.width,
                "height": page_img.height,
                "checks_on_page": checks_on_page,
            })

        # Save page images for preview
        pages_dir = os.path.join(out_dir, "pages")
        os.makedirs(pages_dir, exist_ok=True)
        for idx, page_img in enumerate(app_ext.pages):
            page_img.save(os.path.join(pages_dir, f"page_{idx+1}.png"))

        # Also extract check images now so they're ready for preview
        manifest = app_ext.extract_all_images()

        # Build check list
        checks = []
        for cid, img_path, page_num in manifest:
            im = PILImage.open(img_path)
            checks.append({
                "check_id": cid,
                "page": page_num,
                "image_file": os.path.basename(img_path),
                "image_path": img_path,
                "width": im.size[0],
                "height": im.size[1],
                "extraction": None,
            })

        # Store in memory
        jobs[job_id] = {
            "job_id": job_id,
            "status": "analyzed",
            "pdf_name": file.filename,
            "pdf_path": pdf_path,
            "file_size": file_size,
            "doc_format": doc_format,
            "total_pages": len(app_ext.pages),
            "total_checks": len(manifest),
            "checks": checks,
            "pages": pages_info,
            "error": None,
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
            "_app_ext": app_ext,
            "_manifest": manifest,
        }

        # Save to DB immediately
        _supabase_insert("check_jobs", {
            "job_id": job_id,
            "pdf_name": file.filename,
            "status": "analyzed",
            "doc_format": doc_format,
            "total_pages": len(app_ext.pages),
            "total_checks": len(manifest),
            "file_size": file_size,
            "checks_data": json.dumps([]),
        })

        # Upload PDF to storage
        try:
            with open(pdf_path, "rb") as f:
                _supabase_upload_file(
                    "checks", f"jobs/{job_id}/{file.filename}", f.read(), "application/pdf"
                )
        except Exception as e:
            print(f"  PDF storage upload failed: {e}")

        # Upload check images to storage
        for check in checks:
            try:
                with open(check["image_path"], "rb") as f:
                    url = _supabase_upload_file(
                        "checks",
                        f"jobs/{job_id}/images/{check['check_id']}.png",
                        f.read(),
                        "image/png",
                    )
                if url:
                    check["storage_url"] = url
            except Exception as e:
                print(f"  Image upload failed for {check['check_id']}: {e}")

        # Build clean checks list for the response (no local paths)
        checks_response = []
        for c in checks:
            checks_response.append({
                "check_id": c["check_id"],
                "page": c["page"],
                "width": c["width"],
                "height": c["height"],
            })

        return {
            "job_id": job_id,
            "pdf_name": file.filename,
            "file_size": file_size,
            "doc_format": doc_format,
            "total_pages": len(app_ext.pages),
            "total_checks": len(manifest),
            "pages": pages_info,
            "checks": checks_response,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Analysis failed: {str(e)}")


class StartExtractionRequest(BaseModel):
    job_id: str
    methods: list[str] = ["hybrid"]
    page_range: Optional[dict] = None
    cheque_range: Optional[dict] = None
    force: bool = False  # Force re-extraction even if results exist


@app.post("/api/start-extraction")
def start_extraction(req: StartExtractionRequest):
    """Start OCR extraction on a previously analyzed job.
    Supports page_range ({from, to}) and cheque_range ({from, to}) filtering.
    Allows re-extraction on complete jobs (only processes checks without results).
    force=True will re-extract all checks in range regardless of existing results.
    If methods differ from previous extraction, affected checks are re-extracted.
    """
    if req.job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[req.job_id]
    # Allow re-extraction on complete/error jobs too
    if job["status"] in ("extracting", "ocr_running"):
        return {"job_id": req.job_id, "status": job["status"], "message": "Already processing"}

    job["selected_methods"] = req.methods
    job["status"] = "extracting"

    def _run_extraction():
        try:
            app_ext = job.get("_app_ext")
            manifest = job.get("_manifest")
            out_dir = str(OUTPUT_DIR / req.job_id)
            checks = job["checks"]

            if not app_ext or not manifest:
                # Fallback: re-load
                pdf_path = job.get("pdf_path", str(UPLOAD_DIR / f"{req.job_id}.pdf"))
                app_ext = CheckExtractorApp(pdf_path, output_dir=out_dir)
                manifest = app_ext.extract_all_images()

            # ── Filter manifest by range ──────────────────────────
            filtered_manifest = list(manifest)

            if req.cheque_range:
                # Cheque range: 1-indexed cheque numbers
                c_from = max(1, req.cheque_range.get("from", 1))
                c_to = min(len(manifest), req.cheque_range.get("to", len(manifest)))
                filtered_manifest = filtered_manifest[c_from - 1 : c_to]
                print(f"  Cheque range filter: #{c_from}-#{c_to} → {len(filtered_manifest)} checks")
            elif req.page_range:
                p_from = req.page_range.get("from", 1)
                p_to = req.page_range.get("to", job.get("total_pages", 9999))
                filtered_manifest = [
                    (cid, ip, pn) for cid, ip, pn in filtered_manifest
                    if p_from <= pn <= p_to
                ]
                print(f"  Page range filter: pages {p_from}-{p_to} → {len(filtered_manifest)} checks")

            # ── Smart re-extraction logic ─────────────────────────
            # Resolve requested engine set for comparison
            requested_methods = set(req.methods)
            if "hybrid" in requested_methods:
                requested_engines = {"tesseract", "numarkdown", "gemini"}
            else:
                requested_engines = set()
                for m in requested_methods:
                    if m in ("ocr", "tesseract"):
                        requested_engines.add("tesseract")
                    elif m == "numarkdown":
                        requested_engines.add("numarkdown")
                    elif m in ("ai", "gemini"):
                        requested_engines.add("gemini")

            results_dir = os.path.join(out_dir, "ocr_results")

            if not req.force:
                # Build a lookup of check_id → set of methods already used
                checks_by_id = {c["check_id"]: c for c in checks}
                before = len(filtered_manifest)
                keep = []
                for item in filtered_manifest:
                    cid = item[0]
                    c = checks_by_id.get(cid, {})
                    existing_extraction = c.get("extraction")
                    existing_methods = set(c.get("methods_used", []))

                    if not existing_extraction:
                        # No results at all — must extract
                        keep.append(item)
                    elif not requested_engines.issubset(existing_methods):
                        # New methods requested that weren't run before
                        keep.append(item)
                    else:
                        # Already extracted with same or superset of methods — skip
                        pass

                filtered_manifest = keep
                skipped = before - len(filtered_manifest)
                if skipped > 0:
                    print(f"  Smart skip: {skipped} checks already extracted with [{', '.join(sorted(requested_engines))}]")
            else:
                print(f"  Force mode: re-extracting all {len(filtered_manifest)} checks in range")

            if not filtered_manifest:
                print(f"  No checks to process for job {req.job_id}")
                job["status"] = "complete"
                return

            # Run OCR with selected methods
            job["status"] = "ocr_running"
            job["processing_count"] = len(filtered_manifest)
            job["processed_count"] = 0
            job["progress_logs"] = []
            job["extraction_progress"] = 0
            _supabase_update("check_jobs", {"job_id": req.job_id}, {"status": "ocr_running"})

            # Progress callback — updates job dict so polling endpoint returns live data
            def _on_progress(info):
                evt = info.get("event")
                total = info.get("total", 1)

                if evt == "start":
                    engines = info.get("engines", [])
                    job["methods_progress"] = []
                    for eng in engines:
                        job["methods_progress"].append({
                            "method": eng,
                            "status": "running",
                            "progress": 0,
                            "checks_processed": 0,
                            "checks_total": total,
                        })
                    job["progress_logs"].append({
                        "ts": datetime.now().isoformat(),
                        "msg": f"Starting extraction with [{', '.join(engines)}] on {total} cheques",
                        "level": "info",
                    })

                elif evt == "check_start":
                    idx = info.get("index", 0)
                    cid = info.get("check_id", "")
                    page = info.get("page", 0)
                    pct = int((idx / max(total, 1)) * 100)
                    job["extraction_progress"] = pct
                    job["progress_logs"].append({
                        "ts": datetime.now().isoformat(),
                        "msg": f"[{idx+1}/{total}] Extracting {cid} (page {page})...",
                        "level": "info",
                    })

                elif evt == "check_done":
                    idx = info.get("index", 0)
                    cid = info.get("check_id", "")
                    payee = info.get("payee", "?")
                    times = info.get("engine_times_ms", {})
                    has_err = info.get("has_error", False)
                    done = idx + 1
                    pct = int((done / max(total, 1)) * 100)

                    job["processed_count"] = done
                    job["extraction_progress"] = pct

                    # Update per-engine progress
                    if "methods_progress" in job:
                        for mp in job["methods_progress"]:
                            mp["checks_processed"] = done
                            mp["progress"] = pct
                            if done >= total:
                                mp["status"] = "complete"

                    parts = [f"{k}:{v}ms" for k, v in times.items() if v > 0]
                    level = "warn" if has_err else "success"
                    job["progress_logs"].append({
                        "ts": datetime.now().isoformat(),
                        "msg": f"[{done}/{total}] ✓ {cid} — payee={payee} | {' '.join(parts)}",
                        "level": level,
                    })

                    # Keep only last 100 log entries to avoid memory bloat
                    if len(job["progress_logs"]) > 100:
                        job["progress_logs"] = job["progress_logs"][-100:]

            app_ext.run_parallel_ocr(filtered_manifest, methods=req.methods, progress_callback=_on_progress)
            app_ext.save_summary(filtered_manifest)

            # Load results back into checks (for ALL checks, not just filtered)
            for check in checks:
                hybrid_path = os.path.join(results_dir, check["check_id"], "hybrid.json")
                if os.path.exists(hybrid_path):
                    with open(hybrid_path) as f:
                        hybrid = json.load(f)
                    check["extraction"] = hybrid.get("extraction", {})
                    check["methods_used"] = hybrid.get("methods_used", [])

            # Save to DB
            checks_data = []
            for c in checks:
                checks_data.append({
                    "check_id": c["check_id"],
                    "page": c["page"],
                    "width": c["width"],
                    "height": c["height"],
                    "image_url": c.get("storage_url", f"/api/checks/{req.job_id}/{c['check_id']}/image"),
                    "extraction": c.get("extraction"),
                    "methods_used": c.get("methods_used", []),
                })

            _supabase_update("check_jobs", {"job_id": req.job_id}, {
                "status": "complete",
                "checks_data": json.dumps(checks_data),
                "completed_at": datetime.now().isoformat(),
            })

            for c in checks:
                c.pop("image_path", None)

            job.pop("_app_ext", None)
            job.pop("_manifest", None)
            job["status"] = "complete"
            job["completed_at"] = datetime.now().isoformat()

            # ── Cleanup local files after successful extraction ────
            pdf_path = str(UPLOAD_DIR / f"{req.job_id}.pdf")
            _cleanup_local_files(req.job_id, pdf_path)

        except Exception as e:
            job["status"] = "error"
            job["error"] = str(e)
            _supabase_update("check_jobs", {"job_id": req.job_id}, {
                "status": "error",
                "error_message": str(e)[:500],
            })
            print(f"Extraction {req.job_id} failed: {e}")
            traceback.print_exc()

    thread = threading.Thread(target=_run_extraction)
    thread.daemon = True
    thread.start()

    return {"job_id": req.job_id, "status": "extracting", "message": "Extraction started",
            "methods": req.methods}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    """Get job status and results."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    # Return a clean copy without internal fields
    job = {k: v for k, v in jobs[job_id].items() if not k.startswith("_")}
    return job


@app.get("/api/jobs")
def list_jobs():
    """List all jobs."""
    clean = []
    for j in jobs.values():
        clean.append({k: v for k, v in j.items() if not k.startswith("_")})
    return {"jobs": clean}


@app.get("/api/jobs/{job_id}/pdf")
def get_job_pdf(job_id: str):
    """Serve the uploaded PDF for iframe viewing."""
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF not found")
    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@app.get("/api/jobs/{job_id}/pages/{page_num}/image")
def get_page_image(job_id: str, page_num: int):
    """Serve a rendered page image."""
    img_path = OUTPUT_DIR / job_id / "pages" / f"page_{page_num}.png"
    if not img_path.exists():
        raise HTTPException(404, "Page image not found")
    return FileResponse(str(img_path), media_type="image/png")


@app.get("/api/checks/{job_id}/{check_id}/image")
def get_check_image(job_id: str, check_id: str):
    """Get the cropped check image."""
    img_path = OUTPUT_DIR / job_id / "images" / f"{check_id}.png"
    if not img_path.exists():
        raise HTTPException(404, "Check image not found")
    return FileResponse(str(img_path), media_type="image/png")


@app.get("/api/checks/{job_id}/{check_id}/ocr/{engine}")
def get_ocr_result(job_id: str, check_id: str, engine: str):
    """Get OCR result for a specific engine (tesseract, gemini, numarkdown, hybrid)."""
    result_path = OUTPUT_DIR / job_id / "ocr_results" / check_id / f"{engine}.json"
    if not result_path.exists():
        raise HTTPException(404, f"OCR result not found for {engine}")
    with open(result_path) as f:
        return json.load(f)


@app.get("/api/checks/{job_id}/summary")
def get_summary(job_id: str):
    """Get extraction summary for a job."""
    summary_path = OUTPUT_DIR / job_id / "extraction_summary.json"
    if not summary_path.exists():
        raise HTTPException(404, "Summary not found")
    with open(summary_path) as f:
        return json.load(f)


# ── Export helpers ────────────────────────────────────────────────

def _ext_val(ext, field):
    """Safely extract a value from the extraction dict."""
    if not ext:
        return ""
    f = ext.get(field, {})
    if isinstance(f, dict):
        return f.get("value", "")
    return str(f) if f else ""


def _ext_conf(ext, field):
    """Safely extract a confidence score."""
    if not ext:
        return ""
    f = ext.get(field, {})
    if isinstance(f, dict):
        return f.get("confidence", "")
    return ""


def _micr_val(ext, sub_field):
    """Extract MICR sub-field (routing, account, serial)."""
    if not ext:
        return ""
    micr = ext.get("micr", {})
    if isinstance(micr, dict):
        sub = micr.get(sub_field, {})
        if isinstance(sub, dict):
            return sub.get("value", "")
        return str(sub) if sub else ""
    return ""


def _parse_amount(raw: str) -> str:
    """Clean amount string to numeric: '$1,250.00' -> '1250.00'."""
    import re
    if not raw:
        return "0.00"
    cleaned = re.sub(r'[^\d.]', '', raw)
    try:
        return f"{float(cleaned):.2f}"
    except ValueError:
        return "0.00"


def _get_job_checks(job_id: str):
    """Get job and checks, raise HTTPException if not found/ready."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if job["status"] != "complete":
        raise HTTPException(400, "Job not complete yet")
    return job, job.get("checks", [])


def _build_generic_csv(job, checks_list):
    """Generic CSV with all fields."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Check ID", "Page", "Payee", "Amount", "Date", "Check Number",
        "Bank", "Memo", "MICR Routing", "MICR Account", "Confidence"
    ])
    for check in checks_list:
        ext = check.get("extraction", {})
        writer.writerow([
            check.get("check_id", ""),
            check.get("page", ""),
            _ext_val(ext, "payee"),
            _ext_val(ext, "amount"),
            _ext_val(ext, "checkDate"),
            _ext_val(ext, "checkNumber"),
            _ext_val(ext, "bankName"),
            _ext_val(ext, "memo"),
            _micr_val(ext, "routing"),
            _micr_val(ext, "account"),
            ext.get("confidence_summary", "") if ext else "",
        ])
    output.seek(0)
    return output


def _build_quickbooks_iif(job, checks_list, bank_account="Checking", expense_account="Uncategorized Expense"):
    """
    QuickBooks Desktop IIF format.
    Tab-delimited with !TRNS/!SPL/!ENDTRNS structure.
    Transaction type: CHECK.
    """
    lines = []
    # Header rows
    lines.append("\t".join(["!TRNS", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"]))
    lines.append("\t".join(["!SPL", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"]))
    lines.append("!ENDTRNS")

    for check in checks_list:
        ext = check.get("extraction", {})
        payee = _ext_val(ext, "payee")
        amount = _parse_amount(_ext_val(ext, "amount"))
        date = _ext_val(ext, "checkDate")
        check_num = _ext_val(ext, "checkNumber")
        memo = _ext_val(ext, "memo")

        # TRNS line: bank account (negative amount = money leaving bank)
        lines.append("\t".join([
            "TRNS", "CHECK", date, bank_account, payee,
            f"-{amount}", check_num, memo
        ]))
        # SPL line: expense account (positive amount)
        lines.append("\t".join([
            "SPL", "CHECK", date, expense_account, payee,
            amount, check_num, memo
        ]))
        lines.append("ENDTRNS")

    output = io.StringIO("\n".join(lines) + "\n")
    return output


def _build_quickbooks_online_csv(job, checks_list):
    """
    QuickBooks Online CSV import format.
    Columns: Date, Transaction Type, Num, Name, Memo/Description, Account, Amount
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Transaction Type", "Num", "Name", "Memo/Description", "Account", "Amount"])

    for check in checks_list:
        ext = check.get("extraction", {})
        writer.writerow([
            _ext_val(ext, "checkDate"),
            "Check",
            _ext_val(ext, "checkNumber"),
            _ext_val(ext, "payee"),
            _ext_val(ext, "memo"),
            _ext_val(ext, "bankName") or "Checking",
            f"-{_parse_amount(_ext_val(ext, 'amount'))}",
        ])

    output.seek(0)
    return output


def _build_xero_csv(job, checks_list):
    """
    Xero bank statement CSV import format.
    Columns: Date, Amount, Payee, Description, Reference, Check Number
    Amount is negative for payments (checks).
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Amount", "Payee", "Description", "Reference", "Check Number"])

    for check in checks_list:
        ext = check.get("extraction", {})
        writer.writerow([
            _ext_val(ext, "checkDate"),
            f"-{_parse_amount(_ext_val(ext, 'amount'))}",
            _ext_val(ext, "payee"),
            _ext_val(ext, "memo"),
            _ext_val(ext, "checkNumber"),
            _ext_val(ext, "checkNumber"),
        ])

    output.seek(0)
    return output


def _build_zoho_csv(job, checks_list):
    """
    Zoho Books CSV import format.
    Columns: Date, Reference Number, Payee Name, Amount, Account, Description
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Reference Number", "Payee Name", "Amount", "Account", "Description"])

    for check in checks_list:
        ext = check.get("extraction", {})
        writer.writerow([
            _ext_val(ext, "checkDate"),
            _ext_val(ext, "checkNumber"),
            _ext_val(ext, "payee"),
            _parse_amount(_ext_val(ext, "amount")),
            _ext_val(ext, "bankName") or "Petty Cash",
            _ext_val(ext, "memo"),
        ])

    output.seek(0)
    return output


def _build_sage_csv(job, checks_list):
    """
    Sage CSV import format.
    Columns: Date, Reference, Description, Amount, Bank Account
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Reference", "Description", "Amount", "Bank Account"])

    for check in checks_list:
        ext = check.get("extraction", {})
        payee = _ext_val(ext, "payee")
        memo = _ext_val(ext, "memo")
        desc = f"{payee} - {memo}" if memo else payee
        writer.writerow([
            _ext_val(ext, "checkDate"),
            _ext_val(ext, "checkNumber"),
            desc,
            f"-{_parse_amount(_ext_val(ext, 'amount'))}",
            _ext_val(ext, "bankName") or "Bank Account",
        ])

    output.seek(0)
    return output


@app.get("/api/jobs/{job_id}/export")
def export_job(job_id: str, format: str = "csv", bank_account: str = "Checking", expense_account: str = "Uncategorized Expense"):
    """
    Export job results in various accounting formats.

    Query params:
      - format: csv | iif | qbo | xero | zoho | sage  (default: csv)
      - bank_account: bank account name for IIF (default: Checking)
      - expense_account: expense account name for IIF (default: Uncategorized Expense)
    """
    job, checks_list = _get_job_checks(job_id)
    base_name = job["pdf_name"].rsplit(".", 1)[0]

    if format == "iif":
        output = _build_quickbooks_iif(job, checks_list, bank_account, expense_account)
        return StreamingResponse(
            output,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_checks.iif"'},
        )

    elif format == "qbo":
        output = _build_quickbooks_online_csv(job, checks_list)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_quickbooks_online.csv"'},
        )

    elif format == "xero":
        output = _build_xero_csv(job, checks_list)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_xero.csv"'},
        )

    elif format == "zoho":
        output = _build_zoho_csv(job, checks_list)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_zoho.csv"'},
        )

    elif format == "sage":
        output = _build_sage_csv(job, checks_list)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_sage.csv"'},
        )

    else:
        # Default: generic CSV
        output = _build_generic_csv(job, checks_list)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{base_name}_checks.csv"'},
        )


@app.get("/api/export-formats")
def list_export_formats():
    """List all supported export formats with descriptions."""
    return {
        "formats": [
            {"id": "csv",  "name": "Generic CSV",          "ext": ".csv", "description": "Standard CSV with all fields. Works with Excel, Google Sheets."},
            {"id": "iif",  "name": "QuickBooks Desktop",   "ext": ".iif", "description": "IIF format for QuickBooks Desktop. Imports as CHECK transactions."},
            {"id": "qbo",  "name": "QuickBooks Online",    "ext": ".csv", "description": "CSV format for QuickBooks Online bank transaction import."},
            {"id": "xero", "name": "Xero",                 "ext": ".csv", "description": "Bank statement CSV for Xero. Amounts are negative for payments."},
            {"id": "zoho", "name": "Zoho Books",           "ext": ".csv", "description": "CSV format for Zoho Books bank statement import."},
            {"id": "sage", "name": "Sage",                 "ext": ".csv", "description": "CSV format for Sage accounting import."},
        ]
    }


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    """Delete a job and its files."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    out_path = OUTPUT_DIR / job_id
    if out_path.exists():
        shutil.rmtree(out_path)
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    del jobs[job_id]
    return {"message": "Job deleted"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3090))
    print(f"\n{'='*60}")
    print(f"  Check Extractor API Server")
    print(f"  http://localhost:{port}")
    print(f"  Docs: http://localhost:{port}/docs")
    print(f"{'='*60}\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
