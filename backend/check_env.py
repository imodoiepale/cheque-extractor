#!/usr/bin/env python3
"""Quick script to check which Gemini API keys are loaded."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env files in the same order as api_server.py
root_dir = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=root_dir / ".env")
load_dotenv(dotenv_path=root_dir / ".env.local")

keys = os.environ.get("GEMINI_API_KEYS", "")
if keys:
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    print(f"\n✓ Found {len(key_list)} Gemini API keys:\n")
    for i, key in enumerate(key_list, 1):
        # Show first 20 and last 6 characters
        masked = f"{key[:20]}...{key[-6:]}"
        print(f"  {i}. {masked}")
    print()
else:
    print("\n❌ No GEMINI_API_KEYS found in environment!\n")

print(f"Loaded from:")
print(f"  - {root_dir / '.env'}")
print(f"  - {root_dir / '.env.local'}")
print()
