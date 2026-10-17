# Kyriq OCR on RunPod Serverless

Two serverless endpoints sharing one network volume:

| Endpoint | Model | GPU | Why |
|---|---|---|---|
| `paddleocr-vl/` | Baidu **PaddleOCR-VL** (0.9B VLM document parser) | 16 GB (A4000/A4500/RTX 4000 Ada) | Tiny, fast, strong on printed text and layout |
| `numarkdown/` | **NuMarkdown-8B-Thinking** (Qwen2.5-VL-7B fine-tune, vLLM) | 24 GB (A5000/L4/3090) | Same model the backend already calls via the free HF Space, now self-hosted |

Both return `{"markdown": ..., "processing_time_ms": ...}`; the backend parses it with the existing `_parse_numarkdown_output`.

## Setup (you do these steps; never paste keys in chat)

1. **Network volume**: Storage > New Network Volume, 30 GB, in a datacenter that lists both 16 GB and 24 GB serverless GPUs (e.g. EU-RO-1 or US-KS-2; check stock). Both endpoints must be in this datacenter.
2. **Build and push images** (Docker Hub or GHCR):
   ```bash
   docker build -t <you>/kyriq-paddleocr-vl runpod/paddleocr-vl && docker push <you>/kyriq-paddleocr-vl
   docker build -t <you>/kyriq-numarkdown runpod/numarkdown && docker push <you>/kyriq-numarkdown
   ```
3. **Endpoints**: Serverless > New Endpoint for each image. Attach the network volume. Settings: Active workers 0, Max workers 2, Idle timeout 30 s, FlashBoot on, execution timeout 300 s. For NuMarkdown also set env `HF_HOME=/runpod-volume/hf`.
4. **API key**: Settings > API Keys > create a key with access to these endpoints only. Put in `.env` (and Railway):
   ```
   USE_RUNPOD_OCR=true
   RUNPOD_API_KEY=...
   RUNPOD_NUMARKDOWN_ENDPOINT_ID=...
   RUNPOD_PADDLEOCR_ENDPOINT_ID=...
   RUNPOD_OCR_ENGINE=numarkdown   # or paddleocr_vl
   ```
   The SSH key is not needed for serverless; it only matters for Pods.

With `USE_RUNPOD_OCR` unset, nothing changes. When set, the NuMarkdown slot in `extract_with_numarkdown` calls the chosen endpoint; on any error it falls back to the HF Space, and Gemini still runs in parallel and wins the hybrid merge for handwriting.

## Cost (prices as of writing; re-check runpod.io/pricing before committing)

- Network volume: ~$0.07 / GB-month -> 30 GB ~ **$2.10/month**, always on.
- Flex serverless, per second while a worker runs: 16 GB ~ $0.00016/s, 24 GB ~ $0.00019/s. Idle = $0.
- Warm per cheque: PaddleOCR-VL ~1-2 s (~$0.0003); NuMarkdown "thinking" emits 1-2k tokens, ~15-25 s (~$0.004).
- Cold start (weights from volume, not internet): Paddle ~30-60 s, vLLM 8B ~60-120 s. Paid once per batch, not per cheque. Assumed batches of 20 cheques.

| Checks / month | 1,200 | 4,500 | 10,000 |
|---|---|---|---|
| PaddleOCR-VL (warm + cold) | ~$0.80 | ~$2.70 | ~$6 |
| NuMarkdown (warm + cold) | ~$6 | ~$22 | ~$47 |
| Volume | $2.10 | $2.10 | $2.10 |
| **Per 1,000 checks** | Paddle ~$0.65, NuMarkdown ~$5 (incl. cold starts) | | |

Gemini Flash for comparison is roughly $0.10-0.40 per 1,000 cheque images. RunPod saves money only versus a paid NuMarkdown or a pricier model, not versus Gemini Flash; the real gains are no rate limits / key rotation and keeping data off Google.

## Effectiveness (expected, not yet measured here)

- PaddleOCR-VL: excellent on printed MICR line, dates, amounts, bank statement tables; weaker on cursive payee lines.
- NuMarkdown-8B: good structure and reasoning, decent handwriting; slow because it "thinks".
- Gemini Flash remains best on handwritten payees. Keep it as primary for payee/amount-in-words and use RunPod engines as the second/third vote.

## Still needed

- Live accuracy/latency test: run once endpoints exist (no `RUNPOD_API_KEY` in `.env` yet).
- Max workers caps concurrency (2 => ~2 cheques at a time on NuMarkdown); raise for 10k/month or use `/run` + polling instead of `/runsync` (90 s sync limit-ish).
- Monitoring: RunPod endpoint dashboard (queue depth, cold starts, failures) plus the `[RunPod ...] failed` log line on Railway.
- Pin image tags (`paddlepaddle/paddle`, `vllm/vllm-openai`) after the first successful build.
