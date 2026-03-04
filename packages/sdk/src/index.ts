/**
 * LUMINO SDK — Entry Point
 *
 * Vanilla TypeScript shell that:
 * 1. Creates shadow DOM container
 * 2. Authenticates via host JWT callback
 * 3. Loads published walkthroughs from server
 * 4. Shows notifications for available walkthroughs
 * 5. Plays walkthroughs with spotlight + tooltip + action-gating
 * 6. Provides recorder for authors
 */

import type { LuminoInitConfig, WalkthroughStep } from '@lumino/shared';
import { SHADOW_HOST_ID, SDK_VERSION, API_ROUTES } from '@lumino/shared';
import { DomObserver } from './observers/dom-observer';
import { RouteObserver } from './observers/route-observer';
import { ApiClient } from './core/api-client';
import { AuthManager } from './core/auth-manager';
import { StateManager } from './core/state-manager';
import { ShadowDomManager } from './core/shadow-dom';
import { WalkthroughPlayer } from './player/player';
import { WalkthroughRecorder } from './recorder/recorder';
import { NotificationEngine } from './notifications/engine';
import { EventBus, LuminoEvent } from './core/event-bus';
import { Logger } from './utils/logger';

export class Lumino {
  private static instance: Lumino | null = null;
  private static bootstrapping = false;
  private initialized = false;

  private readonly eventBus = new EventBus();
  private readonly logger = new Logger('Lumino');

  private config!: LuminoInitConfig;
  private shadowDom!: ShadowDomManager;
  private apiClient!: ApiClient;
  private authManager!: AuthManager;
  private stateManager!: StateManager;
  private domObserver!: DomObserver;
  private routeObserver!: RouteObserver;
  private player!: WalkthroughPlayer;
  private recorder: WalkthroughRecorder | null = null;
  private notifications!: NotificationEngine;

  private constructor() {}

  // ── Init ──────────────────────────────────────────────────────────

  static async init(config: LuminoInitConfig): Promise<Lumino> {
    if (Lumino.instance?.initialized || Lumino.bootstrapping) {
      Lumino.instance?.logger.warn('Already initialized. Ignoring duplicate init().');
      return Lumino.instance ?? new Lumino();
    }

    Lumino.bootstrapping = true;
    const sdk = Lumino.instance ?? new Lumino();
    Lumino.instance = sdk;

    try {
      await sdk.bootstrap(config);
      sdk.logger.info(`SDK v${SDK_VERSION} initialized`, {
        appId: config.appId,
        env: config.environment,
      });
    } catch (error) {
      sdk.logger.error('Init failed', error);
      throw error;
    } finally {
      Lumino.bootstrapping = false;
    }

    return sdk;
  }

  static destroy(): void {
    Lumino.instance?.teardown();
    Lumino.instance = null;
  }

  static getInstance(): Lumino | null {
    return Lumino.instance;
  }

  // ── Bootstrap ─────────────────────────────────────────────────────

  private async bootstrap(config: LuminoInitConfig): Promise<void> {
    this.config = config;
    this.logger.setDebug(config.debug ?? false);

    // 1. Shadow DOM
    this.shadowDom = new ShadowDomManager(SHADOW_HOST_ID);
    this.shadowDom.create();

    // 2. API client
    this.apiClient = new ApiClient({
      baseUrl: config.apiUrl ?? `${window.location.origin}/lumino`,
      appId: config.appId,
    });

    // 3. Auth
    this.authManager = new AuthManager(config.auth);
    await this.authManager.authenticate();
    this.apiClient.setAuthToken(this.authManager.getToken());

    // 4. State
    this.stateManager = new StateManager(this.apiClient);

    // 5. Observers
    this.domObserver = new DomObserver(this.eventBus);
    this.routeObserver = new RouteObserver(this.eventBus);
    this.domObserver.start();
    this.routeObserver.start();

    // 6. Player
    this.player = new WalkthroughPlayer({
      shadowDom: this.shadowDom,
      apiClient: this.apiClient,
      stateManager: this.stateManager,
      eventBus: this.eventBus,
    });

    // 7. Notifications
    const features = config.features ?? {};
    this.notifications = new NotificationEngine({
      shadowDom: this.shadowDom,
      apiClient: this.apiClient,
      eventBus: this.eventBus,
    });
    await this.notifications.start();

    // Wire notification → player
    this.notifications.onStartWalkthrough = (wtId) => {
      this.logger.info('Starting walkthrough from notification', { wtId });
      this.notifications.pause();
      this.player.startWalkthrough(wtId).catch((err) => {
        this.notifications.resume();
        this.logger.error('Failed to start walkthrough', err);
      });
    };

    this.eventBus.on(LuminoEvent.WalkthroughCompleted, () => {
      this.notifications.resume();
    });
    this.eventBus.on(LuminoEvent.WalkthroughAbandoned, () => {
      this.notifications.resume();
    });

    // 8. Recorder (author/admin only)
    const role = this.authManager.getRole();
    if (role !== 'customer' && features.recording !== false) {
      this.recorder = new WalkthroughRecorder({
        shadowDom: this.shadowDom,
        apiClient: this.apiClient,
        eventBus: this.eventBus,
      });
      this.createAuthorFab();
    }

    // 9. Load walkthroughs + progress, then show notifications
    await this.loadAndNotify();

    // 10. Check for cross-app transitions (skip if not deployed)
    // await this.checkPendingTransitions();

    this.initialized = true;
    this.eventBus.emit(LuminoEvent.Initialized, { version: SDK_VERSION });
  }

  private async loadAndNotify(): Promise<void> {
    try {
      await this.stateManager.loadPublishedWalkthroughs(this.config.appId);
      await this.stateManager.loadProgress();

      const inProgressWalkthroughId = this.stateManager.getInProgressWalkthroughId();
      if (inProgressWalkthroughId) {
        this.notifications.pause();
        await this.player.startWalkthrough(inProgressWalkthroughId);
        return;
      }

      // Show notifications for walkthroughs the user hasn't completed
      for (const wt of this.stateManager.getAllWalkthroughs()) {
        if (!this.stateManager.isCompleted(wt.id)) {
          this.notifications.enqueue(wt.id, wt.definition);
        }
      }
    } catch (err) {
      this.logger.warn('Failed to load walkthroughs', err);
    }
  }

  // TODO: Re-enable when cross-app transitions module is deployed
  // private async checkPendingTransitions(): Promise<void> { ... }

  // ── Author FAB ──────────────────────────────────────────────────

  private createAuthorFab(): void {
    this.shadowDom.appendStyles(AUTHOR_FAB_CSS);
    const container = this.shadowDom.getContainer('author-fab');

    const fab = document.createElement('button');
    fab.className = 'lm-author-fab';
    fab.innerHTML = '&#9679; Record Guide';
    container.appendChild(fab);

    let capturedSteps: WalkthroughStep[] = [];

    fab.addEventListener('click', () => {
      if (this.recorder?.isRecording()) return;
      fab.style.display = 'none';
      this.recorder!.startRecording(this.config.appId);

      // Capture steps when recording stops (before they're cleared)
      const handler = () => {
        capturedSteps = this.recorder?.getSteps() ?? [];
        this.eventBus.off(LuminoEvent.RecordingStopped, handler);
        if (capturedSteps.length === 0) {
          fab.style.display = '';
          return;
        }
        this.showSaveDialog(capturedSteps, fab);
      };
      this.eventBus.on(LuminoEvent.RecordingStopped, handler);
    });
  }

  private showSaveDialog(steps: WalkthroughStep[], fab: HTMLElement): void {
    const container = this.shadowDom.getContainer('author-fab');
    const dialog = document.createElement('div');
    dialog.className = 'lm-save-dialog';
    dialog.innerHTML = `
      <h4 style="font-size:15px;font-weight:700;margin-bottom:4px;color:#FFF">Save Walkthrough</h4>
      <p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:14px">${steps.length} steps recorded</p>
      <input class="lm-save-input" id="lm-save-title" placeholder="Walkthrough title" />
      <input class="lm-save-input" id="lm-save-desc" placeholder="Short description" />
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="lm-save-btn" id="lm-save-submit">Save &amp; Create</button>
        <button class="lm-save-cancel" id="lm-save-cancel">Discard</button>
      </div>
    `;
    container.appendChild(dialog);
    requestAnimationFrame(() => dialog.classList.add('lm-save-visible'));

    const submit = dialog.querySelector('#lm-save-submit') as HTMLElement;
    const cancel = dialog.querySelector('#lm-save-cancel') as HTMLElement;
    const titleInput = dialog.querySelector('#lm-save-title') as HTMLInputElement;
    const descInput = dialog.querySelector('#lm-save-desc') as HTMLInputElement;

    submit.addEventListener('click', async () => {
      const title = titleInput.value.trim() || 'Untitled Walkthrough';
      const desc = descInput.value.trim() || 'Recorded walkthrough';
      submit.textContent = 'Saving...';
      try {
        const definition = {
          title,
          description: desc,
          tags: [] as string[],
          audienceRules: {},
          priority: 100,
          schedule: {},
          rateLimit: { maxPerUser: 5, maxPerSession: 1, cooldownMinutes: 60 },
          steps,
          language: 'en',
          translations: {},
        };
        const result = await this.apiClient.post<{ id: string }>(API_ROUTES.WALKTHROUGHS, {
          appId: this.config.appId,
          definition,
        });
        // Auto-publish so it's immediately visible to customers
        this.logger.info('Walkthrough created', { id: result?.id });
        if (result?.id) {
          await this.apiClient.post(`${API_ROUTES.WALKTHROUGHS}/${result.id}/publish`, {}).catch((pubErr) => {
            this.logger.warn('Auto-publish failed — walkthrough saved as draft', pubErr);
          });
        }
        dialog.innerHTML = '<p style="color:#10B981;font-size:13px;font-weight:600;padding:20px;text-align:center">Walkthrough saved &amp; published!</p>';
        setTimeout(() => { dialog.remove(); fab.style.display = ''; }, 1500);
      } catch (err) {
        this.logger.error('Save failed', err);
        submit.textContent = 'Save Failed — Retry';
      }
    });

    cancel.addEventListener('click', () => {
      dialog.remove();
      fab.style.display = '';
    });
  }

  // ── Teardown ──────────────────────────────────────────────────────

  private teardown(): void {
    this.player?.stop();
    this.notifications?.stop();
    this.domObserver?.stop();
    this.routeObserver?.stop();
    this.shadowDom?.destroy();
    this.eventBus.clear();
    this.initialized = false;
    this.logger.info('SDK destroyed');
  }

  // ── Public API ────────────────────────────────────────────────────

  get version(): string { return SDK_VERSION; }
  get isInitialized(): boolean { return this.initialized; }

  /** Start a specific walkthrough by ID */
  startWalkthrough(walkthroughId: string): void {
    this.player.startWalkthrough(walkthroughId);
  }

  /** Stop the currently playing walkthrough */
  stopWalkthrough(): void {
    this.player.stop();
  }

  /** Start recording a new walkthrough (author/admin only) */
  startRecording(): void {
    if (!this.recorder) {
      this.logger.warn('Recording not available for this role');
      return;
    }
    this.recorder.startRecording(this.config.appId);
  }

  /** Stop recording and return captured steps */
  stopRecording() {
    return this.recorder?.stopRecording() ?? [];
  }

  /** Save a recorded walkthrough to the server */
  async saveRecording(title: string, description: string) {
    if (!this.recorder) throw new Error('Recording not available');
    return this.recorder.saveWalkthrough(title, description);
  }

  /** Subscribe to SDK events */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.on(event, handler);
  }

  /** Unsubscribe */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.off(event, handler);
  }
}

// ── Author FAB CSS ──────────────────────────────────────────────────────

const AUTHOR_FAB_CSS = `
  .lm-author-fab {
    position: fixed; bottom: 20px; right: 20px; z-index: 100000;
    display: flex; align-items: center; gap: 6px;
    padding: 12px 20px; border-radius: 14px; border: none;
    background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #FFF; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    animation: lm-fab-glow 3s ease-in-out infinite;
    transition: all 0.2s; pointer-events: auto;
  }
  @keyframes lm-fab-glow {
    0%,100% { box-shadow: 0 8px 30px rgba(224,122,47,0.35); }
    50%     { box-shadow: 0 8px 40px rgba(224,122,47,0.55), 0 0 60px rgba(224,122,47,0.15); }
  }
  .lm-author-fab:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(224,122,47,0.45);
    animation: none;
  }
  .lm-save-dialog {
    position: fixed; bottom: 80px; right: 20px; z-index: 100000;
    width: 300px; background: #1E1E36; border-radius: 16px; padding: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.08);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: auto;
    opacity: 0; transform: translateY(10px);
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
  }
  .lm-save-visible { opacity: 1; transform: translateY(0); }
  .lm-save-input {
    display: block; width: 100%; padding: 10px 12px; margin-bottom: 8px;
    border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.06); color: #FFF; font-size: 13px;
    font-family: inherit; outline: none;
  }
  .lm-save-input::placeholder { color: rgba(255,255,255,0.25); }
  .lm-save-input:focus { border-color: #E07A2F; }
  .lm-save-btn {
    flex: 1; padding: 10px 16px; border-radius: 10px; border: none;
    background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #FFF; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: inherit;
  }
  .lm-save-cancel {
    padding: 10px 16px; border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1); background: transparent;
    color: rgba(255,255,255,0.5); font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit;
  }
`;

// ── Global ──────────────────────────────────────────────────────────────

declare global {
  interface Window {
    Lumino: typeof Lumino;
  }
}

if (typeof window !== 'undefined') {
  window.Lumino = Lumino;
}

export default Lumino;
export { LuminoEvent } from './core/event-bus';
