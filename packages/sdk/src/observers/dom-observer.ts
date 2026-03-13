import type { ElementSelector } from '@lumino/shared';
import { EventBus, LuminoEvent } from '../core/event-bus';

/**
 * DomObserver
 *
 * Watches the host product's DOM for:
 * - Element matching against walkthrough selectors
 * - Mutations that might break existing selectors
 * - New elements appearing (for wait_for conditions)
 */
export class DomObserver {
  private observer: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private watchedSelectors = new Map<string, { selector: ElementSelector; callback: (el: Element | null) => void }>();

  constructor(private readonly eventBus: EventBus) {}

  start(): void {
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'data-testid', 'aria-label', 'href'],
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.eventBus.emit(LuminoEvent.DomMutated, { type: 'resize' });
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.watchedSelectors.clear();
  }

  // ── Element Finding ───────────────────────────────────────────────

  /**
   * Find an element using multi-signal selector matching.
   * Tries primary CSS selector first, then fallbacks, then text/aria matching.
   */
  findElement(selector: ElementSelector): Element | null {
    // 1. Try primary CSS selector
    let el = this.trySelector(selector.primary);
    if (el) return el;

    // 2. Try fallback selectors
    for (const fallback of selector.fallbacks) {
      el = this.trySelector(fallback);
      if (el) return el;
    }

    // 3. Try text content match
    if (selector.textContent) {
      el = this.findByTextContent(selector.textContent);
      if (el) return el;
    }

    // 4. Try aria-label match
    if (selector.ariaLabel) {
      el = document.querySelector(`[aria-label="${CSS.escape(selector.ariaLabel)}"]`);
      if (el) return el;
    }

    // 5. Try DOM path (structural)
    if (selector.domPath) {
      el = this.trySelector(selector.domPath);
      if (el) return el;
    }

    return null;
  }

  /**
   * Watch for an element to appear in the DOM.
   * Calls back immediately if already present, otherwise waits.
   */
  waitForElement(
    id: string,
    selector: ElementSelector,
    callback: (el: Element) => void,
    timeoutMs = 10000,
    predicate?: (el: Element) => boolean,
  ): () => void {
    // Check if already present
    const existing = this.findElement(selector);
    if (existing && (!predicate || predicate(existing))) {
      callback(existing);
      return () => {};
    }

    // Watch for it
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        this.watchedSelectors.delete(id);
      }
    }, timeoutMs);

    this.watchedSelectors.set(id, {
      selector,
      callback: (el) => {
        if (!el || resolved) return;
        if (predicate && !predicate(el)) return;
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.watchedSelectors.delete(id);
          callback(el);
        }
      },
    });

    return () => {
      resolved = true;
      clearTimeout(timer);
      this.watchedSelectors.delete(id);
    };
  }

  /**
   * Get bounding rect of an element relative to viewport.
   */
  getRect(el: Element): DOMRect {
    return el.getBoundingClientRect();
  }

  /**
   * Check if element is visible in the viewport.
   */
  isVisible(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  // ── Private ───────────────────────────────────────────────────────

  private handleMutations(_mutations: MutationRecord[]): void {
    this.eventBus.emit(LuminoEvent.DomMutated, { type: 'mutation' });

    // Re-check watched selectors
    for (const [, entry] of this.watchedSelectors) {
      const el = this.findElement(entry.selector);
      entry.callback(el);
    }
  }

  private trySelector(selector: string): Element | null {
    try {
      return document.querySelector(selector);
    } catch {
      return null; // Invalid selector
    }
  }

  private findByTextContent(text: string): Element | null {
    const normalizedTarget = text.trim().toLowerCase();

    // Search interactive elements first (buttons, links, inputs)
    const interactives = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
    for (const el of interactives) {
      const elText = (el.textContent ?? '').trim().toLowerCase();
      if (elText === normalizedTarget || elText.includes(normalizedTarget)) {
        return el;
      }
    }

    // Broaden search to headings, labels
    const labels = document.querySelectorAll('h1, h2, h3, h4, label, [data-testid]');
    for (const el of labels) {
      const elText = (el.textContent ?? '').trim().toLowerCase();
      if (elText === normalizedTarget) {
        return el;
      }
    }

    return null;
  }
}
