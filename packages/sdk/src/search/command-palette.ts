import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import { EventBus } from '../core/event-bus';
import { API_ROUTES } from '@lumino/shared';
import { makeDraggable } from '../utils/draggable';
import { escapeHtml } from '../utils/escape-html';

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
    this.launcherEl.innerHTML = '✦ Ask Lumino';
    this.launcherEl.addEventListener('click', () => {
      if (this.visible) {
        this.close();
      } else {
        void this.open();
      }
    });

    this.containerEl.appendChild(this.launcherEl);
    this.repositionForAuthorMode();
    makeDraggable(this.launcherEl, this.launcherEl, {
      onDragged: () => { this.launcherDragged = true; },
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
      makeDraggable(this.panelEl, header ?? this.panelEl, {
        onDragged: () => { this.panelDragged = true; },
        filterInteractive: true,
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
          <div class="lm-chat-result-title">${escapeHtml(item.title)}</div>
          <div class="lm-chat-result-desc">${escapeHtml(item.description)}</div>
          <div class="lm-chat-result-meta">Confidence ${(item.confidence * 100).toFixed(0)}% · ${escapeHtml(item.reason)}</div>
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

}

const PALETTE_CSS = `
  .lm-chat-launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 100000;
    border: none; border-radius: 999px; padding: 12px 18px; cursor: pointer;
    background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #fff; font-weight: 700; font-size: 13px;
    box-shadow: 0 8px 28px rgba(224,122,47,0.3);
    transition: all 0.2s;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .lm-chat-launcher:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(224,122,47,0.4);
  }
  .lm-chat-panel {
    position: fixed; right: 20px; bottom: 72px; width: 360px; max-height: 70vh;
    overflow: auto; background: #fff; border-radius: 18px; padding: 16px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: 0 24px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.03);
    z-index: 100000; opacity: 0; transform: translateY(8px) scale(0.98);
    pointer-events: none; transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .lm-chat-panel::before {
    content: ''; position: absolute; top: 0; left: 16px; right: 16px; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(224,122,47,0.3), transparent);
    border-radius: 0 0 2px 2px;
  }
  .lm-chat-visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
  .lm-chat-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px; cursor: move; user-select: none;
  }
  .lm-chat-header strong { font-size: 14px; font-weight: 700; color: #111827; }
  .lm-chat-close {
    border: none; background: transparent; font-size: 18px; cursor: pointer;
    color: #9ca3af; width: 28px; height: 28px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center; transition: all 0.15s;
  }
  .lm-chat-close:hover { background: #f3f4f6; color: #6b7280; }
  .lm-chat-subtitle { color: #9ca3af; font-size: 12px; line-height: 1.4; margin-bottom: 12px; }
  .lm-chat-form { display: flex; gap: 8px; margin-bottom: 12px; }
  .lm-chat-input {
    flex: 1; border: 1.5px solid #e5e7eb; border-radius: 12px; padding: 10px 14px;
    font-size: 13px; outline: none; transition: border-color 0.2s;
    font-family: inherit;
  }
  .lm-chat-input:focus { border-color: #E07A2F; box-shadow: 0 0 0 3px rgba(224,122,47,0.08); }
  .lm-chat-submit {
    border: none; background: linear-gradient(135deg, #E07A2F, #F5A623);
    color: #fff; border-radius: 12px;
    padding: 10px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
    font-family: inherit; transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(224,122,47,0.2);
  }
  .lm-chat-submit:hover { box-shadow: 0 4px 12px rgba(224,122,47,0.3); }
  .lm-chat-results { display: grid; gap: 8px; }
  .lm-chat-result {
    border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 12px;
    text-align: left; cursor: pointer; transition: all 0.15s; position: relative;
  }
  .lm-chat-result:hover {
    border-color: rgba(224,122,47,0.2); background: #FFFBF7;
    box-shadow: 0 2px 8px rgba(224,122,47,0.06);
  }
  .lm-chat-result:hover::before {
    content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
    background: linear-gradient(180deg, #E07A2F, #F5A623); border-radius: 0 3px 3px 0;
  }
  .lm-chat-result-title { font-weight: 600; font-size: 13px; color: #111827; margin-bottom: 4px; }
  .lm-chat-result-desc { font-size: 12px; color: #6b7280; margin-bottom: 6px; line-height: 1.5; }
  .lm-chat-result-meta { font-size: 11px; color: #9ca3af; }
  .lm-chat-empty {
    border: 1.5px dashed #e5e7eb; border-radius: 12px; padding: 20px;
    font-size: 12px; color: #9ca3af; text-align: center;
  }
`;
