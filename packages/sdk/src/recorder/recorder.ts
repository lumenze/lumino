import { ActionType } from '@lumino/shared';
import type { WalkthroughStep, ElementSelector, TooltipPosition } from '@lumino/shared';
import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import { EventBus, LuminoEvent } from '../core/event-bus';
import { API_ROUTES } from '@lumino/shared';

interface RecorderDeps {
  shadowDom: ShadowDomManager;
  apiClient: ApiClient;
  eventBus: EventBus;
}

/**
 * WalkthroughRecorder
 *
 * Captures walkthrough steps by intercepting user interactions.
 * For each click/input, captures max selector signals:
 * - CSS selector (primary + fallbacks)
 * - text content, aria-label
 * - DOM structural path
 * - bounding box
 *
 * Author mode only.
 */
export class WalkthroughRecorder {
  private deps: RecorderDeps;
  private recording = false;
  private steps: WalkthroughStep[] = [];
  private toolbarEl: HTMLElement | null = null;
  private highlightEl: HTMLElement | null = null;
  private stepListEl: HTMLElement | null = null;
  private appId: string = '';

  // Bound handlers for cleanup
  private boundClickHandler: ((e: MouseEvent) => void) | null = null;
  private boundHoverHandler: ((e: MouseEvent) => void) | null = null;
  private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(deps: RecorderDeps) {
    this.deps = deps;
  }

  // ── Public API ────────────────────────────────────────────────────

  startRecording(appId: string): void {
    if (this.recording) return;

    this.appId = appId;
    this.recording = true;
    this.steps = [];

    this.createRecordingUI();
    this.attachListeners();

    this.deps.eventBus.emit(LuminoEvent.RecordingStarted);
  }

  stopRecording(): WalkthroughStep[] {
    if (!this.recording) return [];

    this.recording = false;
    this.detachListeners();
    this.removeRecordingUI();

    this.deps.eventBus.emit(LuminoEvent.RecordingStopped);
    return [...this.steps];
  }

  async saveWalkthrough(title: string, description: string): Promise<unknown> {
    const steps = this.stopRecording();
    if (steps.length === 0) {
      throw new Error('No steps recorded');
    }

    const definition = {
      title,
      description,
      tags: [],
      audienceRules: {},
      priority: 100,
      schedule: {},
      rateLimit: { maxPerUser: 5, maxPerSession: 1, cooldownMinutes: 60 },
      steps,
      language: 'en',
      translations: {},
    };

    return this.deps.apiClient.post(API_ROUTES.WALKTHROUGHS, {
      appId: this.appId,
      definition,
    });
  }

  isRecording(): boolean {
    return this.recording;
  }

  getSteps(): WalkthroughStep[] {
    return [...this.steps];
  }

  undoLastStep(): WalkthroughStep | undefined {
    return this.steps.pop();
  }

  // ── Capture ───────────────────────────────────────────────────────

  private captureStep(el: HTMLElement, actionType: ActionType): void {
    const selector = this.captureSelector(el);
    const rect = el.getBoundingClientRect();

    const step: WalkthroughStep = {
      id: `step-${this.steps.length + 1}-${Date.now()}`,
      order: this.steps.length,
      selector,
      actionType: actionType as ActionType,
      title: `Step ${this.steps.length + 1}`,
      description: this.generateStepDescription(el, actionType),
      tooltipPosition: this.calculateTooltipPosition(rect) as TooltipPosition,
      appContext: {
        appId: this.appId,
        appName: this.appId,
      },
      expectedUrl: window.location.pathname,
      triggersNavigation: el.tagName === 'A' || el.closest('a') !== null,
    };

    this.steps.push(step);
    this.updateToolbarCount();
    this.flashCapture(el);
    this.addStepCard(step);
  }

  /**
   * Capture maximum selector signals for an element.
   * This is critical for auto-healing — the more signals, the better
   * we can re-find the element if the UI changes.
   */
  private captureSelector(el: HTMLElement): ElementSelector {
    const rect = el.getBoundingClientRect();

    return {
      // Primary: best unique CSS selector
      primary: this.buildCssSelector(el),

      // Fallbacks: alternative selectors
      fallbacks: this.buildFallbackSelectors(el),

      // Text content
      textContent: (el.textContent ?? '').trim().slice(0, 200),

      // Accessibility
      ariaLabel: el.getAttribute('aria-label') ?? el.getAttribute('title') ?? '',

      // Structural position
      domPath: this.buildDomPath(el),

      // Visual hash (placeholder — needs canvas snapshot in production)
      visualHash: '',

      // Position
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  private buildCssSelector(el: HTMLElement): string {
    // Prefer ID
    if (el.id) return `#${CSS.escape(el.id)}`;

    // data-testid
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

    // Build path with class/tag
    const parts: string[] = [];
    let current: HTMLElement | null = el;
    let depth = 0;

    while (current && current !== document.body && depth < 4) {
      let seg = current.tagName.toLowerCase();

      if (current.id) {
        seg = `#${CSS.escape(current.id)}`;
        parts.unshift(seg);
        break;
      }

      // Add meaningful classes (skip utility classes)
      const classes = Array.from(current.classList)
        .filter(c => !c.match(/^(p-|m-|w-|h-|flex|grid|text-|bg-|border)/))
        .slice(0, 2);
      if (classes.length > 0) {
        seg += classes.map(c => `.${CSS.escape(c)}`).join('');
      }

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(s => s.tagName === current!.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          seg += `:nth-child(${idx})`;
        }
      }

      parts.unshift(seg);
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  private buildFallbackSelectors(el: HTMLElement): string[] {
    const fallbacks: string[] = [];

    // By aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      fallbacks.push(`[aria-label="${CSS.escape(ariaLabel)}"]`);
    }

    // By name attribute (forms)
    const name = el.getAttribute('name');
    if (name) {
      fallbacks.push(`[name="${CSS.escape(name)}"]`);
    }

    // By role + text
    const role = el.getAttribute('role');
    if (role) {
      fallbacks.push(`[role="${CSS.escape(role)}"]`);
    }

    // By href (links)
    const href = el.getAttribute('href');
    if (href && href !== '#') {
      fallbacks.push(`a[href="${CSS.escape(href)}"]`);
    }

    return fallbacks.slice(0, 4);
  }

  private buildDomPath(el: HTMLElement): string {
    const parts: string[] = [];
    let current: HTMLElement | null = el;
    let depth = 0;

    while (current && current !== document.body && depth < 6) {
      const parent = current.parentElement;
      if (parent) {
        const idx = Array.from(parent.children).indexOf(current);
        parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${idx + 1})`);
      } else {
        parts.unshift(current.tagName.toLowerCase());
      }
      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  // ── Event Handlers ────────────────────────────────────────────────

  private attachListeners(): void {
    this.boundClickHandler = (e: MouseEvent) => {
      if (!this.recording) return;
      const target = e.target as HTMLElement;

      // Ignore clicks on our own UI (inside shadow DOM)
      if (target.closest('[data-lumino]') || target.closest('#lumino-root')) return;

      e.preventDefault();
      e.stopPropagation();

      const actionType = this.inferActionType(target);
      this.captureStep(target, actionType);
    };

    this.boundHoverHandler = (e: MouseEvent) => {
      if (!this.recording) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-lumino]')) return;
      this.highlightElement(target);
    };

    this.boundKeyHandler = (e: KeyboardEvent) => {
      if (!this.recording) return;
      if (e.key === 'Escape') {
        this.stopRecording();
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        this.undoLastStep();
        this.updateToolbarCount();
      }
    };

    // Use capture phase so we intercept before the app
    document.addEventListener('click', this.boundClickHandler, true);
    document.addEventListener('mouseover', this.boundHoverHandler, true);
    document.addEventListener('keydown', this.boundKeyHandler, true);
  }

  private detachListeners(): void {
    if (this.boundClickHandler) {
      document.removeEventListener('click', this.boundClickHandler, true);
    }
    if (this.boundHoverHandler) {
      document.removeEventListener('mouseover', this.boundHoverHandler, true);
    }
    if (this.boundKeyHandler) {
      document.removeEventListener('keydown', this.boundKeyHandler, true);
    }
  }

  private inferActionType(el: HTMLElement): ActionType {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return ActionType.Input;
    if (tag === 'select') return ActionType.Select;
    if (tag === 'a' && el.getAttribute('href')) return ActionType.Navigate;
    return ActionType.Click;
  }

  // ── Recording UI ──────────────────────────────────────────────────

  private createRecordingUI(): void {
    const root = this.deps.shadowDom.getRoot();
    this.deps.shadowDom.appendStyles(RECORDER_CSS);

    // Recording toolbar
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'lm-rec-toolbar';
    this.toolbarEl.innerHTML = `
      <div class="lm-rec-indicator"><span class="lm-rec-dot"></span> Recording</div>
      <span class="lm-rec-count" id="lm-rec-count">0 steps</span>
      <button class="lm-rec-undo" id="lm-rec-undo">↩ Undo <kbd class="lm-kbd">⌘Z</kbd></button>
      <button class="lm-rec-stop" id="lm-rec-stop">■ Stop <kbd class="lm-kbd">Esc</kbd></button>
    `;
    root.appendChild(this.toolbarEl);

    // Hover highlight
    this.highlightEl = document.createElement('div');
    this.highlightEl.className = 'lm-rec-highlight';
    root.appendChild(this.highlightEl);

    // Step preview panel
    this.stepListEl = document.createElement('div');
    this.stepListEl.className = 'lm-rec-steps';
    root.appendChild(this.stepListEl);

    // Wire toolbar buttons
    const stopBtn = this.toolbarEl.querySelector('#lm-rec-stop');
    const undoBtn = this.toolbarEl.querySelector('#lm-rec-undo');
    stopBtn?.addEventListener('click', () => this.stopRecording());
    undoBtn?.addEventListener('click', () => {
      this.undoLastStep();
      this.updateToolbarCount();
      // Remove last card from preview panel
      if (this.stepListEl?.lastElementChild) {
        this.stepListEl.lastElementChild.remove();
      }
    });
  }

  private removeRecordingUI(): void {
    this.toolbarEl?.remove();
    this.highlightEl?.remove();
    this.stepListEl?.remove();
    this.toolbarEl = null;
    this.highlightEl = null;
    this.stepListEl = null;
  }

  private updateToolbarCount(): void {
    const countEl = this.toolbarEl?.querySelector('#lm-rec-count');
    if (countEl) {
      countEl.textContent = `${this.steps.length} step${this.steps.length !== 1 ? 's' : ''}`;
    }
  }

  private highlightElement(el: HTMLElement): void {
    if (!this.highlightEl) return;
    const rect = el.getBoundingClientRect();
    Object.assign(this.highlightEl.style, {
      display: 'block',
      top: `${rect.top - 2}px`,
      left: `${rect.left - 2}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 4}px`,
    });
  }

  private flashCapture(el: HTMLElement): void {
    if (!this.highlightEl) return;
    const rect = el.getBoundingClientRect();
    this.highlightEl.style.borderColor = '#10B981';
    this.highlightEl.style.background = 'rgba(16,185,129,0.08)';
    setTimeout(() => {
      if (this.highlightEl) {
        this.highlightEl.style.borderColor = '#E07A2F';
        this.highlightEl.style.background = 'rgba(224,122,47,0.04)';
      }
    }, 300);
  }

  // ── Step Preview Panel ──────────────────────────────────────────

  private addStepCard(step: WalkthroughStep): void {
    if (!this.stepListEl) return;

    const card = document.createElement('div');
    card.className = 'lm-rec-step-card';
    const selectorPreview = step.selector.primary.length > 30
      ? step.selector.primary.slice(0, 30) + '...'
      : step.selector.primary;

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#E07A2F,#F5A623);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#FFF;flex-shrink:0">${step.order + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:#FFF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.escapeHtml(step.title)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:1px;display:flex;align-items:center;gap:4px">
            <span style="color:#E07A2F;font-weight:600;text-transform:uppercase">${step.actionType}</span>
            <span>${this.escapeHtml(selectorPreview)}</span>
          </div>
        </div>
      </div>
    `;

    this.stepListEl.appendChild(card);
    // Scroll to bottom
    this.stepListEl.scrollTop = this.stepListEl.scrollHeight;
  }

  private escapeHtml(str: string): string {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private generateStepDescription(el: HTMLElement, actionType: ActionType): string {
    const text = (el.textContent ?? '').trim().slice(0, 50);
    const tag = el.tagName.toLowerCase();
    const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || text;

    switch (actionType) {
      case 'click': return label ? `Click on "${label}"` : `Click the ${tag} element`;
      case 'input': return label ? `Enter a value in "${label}"` : `Type in the ${tag} field`;
      case 'select': return label ? `Choose an option from "${label}"` : `Select from the dropdown`;
      case 'navigate': return label ? `Navigate to "${label}"` : `Click the link`;
      default: return `Interact with the ${tag} element`;
    }
  }

  private calculateTooltipPosition(rect: DOMRect): string {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer right, then left, then bottom, then top
    if (cx < vw * 0.6) return 'right';
    if (cx > vw * 0.4) return 'left';
    if (cy < vh * 0.5) return 'bottom';
    return 'top';
  }
}

const RECORDER_CSS = `
  .lm-rec-toolbar {
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    z-index: 100005; display: flex; align-items: center; gap: 12px;
    background: rgba(30,30,54,0.85); backdrop-filter: blur(12px) saturate(160%);
    -webkit-backdrop-filter: blur(12px) saturate(160%);
    color: #FFF; border-radius: 14px;
    padding: 10px 18px; pointer-events: auto;
    box-shadow: 0 12px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
  }
  .lm-rec-indicator { display: flex; align-items: center; gap: 8px; font-weight: 700; }
  .lm-rec-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #EF4444;
    animation: lm-rec-ripple 2s ease-out infinite;
  }
  @keyframes lm-rec-ripple {
    0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
    70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  }
  .lm-rec-count { color: rgba(255,255,255,0.5); font-weight: 600; }
  .lm-rec-undo, .lm-rec-stop {
    padding: 4px 12px; border-radius: 8px; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
    transition: all 0.2s;
  }
  .lm-rec-undo {
    background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7);
  }
  .lm-rec-undo:hover { background: rgba(255,255,255,0.15); }
  .lm-rec-stop {
    background: #EF4444; color: #FFF;
  }
  .lm-rec-stop:hover { background: #DC2626; }
  .lm-kbd {
    display: inline-block; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 9px; padding: 1px 4px; border-radius: 3px;
    background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4);
    margin-left: 4px; vertical-align: middle; font-weight: 500;
  }

  .lm-rec-highlight {
    position: fixed; z-index: 100004; pointer-events: none; display: none;
    border: 2px dashed #E07A2F; border-radius: 4px;
    background: rgba(224,122,47,0.04);
    transition: all 0.15s ease;
  }

  .lm-rec-steps {
    position: fixed; top: 56px; right: 16px; width: 260px; max-height: 300px;
    overflow-y: auto; z-index: 100005; pointer-events: auto;
    background: rgba(30,30,54,0.9); backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 12px; padding: 8px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.06);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .lm-rec-steps::-webkit-scrollbar { width: 4px; }
  .lm-rec-steps::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

  .lm-rec-step-card {
    padding: 8px 10px; border-radius: 8px; margin-bottom: 4px;
    background: rgba(255,255,255,0.04);
    animation: lm-step-slide 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
    opacity: 0; transform: translateX(10px);
  }
  .lm-rec-step-card:last-child { margin-bottom: 0; }
  @keyframes lm-step-slide { to { opacity: 1; transform: translateX(0); } }
`;
