"""
Self-check for DELETE /api/jobs/{id}: a failed database delete must be reported.

    python backend/check_delete_job.py

It used to print the error and return "deleted successfully", so a document
whose rows the database refused to delete kept coming back. Supabase is stubbed;
no real database is touched.
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for key in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY", "REQUIRE_AUTH"):
    os.environ.pop(key, None)
sys.path.insert(0, str(HERE))
os.chdir(HERE)

import api_server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class Resp:
    def __init__(self, code, text=""):
        self.status_code, self.text = code, text


def run(fail_table):
    calls = []

    def fake_delete(url, **_):
        table = url.split("/rest/v1/")[1].split("?")[0]
        calls.append(table)
        return Resp(409, "violates foreign key constraint") if table == fail_table else Resp(204)

    api_server._supabase_ok = True
    api_server._sb_url = "http://stub"
    api_server._supabase_select = lambda *a, **k: [{"id": "c1"}]
    api_server._supabase_delete_folder = lambda *a, **k: None
    api_server._requests.delete = fake_delete
    api_server.jobs["j1"] = {"job_id": "j1", "status": "complete", "checks": []}
    resp = TestClient(api_server.app).delete("/api/jobs/j1")
    return resp, calls


failures = []

resp, calls = run(fail_table="checks")
if resp.status_code != 500:
    failures.append(f"a refused checks delete returned {resp.status_code}, expected 500")
if calls != ["checks"]:
    failures.append(f"a refused checks delete still touched {calls[1:]}; nothing else may go")
if "j1" not in api_server.jobs:
    failures.append("the job left memory even though the database still holds it")

resp, calls = run(fail_table="check_jobs")
if resp.status_code != 500:
    failures.append(f"a refused check_jobs delete returned {resp.status_code}, expected 500")

resp, calls = run(fail_table=None)
if resp.status_code != 200 or "j1" in api_server.jobs:
    failures.append(f"a clean delete returned {resp.status_code} or left the job in memory")

if failures:
    for f in failures:
        print(f"FAIL: {f}")
    raise SystemExit(1)
print("delete job: all checks passed")
