import type { WalkthroughStep, CrossAppTransition, ActionType } from '@lumino/shared';
import { TRANSITION_URL_PARAM } from '@lumino/shared';
import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import type { StateManager } from '../core/state-manager';
import type { AnalyticsTracker } from '../core/analytics';
import { EventBus, LuminoEvent } from '../core/event-bus';
import { DomObserver } from '../observers/dom-observer';
import { makeDraggable } from '../utils/draggable';
import { escapeHtml } from '../utils/escape-html';
import { Logger } from '../utils/logger';
import { DebugLogger } from '../utils/debug-logger';

interface PlayerDeps {
  shadowDom: ShadowDomManager;
  apiClient: ApiClient;
  stateManager: StateManager;
  eventBus: EventBus;
  analytics?: AnalyticsTracker;
}

/**
 * WalkthroughPlayer
 *
 * Core playback engine. Renders spotlight overlay, tooltip, and progress
 * inside the shadow DOM. Advances steps via action-gating (waits for
 * user to perform the correct action before progressing).
 */
export class WalkthroughPlayer {
  private deps: PlayerDeps;
  private domObserver: DomObserver;
  private logger = new Logger('Player');
  private dbg = DebugLogger.getInstance();
  private playing = false;

  // DOM elements (inside shadow DOM)
  private spotlightEl: HTMLElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private completionEl: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private boundEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private tooltipDragged = false;

  // Current step tracking
  private currentTargetEl: Element | null = null;
  private cleanupListeners: (() => void)[] = [];
  private repositionRaf: number | null = null;
  private startTime: number = 0;

  constructor(deps: PlayerDeps) {
    this.deps = deps;
    this.domObserver = new DomObserver(deps.eventBus);
  }

  // ── Public API ────────────────────────────────────────────────────

  async startWalkthrough(walkthroughId: string): Promise<void> {
    const wt = this.deps.stateManager.getWalkthrough(walkthroughId);
    if (!wt) throw new Error(`Walkthrough ${walkthroughId} not loaded`);

    // Check for existing progress to resume
    const progress = this.deps.stateManager.getProgress(walkthroughId);
    let startIndex = progress && !progress.completed ? progress.currentStepOrder : 0;

    // Check sessionStorage for a more recent step (survives page navigation
    // even when the async server sync didn't complete before unload)
    try {
      const savedState = sessionStorage.getItem('__lumino_playback_state__');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.walkthroughId === walkthroughId && parsed.stepIndex > startIndex) {
          startIndex = parsed.stepIndex;
          this.logger.debug(`Resuming from sessionStorage step ${startIndex}`);
        }
        sessionStorage.removeItem('__lumino_playback_state__');
      }
    } catch {
      // sessionStorage may be unavailable
    }

    this.logger.debug(`Starting walkthrough ${walkthroughId} at step ${startIndex}`);

    this.deps.stateManager.setActive(walkthroughId, startIndex);
    this.playing = true;
    this.startTime = Date.now();

    this.createOverlayElements();
    this.domObserver.start();

    this.deps.eventBus.emit(LuminoEvent.WalkthroughStarted, { walkthroughId });
    this.deps.analytics?.track({
      type: 'walkthrough_started',
      walkthroughId,
      walkthroughVersion: wt.version,
      pageUrl: window.location.href,
    });
    this.showCurrentStep();
  }

  async resumeFromTransition(transition: CrossAppTransition): Promise<void> {
    const wt = this.deps.stateManager.getWalkthrough(transition.walkthroughId);
    if (!wt) {
      // Need to load the walkthrough first
      // In real impl this would fetch by ID
      return;
    }

    this.deps.stateManager.setActive(transition.walkthroughId, transition.nextStep);
    this.playing = true;

    this.createOverlayElements();
    this.domObserver.start();

    this.deps.eventBus.emit(LuminoEvent.TransitionResumed, { transition });
    this.showCurrentStep();
  }

  stop(): void {
    this.playing = false;
    this.cleanupStep();
    this.removeOverlayElements();
    this.domObserver.stop();
    this.deps.stateManager.clearActive();
  }

  skip(): void {
    const active = this.deps.stateManager.getActive();
    if (active) {
      this.deps.eventBus.emit(LuminoEvent.WalkthroughAbandoned, {
        walkthroughId: active.walkthroughId,
        atStep: active.stepIndex,
      });
    }
    this.stop();
  }

  // ── Step Rendering ────────────────────────────────────────────────

  private showCurrentStep(): void {
    const active = this.deps.stateManager.getActive();
    if (!active || !active.step) {
      this.logger.debug('No active step — showing completion');
      this.showCompletion();
      return;
    }

    this.cleanupStep();

    const step = active.step;
    this.logger.debug(`Showing step ${active.stepIndex} "${step.title}" selector: ${step.selector.primary}`);
    this.dbg.log('info', 'player', `Step ${active.stepIndex + 1}/${active.totalSteps}: "${step.title}"`, {
      stepId: step.id,
      actionType: step.actionType,
      selector: step.selector.primary,
      fallbacks: step.selector.fallbacks,
      textContent: step.selector.textContent?.slice(0, 50),
      expectedUrl: step.expectedUrl,
      currentUrl: window.location.pathname,
      triggersNavigation: step.triggersNavigation,
    });

    // If the step expects a different URL, navigate there first
    if (step.expectedUrl && !window.location.pathname.startsWith(step.expectedUrl)) {
      this.dbg.log('info', 'player', `Navigating to ${step.expectedUrl} for step "${step.title}"`);
      this.deps.stateManager.syncProgress({
        walkthroughId: active.walkthroughId,
        version: active.version,
        stepId: step.id,
        stepOrder: active.stepIndex,
        completed: false,
      });
      window.location.href = step.expectedUrl;
      return;
    }

    // Find the target element
    const el = this.domObserver.findElement(step.selector);
    const targetReady = !!el && this.isInteractableTarget(el);
    if (!targetReady) {
      this.dbg.log('warn', 'player', `Element not ready (missing/hidden) — waiting 10s`, {
        primary: step.selector.primary,
        fallbacks: step.selector.fallbacks,
        textContent: step.selector.textContent?.slice(0, 50),
        ariaLabel: step.selector.ariaLabel,
        domPath: step.selector.domPath,
        foundButHidden: !!el,
        foundRect: el ? this.rectSummary(el) : null,
      });
      // Element missing/hidden — wait for an interactable target, auto-skip after timeout
      let found = false;
      const cancel = this.domObserver.waitForElement(
        step.id,
        step.selector,
        (foundEl) => {
          found = true;
          this.dbg.log('info', 'player', 'Element found after wait', {
            tag: (foundEl as HTMLElement).tagName,
            id: (foundEl as HTMLElement).id,
            text: (foundEl as HTMLElement).textContent?.slice(0, 50),
          });
          this.renderStep(step, foundEl, active.stepIndex, active.totalSteps);
        },
        10000,
        (candidate) => this.isInteractableTarget(candidate),
      );
      // If not found after timeout, auto-skip to next step
      const skipTimer = setTimeout(() => {
        if (!found) {
          this.dbg.log('error', 'player', `Element not found after 10s — auto-skipping step "${step.title}"`, {
            selector: step.selector,
          });
          cancel();
          this.advanceToNextStep();
        }
      }, 10500);
      this.cleanupListeners.push(() => { cancel(); clearTimeout(skipTimer); });
      return;
    }

    this.logger.debug('Element found');
    this.renderStep(step, el, active.stepIndex, active.totalSteps);
  }

  private isInteractableTarget(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      style.pointerEvents === 'none'
    ) {
      return false;
    }

    const node = el as HTMLElement;
    if ('disabled' in node && (node as HTMLInputElement).disabled) return false;
    if (node.getAttribute('aria-disabled') === 'true') return false;

    return true;
  }

  private rectSummary(el: Element): { x: number; y: number; w: number; h: number } {
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
  }

  private renderStep(step: WalkthroughStep, targetEl: Element, stepIndex: number, totalSteps: number): void {
    this.currentTargetEl = targetEl;
    const rect = targetEl.getBoundingClientRect();
    this.dbg.log('info', 'player', `Rendering step ${stepIndex + 1}: element found`, {
      tag: (targetEl as HTMLElement).tagName,
      id: (targetEl as HTMLElement).id,
      classes: (targetEl as HTMLElement).className?.toString().slice(0, 80),
      text: (targetEl as HTMLElement).textContent?.slice(0, 50),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      actionType: step.actionType,
      visible: rect.width > 0 && rect.height > 0,
    });

    // Show overlay
    this.showOverlay();

    // Position spotlight on target
    this.positionSpotlight(targetEl);

    // Render tooltip
    this.renderTooltip(step, targetEl, stepIndex, totalSteps);

    // Make target element interactive above overlay
    (targetEl as HTMLElement).style.position = (targetEl as HTMLElement).style.position || 'relative';
    (targetEl as HTMLElement).style.zIndex = '100001';
    (targetEl as HTMLElement).style.pointerEvents = 'auto';
    this.cleanupListeners.push(() => {
      (targetEl as HTMLElement).style.zIndex = '';
      (targetEl as HTMLElement).style.pointerEvents = '';
    });

    // Set up action-gating
    this.setupActionGating(step, targetEl);

    // Sync progress to server
    const active = this.deps.stateManager.getActive();
    if (active) {
      this.deps.stateManager.syncProgress({
        walkthroughId: active.walkthroughId,
        version: active.version,
        stepId: step.id,
        stepOrder: stepIndex,
        completed: false,
      });
    }

    // Track repositioning on scroll/resize
    this.startRepositioning(targetEl);
  }

  private setupActionGating(step: WalkthroughStep, targetEl: Element): void {
    const actionType = step.actionType as ActionType;
    this.dbg.log('debug', 'player', `Action gating: waiting for "${actionType}" on element`, {
      tag: (targetEl as HTMLElement).tagName,
      id: (targetEl as HTMLElement).id,
      triggersNavigation: step.triggersNavigation,
    });

    // Heartbeat: log every 5s while waiting so we can see how long it was stuck
    let gatingDone = false;
    const heartbeat = setInterval(() => {
      if (gatingDone) { clearInterval(heartbeat); return; }
      this.dbg.log('warn', 'player', `Still waiting for "${actionType}" on step "${step.title}"`, {
        waitingSince: Date.now(),
        elementStillInDom: document.body.contains(targetEl),
        elementVisible: (targetEl as HTMLElement).offsetWidth > 0,
      });
    }, 5000);
    this.cleanupListeners.push(() => { gatingDone = true; clearInterval(heartbeat); });

    if (actionType === 'click' || actionType === 'navigate') {
      const handler = () => {
        targetEl.removeEventListener('click', handler);
        this.dbg.log('info', 'player', `Click detected — advancing (triggersNavigation: ${step.triggersNavigation})`);

        if (step.triggersNavigation) {
          this.advanceToNextStep();
        } else {
          setTimeout(() => this.advanceToNextStep(), 100);
        }
      };
      targetEl.addEventListener('click', handler);
      this.cleanupListeners.push(() => targetEl.removeEventListener('click', handler));

    } else if (actionType === 'input') {
      const inputEl = targetEl as HTMLInputElement;
      let hasTyped = false;

      // Track that user has typed something
      const inputHandler = () => { hasTyped = true; };
      inputEl.addEventListener('input', inputHandler);
      this.cleanupListeners.push(() => inputEl.removeEventListener('input', inputHandler));

      // Advance when user presses Enter or leaves the field (blur), but only if they typed
      const confirmHandler = () => {
        if (!hasTyped) return;
        cleanup();
        setTimeout(() => this.advanceToNextStep(), 300);
      };
      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && hasTyped) {
          cleanup();
          setTimeout(() => this.advanceToNextStep(), 300);
        }
      };
      const cleanup = () => {
        inputEl.removeEventListener('blur', confirmHandler);
        inputEl.removeEventListener('keydown', keyHandler);
      };

      inputEl.focus();
      inputEl.addEventListener('blur', confirmHandler);
      inputEl.addEventListener('keydown', keyHandler);
      this.cleanupListeners.push(cleanup);

    } else if (actionType === 'select') {
      const selectEl = targetEl as HTMLElement;
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        this.dbg.log('info', 'player', 'Select/click detected — advancing');
        setTimeout(() => this.advanceToNextStep(), 300);
      };
      // Native <select> fires 'change'
      selectEl.addEventListener('change', advance);
      // Custom dropdowns use click
      selectEl.addEventListener('click', advance);
      this.cleanupListeners.push(() => {
        selectEl.removeEventListener('change', advance);
        selectEl.removeEventListener('click', advance);
      });

    } else if (actionType === 'hover') {
      const handler = () => {
        setTimeout(() => this.advanceToNextStep(), 500);
        targetEl.removeEventListener('mouseenter', handler);
      };
      targetEl.addEventListener('mouseenter', handler);
      this.cleanupListeners.push(() => targetEl.removeEventListener('mouseenter', handler));

    } else if (actionType === 'scroll') {
      // Auto-advance after short delay — scroll steps are informational
      const timer = setTimeout(() => this.advanceToNextStep(), 2500);
      this.cleanupListeners.push(() => clearTimeout(timer));

    } else if (actionType === 'cross_app_transition') {
      const handler = () => {
        targetEl.removeEventListener('click', handler);
        void this.initiateCrossAppTransition(step);
      };
      targetEl.addEventListener('click', handler);
      this.cleanupListeners.push(() => targetEl.removeEventListener('click', handler));
    }
  }

  private async initiateCrossAppTransition(step: WalkthroughStep): Promise<void> {
    const active = this.deps.stateManager.getActive();
    if (!active) return;
    const cfg = step.transitionConfig;
    if (!cfg) {
      this.logger.warn('Missing transitionConfig for cross_app_transition step');
      return;
    }

    try {
      const result = await this.deps.apiClient.createTransition({
        walkthroughId: active.walkthroughId,
        walkthroughVersion: active.version,
        fromApp: cfg.sourceAppId,
        toApp: cfg.targetAppId,
        currentStep: active.stepIndex,
        nextStep: active.stepIndex + 1,
        ttlSeconds: cfg.ttlSeconds ?? 300,
        targetUrl: cfg.targetUrlPattern,
        urlParamKey: cfg.urlParamKey || TRANSITION_URL_PARAM,
      });

      await this.deps.stateManager.syncProgress({
        walkthroughId: active.walkthroughId,
        version: active.version,
        stepId: step.id,
        stepOrder: active.stepIndex,
        completed: false,
      });

      this.deps.eventBus.emit(LuminoEvent.TransitionInitiated, result.transition);
      window.location.href = result.redirectUrl;
    } catch (error) {
      this.logger.error('Failed to initiate cross-app transition', error);
    }
  }

  private advanceToNextStep(): void {
    if (!this.playing) return;

    this.deps.eventBus.emit(LuminoEvent.StepAdvanced, this.deps.stateManager.getActive());

    const hasNext = this.deps.stateManager.advanceStep();
    if (hasNext) {
      // Persist the new step index to sessionStorage so it survives page navigation.
      // The server sync (in showCurrentStep/renderStep) is async and may not complete
      // before a full page navigation triggered by the user's click.
      const active = this.deps.stateManager.getActive();
      if (active) {
        try {
          sessionStorage.setItem('__lumino_playback_state__', JSON.stringify({
            walkthroughId: active.walkthroughId,
            stepIndex: active.stepIndex,
            version: active.version,
          }));
        } catch {
          // sessionStorage may be unavailable
        }
      }
      this.showCurrentStep();
    } else {
      this.showCompletion();
    }
  }

  // ── Skip Confirmation ────────────────────────────────────────────

  private showSkipConfirmation(): void {
    if (!this.tooltipEl) return;
    // Prevent duplicate
    if (this.tooltipEl.querySelector('.lm-skip-confirm')) return;

    const panel = document.createElement('div');
    panel.className = 'lm-skip-confirm';
    panel.style.cssText = `
      border-top: 1px solid rgba(255,255,255,0.08); margin-top: 14px; padding-top: 14px;
      opacity: 0; transform: translateY(6px);
      transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
    `;
    panel.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:10px">Skip this guide?</div>
      <div style="display:flex;gap:8px">
        <button id="lm-skip-yes" style="flex:1;padding:8px 12px;border-radius:8px;border:none;background:rgba(239,68,68,0.15);color:#EF4444;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background 0.2s">Yes, skip</button>
        <button id="lm-skip-no" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s">Continue</button>
      </div>
    `;
    this.tooltipEl.appendChild(panel);

    // Animate in
    requestAnimationFrame(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    });

    const yesBtn = panel.querySelector('#lm-skip-yes') as HTMLElement;
    const noBtn = panel.querySelector('#lm-skip-no') as HTMLElement;

    yesBtn.addEventListener('click', () => this.skip());
    noBtn.addEventListener('click', () => panel.remove());
  }

  // ── Spotlight ─────────────────────────────────────────────────────

  private positionSpotlight(el: Element): void {
    if (!this.spotlightEl) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(this.spotlightEl.style, {
      display: 'block',
      top: `${rect.top - pad}px`,
      left: `${rect.left - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
    });
  }

  // ── Tooltip ───────────────────────────────────────────────────────

  private renderTooltip(step: WalkthroughStep, targetEl: Element, index: number, total: number): void {
    if (!this.tooltipEl) return;
    this.tooltipDragged = false;

    const actionHints: Record<string, string> = {
      click: 'Click to continue',
      input: 'Type a value to continue',
      select: 'Select an option',
      navigate: 'Click to navigate',
      hover: 'Hover to continue',
      scroll: 'Auto-advancing…',
    };

    // Render content
    this.tooltipEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;position:relative;z-index:1">
        <span style="background:rgba(224,122,47,0.15);color:#E07A2F;font-size:10px;font-weight:800;padding:4px 12px;border-radius:100px;letter-spacing:0.5px">
          STEP ${index + 1} <span style="color:rgba(224,122,47,0.5);font-weight:600">/ ${total}</span>
        </span>
      </div>
      <h4 style="font-size:16px;font-weight:700;margin-bottom:8px;position:relative;z-index:1;letter-spacing:-0.01em">${escapeHtml(step.title)}</h4>
      <p style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.7;margin-bottom:16px;position:relative;z-index:1">${escapeHtml(step.description)}</p>
      ${this.buildProgressBar(index, total)}
      <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1">
        <span style="font-size:11px;color:rgba(255,255,255,.3);font-weight:500">
          ${actionHints[step.actionType] ?? 'Continue'}
        </span>
        <button id="lm-skip-btn">
          Skip
        </button>
      </div>
    `;

    // Wire skip button
    const skipBtn = this.tooltipEl.querySelector('#lm-skip-btn');
    if (skipBtn) {
      const handler = () => this.showSkipConfirmation();
      skipBtn.addEventListener('click', handler);
      this.cleanupListeners.push(() => skipBtn.removeEventListener('click', handler));
    }

    // Position tooltip relative to target
    this.positionTooltip(targetEl, step.tooltipPosition, step.actionType);
    this.tooltipEl.style.display = 'block';

    // Animate in
    this.tooltipEl.style.opacity = '0';
    this.tooltipEl.style.transform = 'scale(0.95) translateY(8px)';
    requestAnimationFrame(() => {
      if (this.tooltipEl) {
        this.tooltipEl.style.transition = 'all 0.35s cubic-bezier(0.16,1,0.3,1)';
        this.tooltipEl.style.opacity = '1';
        this.tooltipEl.style.transform = 'scale(1) translateY(0)';
      }
    });
    makeDraggable(this.tooltipEl, this.tooltipEl, {
      onDragged: () => { this.tooltipDragged = true; },
    });
  }

  private buildProgressBar(index: number, total: number): string {
    if (total <= 1) return '';
    const items: string[] = [];
    for (let i = 0; i < total; i++) {
      // Connecting line (before each step except the first)
      if (i > 0) {
        const lineFill = i <= index
          ? 'linear-gradient(90deg,#E07A2F,#F5A623)'
          : 'rgba(255,255,255,0.08)';
        items.push(`<div style="flex:1;height:2px;background:${lineFill};transition:background 0.4s;margin:0 -1px;align-self:center;border-radius:1px"></div>`);
      }
      // Step dot
      const isDone = i < index;
      const isCurrent = i === index;
      const size = isCurrent ? 14 : 10;
      const bg = isDone ? '#E07A2F' : isCurrent ? 'linear-gradient(135deg,#E07A2F,#F5A623)' : 'rgba(255,255,255,0.1)';
      const shadow = isCurrent ? 'box-shadow:0 0 0 4px rgba(224,122,47,0.15),0 0 12px rgba(224,122,47,0.25);' : '';
      items.push(`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};${shadow}flex-shrink:0;transition:all 0.35s cubic-bezier(0.16,1,0.3,1);position:relative;z-index:1"></div>`);
    }
    return `<div style="display:flex;align-items:center;margin-bottom:16px;gap:0;position:relative;z-index:1">${items.join('')}</div>`;
  }

  private positionTooltip(targetEl: Element, position: string, actionType?: string): void {
    if (!this.tooltipEl) return;
    if (this.tooltipDragged) return;
    const rect = targetEl.getBoundingClientRect();
    const tw = 340;
    const th = this.tooltipEl.offsetHeight || 200;
    let left: number, top: number;
    const viewportPad = 16;
    const gap = 16;

    const fitsRight = rect.right + gap + tw <= window.innerWidth - viewportPad;
    const fitsLeft = rect.left - gap - tw >= viewportPad;
    const fitsTop = rect.top - gap - th >= viewportPad;
    const fitsBottom = rect.bottom + gap + th <= window.innerHeight - viewportPad;

    const rightSpace = window.innerWidth - rect.right;
    const leftSpace = rect.left;
    const topSpace = rect.top;
    const bottomSpace = window.innerHeight - rect.bottom;

    let resolved = position;
    if ((actionType === 'input' || actionType === 'select') && (position === 'right' || position === 'left')) {
      // For editable controls, treat static horizontal hints as adaptive.
      resolved = 'auto';
    }
    if (position === 'auto') {
      // Generic UX rule: editable controls should avoid covering typing flow.
      const preferLeftFirst = actionType === 'input' || actionType === 'select';
      if (preferLeftFirst) {
        if (fitsLeft) resolved = 'left';
        else if (fitsRight) resolved = 'right';
        else if (fitsTop) resolved = 'top';
        else resolved = 'bottom';
      } else {
        // Choose side with strongest available space, then apply fit fallback.
        const horizontalBetter = Math.max(leftSpace, rightSpace) >= Math.max(topSpace, bottomSpace);
        if (horizontalBetter) {
          if (rightSpace >= leftSpace && fitsRight) resolved = 'right';
          else if (fitsLeft) resolved = 'left';
          else if (fitsBottom) resolved = 'bottom';
          else resolved = 'top';
        } else {
          if (bottomSpace >= topSpace && fitsBottom) resolved = 'bottom';
          else if (fitsTop) resolved = 'top';
          else if (fitsRight) resolved = 'right';
          else resolved = 'left';
        }
      }
    }

    switch (resolved) {
      case 'right':
        left = rect.right + gap;
        top = rect.top;
        if (left + tw > window.innerWidth - 20) {
          left = rect.left - tw - gap;
        }
        break;
      case 'left':
        left = rect.left - tw - gap;
        top = rect.top;
        if (left < 20) left = rect.right + gap;
        break;
      case 'top':
        left = rect.left;
        top = rect.top - th - gap;
        if (top < 20) top = rect.bottom + gap;
        break;
      case 'bottom':
        left = rect.left;
        top = rect.bottom + gap;
        break;
      default: // auto
        left = rect.right + gap;
        top = rect.top;
        if (left + tw > window.innerWidth - 20) left = rect.left - tw - gap;
        if (left < 20) { left = rect.left; top = rect.bottom + gap; }
        break;
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tw - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - th - 16));

    Object.assign(this.tooltipEl.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${tw}px`,
    });
  }

  // ── Completion ────────────────────────────────────────────────────

  private showCompletion(): void {
    const active = this.deps.stateManager.getActive();
    if (!active) return;

    // Sync completion
    const lastStep = active.definition.steps[active.definition.steps.length - 1];
    if (lastStep) {
      this.deps.stateManager.syncProgress({
        walkthroughId: active.walkthroughId,
        version: active.version,
        stepId: lastStep.id,
        stepOrder: active.totalSteps - 1,
        completed: true,
      });
    }

    this.cleanupStep();
    this.hideSpotlight();

    // Confetti burst
    this.spawnConfetti();

    if (this.completionEl) {
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      const totalSteps = active.definition.steps?.length ?? 0;

      this.completionEl.innerHTML = `
        <div style="width:72px;height:72px;margin:0 auto 24px;position:relative">
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style="position:absolute;top:0;left:0">
            <circle cx="36" cy="36" r="33" stroke="url(#lm-cg)" stroke-width="3" stroke-dasharray="207" stroke-dashoffset="207" style="animation:lm-circle-draw 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards" />
            <path d="M22 36l10 10 18-20" stroke="#FFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="50" stroke-dashoffset="50" style="animation:lm-check-draw 0.4s cubic-bezier(0.16,1,0.3,1) 0.5s forwards" />
            <defs><linearGradient id="lm-cg" x1="0" y1="0" x2="72" y2="72"><stop stop-color="#E07A2F"/><stop offset="1" stop-color="#F5A623"/></linearGradient></defs>
          </svg>
        </div>
        <h3 style="font-size:22px;font-weight:800;margin-bottom:8px;background:linear-gradient(135deg,#E07A2F,#F5A623);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">You're all set!</h3>
        <p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin-bottom:24px">${escapeHtml(active.definition.title)} completed successfully.</p>
        <div style="display:flex;gap:12px;justify-content:center;margin-bottom:28px">
          <div style="background:linear-gradient(135deg,rgba(224,122,47,0.08),rgba(245,166,35,0.04));border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 24px;text-align:center;min-width:90px">
            <div style="font-size:24px;font-weight:800;color:#E07A2F">${totalSteps}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.35);font-weight:600;margin-top:3px;letter-spacing:0.5px">STEPS</div>
          </div>
          <div style="background:linear-gradient(135deg,rgba(224,122,47,0.08),rgba(245,166,35,0.04));border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 24px;text-align:center;min-width:90px">
            <div style="font-size:24px;font-weight:800;color:#E07A2F">${durationStr}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.35);font-weight:600;margin-top:3px;letter-spacing:0.5px">DURATION</div>
          </div>
        </div>
        <button id="lm-done-btn" style="padding:13px 36px;border-radius:14px;border:none;background:linear-gradient(135deg,#E07A2F,#F5A623);color:#FFF;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 6px 20px rgba(224,122,47,.3)">Done</button>
      `;
      this.completionEl.style.display = 'block';

      // Animate in
      this.completionEl.style.opacity = '0';
      this.completionEl.style.transform = 'translate(-50%,-50%) scale(0.85)';
      requestAnimationFrame(() => {
        if (this.completionEl) {
          this.completionEl.style.transition = 'all 0.5s cubic-bezier(0.16,1,0.3,1)';
          this.completionEl.style.opacity = '1';
          this.completionEl.style.transform = 'translate(-50%,-50%) scale(1)';
        }
      });

      const doneBtn = this.completionEl.querySelector('#lm-done-btn');
      if (doneBtn) {
        doneBtn.addEventListener('click', () => this.stop());
      }
      makeDraggable(this.completionEl, this.completionEl, { clearTransform: true });
    }

    this.deps.eventBus.emit(LuminoEvent.WalkthroughCompleted, {
      walkthroughId: active.walkthroughId,
    });
    this.deps.analytics?.track({
      type: 'walkthrough_completed',
      walkthroughId: active.walkthroughId,
      walkthroughVersion: active.version,
      pageUrl: window.location.href,
    });
  }

  // ── Confetti ────────────────────────────────────────────────────────

  private spawnConfetti(): void {
    const root = this.deps.shadowDom.getRoot();
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:100010;pointer-events:none;overflow:hidden';

    const colors = ['#E07A2F', '#F5A623', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444'];
    const count = 60;

    // Inject confetti keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes lm-confetti-burst {
        0% { transform: translate(0,0) rotate(0deg); opacity: 1; }
        100% { transform: translate(var(--tx), var(--ty)) rotate(var(--r)); opacity: 0; }
      }
    `;
    container.appendChild(style);

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      const size = 6 + Math.random() * 6;
      const isCircle = Math.random() > 0.5;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const tx = (Math.random() - 0.5) * window.innerWidth * 0.8;
      const ty = -(200 + Math.random() * 400);
      const r = (Math.random() - 0.5) * 720;

      particle.style.cssText = `
        position:absolute; top:50%; left:50%;
        width:${size}px; height:${size}px;
        background:${color};
        border-radius:${isCircle ? '50%' : '2px'};
        --tx:${tx}px; --ty:${ty}px; --r:${r}deg;
        animation: lm-confetti-burst ${1.2 + Math.random() * 1}s cubic-bezier(0.25,0.46,0.45,0.94) forwards;
        animation-delay: ${Math.random() * 0.15}s;
      `;
      container.appendChild(particle);
    }

    root.appendChild(container);
    setTimeout(() => container.remove(), 2500);
  }

  // ── Reposition on scroll/resize ───────────────────────────────────

  private startRepositioning(targetEl: Element): void {
    const reposition = () => {
      if (!this.playing || !this.currentTargetEl) return;
      this.positionSpotlight(targetEl);
      if (this.tooltipEl && this.tooltipEl.style.display !== 'none') {
        const active = this.deps.stateManager.getActive();
        if (active?.step) {
          this.positionTooltip(targetEl, active.step.tooltipPosition, active.step.actionType);
        }
      }
      this.repositionRaf = requestAnimationFrame(reposition);
    };
    this.repositionRaf = requestAnimationFrame(reposition);
    this.cleanupListeners.push(() => {
      if (this.repositionRaf) cancelAnimationFrame(this.repositionRaf);
    });
  }

  // ── DOM Construction ──────────────────────────────────────────────

  private createOverlayElements(): void {
    const root = this.deps.shadowDom.getRoot();

    // Inject styles
    this.deps.shadowDom.appendStyles(PLAYER_CSS);

    // Spotlight
    this.spotlightEl = document.createElement('div');
    this.spotlightEl.className = 'lm-spotlight';
    root.appendChild(this.spotlightEl);

    // Tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'lm-tooltip';
    root.appendChild(this.tooltipEl);

    // Completion dialog
    this.completionEl = document.createElement('div');
    this.completionEl.className = 'lm-completion';
    root.appendChild(this.completionEl);

    // Powered badge
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'lm-badge';
    this.badgeEl.innerHTML = 'Guided by <b style="color:#E07A2F;font-weight:800">✦ Lumino</b>';
    root.appendChild(this.badgeEl);

    // Escape key handler
    this.boundEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.playing) {
        this.showSkipConfirmation();
      }
    };
    document.addEventListener('keydown', this.boundEscHandler);
  }

  private removeOverlayElements(): void {
    this.spotlightEl?.remove();
    this.tooltipEl?.remove();
    this.completionEl?.remove();
    this.badgeEl?.remove();
    this.spotlightEl = null;
    this.tooltipEl = null;
    this.completionEl = null;
    this.badgeEl = null;
    if (this.boundEscHandler) {
      document.removeEventListener('keydown', this.boundEscHandler);
    }
    this.boundEscHandler = null;
    this.tooltipDragged = false;
  }

  private showOverlay(): void {
    if (this.spotlightEl) this.spotlightEl.style.display = 'block';
  }

  private hideSpotlight(): void {
    if (this.spotlightEl) this.spotlightEl.style.display = 'none';
  }

  private cleanupStep(): void {
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];
    this.currentTargetEl = null;

    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.innerHTML = '';
      this.tooltipEl.style.left = '';
      this.tooltipEl.style.top = '';
    }
    if (this.completionEl) {
      this.completionEl.style.display = 'none';
      this.completionEl.style.left = '';
      this.completionEl.style.top = '';
      this.completionEl.style.transform = '';
    }
    this.tooltipDragged = false;
  }

}

// ── Injected CSS ────────────────────────────────────────────────────────

const PLAYER_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .lm-spotlight {
    position: fixed; z-index: 99998; border-radius: 12px; pointer-events: none; display: none;
    box-shadow: 0 0 0 4000px rgba(0,0,0,0.45);
    will-change: top, left, width, height;
    transition: top 0.5s cubic-bezier(0.34,1.56,0.64,1), left 0.5s cubic-bezier(0.34,1.56,0.64,1),
                width 0.45s cubic-bezier(0.22,1,0.36,1), height 0.45s cubic-bezier(0.22,1,0.36,1);
  }
  .lm-spotlight::before {
    content: ''; position: absolute; inset: -3px; border-radius: 14px;
    border: 2px solid rgba(224,122,47,0.7);
  }
  .lm-spotlight::after {
    content: ''; position: absolute; inset: -6px; border-radius: 16px;
    border: 1.5px solid transparent;
    animation: lm-pulse 2.5s ease-in-out infinite;
  }
  @keyframes lm-pulse {
    0%   { box-shadow: 0 0 8px rgba(224,122,47,0.2), 0 0 0 0 rgba(224,122,47,0.15); }
    50%  { box-shadow: 0 0 20px rgba(224,122,47,0.35), 0 0 0 5px rgba(224,122,47,0); }
    100% { box-shadow: 0 0 8px rgba(224,122,47,0.2), 0 0 0 0 rgba(224,122,47,0.15); }
  }

  .lm-tooltip {
    position: fixed; z-index: 100002; display: none;
    background: rgba(15,15,30,0.92); color: #FFF; border-radius: 16px; padding: 22px;
    backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
    box-shadow: 0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06), 0 0 40px rgba(224,122,47,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: auto; overflow: hidden;
  }
  .lm-tooltip::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 90px;
    background: linear-gradient(180deg, rgba(224,122,47,0.06), transparent);
    pointer-events: none; border-radius: 16px 16px 0 0;
  }
  .lm-tooltip::after {
    content: ''; position: absolute; top: -8px; right: -8px;
    width: 60px; height: 60px; border-radius: 50%;
    background: radial-gradient(circle, rgba(224,122,47,0.08) 0%, transparent 70%);
    pointer-events: none;
  }

  #lm-skip-btn {
    font-size: 11px; color: rgba(255,255,255,0.4); background: none; border: none;
    cursor: pointer; font-family: inherit; padding: 4px 10px; border-radius: 6px;
    transition: all 0.2s;
  }
  #lm-skip-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }

  .lm-completion {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 100002; display: none;
    background: rgba(15,15,30,0.94); color: #FFF; border-radius: 24px; padding: 44px;
    backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
    text-align: center; width: 380px; pointer-events: auto;
    box-shadow: 0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06), 0 0 60px rgba(224,122,47,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  #lm-done-btn {
    transition: all 0.2s;
  }
  #lm-done-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(224,122,47,0.4);
  }

  @keyframes lm-check-draw {
    to { stroke-dashoffset: 0; }
  }
  @keyframes lm-circle-draw {
    to { stroke-dashoffset: 0; }
  }

  .lm-badge {
    position: fixed; bottom: 16px; right: 16px; z-index: 100003;
    background: rgba(15,15,30,0.88); backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    color: rgba(255,255,255,0.5); font-size: 11px; font-weight: 600;
    padding: 7px 14px; border-radius: 100px; pointer-events: none;
    display: flex; align-items: center; gap: 5px;
    border: 1px solid rgba(255,255,255,0.06);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    opacity: 0; transform: translateY(8px);
    animation: lm-badge-in 0.4s ease 0.3s forwards;
  }
  .lm-badge b { animation: lm-sparkle 3s ease-in-out infinite; }
  @keyframes lm-badge-in { to { opacity: 1; transform: translateY(0); } }
  @keyframes lm-sparkle {
    0%,100% { color: #E07A2F; }
    50% { color: #F5A623; }
  }
`;
