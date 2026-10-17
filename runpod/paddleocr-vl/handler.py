"""RunPod serverless worker: Baidu PaddleOCR-VL. Input {"image_b64": str} -> {"markdown": str}."""
import base64, os, tempfile, time
import runpod

# Weights cache on the shared network volume (mounted at /runpod-volume on serverless).
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", "/runpod-volume/paddlex")
from paddleocr import PaddleOCRVL  # noqa: E402

PIPELINE = PaddleOCRVL()  # loaded once per worker, reused while warm


def handler(job):
    t0 = time.time()
    data = base64.b64decode(job["input"]["image_b64"])
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        f.write(data); f.flush()
        pages = PIPELINE.predict(f.name)
        md = "\n\n".join(p.markdown["markdown_texts"] for p in pages)
    return {"markdown": md, "processing_time_ms": int((time.time() - t0) * 1000)}


runpod.serverless.start({"handler": handler})
