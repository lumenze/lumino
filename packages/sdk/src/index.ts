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
import { CommandPalette } from './search/command-palette';

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
    this.makeDraggable(fab, fab, { preserveTransform: false });

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
    this.makeDraggable(dialog, dialog, { preserveTransform: false });

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

  /** Subscribe to SDK events */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.on(event, handler);
  }

  /** Unsubscribe */
  off(event: string, handler: (...args: unknown[]) => void): void {
    this.eventBus.off(event, handler);
  }

  private makeDraggable(
    target: HTMLElement,
    handle: HTMLElement,
    options: { preserveTransform: boolean },
  ): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const left = Math.max(8, Math.min(startLeft + dx, window.innerWidth - target.offsetWidth - 8));
      const top = Math.max(8, Math.min(startTop + dy, window.innerHeight - target.offsetHeight - 8));
      target.style.left = `${left}px`;
      target.style.top = `${top}px`;
      target.style.right = 'auto';
      target.style.bottom = 'auto';
      if (!options.preserveTransform) {
        target.style.transform = 'none';
      }
    };

    const onPointerUp = () => {
      dragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = target.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      target.style.left = `${rect.left}px`;
      target.style.top = `${rect.top}px`;
      target.style.right = 'auto';
      target.style.bottom = 'auto';
      if (!options.preserveTransform) {
        target.style.transform = 'none';
      }
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
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
    cursor: move;
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
    cursor: move;
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
  void LuminoBootstrap.initFromScript();
}

export default Lumino;
export { LuminoEvent } from './core/event-bus';
