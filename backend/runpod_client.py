"""Optional RunPod serverless OCR client. Enabled with USE_RUNPOD_OCR=true; key from RUNPOD_API_KEY."""
import base64, os
import requests

ENDPOINTS = {
    "numarkdown": os.getenv("RUNPOD_NUMARKDOWN_ENDPOINT_ID"),
    "paddleocr_vl": os.getenv("RUNPOD_PADDLEOCR_ENDPOINT_ID"),
}


def enabled(engine):
    return os.getenv("USE_RUNPOD_OCR", "").lower() == "true" and bool(os.getenv("RUNPOD_API_KEY")) and bool(ENDPOINTS.get(engine))


def run_ocr(engine, img_path, timeout=180):
    """Return the worker's markdown. Raises on HTTP/worker error so callers fall back."""
    with open(img_path, "rb") as f:
        payload = {"input": {"image_b64": base64.b64encode(f.read()).decode()}}
    r = requests.post(f"https://api.runpod.ai/v2/{ENDPOINTS[engine]}/runsync", json=payload, timeout=timeout,
                      headers={"Authorization": f"Bearer {os.environ['RUNPOD_API_KEY']}"})
    r.raise_for_status()
    body = r.json()
    if body.get("status") != "COMPLETED":
        raise RuntimeError(f"RunPod {engine} status {body.get('status')}: {body.get('error')}")
    return body["output"]["markdown"]
