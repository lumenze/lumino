import type { WalkthroughStep, CrossAppTransition, ActionType } from '@lumino/shared';
import { TRANSITION_URL_PARAM } from '@lumino/shared';
import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import type { StateManager } from '../core/state-manager';
import { EventBus, LuminoEvent } from '../core/event-bus';
import { DomObserver } from '../observers/dom-observer';

interface PlayerDeps {
  shadowDom: ShadowDomManager;
  apiClient: ApiClient;
  stateManager: StateManager;
  eventBus: EventBus;
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
  private playing = false;

  // DOM elements (inside shadow DOM)
  private overlayEl: HTMLElement | null = null;
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
    const startIndex = progress && !progress.completed ? progress.currentStepOrder : 0;

    console.log('[Lumino Player] Starting walkthrough', walkthroughId, 'at step', startIndex);

    this.deps.stateManager.setActive(walkthroughId, startIndex);
    this.playing = true;
    this.startTime = Date.now();

    this.createOverlayElements();
    this.domObserver.start();

    this.deps.eventBus.emit(LuminoEvent.WalkthroughStarted, { walkthroughId });
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
      console.log('[Lumino Player] No active step — showing completion');
      this.showCompletion();
      return;
    }

    this.cleanupStep();

    const step = active.step;
    console.log('[Lumino Player] Showing step', active.stepIndex, step.title, 'selector:', step.selector.primary);

    // If the step expects a different URL, navigate there first
    if (step.expectedUrl && !window.location.pathname.startsWith(step.expectedUrl)) {
      console.log('[Lumino Player] Navigating to', step.expectedUrl, 'for step', step.title);
      this.deps.stateManager.syncProgress({
        walkthroughId: active.walkthroughId,
        version: active.version,
        stepId: step.id,
        stepOrder: active.stepIndex,
        completed: false,
      });
      window.location.href = step.expectedUrl;
      // After navigation, the SDK will re-init and resume from progress
      return;
    }

    // Find the target element
    const el = this.domObserver.findElement(step.selector);
    if (!el) {
      console.log('[Lumino Player] Element not found for', step.selector.primary, '— waiting...');
      // Element not found — wait for it
      const cancel = this.domObserver.waitForElement(
        step.id,
        step.selector,
        (foundEl) => {
          console.log('[Lumino Player] Element found after wait:', foundEl);
          this.renderStep(step, foundEl, active.stepIndex, active.totalSteps);
        },
        15000,
      );
      this.cleanupListeners.push(cancel);
      return;
    }

    console.log('[Lumino Player] Element found:', el);
    this.renderStep(step, el, active.stepIndex, active.totalSteps);
  }

  private renderStep(step: WalkthroughStep, targetEl: Element, stepIndex: number, totalSteps: number): void {
    this.currentTargetEl = targetEl;

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

    if (actionType === 'click' || actionType === 'navigate') {
      const handler = () => {
        targetEl.removeEventListener('click', handler);
        // Small delay to let navigation happen if needed
        const delay = step.triggersNavigation ? 500 : 100;
        setTimeout(() => this.advanceToNextStep(), delay);
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
      const selectEl = targetEl as HTMLSelectElement;
      const handler = () => {
        setTimeout(() => this.advanceToNextStep(), 300);
        selectEl.removeEventListener('change', handler);
      };
      selectEl.addEventListener('change', handler);
      this.cleanupListeners.push(() => selectEl.removeEventListener('change', handler));

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
      console.warn('[Lumino Player] Missing transitionConfig for cross_app_transition step');
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
      console.error('[Lumino Player] Failed to initiate cross-app transition', error);
    }
  }

  private advanceToNextStep(): void {
    if (!this.playing) return;

    this.deps.eventBus.emit(LuminoEvent.StepAdvanced, this.deps.stateManager.getActive());

    const hasNext = this.deps.stateManager.advanceStep();
    if (hasNext) {
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
      click: '👆 Click to continue',
      input: '⌨ Type a value to continue',
      select: '📋 Select an option',
      navigate: '👆 Click to navigate',
      hover: '👆 Hover to continue',
      scroll: 'Auto-advancing...',
    };

    // Render content
    this.tooltipEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="background:#E07A2F;color:#FFF;font-size:11px;font-weight:800;padding:3px 10px;border-radius:6px">
          STEP ${index + 1}
        </span>
        <span style="font-size:11px;color:rgba(255,255,255,.4)">of ${total}</span>
      </div>
      <h4 style="font-size:15px;font-weight:700;margin-bottom:6px">${this.escapeHtml(step.title)}</h4>
      <p style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:14px">${this.escapeHtml(step.description)}</p>
      ${this.buildProgressBar(index, total)}
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:rgba(255,255,255,.35);font-style:italic">
          ${actionHints[step.actionType] ?? 'Continue'}
        </span>
        <button id="lm-skip-btn" style="font-size:11px;color:rgba(255,255,255,.4);background:none;border:none;cursor:pointer;font-family:inherit;padding:4px 8px">
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
    this.makeDraggable(this.tooltipEl, this.tooltipEl, () => {
      this.tooltipDragged = true;
    });
  }

  private buildProgressBar(index: number, total: number): string {
    if (total <= 1) return '';
    const items: string[] = [];
    for (let i = 0; i < total; i++) {
      // Connecting line (before each step except the first)
      if (i > 0) {
        const lineFill = i <= index ? '#E07A2F' : 'rgba(255,255,255,0.1)';
        items.push(`<div style="flex:1;height:2px;background:${lineFill};transition:background 0.4s;margin:0 -2px;align-self:center"></div>`);
      }
      // Step circle
      const isDone = i < index;
      const isCurrent = i === index;
      const bg = isDone ? '#E07A2F' : isCurrent ? 'linear-gradient(135deg,#E07A2F,#F5A623)' : 'rgba(255,255,255,0.08)';
      const color = isDone || isCurrent ? '#FFF' : 'rgba(255,255,255,0.25)';
      const scale = isCurrent ? 'transform:scale(1.15);' : '';
      const shadow = isCurrent ? 'box-shadow:0 0 0 4px rgba(224,122,47,0.2),0 2px 8px rgba(224,122,47,0.3);' : '';
      items.push(`<div style="width:22px;height:22px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${color};${scale}${shadow}flex-shrink:0;transition:all 0.3s;position:relative;z-index:1">${i + 1}</div>`);
    }
    return `<div style="display:flex;align-items:center;margin-bottom:14px;gap:0">${items.join('')}</div>`;
  }

  private positionTooltip(targetEl: Element, position: string, actionType?: string): void {
    if (!this.tooltipEl) return;
    if (this.tooltipDragged) return;
    const rect = targetEl.getBoundingClientRect();
    const tw = 300;
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
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#E07A2F,#F5A623);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 20px;box-shadow:0 8px 30px rgba(224,122,47,.3)">✓</div>
        <h3 style="font-size:20px;font-weight:800;margin-bottom:8px">All Set!</h3>
        <p style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:20px">${this.escapeHtml(active.definition.title)} completed successfully.</p>
        <div style="display:flex;gap:12px;justify-content:center;margin-bottom:24px">
          <div style="background:rgba(255,255,255,0.06);border-radius:12px;padding:12px 20px;text-align:center;min-width:80px">
            <div style="font-size:22px;font-weight:800;color:#E07A2F">${totalSteps}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;margin-top:2px">Steps</div>
          </div>
          <div style="background:rgba(255,255,255,0.06);border-radius:12px;padding:12px 20px;text-align:center;min-width:80px">
            <div style="font-size:22px;font-weight:800;color:#E07A2F">${durationStr}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;margin-top:2px">Duration</div>
          </div>
        </div>
        <button id="lm-done-btn" style="padding:12px 32px;border-radius:12px;border:none;background:linear-gradient(135deg,#E07A2F,#F5A623);color:#FFF;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(224,122,47,.3)">Done</button>
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
      this.makeDraggable(this.completionEl, this.completionEl, () => {
        // no-op callback
      });
    }

    this.deps.eventBus.emit(LuminoEvent.WalkthroughCompleted, {
      walkthroughId: active.walkthroughId,
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
    this.deps.shadowDom.injectStyles(PLAYER_CSS);

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
    this.boundEscHandler = null;
    this.tooltipDragged = false;
  }
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

  private makeDraggable(
    target: HTMLElement,
    handle: HTMLElement,
    onDragged: () => void,
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
      if (target === this.completionEl) {
        target.style.transform = 'none';
      }
      onDragged();
    };

    const onPointerUp = () => {
      dragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    handle.onpointerdown = (event: PointerEvent) => {
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
      if (target === this.completionEl) {
        target.style.transform = 'none';
      }
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// ── Injected CSS ────────────────────────────────────────────────────────

const PLAYER_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .lm-spotlight {
    position: fixed; z-index: 99998; border-radius: 8px; pointer-events: none; display: none;
    box-shadow: 0 0 0 4000px rgba(0,0,0,0.5);
    will-change: top, left, width, height;
    transition: top 0.5s cubic-bezier(0.34,1.56,0.64,1), left 0.5s cubic-bezier(0.34,1.56,0.64,1),
                width 0.45s cubic-bezier(0.22,1,0.36,1), height 0.45s cubic-bezier(0.22,1,0.36,1);
  }
  .lm-spotlight::after {
    content: ''; position: absolute; inset: -4px; border-radius: 12px;
    border: 2px solid #E07A2F;
    animation: lm-pulse 2s ease infinite;
  }
  @keyframes lm-pulse {
    0%   { box-shadow: 0 0 12px rgba(224,122,47,0.3), 0 0 0 0 rgba(224,122,47,0.2); }
    50%  { box-shadow: 0 0 24px rgba(224,122,47,0.5), 0 0 0 6px rgba(224,122,47,0); }
    100% { box-shadow: 0 0 12px rgba(224,122,47,0.3), 0 0 0 0 rgba(224,122,47,0.2); }
  }

  .lm-tooltip {
    position: fixed; z-index: 100002; display: none;
    background: #1E1E36; color: #FFF; border-radius: 14px; padding: 20px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(224,122,47,0.08);
    border: 1px solid rgba(255,255,255,0.08);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    pointer-events: auto; overflow: hidden;
  }
  .lm-tooltip::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 80px;
    background: linear-gradient(180deg, rgba(224,122,47,0.08), transparent);
    pointer-events: none; border-radius: 14px 14px 0 0;
  }

  .lm-completion {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    z-index: 100002; display: none;
    background: #1E1E36; color: #FFF; border-radius: 20px; padding: 40px;
    text-align: center; width: 360px; pointer-events: auto;
    box-shadow: 0 30px 80px rgba(0,0,0,0.35), 0 0 60px rgba(224,122,47,0.1);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .lm-badge {
    position: fixed; bottom: 16px; right: 16px; z-index: 100003;
    background: rgba(30,30,54,0.85); backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 600;
    padding: 6px 12px; border-radius: 8px; pointer-events: none;
    display: flex; align-items: center; gap: 5px;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    opacity: 0; transform: translateY(8px);
    animation: lm-badge-in 0.4s ease 0.3s forwards;
  }
  @keyframes lm-badge-in { to { opacity: 1; transform: translateY(0); } }
`;
