const STORAGE_KEY = "genart.default-clock.config";

export const DEFAULT_CLOCK_CONFIG = {
  authorUiEnabled: false,

  // Global composition
  GLOBAL_SCALE: 1,

  // 3D camera layer: the 2D clock canvas is treated as a centered plane at world 0,0,0.
  SHOW_CAMERA_3D: true,
  CAMERA_DISTANCE: 900,
  CAMERA_FOV: 900,
  CAMERA_BASE_X: 0,
  CAMERA_BASE_Y: 0,
  CAMERA_BASE_Z: 0,
  CAMERA_POSITION_WIGGLE_ENABLED: true,
  CAMERA_POSITION_WIGGLE_X: 22,
  CAMERA_POSITION_WIGGLE_Y: 16,
  CAMERA_POSITION_WIGGLE_Z: 28,
  CAMERA_POSITION_WIGGLE_SPEED: 0.055,
  CAMERA_ROTATION_WIGGLE_ENABLED: true,
  CAMERA_ROTATION_WIGGLE_X: 1.8,
  CAMERA_ROTATION_WIGGLE_Y: 2.4,
  CAMERA_ROTATION_WIGGLE_Z: 0.9,
  CAMERA_ROTATION_WIGGLE_SPEED: 0.075,

  // Post FX stack: ordered layers on top of the 3D clock plane.
  SHOW_FX_STACK: true,
  FX_BASICS_ENABLED: true,
  FX_EXPOSURE: 1,
  FX_CONTRAST: 1.08,
  FX_SATURATION: 1.06,
  FX_BRIGHTNESS: 1,
  FX_LEVELS_BLACK: 0,
  FX_LEVELS_WHITE: 1,

  FX_NOISE_ENABLED: true,
  FX_NOISE_BLEND_MODE: "overlay",
  FX_NOISE_OPACITY: 0.09,
  FX_NOISE_SCALE: 2.6,
  FX_NOISE_OCTAVES: 3,
  FX_NOISE_LACUNARITY: 2,
  FX_NOISE_GAIN: 0.5,
  FX_NOISE_SPEED: 0.0006,
  FX_NOISE_CONTRAST: 1.35,
  FX_NOISE_MIN: 0,
  FX_NOISE_MAX: 1,
  FX_NOISE_MONOCHROME: true,

  FX_DISTORTION_ENABLED: false,
  FX_DISTORTION_MAP_TYPE: "simplex",
  FX_DISTORTION_AMPLITUDE: 8,
  FX_DISTORTION_SCALE: 6,
  FX_DISTORTION_OCTAVES: 3,
  FX_DISTORTION_LACUNARITY: 2,
  FX_DISTORTION_GAIN: 0.5,
  FX_DISTORTION_SPEED: 0.00035,
  FX_DISTORTION_QUALITY: 0.35,

  FX_ABERRATION_ENABLED: true,
  FX_ABERRATION_BLEND_MODE: "screen",
  FX_ABERRATION_OPACITY: 0.32,
  FX_ABERRATION_OFFSET: 8,
  FX_ABERRATION_EDGE_BLUR: 3.5,
  FX_ABERRATION_ANGLE: 0,
  FX_ABERRATION_ROTATE_WITH_TIME: true,
  FX_ABERRATION_SPEED: 0.08,

  FX_HALATION_ENABLED: true,
  FX_HALATION_BLEND_MODE: "screen",
  FX_HALATION_OPACITY: 0.24,
  FX_HALATION_RADIUS: 12,
  FX_HALATION_THRESHOLD: 1.45,
  FX_HALATION_TINT: "#ff8cad",

  FX_LENS_ENABLED: true,
  FX_LENS_BLEND_MODE: "multiply",
  FX_VIGNETTE_OPACITY: 0.28,
  FX_VIGNETTE_RADIUS: 0.58,
  FX_VIGNETTE_SOFTNESS: 0.54,
  FX_LENS_GLOW_OPACITY: 0.09,
  FX_LENS_GLOW_RADIUS: 0.62,
  FX_LENS_GLOW_COLOR: "#8fb7ff",

  // Atmosphere / background object
  SHOW_BACKGROUND: true,
  BG_TOP: "#04070d",
  BG_BOTTOM: "#101827",
  TRAIL_ALPHA: 0.08,

  // Face / clock body object
  SHOW_FACE_RING: true,
  FACE_RADIUS_RATIO: 0.34,
  RING_WIDTH_RATIO: 0.006,
  FACE_RING_COLOR: "#aac8ff",
  FACE_RING_ALPHA: 0.34,
  FACE_GLOW_COLOR: "#7db4ff",
  FACE_GLOW_ALPHA: 0.7,
  FACE_GLOW_RADIUS_RATIO: 0.09,

  // Calibration / tick object
  SHOW_TICKS: true,
  TICK_COUNT: 60,
  MAJOR_TICK_EVERY: 5,
  TICK_INNER_RATIO: 0.965,
  MAJOR_TICK_INNER_RATIO: 0.91,
  TICK_OUTER_RATIO: 0.995,
  TICK_WIDTH_RATIO: 0.002,
  MAJOR_TICK_WIDTH_RATIO: 0.006,
  TICK_COLOR: "#bed2f0",
  TICK_ALPHA: 0.22,
  MAJOR_TICK_COLOR: "#ebf5ff",
  MAJOR_TICK_ALPHA: 0.72,

  // Hour glyph object
  SHOW_DIGITS: true,
  DIGIT_RADIUS_RATIO: 0.86,
  DIGIT_SIZE_RATIO: 0.072,
  DIGIT_COLOR: "#eef6ff",
  DIGIT_ALPHA: 0.88,
  DIGIT_GLOW_COLOR: "#7db4ff",
  DIGIT_GLOW_ALPHA: 0.34,
  DIGIT_GLOW_RADIUS_RATIO: 0.035,
  DIGIT_ROTATION_MODE: "upright",

  // Center time object
  SHOW_CENTER_TIME: true,
  CENTER_TIME_SIZE_RATIO: 0.066,
  CENTER_TIME_COLOR: "#ebf3ff",
  CENTER_TIME_ALPHA: 0.84,
  CENTER_TIME_GLOW_COLOR: "#78aaff",
  CENTER_TIME_GLOW_ALPHA: 0.45,
  CENTER_TIME_GLOW_SIZE_RATIO: 0.015,
  CENTER_TIME_Y_RATIO: 0.018,

  // Center seconds sub-object
  SHOW_CENTER_SECONDS: true,
  CENTER_SECONDS_SIZE_RATIO: 0.028,
  CENTER_SECONDS_COLOR: "#ff96b9",
  CENTER_SECONDS_ALPHA: 0.78,
  CENTER_SECONDS_Y_RATIO: 0.082,

  // Seconds orbit object
  SHOW_SECONDS: true,
  SHOW_SECOND_PROGRESS: true,
  SHOW_SECOND_DOT: true,
  SECOND_TRACK_RADIUS_RATIO: 1.018,
  SECOND_DOT_RADIUS_RATIO: 0.012,
  SECOND_PROGRESS_WIDTH_RATIO: 0.004,
  SECOND_PROGRESS_LENGTH_DEG: 88,
  SECOND_PROGRESS_TAIL_ALPHA: 0.08,
  SECOND_PROGRESS_TAIL_WIDTH_RATIO: 0.22,
  SECOND_PROGRESS_COLOR: "#ff6b9a",
  SECOND_PROGRESS_ALPHA: 0.42,
  SECOND_DOT_COLOR: "#ff6b9a",
  SECOND_DOT_ALPHA: 0.95,
  SECOND_GLOW_COLOR: "#ff6b9a",
  SECOND_GLOW_ALPHA: 0.65,
  SECOND_GLOW_RADIUS_RATIO: 0.035,

  // Analog hands object
  SHOW_ANALOG_HANDS: true,
  SHOW_HOUR_HAND: true,
  SHOW_MINUTE_HAND: true,
  SHOW_SECOND_HAND: true,
  HOUR_HAND_LENGTH_RATIO: 0.28,
  MINUTE_HAND_LENGTH_RATIO: 0.4,
  SECOND_HAND_LENGTH_RATIO: 0.45,
  HOUR_HAND_WIDTH_RATIO: 0.01,
  MINUTE_HAND_WIDTH_RATIO: 0.007,
  SECOND_HAND_WIDTH_RATIO: 0.003,
  HOUR_HAND_COLOR: "#f8fbff",
  MINUTE_HAND_COLOR: "#b9d8ff",
  SECOND_HAND_COLOR: "#ff6b9a",
  HOUR_HAND_ALPHA: 0.95,
  MINUTE_HAND_ALPHA: 0.86,
  SECOND_HAND_ALPHA: 0.95,
  HAND_GLOW_ALPHA: 0.5,
  HAND_GLOW_RADIUS_RATIO: 0.035,
  SHOW_HAND_PIVOT: true,
  HAND_PIVOT_RADIUS_RATIO: 0.018,
  HAND_PIVOT_COLOR: "#f8fbff",
  HAND_PIVOT_ALPHA: 0.9,
};

export const DEFAULT_DEFAULT_CLOCK_CONFIG = DEFAULT_CLOCK_CONFIG;

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CLOCK_CONFIG };

  const next = { ...DEFAULT_CLOCK_CONFIG };
  Object.keys(DEFAULT_CLOCK_CONFIG).forEach((key) => {
    const defaultValue = DEFAULT_CLOCK_CONFIG[key];
    const candidate = raw[key];

    if (typeof defaultValue === "number") {
      if (typeof candidate === "number" && Number.isFinite(candidate)) next[key] = candidate;
      return;
    }

    if (typeof defaultValue === "string" && typeof candidate === "string") {
      next[key] = candidate;
      return;
    }

    if (typeof defaultValue === "boolean" && typeof candidate === "boolean") next[key] = candidate;
  });

  return next;
}

export function loadDefaultClockConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_CLOCK_CONFIG };
    return sanitizeConfig(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_CLOCK_CONFIG };
  }
}

export function saveDefaultClockConfig(config) {
  try {
    const sanitized = sanitizeConfig(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore storage failures (private mode / quota exceeded)
  }
}

export function resetDefaultClockConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures (private mode / quota exceeded)
  }

  return { ...DEFAULT_CLOCK_CONFIG };
}
