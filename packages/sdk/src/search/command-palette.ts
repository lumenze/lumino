import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import { EventBus } from '../core/event-bus';
import { API_ROUTES } from '@lumino/shared';

interface SearchDeps {
  shadowDom: ShadowDomManager;
  apiClient: ApiClient;
  eventBus: EventBus;
}

interface NlSearchResult {
  walkthroughId: string;
  title: string;
  description: string;
  confidence: number;
  reason: string;
}

interface NlSearchResponse {
  items: NlSearchResult[];
  query: string;
  total: number;
}

/**
 * CommandPalette
 *
 * NL search for walkthroughs. Phase 2 feature (deferred from MVP).
 * Interface is defined now so the SDK entry point compiles.
 */
export class CommandPalette {
  private containerEl: HTMLElement | null = null;
  private launcherEl: HTMLButtonElement | null = null;
  private panelEl: HTMLElement | null = null;
  private visible = false;
  private onSelectWalkthrough: ((walkthroughId: string) => void) | null = null;
  private launcherDragged = false;
  private panelDragged = false;

  constructor(private readonly deps: SearchDeps) {}

  setOnSelectWalkthrough(handler: (walkthroughId: string) => void): void {
    this.onSelectWalkthrough = handler;
  }

  start(): void {
    this.containerEl = this.deps.shadowDom.getContainer('nl-search');
    this.deps.shadowDom.appendStyles(PALETTE_CSS);

    this.launcherEl = document.createElement('button');
    this.launcherEl.className = 'lm-chat-launcher';
    this.launcherEl.textContent = 'Ask Lumino';
    this.launcherEl.addEventListener('click', () => {
      if (this.visible) {
        this.close();
      } else {
        void this.open();
      }
    });

    this.containerEl.appendChild(this.launcherEl);
    this.repositionForAuthorMode();
    this.makeDraggable(this.launcherEl, this.launcherEl, {
      setDragged: () => { this.launcherDragged = true; },
    });
  }

  async open(): Promise<void> {
    if (!this.containerEl) return;

    if (!this.panelEl) {
      this.panelEl = document.createElement('div');
      this.panelEl.className = 'lm-chat-panel';
      this.panelEl.innerHTML = `
        <div class="lm-chat-header">
          <strong>Ask Lumino</strong>
          <button class="lm-chat-close" aria-label="Close">×</button>
        </div>
        <p class="lm-chat-subtitle">Describe what you want to do and I will find the right guide.</p>
        <form class="lm-chat-form">
          <input class="lm-chat-input" name="query" placeholder="e.g. set purchase limits" />
          <button class="lm-chat-submit" type="submit">Search</button>
        </form>
        <div class="lm-chat-results"></div>
      `;
      this.containerEl.appendChild(this.panelEl);
      this.repositionForAuthorMode();

      const closeBtn = this.panelEl.querySelector('.lm-chat-close');
      closeBtn?.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      closeBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        this.close();
      });

      const header = this.panelEl.querySelector('.lm-chat-header') as HTMLElement | null;
      this.makeDraggable(this.panelEl, header ?? this.panelEl, {
        setDragged: () => { this.panelDragged = true; },
      });

      const form = this.panelEl.querySelector('.lm-chat-form') as HTMLFormElement | null;
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const query = String(formData.get('query') ?? '').trim();
        if (!query) return;
        void this.search(query);
      });
    }

    this.panelEl.classList.add('lm-chat-visible');
    this.visible = true;
  }

  close(): void {
    this.panelEl?.classList.remove('lm-chat-visible');
    this.visible = false;
  }

  async search(query: string): Promise<NlSearchResult[]> {
    const result = await this.deps.apiClient.post<NlSearchResponse>(`${API_ROUTES.NL_SEARCH}/nl`, {
      query,
      limit: 5,
    });
    this.renderResults(result.items);
    return result.items;
  }

  private renderResults(items: NlSearchResult[]): void {
    if (!this.panelEl) return;
    const resultsEl = this.panelEl.querySelector('.lm-chat-results') as HTMLElement | null;
    if (!resultsEl) return;

    if (items.length === 0) {
      resultsEl.innerHTML = '<div class="lm-chat-empty">No guides matched. Try a different phrase.</div>';
      return;
    }

    resultsEl.innerHTML = items
      .map((item) => `
        <button class="lm-chat-result" data-walkthrough-id="${item.walkthroughId}">
          <div class="lm-chat-result-title">${this.escape(item.title)}</div>
          <div class="lm-chat-result-desc">${this.escape(item.description)}</div>
          <div class="lm-chat-result-meta">Confidence ${(item.confidence * 100).toFixed(0)}% · ${this.escape(item.reason)}</div>
        </button>
      `)
      .join('');

    resultsEl.querySelectorAll<HTMLButtonElement>('.lm-chat-result').forEach((button) => {
      button.addEventListener('click', () => {
        const walkthroughId = button.dataset.walkthroughId;
        if (!walkthroughId) return;
        if (this.onSelectWalkthrough) {
          this.onSelectWalkthrough(walkthroughId);
        }
        this.close();
      });
    });
  }

  private escape(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private repositionForAuthorMode(): void {
    const root = this.deps.shadowDom.getRoot();
    const hasAuthorFab = Boolean(root.querySelector('.lm-author-fab'));
    const launcherBottom = hasAuthorFab ? 86 : 20;
    const panelBottom = hasAuthorFab ? 138 : 72;

    if (this.launcherEl && !this.launcherDragged) {
      this.launcherEl.style.left = '';
      this.launcherEl.style.top = '';
      this.launcherEl.style.right = '20px';
      this.launcherEl.style.bottom = `${launcherBottom}px`;
    }

    if (this.panelEl && !this.panelDragged) {
      this.panelEl.style.left = '';
      this.panelEl.style.top = '';
      this.panelEl.style.right = '20px';
      this.panelEl.style.bottom = `${panelBottom}px`;
    }
  }

  private makeDraggable(
    target: HTMLElement,
    handle: HTMLElement,
    opts: { setDragged: () => void },
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
      opts.setDragged();
    };

    const onPointerUp = () => {
      dragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const targetEl = event.target as HTMLElement | null;
      if (targetEl?.closest('button, input, textarea, select, a, [data-no-drag="true"]')) return;
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
      handle.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
}

const PALETTE_CSS = `
  .lm-chat-launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 100000;
    border: none; border-radius: 999px; padding: 12px 16px; cursor: pointer;
    background: #111827; color: #fff; font-weight: 600; font-size: 13px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.2);
  }
  .lm-chat-panel {
    position: fixed; right: 20px; bottom: 72px; width: 360px; max-height: 70vh;
    overflow: auto; background: #fff; border-radius: 14px; padding: 14px;
    border: 1px solid #e5e7eb; box-shadow: 0 18px 40px rgba(0,0,0,0.18);
    z-index: 100000; opacity: 0; transform: translateY(8px) scale(0.98);
    pointer-events: none; transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .lm-chat-visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
  .lm-chat-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .lm-chat-header { cursor: move; user-select: none; }
  .lm-chat-close { border: none; background: transparent; font-size: 18px; cursor: pointer; color: #6b7280; }
  .lm-chat-subtitle { color: #6b7280; font-size: 12px; line-height: 1.4; margin-bottom: 10px; }
  .lm-chat-form { display: flex; gap: 8px; margin-bottom: 12px; }
  .lm-chat-input {
    flex: 1; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px;
    font-size: 13px; outline: none;
  }
  .lm-chat-input:focus { border-color: #2563eb; }
  .lm-chat-submit {
    border: none; background: #2563eb; color: #fff; border-radius: 10px;
    padding: 10px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .lm-chat-results { display: grid; gap: 8px; }
  .lm-chat-result {
    border: 1px solid #e5e7eb; background: #fff; border-radius: 10px; padding: 10px;
    text-align: left; cursor: pointer;
  }
  .lm-chat-result:hover { border-color: #bfdbfe; background: #f8fbff; }
  .lm-chat-result-title { font-weight: 600; font-size: 13px; color: #111827; margin-bottom: 4px; }
  .lm-chat-result-desc { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
  .lm-chat-result-meta { font-size: 11px; color: #9ca3af; }
  .lm-chat-empty {
    border: 1px dashed #d1d5db; border-radius: 10px; padding: 10px;
    font-size: 12px; color: #6b7280;
  }
`;
