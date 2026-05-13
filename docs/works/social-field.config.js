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

  // Force parameters
  HARD_REPULSION: 4,          // force multiplier in hard-stop zone
  SOFT_REPULSION_SCALE: 5,    // force multiplier in soft zone
  ATTRACTION_SCALE: 1.2,      // global attraction multiplier
  ASPECT_FORCE_SCALE: 2.8,    // additional force from aspect similarity/conflict
  ASPECT_REPEL_THRESHOLD: 0.5, // if aspect diff is above this, it repels
  ASPECT_A_THRESHOLD: 0.25,   // dead zone for aspect A signed similarity
  ASPECT_B_THRESHOLD: 0.25,   // dead zone for aspect B signed similarity
  ASPECT_C_THRESHOLD: 0.25,   // dead zone for aspect C signed similarity
  ASPECT_D_THRESHOLD: 0.25,   // dead zone for aspect D signed similarity
  ASPECT_A_STRENGTH: 1.0,     // influence of aspect A on interactions
  ASPECT_B_STRENGTH: 1.0,     // influence of aspect B on interactions
  ASPECT_C_STRENGTH: 1.0,     // influence of aspect C on interactions
  ASPECT_D_STRENGTH: 1.0,     // influence of aspect D on interactions
  BOUNDARY_REDUCTION_MAX: 0.72, // max fraction of boundary that friendship can remove
  BOUNDARY_CURVE: 1.8,        // curvature of friendship→boundary mapping

  // Visuals
  AGENT_RADIUS: 7,
  GLOW_INTENSITY: 0,
  SHOW_CONNECTIONS: false,
  SHOW_VISION: false,
  CONNECTION_ALPHA_MAX: 0.55,
  CONNECTION_MIN_RELATION_NORM: 0.7,
  
  // Performance tweaks
  ENABLE_SHADOWS: false,
  ENABLE_ASPECTS: true,
  DECAY_BATCH_INTERVAL: 10,  // batch decay every N frames
};

const LS_KEY = "social-field-config";

export function loadSocialFieldConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...DEFAULT_SOCIAL_FIELD_CONFIG, ...saved };
    }
  } catch (_) { /* ignore */ }
  return { ...DEFAULT_SOCIAL_FIELD_CONFIG };
}

export function saveSocialFieldConfig(cfg) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch (_) { /* ignore */ }
}
