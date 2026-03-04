// ============================================================================
// LUMINO CONSTANTS
// Shared across SDK, Server, and AI Services
// ============================================================================

/** SDK version - used for compatibility checks */
export const SDK_VERSION = '0.1.0';

/** Default cross-app transition TTL in seconds */
export const DEFAULT_TRANSITION_TTL = 300; // 5 minutes

/** URL parameter key for cross-app transitions */
export const TRANSITION_URL_PARAM = '_lumino';

/** Shadow DOM host element ID */
export const SHADOW_HOST_ID = 'lumino-root';

/** Maximum steps per walkthrough */
export const MAX_STEPS_PER_WALKTHROUGH = 50;

/** Maximum walkthroughs per app */
export const MAX_WALKTHROUGHS_PER_APP = 500;

/** Analytics event batch size (Phase 2) */
export const ANALYTICS_BATCH_SIZE = 25;

/** Analytics flush interval in ms (Phase 2) */
export const ANALYTICS_FLUSH_INTERVAL = 5000;

/** Health check interval in ms */
export const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

/** Session storage key prefix */
export const SESSION_KEY_PREFIX = 'lumino_';

/** API route prefixes */
export const API_ROUTES = {
  WALKTHROUGHS: '/api/v1/walkthroughs',
  AUTH: '/api/v1/auth',
  ANALYTICS: '/api/v1/analytics',
  HEALTH: '/api/v1/health',
  TRANSITIONS: '/api/v1/transitions',
  USER_STATE: '/api/v1/user-state',
  NL_SEARCH: '/api/v1/search',
} as const;

/** WebSocket event names */
export const WS_EVENTS = {
  // Client → Server
  SUBSCRIBE_WALKTHROUGH: 'subscribe:walkthrough',
  UNSUBSCRIBE_WALKTHROUGH: 'unsubscribe:walkthrough',
  STEP_ACTION: 'step:action',

  // Server → Client
  WALKTHROUGH_UPDATED: 'walkthrough:updated',
  WALKTHROUGH_HEALTH_CHANGED: 'walkthrough:health_changed',
  NOTIFICATION_TRIGGER: 'notification:trigger',
} as const;

/** HTTP status codes used in API responses */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

/** Error codes for API responses */
export const ERROR_CODES = {
  // Auth errors
  INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  INSUFFICIENT_ROLE: 'AUTH_INSUFFICIENT_ROLE',

  // Walkthrough errors
  WALKTHROUGH_NOT_FOUND: 'WT_NOT_FOUND',
  WALKTHROUGH_INVALID: 'WT_INVALID',
  WALKTHROUGH_LOCKED: 'WT_LOCKED',
  WALKTHROUGH_VERSION_CONFLICT: 'WT_VERSION_CONFLICT',

  // Transition errors
  TRANSITION_NOT_FOUND: 'TRANS_NOT_FOUND',
  TRANSITION_EXPIRED: 'TRANS_EXPIRED',
  TRANSITION_USER_MISMATCH: 'TRANS_USER_MISMATCH',

  // General
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
