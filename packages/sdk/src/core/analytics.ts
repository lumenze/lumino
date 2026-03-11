import type { ApiClient } from './api-client';
import { API_ROUTES } from '@lumino/shared';

interface AnalyticsEvent {
  type: string;
  walkthroughId: string;
  walkthroughVersion: number;
  stepId?: string;
  pageUrl: string;
  metadata?: Record<string, unknown>;
}

/**
 * AnalyticsTracker
 *
 * Sends lifecycle events (started, completed, step_viewed, etc.)
 * to the server analytics endpoint. Best-effort — failures are silent.
 */
export class AnalyticsTracker {
  private sessionId: string;
  private userId: string | null = null;

  constructor(private readonly api: ApiClient) {
    this.sessionId = this.generateSessionId();
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  async track(event: AnalyticsEvent): Promise<void> {
    if (!this.userId) return;

    try {
      await this.api.post(`${API_ROUTES.ANALYTICS}/events`, {
        type: event.type,
        userId: this.userId,
        walkthroughId: event.walkthroughId,
        walkthroughVersion: event.walkthroughVersion,
        stepId: event.stepId,
        sessionId: this.sessionId,
        pageUrl: event.pageUrl,
        timestamp: new Date().toISOString(),
        metadata: event.metadata,
      });
    } catch {
      // Best-effort — analytics should never break the SDK
    }
  }

  private generateSessionId(): string {
    return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
