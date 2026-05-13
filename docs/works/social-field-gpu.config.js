const STORAGE_KEY = "social-field-gpu-config-v1";

export const DEFAULT_SOCIAL_FIELD_GPU_CONFIG = {
  AGENT_COUNT: 40000,
  WORLD_DAMPING: 0.98,
  WORLD_SPEED_LIMIT: 1.6,
  INTERACTION_RADIUS: 0.032,
  PERSONAL_SPACE: 0.012,
  ATTRACTION: 0.08,
  REPULSION: 0.42,
  SAMPLE_COUNT: 24,
  MAX_NEIGHBORS: 32,
  JITTER: 0.0018,
  POINT_SIZE: 1.6,
  GLOW: 0.55,
  BG_COLOR: "#0d1016",
  AGENT_COLOR: "#9ad1ff"
};

function normalizeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function loadSocialFieldGpuConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOCIAL_FIELD_GPU_CONFIG };
    const parsed = JSON.parse(raw);
    const out = { ...DEFAULT_SOCIAL_FIELD_GPU_CONFIG };
    for (const [k, v] of Object.entries(DEFAULT_SOCIAL_FIELD_GPU_CONFIG)) {
      if (typeof v === "number") out[k] = normalizeNumber(parsed[k], v);
      else out[k] = normalizeColor(parsed[k], v);
    }
    return out;
  } catch (_) {
    return { ...DEFAULT_SOCIAL_FIELD_GPU_CONFIG };
  }
}

export function saveSocialFieldGpuConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (_) {
    // ignore
  }
}

export function resetSocialFieldGpuConfig() {
  const reset = { ...DEFAULT_SOCIAL_FIELD_GPU_CONFIG };
  saveSocialFieldGpuConfig(reset);
  return reset;
}
