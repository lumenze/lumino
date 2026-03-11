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

import type { LuminoInitConfig, WalkthroughStep, CrossAppTransition } from '@lumino/shared';
import { SHADOW_HOST_ID, SDK_VERSION, API_ROUTES, TRANSITION_URL_PARAM } from '@lumino/shared';
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
import { CommandPalette } from './search/command-palette';
import { AnalyticsTracker } from './core/analytics';
import { makeDraggable } from './utils/draggable';
import { escapeHtml } from './utils/escape-html';

type LuminoScriptConfig = {
  appId: string;
  tokenEndpoint?: string;
  token?: string;
  apiUrl: string;
  environment: 'development' | 'staging' | 'production';
  debug: boolean;
  roleParam: string;
  roleStorageKey?: string;
  autoInit: boolean;
};

type LuminoErrorCode =
  | 'LUMINO_CONFIG_ERROR'
  | 'LUMINO_TOKEN_FETCH_ERROR'
  | 'LUMINO_INIT_ERROR';

function emitLuminoEvent(name: 'lumino:ready' | 'lumino:error', detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function emitLuminoError(code: LuminoErrorCode, message: string, details?: unknown): void {
  emitLuminoEvent('lumino:error', { code, message, details });
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value.toLowerCase() === 'true';
}

function parseEnvironment(value: string | null): LuminoScriptConfig['environment'] {
  if (value === 'development' || value === 'staging' || value === 'production') {
    return value;
  }
  return 'production';
}

function readScriptConfig(script: HTMLScriptElement): LuminoScriptConfig {
  const appId = script.getAttribute('data-lumino-app-id')?.trim() ?? '';
  const tokenEndpoint = script.getAttribute('data-lumino-token-endpoint')?.trim() || undefined;
  const token = script.getAttribute('data-lumino-token')?.trim() || undefined;

  if (!appId) {
    throw new Error('Missing required attribute: data-lumino-app-id');
  }
  if (!tokenEndpoint && !token) {
    throw new Error('Missing auth configuration: provide data-lumino-token-endpoint or data-lumino-token');
  }

  return {
    appId,
    tokenEndpoint,
    token,
    apiUrl: script.getAttribute('data-lumino-api-url')?.trim() || '/lumino',
    environment: parseEnvironment(script.getAttribute('data-lumino-environment')),
    debug: parseBoolean(script.getAttribute('data-lumino-debug'), false),
    roleParam: script.getAttribute('data-lumino-role-param')?.trim() || 'role',
    roleStorageKey: script.getAttribute('data-lumino-role-storage-key')?.trim() || undefined,
    autoInit: parseBoolean(script.getAttribute('data-lumino-auto-init'), true),
  };
}

async function fetchTokenFromEndpoint(config: LuminoScriptConfig): Promise<string> {
  if (!config.tokenEndpoint) {
    throw new Error('Token endpoint missing');
  }

  const endpointUrl = new URL(config.tokenEndpoint, window.location.origin);
  if (config.roleStorageKey) {
    const role = localStorage.getItem(config.roleStorageKey);
    if (role) {
      endpointUrl.searchParams.set(config.roleParam, role);
    }
  }

  const response = await fetch(endpointUrl.toString(), { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Token endpoint returned ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await response.json();
    const token = json?.token ?? json?.data?.token;
    if (!token || typeof token !== 'string') {
      throw new Error('Token endpoint JSON response missing token');
    }
    return token;
  }

  const textToken = (await response.text()).trim();
  if (!textToken) {
    throw new Error('Token endpoint returned empty token');
  }
  return textToken;
}

function findLuminoScript(script?: HTMLScriptElement): HTMLScriptElement | null {
  if (script) return script;
  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }
  return document.querySelector('script[data-lumino-app-id]');
}

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
  private commandPalette: CommandPalette | null = null;
  private analytics!: AnalyticsTracker;
  private fabEl: HTMLElement | null = null;

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

  static async searchWalkthroughs(query: string) {
    const sdk = await Lumino.waitUntilReady();
    if (!sdk) {
      throw new Error('Lumino SDK not initialized yet');
    }
    return sdk.searchWalkthroughs(query);
  }

  static startWalkthrough(walkthroughId: string): void {
    const sdk = Lumino.instance;
    if (!sdk?.initialized) {
      throw new Error('Lumino SDK not initialized yet');
    }
    sdk.startWalkthrough(walkthroughId);
  }

  private static async waitUntilReady(timeoutMs = 8000): Promise<Lumino | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (Lumino.instance?.initialized) {
        return Lumino.instance;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
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

    // 4. State & Analytics
    this.stateManager = new StateManager(this.apiClient);
    this.analytics = new AnalyticsTracker(this.apiClient);
    this.analytics.setUserId(this.authManager.getUserId());

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
      analytics: this.analytics,
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

    // 8.5 NL search/chat widget (default ON)
    if (features.nlSearch !== false) {
      this.commandPalette = new CommandPalette({
        shadowDom: this.shadowDom,
        apiClient: this.apiClient,
        eventBus: this.eventBus,
      });
      this.commandPalette.setOnSelectWalkthrough((walkthroughId) => {
        this.notifications.pause();
        this.player.startWalkthrough(walkthroughId).catch((err) => {
          this.notifications.resume();
          this.logger.error('Failed to start walkthrough from search', err);
        });
      });
      this.commandPalette.start();
    }

    // 9. Check and resume cross-app transitions first
    const resumedFromTransition = await this.checkPendingTransitions();

    // 10. Load walkthroughs + progress, then show notifications
    if (!resumedFromTransition) {
      await this.loadAndNotify();
    }

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

  private async checkPendingTransitions(): Promise<boolean> {
    try {
      let transition: CrossAppTransition | null = null;
      const currentUrl = new URL(window.location.href);
      const token = currentUrl.searchParams.get(TRANSITION_URL_PARAM);

      if (token) {
        transition = await this.apiClient.consumeTransition(token);
      }

      if (!transition) {
        transition = await this.apiClient.getPendingTransition(this.config.appId);
      }

      if (!transition) {
        return false;
      }

      await this.stateManager.loadWalkthroughById(transition.walkthroughId);
      await this.stateManager.loadProgress();

      this.notifications.pause();
      await this.player.resumeFromTransition(transition);

      if (token) {
        currentUrl.searchParams.delete(TRANSITION_URL_PARAM);
        window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      }

      return true;
    } catch (err) {
      this.logger.warn('Failed to resume transition', err);
      return false;
    }
  }

  // ── Author FAB ──────────────────────────────────────────────────

  private createAuthorFab(): void {
    this.shadowDom.appendStyles(AUTHOR_FAB_CSS);
    const container = this.shadowDom.getContainer('author-fab');

    const fab = document.createElement('button');
    fab.className = 'lm-author-fab';
    fab.innerHTML = '<span class="lm-rec-dot"></span> Record Guide';
    container.appendChild(fab);
    makeDraggable(fab, fab);
    this.fabEl = fab;

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

    // Header
    const header = document.createElement('div');
    header.innerHTML = `
      <h4 style="font-size:15px;font-weight:700;margin-bottom:4px;color:#FFF">Save Walkthrough</h4>
      <p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:14px">${steps.length} steps recorded</p>
    `;
    dialog.appendChild(header);

    // Step edit list
    const stepList = document.createElement('div');
    stepList.className = 'lm-step-edit-list';

    const stepInputs: Array<{ titleInput: HTMLInputElement; descInput: HTMLInputElement }> = [];

    steps.forEach((step, i) => {
      const card = document.createElement('div');
      card.className = 'lm-step-edit-card';

      const badge = document.createElement('div');
      badge.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
      badge.innerHTML = `
        <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#E07A2F,#F5A623);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#FFF;flex-shrink:0">${i + 1}</div>
        <span style="font-size:10px;color:#E07A2F;font-weight:600;text-transform:uppercase">${escapeHtml(step.actionType)}</span>
      `;
      card.appendChild(badge);

      const titleInput = document.createElement('input');
      titleInput.className = 'lm-save-input';
      titleInput.placeholder = 'Step title';
      titleInput.value = step.title;
      card.appendChild(titleInput);

      const descInput = document.createElement('input');
      descInput.className = 'lm-save-input';
      descInput.placeholder = 'Step description';
      descInput.value = step.description;
      descInput.style.marginBottom = '0';
      card.appendChild(descInput);

      stepInputs.push({ titleInput, descInput });
      stepList.appendChild(card);
    });

    dialog.appendChild(stepList);

    // Walkthrough-level inputs
    const wtSection = document.createElement('div');
    wtSection.innerHTML = `
      <div style="border-top:1px solid rgba(255,255,255,0.08);margin:12px 0;padding-top:12px">
        <p style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Walkthrough Details</p>
      </div>
    `;
    dialog.appendChild(wtSection);

    const wtTitleInput = document.createElement('input');
    wtTitleInput.className = 'lm-save-input';
    wtTitleInput.placeholder = 'Walkthrough title';
    dialog.appendChild(wtTitleInput);

    const wtDescInput = document.createElement('input');
    wtDescInput.className = 'lm-save-input';
    wtDescInput.placeholder = 'Short description';
    dialog.appendChild(wtDescInput);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px';

    const submit = document.createElement('button');
    submit.className = 'lm-save-btn';
    submit.textContent = 'Save & Create';
    btnRow.appendChild(submit);

    const cancel = document.createElement('button');
    cancel.className = 'lm-save-cancel';
    cancel.textContent = 'Discard';
    btnRow.appendChild(cancel);

    dialog.appendChild(btnRow);
    container.appendChild(dialog);
    requestAnimationFrame(() => dialog.classList.add('lm-save-visible'));
    makeDraggable(dialog, dialog);

    submit.addEventListener('click', async () => {
      const title = wtTitleInput.value.trim() || 'Untitled Walkthrough';
      const desc = wtDescInput.value.trim() || 'Recorded walkthrough';

      // Apply edited step values
      stepInputs.forEach((inputs, i) => {
        const step = steps[i];
        if (!step) return;
        step.title = inputs.titleInput.value.trim() || step.title;
        step.description = inputs.descInput.value.trim() || step.description;
      });

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
    this.recorder?.stopRecording();
    this.notifications?.stop();
    this.commandPalette?.close();
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

  /** Resume recording with previously captured steps (for cross-page recording) */
  resumeRecording(steps: WalkthroughStep[]): void {
    if (!this.recorder) {
      this.logger.warn('Recording not available for this role');
      return;
    }
    // Hide FAB while recording
    if (this.fabEl) this.fabEl.style.display = 'none';

    this.recorder.resumeRecording(this.config.appId, steps);

    // Wire up save dialog when recording stops
    const handler = () => {
      const capturedSteps = this.recorder?.getSteps() ?? [];
      this.eventBus.off(LuminoEvent.RecordingStopped, handler);
      if (capturedSteps.length === 0) {
        if (this.fabEl) this.fabEl.style.display = '';
        return;
      }
      this.showSaveDialog(capturedSteps, this.fabEl!);
    };
    this.eventBus.on(LuminoEvent.RecordingStopped, handler);
  }

  /** Search walkthroughs by natural language (host chatbot integration) */
  async searchWalkthroughs(query: string) {
    return this.apiClient.post<{ items: Array<{
      walkthroughId: string;
      title: string;
      description: string;
      confidence: number;
      reason: string;
    }>; query: string; total: number }>(`${API_ROUTES.NL_SEARCH}/nl`, {
      query,
      limit: 5,
    });
  }

  /** Save a recorded walkthrough to the server */
  async saveRecording(title: string, description: string) {
    if (!this.recorder) throw new Error('Recording not available');
    return this.recorder.saveWalkthrough(title, description);
  }

  /** Get current recording state (for cross-page persistence by Chrome extension) */
  getRecordingState(): { recording: boolean; steps: WalkthroughStep[] } {
    return {
      recording: this.recorder?.isRecording() ?? false,
      steps: this.recorder?.getSteps() ?? [],
    };
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
    display: flex; align-items: center; gap: 8px;
    padding: 13px 22px; border-radius: 16px; border: none;
    background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #FFF; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    animation: lm-fab-glow 3s ease-in-out infinite;
    transition: all 0.2s; pointer-events: auto;
    cursor: move;
  }
  .lm-author-fab .lm-rec-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #FFF;
    animation: lm-rec-blink 1.5s ease-in-out infinite;
  }
  @keyframes lm-rec-blink {
    0%,100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes lm-fab-glow {
    0%,100% { box-shadow: 0 8px 28px rgba(224,122,47,0.3); }
    50%     { box-shadow: 0 8px 36px rgba(224,122,47,0.5), 0 0 50px rgba(224,122,47,0.12); }
  }
  .lm-author-fab:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 40px rgba(224,122,47,0.45);
    animation: none;
  }
  .lm-save-dialog {
    position: fixed; bottom: 80px; right: 20px; z-index: 100000;
    width: 360px; max-height: 80vh; overflow-y: auto;
    background: rgba(15,15,30,0.94); border-radius: 20px; padding: 22px;
    backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
    box-shadow: 0 24px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: auto;
    opacity: 0; transform: translateY(10px);
    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    cursor: move;
  }
  .lm-save-dialog::before {
    content: ''; position: absolute; top: 0; left: 20px; right: 20px; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(224,122,47,0.3), transparent);
    border-radius: 0 0 2px 2px;
  }
  .lm-save-visible { opacity: 1; transform: translateY(0); }
  .lm-save-input {
    display: block; width: 100%; padding: 11px 14px; margin-bottom: 8px;
    border-radius: 10px; border: 1.5px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.05); color: #FFF; font-size: 13px;
    font-family: inherit; outline: none; transition: border-color 0.2s;
  }
  .lm-save-input::placeholder { color: rgba(255,255,255,0.2); }
  .lm-save-input:focus { border-color: #E07A2F; box-shadow: 0 0 0 3px rgba(224,122,47,0.1); }
  .lm-save-btn {
    flex: 1; padding: 11px 18px; border-radius: 12px; border: none;
    background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #FFF; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(224,122,47,0.25);
  }
  .lm-save-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(224,122,47,0.35); }
  .lm-save-cancel {
    padding: 11px 18px; border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.1); background: transparent;
    color: rgba(255,255,255,0.5); font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all 0.2s;
  }
  .lm-save-cancel:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); }
  .lm-step-edit-list {
    max-height: 200px; overflow-y: auto; margin-bottom: 4px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .lm-step-edit-list::-webkit-scrollbar { width: 4px; }
  .lm-step-edit-list::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.12); border-radius: 4px;
  }
  .lm-step-edit-card {
    padding: 12px; border-radius: 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    transition: border-color 0.15s;
  }
  .lm-step-edit-card:hover { border-color: rgba(255,255,255,0.1); }
`;

// ── Global ──────────────────────────────────────────────────────────────

declare global {
  interface Window {
    Lumino: typeof Lumino;
    LuminoBootstrap: {
      initFromScript: (script?: HTMLScriptElement) => Promise<Lumino | null>;
    };
  }
}

if (typeof window !== 'undefined') {
  window.Lumino = Lumino;
}

export const LuminoBootstrap = {
  async initFromScript(script?: HTMLScriptElement): Promise<Lumino | null> {
    const scriptEl = findLuminoScript(script);
    if (!scriptEl) {
      console.warn('[Lumino] No <script data-lumino-app-id> element found. SDK auto-init skipped.');
      return null;
    }

    let config: LuminoScriptConfig;
    try {
      config = readScriptConfig(scriptEl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid SDK config';
      console.error('[Lumino] LUMINO_CONFIG_ERROR:', message);
      emitLuminoError('LUMINO_CONFIG_ERROR', message, error);
      return null;
    }

    if (!config.autoInit) {
      return null;
    }

    try {
      const sdk = await Lumino.init({
        appId: config.appId,
        auth: async () => {
          if (config.token) return config.token;
          try {
            return await fetchTokenFromEndpoint(config);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Token fetch failed';
            console.error('[Lumino] LUMINO_TOKEN_FETCH_ERROR:', message);
            emitLuminoError('LUMINO_TOKEN_FETCH_ERROR', message, error);
            throw error;
          }
        },
        environment: config.environment,
        apiUrl: config.apiUrl,
        debug: config.debug,
      });
      emitLuminoEvent('lumino:ready', { appId: config.appId, version: sdk.version });
      return sdk;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SDK initialization failed';
      console.error('[Lumino] LUMINO_INIT_ERROR:', message);
      emitLuminoError('LUMINO_INIT_ERROR', message, error);
      return null;
    }
  },
};

if (typeof window !== 'undefined') {
  window.LuminoBootstrap = LuminoBootstrap;

  // Try init immediately; if script element not found (e.g. dynamic injection
  // by Next.js), retry once after DOM is interactive.
  const tryInit = () => void LuminoBootstrap.initFromScript();
  if (findLuminoScript()) {
    tryInit();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit, { once: true });
  } else {
    // DOM already ready — use a microtask to let the injected script element settle
    Promise.resolve().then(tryInit);
  }
}

export default Lumino;
export { LuminoEvent } from './core/event-bus';
