// ============================================================================
// LUMINO SHARED TYPES
// This is the single source of truth for all data structures.
// SDK, Server, and AI Services all import from here.
// ============================================================================

// ── Enums ───────────────────────────────────────────────────────────────────

export enum WalkthroughStatus {
  Draft = 'draft',
  InReview = 'in_review',
  Published = 'published',
  Archived = 'archived',
}

export enum UserRole {
  Customer = 'customer',
  Author = 'author',
  Admin = 'admin',
}

export enum ActionType {
  Click = 'click',
  Input = 'input',
  Select = 'select',
  Navigate = 'navigate',
  Scroll = 'scroll',
  Hover = 'hover',
  CrossAppTransition = 'cross_app_transition',
}

export enum TooltipPosition {
  Top = 'top',
  Right = 'right',
  Bottom = 'bottom',
  Left = 'left',
  Auto = 'auto',
}

export enum HealthStatus {
  Healthy = 'healthy',
  Warning = 'warning',
  Critical = 'critical',
}

export enum TransitionStatus {
  Pending = 'pending',
  Completed = 'completed',
  Expired = 'expired',
}

// ── Selector (Max signals for auto-healing) ─────────────────────────────────

export interface ElementSelector {
  /** Primary CSS selector captured during recording */
  primary: string;
  /** Alternative CSS selectors as fallbacks */
  fallbacks: string[];
  /** Visible text content of the element */
  textContent: string;
  /** Accessibility label */
  ariaLabel: string;
  /** Structural position in DOM tree */
  domPath: string;
  /** Visual fingerprint for image-based matching */
  visualHash: string;
  /** Last known position and dimensions */
  boundingBox: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Step ─────────────────────────────────────────────────────────────────────

export interface WalkthroughStep {
  id: string;
  order: number;

  // Element targeting
  selector: ElementSelector;

  // Action
  actionType: ActionType;
  actionValue?: string;

  // Content
  title: string;
  description: string;
  tooltipPosition: TooltipPosition;

  // App context (cross-app ready from day one)
  appContext: AppContext;

  // Conditions
  precondition?: StepCondition;
  waitFor?: string;
  expectedUrl?: string;
  triggersNavigation?: boolean;

  // Branching
  branches?: StepBranch[];

  // Cross-app transition config (only for CrossAppTransition type)
  transitionConfig?: CrossAppTransitionConfig;
}

export interface AppContext {
  appId: string;
  appName: string;
  domain?: string;
}

export interface StepCondition {
  type: 'element_visible' | 'url_match' | 'custom';
  value: string;
}

export interface StepBranch {
  condition: StepCondition;
  targetStepId: string;
  label: string;
}

export interface CrossAppTransitionConfig {
  sourceAppId: string;
  targetAppId: string;
  targetUrlPattern: string;
  navigationTrigger: 'link_click' | 'redirect' | 'manual';
  ttlSeconds: number;
  urlParamKey: string;
  showTransitionIndicator: boolean;
  fallbackMessage: string;
}

// ── Walkthrough Definition (stored as JSONB) ────────────────────────────────

export interface WalkthroughDefinition {
  title: string;
  description: string;
  tags: string[];

  // Targeting
  audienceRules: AudienceRules;
  priority: number;
  schedule: WalkthroughSchedule;
  rateLimit: RateLimit;

  // Content
  steps: WalkthroughStep[];

  // Localization
  language: string;
  translations: Record<string, TranslatedContent>;
}

export interface AudienceRules {
  roles?: UserRole[];
  /** Phase 2: segment-based targeting */
  segments?: string[];
  /** Custom rules evaluated at runtime */
  customRules?: CustomRule[];
}

export interface CustomRule {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'in';
  value: string | number | string[];
}

export interface WalkthroughSchedule {
  startDate?: string; // ISO 8601
  endDate?: string;   // ISO 8601
  timezone?: string;
}

export interface RateLimit {
  maxPerUser: number;
  maxPerSession: number;
  cooldownMinutes: number;
}

export interface TranslatedContent {
  title: string;
  description: string;
  steps: Array<{
    stepId: string;
    title: string;
    description: string;
  }>;
  reviewedBy?: string;
  reviewedAt?: string;
}

// ── Walkthrough (database record) ───────────────────────────────────────────

export interface Walkthrough {
  id: string;
  appId: string;
  currentVersion: number;
  status: WalkthroughStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
}

export interface WalkthroughVersion {
  id: string;
  walkthroughId: string;
  version: number;
  definition: WalkthroughDefinition;
  createdBy: string;
  createdAt: string;
  changelog?: string;
}

// ── User Progress ───────────────────────────────────────────────────────────

export interface UserProgress {
  userId: string;
  walkthroughId: string;
  walkthroughVersion: number;
  currentStepId: string;
  currentStepOrder: number;
  completed: boolean;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LuminoJwtPayload {
  /** Unique user identifier */
  sub: string;
  /** User role in the host product */
  role: UserRole;
  /** User locale preference */
  locale: string;
  /** Token expiration (Unix timestamp) */
  exp: number;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Phase 2: user segments for targeting */
  segments?: string[];
}

// ── Analytics Events ────────────────────────────────────────────────────────

export enum AnalyticsEventType {
  WalkthroughImpression = 'walkthrough_impression',
  WalkthroughStarted = 'walkthrough_started',
  StepViewed = 'step_viewed',
  StepCompleted = 'step_completed',
  StepSkipped = 'step_skipped',
  WalkthroughCompleted = 'walkthrough_completed',
  WalkthroughAbandoned = 'walkthrough_abandoned',
  WalkthroughResumed = 'walkthrough_resumed',
  NlQuery = 'nl_query',
  NlResultSelected = 'nl_result_selected',
}

export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  userId: string;
  walkthroughId: string;
  walkthroughVersion: number;
  stepId?: string;
  sessionId: string;
  pageUrl: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ── Health ───────────────────────────────────────────────────────────────────

export interface WalkthroughHealth {
  walkthroughId: string;
  walkthroughVersion: number;
  overallScore: number; // 0-100
  status: HealthStatus;
  lastCheckedAt: string;
  steps: StepHealth[];
  autoHealsCount: number;
}

export interface StepHealth {
  stepId: string;
  stepOrder: number;
  score: number;
  status: HealthStatus;
  selectorValid: boolean;
  lastValidatedAt: string;
  autoHealed: boolean;
  issue?: string;
}

// ── Cross-App Transition ────────────────────────────────────────────────────

export interface CrossAppTransition {
  id: string;
  userId: string;
  walkthroughId: string;
  walkthroughVersion: number;
  fromApp: string;
  toApp: string;
  currentStep: number;
  nextStep: number;
  timestamp: string;
  ttlSeconds: number;
  status: TransitionStatus;
}

// ── SDK Init Config ─────────────────────────────────────────────────────────

export interface LuminoInitConfig {
  /** Application identifier */
  appId: string;
  /** Auth callback - returns JWT string */
  auth: () => Promise<string> | string;
  /** Environment tag */
  environment: 'development' | 'staging' | 'production';
  /** Lumino backend URL (defaults to same origin) */
  apiUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Custom CSS to inject into shadow DOM */
  customStyles?: string;
  /** Disable specific features */
  features?: Partial<FeatureFlags>;
}

export interface FeatureFlags {
  notifications: boolean;
  nlSearch: boolean;
  analytics: boolean;
  recording: boolean;
}

// ── API Response Types ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
