const STORAGE_KEY = "genart.prism-weave.config";

export const DEFAULT_PRISM_WEAVE_CONFIG = {
  BG_TOP: "#030508",
  BG_BOTTOM: "#0d0916",
  BAND_COUNT: 122,
  GHOST_BAND_COUNT: 124,
  WEAVE_STEPS: 7,
  CROSS_LINKS: 10,
  BODY_WIDTH_RATIO: 0.008,
  HIGHLIGHT_WIDTH_RATIO: 0.0035,
  GLOW_WIDTH_RATIO: 0.018,
  TRAIL_ALPHA: 0.065,
  ORBIT_ALPHA: 0.13,
  SPARK_ALPHA: 0.28,
  SPARK_RATE: 0.1,
  CORE_RADIUS_RATIO: 0.18,
  KNOT_RADIUS_RATIO: 0.11,
  WAVE_SCALE_RATIO: 0.042,
  WAVE_DRIFT_RATIO: 0.022,
  LANE_PULSE_RATIO: 0.007,
  SHADOW_BLUR_RATIO: 0.018,
  HUE_SPAN: 340,
  HUE_SHIFT_PER_SECOND: 14,
  FOCUS_PULL_RATIO: 0.05,
  EDGE_FADE_RATIO: 0.18,
  SHEAR_RATIO: 0.055,
  SWAY_RATIO: 0.012,
  KNOT_TILT_RATIO: 0.34,
  CORE_PULSE_RATIO: 0.15,
  PARTICLE_COUNT: 42,
  PARTICLE_SPEED: 0.28,
  BG_PULSE_STRENGTH: 0.06,
};

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PRISM_WEAVE_CONFIG };

  const next = { ...DEFAULT_PRISM_WEAVE_CONFIG };
  Object.keys(DEFAULT_PRISM_WEAVE_CONFIG).forEach((key) => {
    const defaultValue = DEFAULT_PRISM_WEAVE_CONFIG[key];
    const candidate = raw[key];

    if (typeof defaultValue === "number") {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        next[key] = candidate;
      }
      return;
    }

    if (typeof defaultValue === "string") {
      if (typeof candidate === "string") {
        next[key] = candidate;
      }
    }
  });

  return next;
}

export function loadPrismWeaveConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_PRISM_WEAVE_CONFIG };
    return sanitizeConfig(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_PRISM_WEAVE_CONFIG };
  }
}

export function savePrismWeaveConfig(config) {
  try {
    const sanitized = sanitizeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore storage failures (private mode / quota exceeded)
  }
}
