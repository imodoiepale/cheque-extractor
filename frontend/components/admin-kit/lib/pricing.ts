// Shared admin-side pricing constants. The edge functions
// (admin-usage-summary, admin-runpod-stats) keep their own copies because they
// run in a separate Deno runtime and can't import from src/.

/** RunPod RTX 4090 flex-worker rate, per GPU-second — self-hosted TTS. */
export const RUNPOD_COST_PER_SEC = 0.00031;
