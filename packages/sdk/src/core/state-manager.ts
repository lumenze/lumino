import type { UserProgress, WalkthroughDefinition, WalkthroughVersion } from '@lumino/shared';
import { API_ROUTES } from '@lumino/shared';
import type { ApiClient } from './api-client';

/**
 * StateManager
 *
 * Client-side state for the currently active walkthrough session.
 * Syncs progress to the server for session persistence (resume on revisit).
 */
export class StateManager {
  /** Currently loaded walkthrough definitions keyed by id */
  private walkthroughs = new Map<string, { definition: WalkthroughDefinition; version: number }>();

  /** Active walkthrough state */
  private activeWalkthroughId: string | null = null;
  private activeStepIndex = 0;

  /** User progress cache */
  private progressCache = new Map<string, UserProgress>();

  constructor(private readonly api: ApiClient) {}

  // ── Walkthrough Loading ───────────────────────────────────────────

  async loadPublishedWalkthroughs(appId: string): Promise<void> {
    const result = await this.api.get<{ items: Array<{ id: string; currentVersion: number; versions: WalkthroughVersion[] }> }>(
      `${API_ROUTES.WALKTHROUGHS}/published?appId=${appId}`,
    );

    for (const wt of result.items) {
      const latestVersion = wt.versions[0];
      if (latestVersion) {
        this.walkthroughs.set(wt.id, {
          definition: latestVersion.definition as unknown as WalkthroughDefinition,
          version: latestVersion.version,
        });
      }
    }
  }

  async loadWalkthroughById(walkthroughId: string): Promise<void> {
    const wt = await this.api.get<{ id: string; currentVersion: number; versions: WalkthroughVersion[] }>(
      `${API_ROUTES.WALKTHROUGHS}/${walkthroughId}`,
    );
    const latestVersion = wt.versions[0];
    if (!latestVersion) return;

    this.walkthroughs.set(wt.id, {
      definition: latestVersion.definition as unknown as WalkthroughDefinition,
      version: latestVersion.version,
    });
  }

  getWalkthrough(id: string) {
    return this.walkthroughs.get(id) ?? null;
  }

  getAllWalkthroughs() {
    return Array.from(this.walkthroughs.entries()).map(([id, wt]) => ({
      id,
      ...wt,
    }));
  }

  // ── Active Walkthrough ────────────────────────────────────────────

  setActive(walkthroughId: string, stepIndex = 0): void {
    this.activeWalkthroughId = walkthroughId;
    this.activeStepIndex = stepIndex;
  }

  getActive() {
    if (!this.activeWalkthroughId) return null;
    const wt = this.walkthroughs.get(this.activeWalkthroughId);
    if (!wt) return null;
    return {
      walkthroughId: this.activeWalkthroughId,
      stepIndex: this.activeStepIndex,
      step: wt.definition.steps[this.activeStepIndex] ?? null,
      totalSteps: wt.definition.steps.length,
      definition: wt.definition,
      version: wt.version,
    };
  }

  advanceStep(): boolean {
    const active = this.getActive();
    if (!active) return false;
    if (this.activeStepIndex >= active.totalSteps - 1) return false;
    this.activeStepIndex++;
    return true;
  }

  clearActive(): void {
    this.activeWalkthroughId = null;
    this.activeStepIndex = 0;
  }

  // ── Progress Sync ─────────────────────────────────────────────────

  async loadProgress(): Promise<void> {
    try {
      const result = await this.api.get<{ items: UserProgress[] }>(
        `${API_ROUTES.USER_STATE}/progress`,
      );
      for (const p of result.items) {
        this.progressCache.set(p.walkthroughId, p);
      }
    } catch {
      // Non-critical — SDK works without progress
    }
  }

  getProgress(walkthroughId: string): UserProgress | null {
    return this.progressCache.get(walkthroughId) ?? null;
  }

  isCompleted(walkthroughId: string): boolean {
    return this.progressCache.get(walkthroughId)?.completed === true;
  }

  getInProgressWalkthroughId(): string | null {
    for (const [walkthroughId, progress] of this.progressCache.entries()) {
      if (!progress.completed && this.walkthroughs.has(walkthroughId)) {
        return walkthroughId;
      }
    }

    return null;
  }

  async syncProgress(params: {
    walkthroughId: string;
    version: number;
    stepId: string;
    stepOrder: number;
    completed: boolean;
  }): Promise<void> {
    try {
      await this.api.put(`${API_ROUTES.USER_STATE}/progress`, {
        walkthroughId: params.walkthroughId,
        walkthroughVersion: params.version,
        currentStepId: params.stepId,
        currentStepOrder: params.stepOrder,
        completed: params.completed,
      });
    } catch {
      // Fail silently — progress sync is best-effort
    }
  }
}
