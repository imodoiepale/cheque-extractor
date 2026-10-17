"""RunPod serverless worker: NuMarkdown-8B-Thinking on vLLM. Input {"image_b64": str} -> {"markdown": str}."""
import base64, io, os, time
import runpod
from PIL import Image
from vllm import LLM, SamplingParams

MODEL = os.environ.get("MODEL_NAME", "numind/NuMarkdown-8B-Thinking")
# HF weights cached on the shared network volume so cold starts skip the 16 GB download.
LLM_ENGINE = LLM(model=MODEL, download_dir="/runpod-volume/hf", max_model_len=8192,
                 gpu_memory_utilization=0.92, limit_mm_per_prompt={"image": 1}, trust_remote_code=True)
PARAMS = SamplingParams(temperature=0.4, max_tokens=4096)
PROMPT = "<|im_start|>user\n<|vision_start|><|image_pad|><|vision_end|><|im_end|>\n<|im_start|>assistant\n"


def handler(job):
    t0 = time.time()
    img = Image.open(io.BytesIO(base64.b64decode(job["input"]["image_b64"]))).convert("RGB")
    out = LLM_ENGINE.generate({"prompt": PROMPT, "multi_modal_data": {"image": img}}, PARAMS)[0].outputs[0].text
    md = out.split("<answer>")[1].split("</answer>")[0] if "<answer>" in out else out
    return {"markdown": md.strip(), "processing_time_ms": int((time.time() - t0) * 1000)}


runpod.serverless.start({"handler": handler})
