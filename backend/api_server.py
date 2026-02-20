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

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from PIL import Image as PILImage
import hashlib

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


def _supabase_select(table: str, columns: str = "*", filters: dict = None, limit: int = 200):
    """Select rows from a Supabase table. Returns list of dicts or empty list."""
    if not _supabase_ok:
        return []
    query = f"{_sb_url}/rest/v1/{table}?select={columns}"
    if filters:
        query += "&" + "&".join(f"{k}=eq.{v}" for k, v in filters.items())
    query += f"&limit={limit}&order=created_at.desc"
    try:
        resp = _requests.get(query, headers=_sb_headers(), timeout=15)
        if resp.status_code >= 400:
            print(f"  Supabase select error ({resp.status_code}): {resp.text[:200]}")
            return []
        return resp.json()
    except Exception as e:
        print(f"  Supabase select exception: {e}")
        return []


def _supabase_rpc(fn_name: str, params: dict = None):
    """Call a Supabase RPC function."""
    if not _supabase_ok:
        return None
    try:
        resp = _requests.post(
            f"{_sb_url}/rest/v1/rpc/{fn_name}",
            headers=_sb_headers(),
            json=params or {},
            timeout=15,
        )
        if resp.status_code >= 400:
            print(f"  Supabase RPC {fn_name} error ({resp.status_code}): {resp.text[:200]}")
            return None
        return resp.json()
    except Exception as e:
        print(f"  Supabase RPC {fn_name} exception: {e}")
        return None


def _load_jobs_from_supabase():
    """Load existing jobs from Supabase into in-memory store on startup."""
    rows = _supabase_select("check_jobs")
    if not rows:
        return
    loaded = 0
    for row in rows:
        jid = row.get("job_id")
        if not jid or jid in jobs:
            continue
        checks_data = row.get("checks_data", [])
        if isinstance(checks_data, str):
            try:
                checks_data = json.loads(checks_data)
            except Exception:
                checks_data = []
        # Rebuild in-memory check list from DB
        checks = []
        for cd in (checks_data or []):
            checks.append({
                "check_id": cd.get("check_id", ""),
                "page": cd.get("page", 0),
                "width": cd.get("width", 0),
                "height": cd.get("height", 0),
                "extraction": cd.get("extraction"),
                "methods_used": cd.get("methods_used", []),
                "storage_url": cd.get("image_url", ""),
                "engine_results": cd.get("engine_results", {}),
                "engine_times_ms": cd.get("engine_times_ms", {}),
            })
        jobs[jid] = {
            "job_id": jid,
            "status": row.get("status", "unknown"),
            "pdf_name": row.get("pdf_name", ""),
                "pdf_url": row.get("pdf_url"),
            "file_size": row.get("file_size"),
            "doc_format": row.get("doc_format"),
            "total_pages": row.get("total_pages", 0),
            "total_checks": row.get("total_checks", 0),
            "checks": checks,
            "error": row.get("error_message"),
            "created_at": row.get("created_at", ""),
            "completed_at": row.get("completed_at"),
        }
        loaded += 1
    if loaded:
        print(f"✓ Loaded {loaded} jobs from Supabase")


def _cleanup_local_files(job_id: str, pdf_path: str = None, keep_images: bool = False):
    """Remove local files after extraction completes.
    Always deletes: uploaded PDF, OCR result JSONs, page images.
    Images are kept if keep_images=True (e.g. when Supabase storage upload failed).
    """
    cleaned = []
    # Remove uploaded PDF
    if pdf_path and os.path.exists(pdf_path):
        try:
            os.remove(pdf_path)
            cleaned.append(f"PDF: {os.path.basename(pdf_path)}")
        except Exception as e:
            print(f"  Cleanup: failed to remove PDF {pdf_path}: {e}")

    out_dir = OUTPUT_DIR / job_id
    if not out_dir.exists():
        return

    # Always remove OCR result JSONs
    ocr_dir = out_dir / "ocr_results"
    if ocr_dir.exists():
        try:
            shutil.rmtree(str(ocr_dir))
            cleaned.append("ocr_results/")
        except Exception as e:
            print(f"  Cleanup: failed to remove {ocr_dir}: {e}")

    # Always remove page images
    pages_dir = out_dir / "pages"
    if pages_dir.exists():
        try:
            shutil.rmtree(str(pages_dir))
            cleaned.append("pages/")
        except Exception as e:
            print(f"  Cleanup: failed to remove {pages_dir}: {e}")

    # Remove check images only if they were uploaded to Supabase Storage
    if not keep_images:
        images_dir = out_dir / "images"
        if images_dir.exists():
            try:
                shutil.rmtree(str(images_dir))
                cleaned.append("images/")
            except Exception as e:
                print(f"  Cleanup: failed to remove {images_dir}: {e}")

    # Remove the job output dir if it's now empty
    try:
        if out_dir.exists() and not any(out_dir.iterdir()):
            out_dir.rmdir()
            cleaned.append(f"output/{job_id}/")
    except Exception:
        pass

    if cleaned:
        print(f"  Cleanup {job_id}: removed {', '.join(cleaned)}")


def _load_engine_results(results_dir: str, check: dict):
    """Load per-engine OCR results + hybrid into a check dict.
    Populates check['extraction'], check['methods_used'], and check['engine_results'].
    """
    cid = check["check_id"]
    check_dir = os.path.join(results_dir, cid)
    if not os.path.isdir(check_dir):
        return
    # Load hybrid
    hybrid_path = os.path.join(check_dir, "hybrid.json")
    if os.path.exists(hybrid_path):
        with open(hybrid_path) as f:
            hybrid = json.load(f)
        check["extraction"] = hybrid.get("extraction", {})
        check["methods_used"] = hybrid.get("methods_used", [])
        check["engine_times_ms"] = hybrid.get("engine_times_ms", {})
    # Load individual engine results
    engine_results = {}
    for engine in ("tesseract", "numarkdown", "gemini"):
        eng_path = os.path.join(check_dir, f"{engine}.json")
        if os.path.exists(eng_path):
            try:
                with open(eng_path) as f:
                    data = json.load(f)
                engine_results[engine] = data.get("fields", {})
            except Exception:
                pass
    if engine_results:
        check["engine_results"] = engine_results


# ── Optional JWT auth ────────────────────────────────────────
_require_auth = os.environ.get("REQUIRE_AUTH", "").lower() in ("true", "1", "yes")
_jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")

try:
    import jwt as _pyjwt
    _HAS_JWT = True
except ImportError:
    _HAS_JWT = False
    if _require_auth:
        print("⚠ REQUIRE_AUTH is set but PyJWT not installed. Auth disabled.")
        _require_auth = False


def _verify_token(request: Request):
    """Verify Supabase JWT from Authorization header. Skips if auth not required."""
    if not _require_auth:
        return None
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = auth[7:]
    try:
        payload = _pyjwt.decode(
            token,
            _jwt_secret or _sb_key,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {e}")


app = FastAPI(title="Check Extractor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3080", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if _require_auth:
    print("✓ Backend auth enabled — JWT verification required on API calls")

# In-memory job store
jobs: dict = {}
_SCRIPT_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = _SCRIPT_DIR / "uploads"
OUTPUT_DIR = _SCRIPT_DIR / "output"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Load persisted jobs from Supabase on startup
_load_jobs_from_supabase()


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
            "status": "detecting",
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
        jobs[job_id]["status"] = "ocr_running"
        jobs[job_id]["processing_count"] = len(manifest)
        jobs[job_id]["processed_count"] = 0
        jobs[job_id]["progress_logs"] = []
        jobs[job_id]["extraction_progress"] = 0

        def _on_progress_legacy(info):
            evt = info.get("event")
            total = info.get("total", 1)
            if evt == "check_done":
                done = info.get("index", 0) + 1
                pct = int((done / max(total, 1)) * 100)
                jobs[job_id]["processed_count"] = done
                jobs[job_id]["extraction_progress"] = pct

        try:
            app_ext.run_parallel_ocr(manifest, progress_callback=_on_progress_legacy)
            app_ext.save_summary(manifest)

            # Load all engine results back into checks
            results_dir = os.path.join(out_dir, "ocr_results")
            for check in checks:
                _load_engine_results(results_dir, check)
        except Exception as ocr_err:
            print(f"OCR phase error (non-fatal): {ocr_err}")
            traceback.print_exc()

        # ── Upload page images to Supabase Storage ───────────────
        pages_dir = Path(out_dir) / "pages"
        if pages_dir.exists():
            for page_file in pages_dir.glob("page_*.png"):
                try:
                    with open(page_file, "rb") as f:
                        _supabase_upload_file(
                            "checks",
                            f"jobs/{job_id}/pages/{page_file.name}",
                            f.read(),
                            "image/png",
                        )
                except Exception as e:
                    print(f"  Page image upload failed for {page_file.name}: {e}")

        # ── Upload OCR result JSONs to Supabase Storage ──────────
        ocr_results_dir = Path(out_dir) / "ocr_results"
        if ocr_results_dir.exists():
            for check_dir in ocr_results_dir.iterdir():
                if check_dir.is_dir():
                    for json_file in check_dir.glob("*.json"):
                        try:
                            with open(json_file, "rb") as f:
                                _supabase_upload_file(
                                    "checks",
                                    f"jobs/{job_id}/ocr_results/{check_dir.name}/{json_file.name}",
                                    f.read(),
                                    "text/plain",  # Supabase doesn't accept application/json
                                )
                        except Exception as e:
                            print(f"  OCR JSON upload failed for {json_file.name}: {e}")

        # ── Upload extraction summary to Supabase Storage ─────────
        summary_file = Path(out_dir) / "extraction_summary.json"
        if summary_file.exists():
            try:
                with open(summary_file, "rb") as f:
                    _supabase_upload_file(
                        "checks",
                        f"jobs/{job_id}/extraction_summary.json",
                        f.read(),
                        "text/plain",  # Supabase doesn't accept application/json
                    )
            except Exception as e:
                print(f"  Extraction summary upload failed: {e}")

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
                "methods_used": c.get("methods_used", []),
                "engine_results": c.get("engine_results", {}),
                "engine_times_ms": c.get("engine_times_ms", {}),
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

        # Track incomplete extractions
        incomplete = [c for c in checks if not c.get("extraction")]
        if incomplete:
            jobs[job_id]["has_incomplete"] = True
            jobs[job_id]["incomplete_count"] = len(incomplete)
            print(f"  Warning: {len(incomplete)}/{len(checks)} checks have no extraction")
        else:
            jobs[job_id]["has_incomplete"] = False
            jobs[job_id]["incomplete_count"] = 0

        # Flatten checks_data into individual rows in the checks table
        _supabase_rpc("flatten_checks_from_job", {"p_job_id": job_id})

        # ── Cleanup local files after successful DB save ───────────
        # All files are now in Storage, safe to delete everything locally
        _cleanup_local_files(job_id, pdf_path, keep_images=False)

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
async def upload_pdf(file: UploadFile = File(...), _auth=Depends(_verify_token)):
    """Upload a PDF file, start detection + extraction in background."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("pdf",):
        raise HTTPException(400, "Only PDF files are supported")

    content = await file.read()
    file_size = len(content)

    # Duplicate detection: check if same filename + size already exists
    file_hash = hashlib.md5(content).hexdigest()
    for existing in jobs.values():
        if (existing.get("pdf_name") == file.filename
                and existing.get("file_size") == file_size
                and existing.get("file_hash") == file_hash
                and existing.get("status") not in ("error",)):
            return {"job_id": existing["job_id"], "status": existing["status"],
                    "message": "Duplicate detected — returning existing job", "duplicate": True}

    job_id = str(uuid.uuid4())[:8]
    pdf_path = str(UPLOAD_DIR / f"{job_id}.pdf")

    with open(pdf_path, "wb") as f:
        f.write(content)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "pdf_name": file.filename,
        "pdf_path": pdf_path,
        "file_size": file_size,
        "file_hash": file_hash,
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
async def upload_analyze(file: UploadFile = File(...), _auth=Depends(_verify_token)):
    """Upload a PDF, detect cheques, return page info with dimensions — no OCR yet."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("pdf",):
        raise HTTPException(400, "Only PDF files are supported")

    content = await file.read()
    file_size = len(content)

    # Duplicate detection
    file_hash = hashlib.md5(content).hexdigest()
    for existing in jobs.values():
        if (existing.get("pdf_name") == file.filename
                and existing.get("file_size") == file_size
                and existing.get("file_hash") == file_hash
                and existing.get("status") not in ("error",)):
            return {"job_id": existing["job_id"], "status": existing["status"],
                    "message": "Duplicate detected — returning existing job", "duplicate": True}

    job_id = str(uuid.uuid4())[:8]
    pdf_path = str(UPLOAD_DIR / f"{job_id}.pdf")

    with open(pdf_path, "wb") as f:
        f.write(content)

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
            "file_hash": file_hash,
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
def start_extraction(req: StartExtractionRequest, _auth=Depends(_verify_token)):
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
                # Check if we have existing check images - if so, we can re-extract without PDF
                images_dir = Path(out_dir) / "images"
                has_images = images_dir.exists() and any(images_dir.glob("check_*.png"))
                
                if has_images:
                    # Build manifest from existing check images
                    print(f"  ✓ Using existing check images for re-extraction (PDF not needed)")
                    manifest = []
                    for check in checks:
                        cid = check["check_id"]
                        img_path = str(images_dir / f"{cid}.png")
                        if os.path.exists(img_path):
                            manifest.append((cid, img_path, check["page"]))
                    
                    if not manifest:
                        raise HTTPException(404, "No check images found. Please re-upload the PDF.")
                    
                    print(f"  ✓ Found {len(manifest)} existing check images")
                else:
                    # Need to extract from PDF
                    pdf_path = job.get("pdf_path", str(UPLOAD_DIR / f"{req.job_id}.pdf"))
                    
                    # If local PDF doesn't exist, try to download from Supabase Storage
                    if not os.path.exists(pdf_path):
                        pdf_url = job.get("pdf_url") or jobs[req.job_id].get("pdf_url")
                        if pdf_url and _supabase_ok:
                            try:
                                print(f"  Local PDF missing, downloading from Storage: {pdf_url}")
                                resp = _requests.get(pdf_url, timeout=30)
                                if resp.status_code == 200:
                                    UPLOAD_DIR.mkdir(exist_ok=True)
                                    with open(pdf_path, "wb") as f:
                                        f.write(resp.content)
                                    print(f"  ✓ Downloaded PDF ({len(resp.content)} bytes)")
                                else:
                                    raise HTTPException(404, f"PDF not found locally or in Storage (HTTP {resp.status_code})")
                            except Exception as e:
                                raise HTTPException(500, f"Failed to download PDF from Storage: {e}")
                        else:
                            raise HTTPException(
                                404, 
                                f"PDF file not found. The original PDF for job {req.job_id} was not uploaded to Storage. "
                                f"Please delete this job and re-upload the PDF to extract it again."
                            )
                    
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

            # Load all engine results back into checks (for ALL checks, not just filtered)
            for check in checks:
                _load_engine_results(results_dir, check)

            # ── Upload page images to Supabase Storage ───────────────
            pages_dir = Path(out_dir) / "pages"
            if pages_dir.exists():
                for page_file in pages_dir.glob("page_*.png"):
                    try:
                        with open(page_file, "rb") as f:
                            _supabase_upload_file(
                                "checks",
                                f"jobs/{req.job_id}/pages/{page_file.name}",
                                f.read(),
                                "image/png",
                            )
                    except Exception as e:
                        print(f"  Page image upload failed for {page_file.name}: {e}")

            # ── Upload OCR result JSONs to Supabase Storage ──────────
            ocr_results_dir = Path(out_dir) / "ocr_results"
            if ocr_results_dir.exists():
                for check_dir in ocr_results_dir.iterdir():
                    if check_dir.is_dir():
                        for json_file in check_dir.glob("*.json"):
                            try:
                                with open(json_file, "rb") as f:
                                    _supabase_upload_file(
                                        "checks",
                                        f"jobs/{req.job_id}/ocr_results/{check_dir.name}/{json_file.name}",
                                        f.read(),
                                        "text/plain",  # Supabase doesn't accept application/json
                                    )
                            except Exception as e:
                                print(f"  OCR JSON upload failed for {json_file.name}: {e}")

            # ── Upload extraction summary to Supabase Storage ─────────
            summary_file = Path(out_dir) / "extraction_summary.json"
            if summary_file.exists():
                try:
                    with open(summary_file, "rb") as f:
                        _supabase_upload_file(
                            "checks",
                            f"jobs/{req.job_id}/extraction_summary.json",
                            f.read(),
                            "text/plain",  # Supabase doesn't accept application/json
                        )
                except Exception as e:
                    print(f"  Extraction summary upload failed: {e}")

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
                    "engine_results": c.get("engine_results", {}),
                    "engine_times_ms": c.get("engine_times_ms", {}),
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

            # Track incomplete extractions
            incomplete = [c for c in checks if not c.get("extraction")]
            if incomplete:
                job["has_incomplete"] = True
                job["incomplete_count"] = len(incomplete)
                print(f"  Warning: {len(incomplete)}/{len(checks)} checks have no extraction")
            else:
                job["has_incomplete"] = False
                job["incomplete_count"] = 0

            # Flatten checks_data into individual rows in the checks table
            _supabase_rpc("flatten_checks_from_job", {"p_job_id": req.job_id})

            # ── Cleanup local files after successful extraction ────
            # All files are now in Storage, safe to delete everything locally
            pdf_path = str(UPLOAD_DIR / f"{req.job_id}.pdf")
            _cleanup_local_files(req.job_id, pdf_path, keep_images=False)

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
def list_jobs(limit: int = 50, offset: int = 0, status: str = None):
    """List jobs with optional pagination and status filter."""
    all_jobs = list(jobs.values())
    # Sort by created_at descending
    all_jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    # Filter by status if provided
    if status:
        all_jobs = [j for j in all_jobs if j.get("status") == status]
    total = len(all_jobs)
    # Paginate
    page = all_jobs[offset:offset + limit]
    clean = []
    for j in page:
        clean.append({k: v for k, v in j.items() if not k.startswith("_")})
    return {"jobs": clean, "total": total, "limit": limit, "offset": offset}


@app.get("/api/jobs/{job_id}/pdf")
def get_job_pdf(job_id: str):
    """Serve the uploaded PDF for iframe viewing. Falls back to Supabase Storage."""
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    if not pdf_path.exists():
        # Try Supabase Storage fallback
        job = jobs.get(job_id)
        if job:
            pdf_name = job.get("pdf_name", "")
            if _supabase_ok and pdf_name:
                storage_url = f"{_sb_url}/storage/v1/object/public/checks/jobs/{job_id}/{pdf_name}"
                return RedirectResponse(storage_url)
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
    """Get the cropped check image. Falls back to Supabase Storage if local file was cleaned up."""
    img_path = OUTPUT_DIR / job_id / "images" / f"{check_id}.png"
    if img_path.exists():
        return FileResponse(str(img_path), media_type="image/png")
    # Fallback: check in-memory job for storage_url
    job = jobs.get(job_id)
    if job:
        for c in job.get("checks", []):
            if c.get("check_id") == check_id:
                url = c.get("storage_url", "")
                if url and url.startswith("http"):
                    return RedirectResponse(url)
    # Fallback: construct Supabase Storage URL
    if _supabase_ok:
        storage_url = f"{_sb_url}/storage/v1/object/public/checks/jobs/{job_id}/images/{check_id}.png"
        return RedirectResponse(storage_url)
    raise HTTPException(404, "Check image not found")


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


@app.post("/api/jobs/{job_id}/retry-failed")
def retry_failed(job_id: str, _auth=Depends(_verify_token)):
    """Re-extract only checks that have null extraction (failed/incomplete)."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if job["status"] in ("extracting", "ocr_running"):
        return {"job_id": job_id, "status": job["status"], "message": "Already processing"}

    incomplete = [c for c in job.get("checks", []) if not c.get("extraction")]
    if not incomplete:
        return {"job_id": job_id, "message": "All checks already extracted", "incomplete": 0}

    # Trigger extraction with force=False — the smart skip logic will only process
    # checks without existing results
    req = StartExtractionRequest(
        job_id=job_id,
        methods=job.get("selected_methods", ["hybrid"]),
        force=False,
    )
    return start_extraction(req, _auth=None)


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str, _auth=Depends(_verify_token)):
    """Delete a job and its local files + Supabase data."""
    # Allow deleting jobs that exist in DB but not in memory
    in_memory = job_id in jobs
    if not in_memory and not _supabase_ok:
        raise HTTPException(404, "Job not found")

    out_path = OUTPUT_DIR / job_id
    if out_path.exists():
        shutil.rmtree(out_path)
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    # Delete from Supabase DB
    if _supabase_ok:
        try:
            _requests.delete(
                f"{_sb_url}/rest/v1/check_jobs?job_id=eq.{job_id}",
                headers=_sb_headers(),
                timeout=10,
            )
        except Exception as e:
            print(f"  Supabase delete error: {e}")

    if in_memory:
        del jobs[job_id]
    return {"message": "Job deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# QuickBooks Data Management
# ══════════════════════════════════════════════════════════════════════════════

class QuickBooksEntry(BaseModel):
    """QuickBooks entry model for comparison"""
    check_number: str
    date: str
    amount: str
    payee: str
    account: str
    memo: Optional[str] = ""


@app.get("/api/quickbooks/entries")
def get_quickbooks_entries(_auth=Depends(_verify_token)):
    """
    Get QuickBooks entries for comparison.
    In production, this would fetch from QuickBooks API or uploaded CSV.
    For now, returns data from Supabase table 'quickbooks_entries' if available.
    """
    if not _supabase_ok:
        return {"entries": []}
    
    entries = _supabase_select("quickbooks_entries", limit=1000)
    return {"entries": entries or []}


@app.post("/api/quickbooks/upload")
async def upload_quickbooks_data(file: UploadFile = File(...), _auth=Depends(_verify_token)):
    """
    Upload QuickBooks data from CSV/IIF file for comparison.
    Parses the file and stores entries in Supabase.
    """
    if not _supabase_ok:
        raise HTTPException(503, "Database not configured")
    
    try:
        content = await file.read()
        text = content.decode('utf-8')
        
        # Parse CSV (assuming QuickBooks export format)
        entries = []
        lines = text.strip().split('\n')
        
        # Try to detect format
        if lines[0].startswith('!'):
            # IIF format
            entries = _parse_iif_format(lines)
        else:
            # CSV format
            reader = csv.DictReader(io.StringIO(text))
            for row in reader:
                # Normalize column names (QuickBooks exports vary)
                entry = {
                    'check_number': row.get('Num') or row.get('Check Number') or row.get('Number') or '',
                    'date': row.get('Date') or '',
                    'amount': row.get('Amount') or '',
                    'payee': row.get('Name') or row.get('Payee') or '',
                    'account': row.get('Account') or 'Checking',
                    'memo': row.get('Memo') or row.get('Description') or '',
                }
                if entry['check_number']:  # Only add if has check number
                    entries.append(entry)
        
        # Store in Supabase
        if entries:
            # Clear existing entries (or implement merge logic)
            _requests.delete(
                f"{_sb_url}/rest/v1/quickbooks_entries?id=gt.0",
                headers=_sb_headers(),
                timeout=10,
            )
            
            # Insert new entries
            resp = _requests.post(
                f"{_sb_url}/rest/v1/quickbooks_entries",
                headers=_sb_headers(),
                json=entries,
                timeout=30,
            )
            
            if resp.status_code >= 400:
                raise HTTPException(500, f"Failed to store entries: {resp.text[:200]}")
        
        return {
            "message": "QuickBooks data uploaded successfully",
            "entries_count": len(entries),
            "entries": entries[:10]  # Return first 10 as preview
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to process file: {str(e)}")


def _parse_iif_format(lines):
    """Parse QuickBooks IIF format"""
    entries = []
    current_entry = {}
    
    for line in lines:
        if line.startswith('!'):
            continue  # Skip header lines
        
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        
        record_type = parts[0]
        
        if record_type == 'TRNS':
            # Transaction line
            if current_entry and current_entry.get('check_number'):
                entries.append(current_entry)
            
            current_entry = {
                'check_number': parts[6] if len(parts) > 6 else '',
                'date': parts[2] if len(parts) > 2 else '',
                'payee': parts[4] if len(parts) > 4 else '',
                'amount': parts[5].replace('-', '') if len(parts) > 5 else '',
                'account': parts[3] if len(parts) > 3 else '',
                'memo': parts[7] if len(parts) > 7 else '',
            }
        elif record_type == 'ENDTRNS':
            if current_entry and current_entry.get('check_number'):
                entries.append(current_entry)
                current_entry = {}
    
    return entries


@app.delete("/api/quickbooks/entries")
def clear_quickbooks_entries(_auth=Depends(_verify_token)):
    """Clear all QuickBooks entries from database"""
    if not _supabase_ok:
        raise HTTPException(503, "Database not configured")
    
    try:
        _requests.delete(
            f"{_sb_url}/rest/v1/quickbooks_entries?id=gt.0",
            headers=_sb_headers(),
            timeout=10,
        )
        return {"message": "QuickBooks entries cleared"}
    except Exception as e:
        raise HTTPException(500, f"Failed to clear entries: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# Settings & Integrations Management
# ══════════════════════════════════════════════════════════════════════════════

class IntegrationSettings(BaseModel):
    """Integration settings model"""
    gemini_api_key: Optional[str] = None


@app.get("/api/settings/integrations")
def get_integration_settings(_auth=Depends(_verify_token)):
    """
    Get integration settings and status.
    Returns masked API keys for security.
    """
    if not _supabase_ok:
        # Return local environment status if no DB
        return {
            "geminiApiKey": bool(os.environ.get("GEMINI_API_KEY")),
            "qboConnected": False,
            "storageType": "local",
        }
    
    try:
        # Fetch from Supabase settings table
        settings = _supabase_select("app_settings", limit=1)
        
        if settings and len(settings) > 0:
            setting = settings[0]
            return {
                "geminiApiKey": bool(setting.get("gemini_api_key")),
                "qboConnected": bool(setting.get("qbo_connected")),
                "qboCompanyId": setting.get("qbo_company_id"),
                "storageType": "supabase",
            }
        
        # No settings found, return defaults
        return {
            "geminiApiKey": bool(os.environ.get("GEMINI_API_KEY")),
            "qboConnected": False,
            "storageType": "supabase",
        }
    except Exception as e:
        print(f"Error fetching integration settings: {e}")
        return {
            "geminiApiKey": bool(os.environ.get("GEMINI_API_KEY")),
            "qboConnected": False,
            "storageType": "error",
        }


@app.patch("/api/settings/integrations")
async def update_integration_settings(settings: IntegrationSettings, _auth=Depends(_verify_token)):
    """
    Update integration settings.
    Stores API keys securely in Supabase.
    """
    if not _supabase_ok:
        raise HTTPException(503, "Database not configured. API keys cannot be stored securely.")
    
    try:
        # Check if settings record exists
        print(f"🔍 Checking for existing app_settings record...")
        existing = _supabase_select("app_settings", limit=1)
        print(f"✓ Existing records found: {len(existing) if existing else 0}")
        
        update_data = {}
        if settings.gemini_api_key:
            update_data["gemini_api_key"] = settings.gemini_api_key
            # Also update environment variable for current session
            os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
        
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        if existing and len(existing) > 0:
            # Update existing record
            setting_id = existing[0].get("id")
            print(f"📝 Updating existing record with id={setting_id}")
            print(f"   URL: {_sb_url}/rest/v1/app_settings?id=eq.{setting_id}")
            print(f"   Data: {update_data}")
            resp = _requests.patch(
                f"{_sb_url}/rest/v1/app_settings?id=eq.{setting_id}",
                headers=_sb_headers(),
                json=update_data,
                timeout=10,
            )
        else:
            # Create new record
            update_data["id"] = 1  # Single settings record
            update_data["created_at"] = datetime.utcnow().isoformat()
            print(f"➕ Creating new record")
            print(f"   URL: {_sb_url}/rest/v1/app_settings")
            print(f"   Data: {update_data}")
            resp = _requests.post(
                f"{_sb_url}/rest/v1/app_settings",
                headers=_sb_headers(),
                json=update_data,
                timeout=10,
            )
        
        print(f"📡 Response status: {resp.status_code}")
        print(f"📡 Response body: {resp.text[:500]}")
        
        if resp.status_code >= 400:
            print(f"❌ ERROR: {resp.text}")
            raise HTTPException(500, f"Failed to save settings: {resp.text[:200]}")
        
        print(f"✅ Settings saved successfully!")
        return {
            "message": "Settings updated successfully",
            "geminiApiKey": bool(settings.gemini_api_key),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ EXCEPTION: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Failed to update settings: {str(e)}")


@app.get("/api/settings/api-keys/status")
def get_api_keys_status(_auth=Depends(_verify_token)):
    """
    Check which API keys are configured (without exposing the actual keys).
    """
    return {
        "gemini": bool(os.environ.get("GEMINI_API_KEY")),
        "supabase": _supabase_ok,
        "storage": "supabase" if _supabase_ok else "local",
    }


# ══════════════════════════════════════════════════════════════════════════════
# QuickBooks OAuth Integration
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/qbo/auth")
def initiate_qbo_auth(_auth=Depends(_verify_token)):
    """
    Initiate QuickBooks OAuth flow.
    Returns the authorization URL to redirect the user to.
    """
    client_id = os.environ.get("INTUIT_CLIENT_ID")
    redirect_uri = os.environ.get("INTUIT_REDIRECT_URI")
    
    if not client_id or not redirect_uri:
        raise HTTPException(503, "QuickBooks OAuth not configured. Set INTUIT_CLIENT_ID and INTUIT_REDIRECT_URI environment variables.")
    
    # QuickBooks OAuth 2.0 authorization endpoint
    auth_url = "https://appcenter.intuit.com/connect/oauth2"
    
    # Generate state parameter for CSRF protection
    import secrets
    state = secrets.token_urlsafe(32)
    
    # Store state in session or database for verification
    # For now, we'll include it in the URL
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "com.intuit.quickbooks.accounting",
        "state": state,
    }
    
    from urllib.parse import urlencode
    auth_url_with_params = f"{auth_url}?{urlencode(params)}"
    
    return {
        "authUrl": auth_url_with_params,
        "state": state,
    }


@app.get("/api/qbo/callback")
async def qbo_oauth_callback(code: str, state: str, realmId: str):
    """
    QuickBooks OAuth callback endpoint.
    Exchanges authorization code for access token.
    """
    client_id = os.environ.get("INTUIT_CLIENT_ID")
    client_secret = os.environ.get("INTUIT_CLIENT_SECRET")
    redirect_uri = os.environ.get("INTUIT_REDIRECT_URI")
    
    if not all([client_id, client_secret, redirect_uri]):
        raise HTTPException(503, "QuickBooks OAuth not configured")
    
    # Exchange code for tokens
    token_url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    
    import base64
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    
    try:
        response = _requests.post(
            token_url,
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=30,
        )
        
        if response.status_code != 200:
            raise HTTPException(500, f"Failed to exchange code for token: {response.text}")
        
        tokens = response.json()
        
        # Store tokens in Supabase
        if _supabase_ok:
            update_data = {
                "qbo_connected": True,
                "qbo_company_id": realmId,
                "qbo_access_token": tokens.get("access_token"),
                "qbo_refresh_token": tokens.get("refresh_token"),
                "qbo_token_expires_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
            
            # Update or create settings
            existing = _supabase_select("app_settings", limit=1)
            if existing and len(existing) > 0:
                setting_id = existing[0].get("id")
                _requests.patch(
                    f"{_sb_url}/rest/v1/app_settings?id=eq.{setting_id}",
                    headers=_sb_headers(),
                    json=update_data,
                    timeout=10,
                )
            else:
                update_data["id"] = 1
                update_data["created_at"] = datetime.utcnow().isoformat()
                _requests.post(
                    f"{_sb_url}/rest/v1/app_settings",
                    headers=_sb_headers(),
                    json=update_data,
                    timeout=10,
                )
        
        # Redirect back to settings page
        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3080")
        return RedirectResponse(url=f"{frontend_url}/settings/integrations?qbo=connected")
        
    except Exception as e:
        print(f"OAuth callback error: {e}")
        raise HTTPException(500, f"OAuth callback failed: {str(e)}")


@app.post("/api/qbo/disconnect")
def disconnect_qbo(_auth=Depends(_verify_token)):
    """
    Disconnect QuickBooks integration.
    Revokes tokens and clears stored credentials.
    """
    if not _supabase_ok:
        raise HTTPException(503, "Database not configured")
    
    try:
        # Get current tokens
        settings = _supabase_select("app_settings", limit=1)
        
        if settings and len(settings) > 0:
            setting = settings[0]
            access_token = setting.get("qbo_access_token")
            
            # Revoke token with Intuit
            if access_token:
                client_id = os.environ.get("INTUIT_CLIENT_ID")
                client_secret = os.environ.get("INTUIT_CLIENT_SECRET")
                
                if client_id and client_secret:
                    import base64
                    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
                    
                    try:
                        _requests.post(
                            "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
                            headers={
                                "Authorization": f"Basic {auth_header}",
                                "Content-Type": "application/json",
                            },
                            json={"token": access_token},
                            timeout=10,
                        )
                    except Exception as e:
                        print(f"Token revocation error: {e}")
            
            # Clear tokens from database
            setting_id = setting.get("id")
            _requests.patch(
                f"{_sb_url}/rest/v1/app_settings?id=eq.{setting_id}",
                headers=_sb_headers(),
                json={
                    "qbo_connected": False,
                    "qbo_company_id": None,
                    "qbo_access_token": None,
                    "qbo_refresh_token": None,
                    "qbo_token_expires_at": None,
                    "updated_at": datetime.utcnow().isoformat(),
                },
                timeout=10,
            )
        
        return {"message": "QuickBooks disconnected successfully"}
        
    except Exception as e:
        raise HTTPException(500, f"Failed to disconnect: {str(e)}")


@app.get("/api/qbo/status")
def get_qbo_status(_auth=Depends(_verify_token)):
    """
    Get QuickBooks connection status.
    """
    if not _supabase_ok:
        return {"connected": False, "companyId": None}
    
    try:
        settings = _supabase_select("app_settings", limit=1)
        if settings and len(settings) > 0:
            setting = settings[0]
            return {
                "connected": bool(setting.get("qbo_connected")),
                "companyId": setting.get("qbo_company_id"),
            }
        return {"connected": False, "companyId": None}
    except Exception as e:
        print(f"Error getting QB status: {e}")
        return {"connected": False, "companyId": None}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 3090))
    print(f"\n{'='*60}")
    print(f"  Check Extractor API Server")
    print(f"  http://localhost:{port}")
    print(f"  Docs: http://localhost:{port}/docs")
    print(f"{'='*60}\n")
    uvicorn.run(app, host="0.0.0.0", port=port)
