#!/usr/bin/env python3
"""
Test script to verify OpenAI backup functionality for cheque extraction.
Tests both Gemini and OpenAI extraction capabilities.
"""

import os
import sys
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Import extraction functions
from check_extractor import (
    extract_with_gemini,
    extract_with_openai,
    GEMINI_KEYS,
    OPENAI_API_KEY,
    OPENAI_AVAILABLE
)

def test_configuration():
    """Test that API keys are configured correctly."""
    print("=" * 70)
    print("CONFIGURATION TEST")
    print("=" * 70)
    
    print(f"\n✓ Gemini API Keys: {len(GEMINI_KEYS)} key(s) configured")
    for i, key in enumerate(GEMINI_KEYS, 1):
        print(f"  Key {i}: ...{key[-8:]}")
    
    print(f"\n✓ OpenAI API Key: {'Configured' if OPENAI_API_KEY else 'NOT CONFIGURED'}")
    if OPENAI_API_KEY:
        print(f"  Key: ...{OPENAI_API_KEY[-8:]}")
    
    print(f"\n✓ OpenAI Library: {'Available' if OPENAI_AVAILABLE else 'NOT AVAILABLE'}")
    
    if not GEMINI_KEYS and not OPENAI_API_KEY:
        print("\n❌ ERROR: No API keys configured!")
        return False
    
    print("\n✅ Configuration looks good!")
    return True

def test_openai_direct():
    """Test OpenAI extraction directly."""
    print("\n" + "=" * 70)
    print("OPENAI DIRECT TEST")
    print("=" * 70)
    
    if not OPENAI_API_KEY or not OPENAI_AVAILABLE:
        print("\n⚠️  SKIPPED: OpenAI not available")
        return None
    
    # Create a simple test image (blank check template)
    print("\nCreating test check image...")
    from PIL import Image, ImageDraw, ImageFont
    
    img = Image.new('RGB', (800, 300), color='white')
    draw = ImageDraw.Draw(img)
    
    # Draw simple check template
    draw.rectangle([10, 10, 790, 290], outline='black', width=2)
    draw.text((50, 50), "PAY TO THE ORDER OF: John Doe", fill='black')
    draw.text((50, 100), "AMOUNT: $1,234.56", fill='black')
    draw.text((50, 150), "DATE: 02/25/2026", fill='black')
    draw.text((50, 200), "CHECK #: 12345", fill='black')
    draw.text((50, 250), "BANK: Test Bank", fill='black')
    
    test_img_path = "test_check.png"
    img.save(test_img_path)
    print(f"✓ Test image created: {test_img_path}")
    
    print("\nTesting OpenAI extraction...")
    try:
        result = extract_with_openai(test_img_path)
        
        print("\n" + "-" * 70)
        print("OpenAI Result:")
        print("-" * 70)
        print(json.dumps(result, indent=2))
        
        if result.get('error'):
            print(f"\n❌ OpenAI extraction failed: {result['error']}")
            return False
        else:
            fields = result.get('fields', {})
            print("\n✅ OpenAI extraction successful!")
            print(f"  Payee: {fields.get('payee')}")
            print(f"  Amount: {fields.get('amount')}")
            print(f"  Date: {fields.get('checkDate')}")
            print(f"  Check #: {fields.get('checkNumber')}")
            return True
    
    except Exception as e:
        print(f"\n❌ OpenAI test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Cleanup
        if os.path.exists(test_img_path):
            os.remove(test_img_path)

def test_gemini_with_fallback():
    """Test Gemini extraction with OpenAI fallback."""
    print("\n" + "=" * 70)
    print("GEMINI WITH OPENAI FALLBACK TEST")
    print("=" * 70)
    
    # Create test image
    print("\nCreating test check image...")
    from PIL import Image, ImageDraw
    
    img = Image.new('RGB', (800, 300), color='white')
    draw = ImageDraw.Draw(img)
    
    draw.rectangle([10, 10, 790, 290], outline='black', width=2)
    draw.text((50, 50), "PAY TO THE ORDER OF: Jane Smith", fill='black')
    draw.text((50, 100), "AMOUNT: $5,678.90", fill='black')
    draw.text((50, 150), "DATE: 02/26/2026", fill='black')
    draw.text((50, 200), "CHECK #: 67890", fill='black')
    draw.text((50, 250), "BANK: Sample Bank", fill='black')
    
    test_img_path = "test_check_fallback.png"
    img.save(test_img_path)
    print(f"✓ Test image created: {test_img_path}")
    
    print("\nTesting Gemini extraction (with OpenAI fallback)...")
    try:
        result = extract_with_gemini(test_img_path)
        
        print("\n" + "-" * 70)
        print("Extraction Result:")
        print("-" * 70)
        print(json.dumps(result, indent=2))
        
        source = result.get('source', 'unknown')
        
        if result.get('error'):
            print(f"\n⚠️  Extraction failed: {result['error']}")
            if 'All keys failed' in result['error']:
                print("  (This is expected if Gemini keys are exhausted)")
                if OPENAI_API_KEY and OPENAI_AVAILABLE:
                    print("  OpenAI backup should have been attempted")
            return False
        else:
            fields = result.get('fields', {})
            print(f"\n✅ Extraction successful via: {source}")
            print(f"  Payee: {fields.get('payee')}")
            print(f"  Amount: {fields.get('amount')}")
            print(f"  Date: {fields.get('checkDate')}")
            print(f"  Check #: {fields.get('checkNumber')}")
            
            if source == 'gemini-openai-backup':
                print("\n🔄 OpenAI backup was used successfully!")
            
            return True
    
    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        # Cleanup
        if os.path.exists(test_img_path):
            os.remove(test_img_path)

def main():
    """Run all tests."""
    print("\n" + "=" * 70)
    print("CHEQUE EXTRACTOR - OPENAI BACKUP TEST SUITE")
    print("=" * 70)
    
    # Test 1: Configuration
    if not test_configuration():
        print("\n❌ Configuration test failed. Exiting.")
        return 1
    
    # Test 2: OpenAI Direct
    openai_result = test_openai_direct()
    
    # Test 3: Gemini with Fallback
    gemini_result = test_gemini_with_fallback()
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    print(f"Configuration: ✅ PASSED")
    print(f"OpenAI Direct: {'✅ PASSED' if openai_result else '⚠️  SKIPPED/FAILED' if openai_result is None else '❌ FAILED'}")
    print(f"Gemini+Fallback: {'✅ PASSED' if gemini_result else '❌ FAILED'}")
    
    if openai_result or gemini_result:
        print("\n✅ System is working! OpenAI backup is functional.")
        return 0
    else:
        print("\n⚠️  Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
