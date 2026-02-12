"""Run the master migration SQL against Supabase via the pg REST rpc endpoint."""
import os, sys, requests
from pathlib import Path

# Load env
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local", encoding="utf-8-sig")

sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not sb_url or not sb_key:
    print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
    sys.exit(1)

sql_file = Path(__file__).parent / "migrations" / "00000000000000_master_schema.sql"
sql = sql_file.read_text(encoding="utf-8")

# Split into individual statements (skip comments and empty lines)
# We'll send the whole thing as one batch via the pg-meta SQL endpoint
print(f"Running migration against {sb_url}...")
print(f"SQL file: {sql_file} ({len(sql)} chars)")

# Use the Supabase pg-meta SQL endpoint (available on all projects)
# POST /pg/query  with { "query": "..." }
headers = {
    "apikey": sb_key,
    "Authorization": f"Bearer {sb_key}",
    "Content-Type": "application/json",
}

# Try the pg-meta endpoint first
resp = requests.post(
    f"{sb_url}/pg/query",
    headers=headers,
    json={"query": sql},
    timeout=60,
)

if resp.status_code == 404:
    # Fallback: try the older /rest/v1/rpc endpoint won't work for DDL
    # Instead, split and run via individual statements
    print("pg/query endpoint not available. Trying statement-by-statement...")
    
    # Simple statement splitter
    statements = []
    current = []
    in_function = False
    for line in sql.split('\n'):
        stripped = line.strip()
        if stripped.startswith('--') or stripped == '':
            continue
        if 'CREATE OR REPLACE FUNCTION' in line or 'CREATE FUNCTION' in line:
            in_function = True
        current.append(line)
        if in_function:
            if stripped == '$$ LANGUAGE plpgsql;' or stripped == '$$ LANGUAGE plpgsql SECURITY DEFINER;' or stripped == '$$ LANGUAGE sql SECURITY DEFINER STABLE;':
                in_function = False
                statements.append('\n'.join(current))
                current = []
        elif stripped.endswith(';') and not in_function:
            statements.append('\n'.join(current))
            current = []
    
    if current:
        statements.append('\n'.join(current))
    
    print(f"Split into {len(statements)} statements")
    errors = 0
    for i, stmt in enumerate(statements):
        if not stmt.strip():
            continue
        r = requests.post(
            f"{sb_url}/pg/query",
            headers=headers,
            json={"query": stmt},
            timeout=30,
        )
        if r.status_code >= 400:
            errors += 1
            print(f"  [{i+1}] ERROR ({r.status_code}): {r.text[:150]}")
        else:
            print(f"  [{i+1}] OK")
    
    print(f"\nDone. {len(statements) - errors}/{len(statements)} succeeded, {errors} errors.")
else:
    if resp.status_code >= 400:
        print(f"ERROR ({resp.status_code}): {resp.text[:500]}")
    else:
        print(f"SUCCESS ({resp.status_code})")
        # Show result summary
        try:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                print(f"  Results: {len(data)} result sets")
        except:
            pass
    print("Migration complete!")
