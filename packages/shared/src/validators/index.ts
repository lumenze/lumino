import { z } from 'zod';
import {
  ActionType,
  AnalyticsEventType,
  TooltipPosition,
  UserRole,
} from '../types';

// ── Selector Validator ──────────────────────────────────────────────────────

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const ElementSelectorSchema = z.object({
  primary: z.string().min(1),
  fallbacks: z.array(z.string()),
  textContent: z.string(),
  ariaLabel: z.string(),
  domPath: z.string(),
  visualHash: z.string(),
  boundingBox: BoundingBoxSchema,
});

// ── Step Validators ─────────────────────────────────────────────────────────

export const AppContextSchema = z.object({
  appId: z.string().min(1),
  appName: z.string().min(1),
  domain: z.string().optional(),
});

export const StepConditionSchema = z.object({
  type: z.enum(['element_visible', 'url_match', 'custom']),
  value: z.string(),
});

export const WalkthroughStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  selector: ElementSelectorSchema,
  actionType: z.nativeEnum(ActionType),
  actionValue: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  tooltipPosition: z.nativeEnum(TooltipPosition),
  appContext: AppContextSchema,
  precondition: StepConditionSchema.optional(),
  waitFor: z.string().optional(),
  expectedUrl: z.string().optional(),
  triggersNavigation: z.boolean().optional(),
  branches: z
    .array(
      z.object({
        condition: StepConditionSchema,
        targetStepId: z.string(),
        label: z.string(),
      })
    )
    .optional(),
  transitionConfig: z
    .object({
      sourceAppId: z.string(),
      targetAppId: z.string(),
      targetUrlPattern: z.string(),
      navigationTrigger: z.enum(['link_click', 'redirect', 'manual']),
      ttlSeconds: z.number().int().min(30).max(3600).default(300),
      urlParamKey: z.string().default('_lumino'),
      showTransitionIndicator: z.boolean().default(true),
      fallbackMessage: z.string(),
    })
    .optional(),
});

// ── Walkthrough Definition Validator ────────────────────────────────────────

export const WalkthroughDefinitionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  tags: z.array(z.string()).max(20),
  audienceRules: z.object({
    roles: z.array(z.nativeEnum(UserRole)).optional(),
    segments: z.array(z.string()).optional(),
    customRules: z
      .array(
        z.object({
          field: z.string(),
          operator: z.enum(['equals', 'contains', 'gt', 'lt', 'in']),
          value: z.union([z.string(), z.number(), z.array(z.string())]),
        })
      )
      .optional(),
  }),
  priority: z.number().int().min(0).max(1000).default(100),
  schedule: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    timezone: z.string().optional(),
  }),
  rateLimit: z.object({
    maxPerUser: z.number().int().min(0).default(5),
    maxPerSession: z.number().int().min(0).default(1),
    cooldownMinutes: z.number().int().min(0).default(60),
  }),
  steps: z.array(WalkthroughStepSchema).min(1).max(50),
  language: z.string().min(2).max(10).default('en'),
  translations: z.record(z.string(), z.any()).default({}),
});

// ── JWT Payload Validator ───────────────────────────────────────────────────

export const LuminoJwtPayloadSchema = z.object({
  sub: z.string().min(1),
  role: z.nativeEnum(UserRole),
  locale: z.string().min(2).default('en-US'),
  exp: z.number().int(),
  iat: z.number().int(),
  segments: z.array(z.string()).optional(),
});

// ── Analytics Event Validator ───────────────────────────────────────────────

export const AnalyticsEventSchema = z.object({
  type: z.nativeEnum(AnalyticsEventType),
  userId: z.string().min(1),
  walkthroughId: z.string().min(1),
  walkthroughVersion: z.number().int().min(1),
  stepId: z.string().optional(),
  sessionId: z.string().min(1),
  pageUrl: z.string().url(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── SDK Init Config Validator ───────────────────────────────────────────────

export const LuminoInitConfigSchema = z.object({
  appId: z.string().min(1),
  auth: z.function(),
  environment: z.enum(['development', 'staging', 'production']),
  apiUrl: z.string().url().optional(),
  debug: z.boolean().optional().default(false),
  customStyles: z.string().optional(),
  features: z
    .object({
      notifications: z.boolean().optional(),
      nlSearch: z.boolean().optional(),
      analytics: z.boolean().optional(),
      recording: z.boolean().optional(),
    })
    .optional(),
});

// ── Cross-App Transition Validator ──────────────────────────────────────────

export const CrossAppTransitionSchema = z.object({
  userId: z.string().min(1),
  walkthroughId: z.string().min(1),
  walkthroughVersion: z.number().int().min(1),
  fromApp: z.string().min(1),
  toApp: z.string().min(1),
  currentStep: z.number().int().min(0),
  nextStep: z.number().int().min(0),
  ttlSeconds: z.number().int().min(30).max(3600).default(300),
});
