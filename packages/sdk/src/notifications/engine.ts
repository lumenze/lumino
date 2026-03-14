import type { WalkthroughDefinition } from '@lumino/shared';
import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import { EventBus, LuminoEvent } from '../core/event-bus';
import { makeDraggable } from '../utils/draggable';
import { escapeHtml } from '../utils/escape-html';

interface NotificationDeps {
  shadowDom: ShadowDomManager;
  apiClient: ApiClient;
  eventBus: EventBus;
}

interface PendingNotification {
  walkthroughId: string;
  definition: WalkthroughDefinition;
}

/**
 * NotificationEngine
 *
 * Shows smart notifications for available walkthroughs.
 * Renders inside shadow DOM so styles don't leak.
 * Respects rate limits and dismissed state.
 */
export class NotificationEngine {
  private deps: NotificationDeps;
  private containerEl: HTMLElement | null = null;
  private queue: PendingNotification[] = [];
  private dismissedIds = new Set<string>();
  private shownIds = new Set<string>();
  private showing = false;
  private paused = false;

  /** Callback when user clicks "Show Me How" */
  public onStartWalkthrough: ((walkthroughId: string) => void) | null = null;

  constructor(deps: NotificationDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    this.containerEl = this.deps.shadowDom.getContainer('notifications');
    // Clear any stale notifications from previous init (shadow DOM reuse)
    this.containerEl.innerHTML = '';
    this.deps.shadowDom.appendStyles(NOTIFICATION_CSS);

    // Load dismissed from sessionStorage
    try {
      const dismissed = sessionStorage.getItem('lumino_dismissed');
      if (dismissed) {
        for (const id of JSON.parse(dismissed)) {
          this.dismissedIds.add(id);
        }
      }
    } catch { /* ignore */ }
  }

  stop(): void {
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
    this.queue = [];
    this.showing = false;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    if (!this.showing) {
      this.showNext();
    }
  }

  /**
   * Queue a notification for a walkthrough.
   * Won't show if already dismissed this session.
   */
  enqueue(walkthroughId: string, definition: WalkthroughDefinition): void {
    if (this.dismissedIds.has(walkthroughId)) return;
    // Deduplicate — don't enqueue if already queued, showing, or previously shown
    if (this.shownIds.has(walkthroughId)) return;
    if (this.queue.some((n) => n.walkthroughId === walkthroughId)) return;
    this.queue.push({ walkthroughId, definition });
    if (!this.showing && !this.paused) {
      this.showNext();
    }
  }

  private showNext(): void {
    if (this.paused) {
      return;
    }

    const next = this.queue.shift();
    if (!next || !this.containerEl) {
      this.showing = false;
      return;
    }

    this.showing = true;
    const { walkthroughId, definition } = next;
    this.shownIds.add(walkthroughId);

    const el = document.createElement('div');
    el.className = 'lm-notif';

    const stepCount = definition.steps?.length ?? 0;
    const estMinutes = Math.max(1, Math.round(stepCount * 0.5));
    const metaText = stepCount > 0 ? `${stepCount} step${stepCount !== 1 ? 's' : ''} · ~${estMinutes} min` : '';

    el.innerHTML = `
      <div class="lm-notif-header">
        <div class="lm-notif-badge">✦ Lumino Guide</div>
        <h4 class="lm-notif-title">${escapeHtml(definition.title)}</h4>
      </div>
      <p class="lm-notif-desc">${escapeHtml(definition.description)}</p>
      ${metaText ? `<div class="lm-notif-meta">${metaText}</div>` : ''}
      <div class="lm-notif-actions">
        <button class="lm-notif-cta">Show Me How →</button>
        <button class="lm-notif-dismiss">Later</button>
      </div>
    `;

    // Wire buttons
    const cta = el.querySelector('.lm-notif-cta') as HTMLElement;
    const dismiss = el.querySelector('.lm-notif-dismiss') as HTMLElement;

    cta.addEventListener('click', () => {
      this.pause();
      this.hide(el, false);
      this.deps.eventBus.emit(LuminoEvent.NotificationDismissed, { walkthroughId, action: 'start' });
      if (this.onStartWalkthrough) {
        this.onStartWalkthrough(walkthroughId);
      }
    });

    dismiss.addEventListener('click', () => {
      this.dismiss(walkthroughId, el);
    });

    const header = el.querySelector('.lm-notif-header') as HTMLElement | null;
    if (!this.isCoarsePointer() && window.innerWidth >= 900) {
      makeDraggable(el, header ?? el);
    }

    this.containerEl.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.classList.add('lm-notif-visible');
    });

    this.deps.eventBus.emit(LuminoEvent.NotificationShown, { walkthroughId });
  }

  private dismiss(walkthroughId: string, el: HTMLElement): void {
    this.dismissedIds.add(walkthroughId);
    try {
      sessionStorage.setItem('lumino_dismissed', JSON.stringify([...this.dismissedIds]));
    } catch { /* ignore */ }

    this.hide(el);
    this.deps.eventBus.emit(LuminoEvent.NotificationDismissed, { walkthroughId, action: 'dismiss' });
  }

  private hide(el: HTMLElement, showNextAfterHide = true): void {
    let handled = false;
    const finish = () => {
      if (handled) return;
      handled = true;
      el.remove();
      this.showing = false;
      if (showNextAfterHide && !this.paused) {
        setTimeout(() => this.showNext(), 500);
      }
    };

    el.classList.remove('lm-notif-visible');
    el.addEventListener('transitionend', finish, { once: true });
    // Fallback if transitionend never fires (prefers-reduced-motion, etc.)
    setTimeout(finish, 600);
  }

  private isCoarsePointer(): boolean {
    return (
      window.matchMedia?.('(pointer: coarse)').matches === true
      || 'ontouchstart' in window
    );
  }

}

const NOTIFICATION_CSS = `
  .lm-notif {
    position: fixed; bottom: 140px; right: 20px; width: 340px;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border-radius: 18px; padding: 22px; padding-left: 26px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.03), 0 0 40px rgba(224,122,47,0.05);
    z-index: 2147483638; pointer-events: auto;
    transform: translateY(20px) scale(0.96); opacity: 0; filter: blur(4px);
    transition: all 0.5s cubic-bezier(0.16,1,0.3,1);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
  }
  .lm-notif::before {
    content: ''; position: absolute; top: 8px; left: 0; bottom: 8px; width: 5px;
    background: linear-gradient(180deg, #E07A2F, #F5A623);
    border-radius: 0 4px 4px 0;
  }
  .lm-notif::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(224,122,47,0.2), transparent);
  }
  .lm-notif-visible { transform: translateY(0) scale(1); opacity: 1; filter: blur(0); }
  @media (hover: hover) and (pointer: fine) {
    .lm-notif-visible:hover { transform: translateY(-2px) scale(1); box-shadow: 0 28px 70px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.03); }
  }

  .lm-notif-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(224,122,47,0.1); color: #E07A2F;
    font-size: 10px; font-weight: 700;
    padding: 4px 12px; border-radius: 100px; letter-spacing: 0.5px;
  }
  .lm-notif-title {
    font-size: 15px; font-weight: 700; margin: 10px 0 6px; color: #1F2937;
    letter-spacing: -0.01em;
  }
  .lm-notif-header { cursor: move; user-select: none; }
  .lm-notif-desc {
    font-size: 12.5px; color: #6B7280; line-height: 1.65; margin-bottom: 8px;
  }
  .lm-notif-meta {
    font-size: 11px; color: #9CA3AF; margin-bottom: 14px;
    display: flex; align-items: center; gap: 4px;
  }
  .lm-notif-actions { display: flex; gap: 8px; }

  .lm-notif-cta {
    flex: 1; padding: 11px 16px; border-radius: 12px; border: none;
    background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #FFF; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: inherit; box-shadow: 0 4px 16px rgba(224,122,47,0.25);
    transition: all 0.2s; position: relative; overflow: hidden;
  }
  .lm-notif-cta::after {
    content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    animation: lm-shimmer 3s ease-in-out infinite;
  }
  @keyframes lm-shimmer { 0% { left: -100%; } 50%,100% { left: 100%; } }
  .lm-notif-cta:hover { transform: translateY(-1px) scale(1.02); box-shadow: 0 8px 24px rgba(224,122,47,0.35); }

  .lm-notif-dismiss {
    padding: 11px 16px; border-radius: 12px;
    border: 1px solid #E5E7EB; background: transparent;
    color: #6B7280; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all 0.2s;
  }
  .lm-notif-dismiss:hover { background: #F3F4F6; border-color: #D1D5DB; }

  /* ── Tablet / small desktop ─────────────────────────────── */
  @media (max-width: 900px) {
    .lm-notif {
      left: 10px; right: 10px; width: auto;
      bottom: max(10px, env(safe-area-inset-bottom, 0px) + 10px);
      border-radius: 16px;
      padding: 16px; padding-left: 20px;
    }
    .lm-notif-header { cursor: default; }
    .lm-notif-title { font-size: 14px; }
    .lm-notif-desc { font-size: 12px; line-height: 1.6; }
    .lm-notif-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .lm-notif-cta,
    .lm-notif-dismiss {
      min-height: 44px;
      padding: 10px 14px;
      font-size: 13px;
      border-radius: 10px;
    }
  }

  /* ── Small phones (≤480px) ────────────────────────────── */
  @media (max-width: 480px) {
    .lm-notif {
      left: 6px; right: 6px;
      bottom: max(6px, env(safe-area-inset-bottom, 0px) + 6px);
      border-radius: 14px;
      padding: 12px; padding-left: 16px;
    }
    .lm-notif-title { font-size: 13px; }
    .lm-notif-desc { font-size: 11px; }
    .lm-notif-actions {
      grid-template-columns: 1fr;
      gap: 6px;
    }
    .lm-notif-cta,
    .lm-notif-dismiss {
      min-height: 44px;
      padding: 10px 12px;
      font-size: 13px;
    }
  }
`;
