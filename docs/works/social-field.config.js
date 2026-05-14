export const DEFAULT_SOCIAL_FIELD_CONFIG = {
  // Initial state
  INITIAL_AGENT_COUNT: 24,
  AGENTS_TO_ADD_PER_CLICK: 5,  // how many agents to add on spacebar/click

  // Perception
  VISION_RADIUS: 160,

  // Physics
  FRICTION: 0.94,
  SPEED_LIMIT: 3.5,

  // Default agent characteristics (each agent randomises around these)
  DEFAULT_FRIENDLINESS: 1.2,
  FRIENDLINESS_VARIANCE: 0.6,
  DEFAULT_BASE_BOUNDARY: 55,
  BOUNDARY_VARIANCE: 15,
  DEFAULT_BOUNDARY_AMPLITUDE: 18,

  // Relationship dynamics
  MAX_RELATIONSHIP: 120,
  RELATIONSHIP_TICK_RATE: 4,  // points per second when in vision
  RELATIONSHIP_DECAY: 0.3,    // points per second when out of vision (0 = no decay)

  // Pair-force toggles (independent components — flip individually to A/B test)
  ENABLE_HARD_CORE: true,      // monotone repulsion when d < equilibrium (prevents overlap)
  ENABLE_SPRING_PULL: true,    // restoring force when d > equilibrium (returns to target)
  ENABLE_SOCIAL_FORCE: true,   // aspect-driven long-range attraction/repulsion
  ENABLE_JITTER: true,         // small per-agent random noise
  ENABLE_SPATIAL_GRID: true,   // spatial hash grid for neighbor culling. Off = brute-force O(N²), every pair considered.
  ENABLE_WRAP_X: true,         // toroidal wrap on the X axis. Off = agents clamp to left/right edges.
  ENABLE_WRAP_Y: true,         // toroidal wrap on the Y axis. Off = agents clamp to top/bottom edges.

  // Pair-spacing geometry
  TARGET_SPACING: 1,           // (was HARD_REPULSION) center-to-center as multiple of summed radii. 1.0 = touching, 1.2 = 20% gap.
  SPACING_SOFTNESS: 0.05,      // (was SOFT_REPULSION_SCALE) ±fraction by which social signal shifts target. 0.05 = ±5%.

  // Pair-force magnitudes
  FORCE_STRENGTH: 1.2,         // (was ATTRACTION_SCALE) master multiplier on all pair forces
  SPRING_STRENGTH: 8,          // (was hardcoded SPRING_STIFFNESS) stiffness of the bilateral spring
  SOCIAL_INFLUENCE: 2.8,       // (was ASPECT_FORCE_SCALE) how strongly aspects modulate the social signal

  // Aspect channels
  ASPECT_REPEL_THRESHOLD: 0.5, // legacy global threshold (kept for backward compat with old configs)
  ASPECT_A_THRESHOLD: 0.25,    // dead zone for aspect A signed similarity
  ASPECT_B_THRESHOLD: 0.25,    // dead zone for aspect B signed similarity
  ASPECT_C_THRESHOLD: 0.25,    // dead zone for aspect C signed similarity
  ASPECT_D_THRESHOLD: 0.25,    // dead zone for aspect D signed similarity
  ASPECT_A_STRENGTH: 1.0,      // weight of aspect A in the social signal
  ASPECT_B_STRENGTH: 1.0,      // weight of aspect B in the social signal
  ASPECT_C_STRENGTH: 1.0,      // weight of aspect C in the social signal
  ASPECT_D_STRENGTH: 1.0,      // weight of aspect D in the social signal
  BOUNDARY_REDUCTION_MAX: 0.72, // max fraction of boundary that friendship can remove
  BOUNDARY_CURVE: 1.8,         // curvature of friendship→boundary mapping

  // Visuals
  AGENT_RADIUS_MIN: 0.35,
  AGENT_RADIUS_MAX: 7,
  GLOW_INTENSITY: 0,
  SHOW_CONNECTIONS: false,
  SHOW_VISION: false,
  CONNECTION_ALPHA_MAX: 0.55,
  CONNECTION_MIN_RELATION_NORM: 0.7,

  // Performance tweaks
  ENABLE_SHADOWS: false,
  ENABLE_ASPECTS: true,
  DECAY_BATCH_INTERVAL: 10,    // batch decay every N frames
};

const LS_KEY = "social-field-config";

// Old → new key renames. Applied when loading saved configs and presets.
const RENAMES = {
  HARD_REPULSION: "TARGET_SPACING",
  SOFT_REPULSION_SCALE: "SPACING_SOFTNESS",
  ATTRACTION_SCALE: "FORCE_STRENGTH",
  ASPECT_FORCE_SCALE: "SOCIAL_INFLUENCE",
};

export function migrateRenamedKeys(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  for (const [oldKey, newKey] of Object.entries(RENAMES)) {
    if (oldKey in cfg) {
      if (!(newKey in cfg) && Number.isFinite(cfg[oldKey])) {
        cfg[newKey] = cfg[oldKey];
      }
      delete cfg[oldKey];
    }
  }
  return cfg;
}

export function loadSocialFieldConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      migrateRenamedKeys(saved);
      const merged = { ...DEFAULT_SOCIAL_FIELD_CONFIG, ...saved };

      // Backward compatibility for old single-size setting.
      if ((saved && (saved.AGENT_RADIUS_MIN == null || saved.AGENT_RADIUS_MAX == null)) && Number.isFinite(saved?.AGENT_RADIUS)) {
        const legacy = Math.max(0.05, Number(saved.AGENT_RADIUS));
        if (saved.AGENT_RADIUS_MIN == null) merged.AGENT_RADIUS_MIN = Math.max(0.05, legacy * 0.1);
        if (saved.AGENT_RADIUS_MAX == null) merged.AGENT_RADIUS_MAX = legacy;
      }

      if (!Number.isFinite(merged.AGENT_RADIUS_MIN)) merged.AGENT_RADIUS_MIN = DEFAULT_SOCIAL_FIELD_CONFIG.AGENT_RADIUS_MIN;
      if (!Number.isFinite(merged.AGENT_RADIUS_MAX)) merged.AGENT_RADIUS_MAX = DEFAULT_SOCIAL_FIELD_CONFIG.AGENT_RADIUS_MAX;

      if (!Number.isFinite(merged.TARGET_SPACING) || merged.TARGET_SPACING < 0) {
        merged.TARGET_SPACING = DEFAULT_SOCIAL_FIELD_CONFIG.TARGET_SPACING;
      }
      if (!Number.isFinite(merged.SPACING_SOFTNESS) || merged.SPACING_SOFTNESS < 0) {
        merged.SPACING_SOFTNESS = DEFAULT_SOCIAL_FIELD_CONFIG.SPACING_SOFTNESS;
      }
      if (!Number.isFinite(merged.SPRING_STRENGTH) || merged.SPRING_STRENGTH < 0) {
        merged.SPRING_STRENGTH = DEFAULT_SOCIAL_FIELD_CONFIG.SPRING_STRENGTH;
      }

      if (merged.AGENT_RADIUS_MAX < merged.AGENT_RADIUS_MIN) {
        const tmp = merged.AGENT_RADIUS_MAX;
        merged.AGENT_RADIUS_MAX = merged.AGENT_RADIUS_MIN;
        merged.AGENT_RADIUS_MIN = tmp;
      }

      return merged;
    }
  } catch (err) {
    console.warn("[social-field] could not load config from localStorage:", err);
  }
  return { ...DEFAULT_SOCIAL_FIELD_CONFIG };
}

export function saveSocialFieldConfig(cfg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.warn("[social-field] could not save config to localStorage:", err);
  }
}
