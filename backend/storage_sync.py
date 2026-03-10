#!/usr/bin/env python3
"""
Storage Sync Utility
Syncs orphaned files in Supabase Storage with the check_jobs database table.
Detects files that exist in storage but have no corresponding database entry.
"""

import os
import json
import requests
from datetime import datetime
from pathlib import Path

def sync_storage_to_database():
    """
    Check Supabase Storage for orphaned job files and create database entries.
    This ensures files uploaded to storage but missing from DB are visible in UI.
    """
    sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    
    if not sb_url or not sb_key:
        print("⚠️ Storage sync skipped: Supabase not configured")
        return
    
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
    }
    
    try:
        # List all folders in the 'checks' bucket under 'jobs/' prefix
        list_resp = requests.post(
            f"{sb_url}/storage/v1/object/list/checks",
            headers=headers,
            json={"prefix": "jobs/", "limit": 1000},
            timeout=15,
        )
        
        if list_resp.status_code >= 400:
            print(f"⚠️ Storage list error ({list_resp.status_code}): {list_resp.text[:200]}")
            return
        
        files = list_resp.json()
        if not files:
            print("✓ No files in storage to sync")
            return
        
        # Extract unique job_ids from storage paths (jobs/{job_id}/...)
        storage_job_ids = set()
        for file in files:
            path = file.get("name", "")
            if path.startswith("jobs/"):
                parts = path.split("/")
                if len(parts) >= 2:
                    job_id = parts[1]
                    storage_job_ids.add(job_id)
        
        if not storage_job_ids:
            print("✓ No job folders found in storage")
            return
        
        print(f"🔍 Found {len(storage_job_ids)} job folders in storage")
        
        # Query database for existing jobs
        db_resp = requests.get(
            f"{sb_url}/rest/v1/check_jobs?select=job_id&limit=1000",
            headers=headers,
            timeout=15,
        )
        
        if db_resp.status_code >= 400:
            print(f"⚠️ Database query error ({db_resp.status_code}): {db_resp.text[:200]}")
            return
        
        db_jobs = db_resp.json()
        db_job_ids = set(job.get("job_id") for job in db_jobs if job.get("job_id"))
        
        print(f"📊 Found {len(db_job_ids)} jobs in database")
        
        # Find orphaned jobs (in storage but not in DB)
        orphaned_job_ids = storage_job_ids - db_job_ids
        
        if not orphaned_job_ids:
            print("✓ No orphaned jobs found - storage and DB are in sync")
            return
        
        print(f"⚠️ Found {len(orphaned_job_ids)} orphaned jobs in storage")
        
        # Create database entries for orphaned jobs
        synced = 0
        for job_id in orphaned_job_ids:
            try:
                # Try to find PDF file to get metadata
                pdf_files = [f for f in files if f.get("name", "").startswith(f"jobs/{job_id}/") and f.get("name", "").endswith(".pdf")]
                pdf_name = "Unknown.pdf"
                file_size = 0
                
                if pdf_files:
                    pdf_file = pdf_files[0]
                    pdf_name = Path(pdf_file.get("name", "")).name
                    file_size = pdf_file.get("metadata", {}).get("size", 0)
                
                # Count check images
                check_images = [f for f in files if f.get("name", "").startswith(f"jobs/{job_id}/images/")]
                total_checks = len(check_images)
                
                # Create minimal database entry
                insert_resp = requests.post(
                    f"{sb_url}/rest/v1/check_jobs",
                    headers=headers,
                    json={
                        "job_id": job_id,
                        "pdf_name": pdf_name,
                        "status": "analyzed",  # Mark as analyzed since files exist
                        "total_checks": total_checks,
                        "file_size": file_size,
                        "checks_data": json.dumps([]),
                        "created_at": datetime.now().isoformat(),
                    },
                    timeout=15,
                )
                
                if insert_resp.status_code >= 400:
                    print(f"  ❌ Failed to sync {job_id}: {insert_resp.text[:200]}")
                else:
                    print(f"  ✅ Synced {job_id} ({total_checks} checks)")
                    synced += 1
                    
            except Exception as e:
                print(f"  ❌ Error syncing {job_id}: {e}")
        
        if synced > 0:
            print(f"✅ Successfully synced {synced}/{len(orphaned_job_ids)} orphaned jobs to database")
        
    except Exception as e:
        print(f"❌ Storage sync failed: {e}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    sync_storage_to_database()
