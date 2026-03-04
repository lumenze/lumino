import { EventBus, LuminoEvent } from '../core/event-bus';

/**
 * RouteObserver
 *
 * Detects route changes in SPAs by intercepting:
 * - history.pushState / replaceState
 * - popstate events (back/forward)
 * - hashchange events
 */
export class RouteObserver {
  private currentUrl: string = '';
  private originalPushState: typeof history.pushState | null = null;
  private originalReplaceState: typeof history.replaceState | null = null;
  private boundPopstate: (() => void) | null = null;
  private boundHashchange: (() => void) | null = null;

  constructor(private readonly eventBus: EventBus) {}

  start(): void {
    this.currentUrl = window.location.href;

    // Intercept pushState
    this.originalPushState = history.pushState.bind(history);
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      this.originalPushState!(...args);
      this.checkUrlChange();
    };

    // Intercept replaceState
    this.originalReplaceState = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      this.originalReplaceState!(...args);
      this.checkUrlChange();
    };

    // Listen for back/forward
    this.boundPopstate = () => this.checkUrlChange();
    window.addEventListener('popstate', this.boundPopstate);

    // Listen for hash changes
    this.boundHashchange = () => this.checkUrlChange();
    window.addEventListener('hashchange', this.boundHashchange);
  }

  stop(): void {
    // Restore original methods
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }

    if (this.boundPopstate) {
      window.removeEventListener('popstate', this.boundPopstate);
    }
    if (this.boundHashchange) {
      window.removeEventListener('hashchange', this.boundHashchange);
    }
  }

  getCurrentUrl(): string {
    return this.currentUrl;
  }

  getCurrentPath(): string {
    return window.location.pathname;
  }

  matchesPattern(pattern: string): boolean {
    const current = window.location.pathname;

    // Exact match
    if (pattern === current) return true;

    // Wildcard match: /settings/* matches /settings/anything
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      return current.startsWith(prefix);
    }

    // Regex match (pattern starts with ^)
    if (pattern.startsWith('^')) {
      try {
        return new RegExp(pattern).test(current);
      } catch {
        return false;
      }
    }

    return false;
  }

  private checkUrlChange(): void {
    const newUrl = window.location.href;
    if (newUrl !== this.currentUrl) {
      const previousUrl = this.currentUrl;
      this.currentUrl = newUrl;
      this.eventBus.emit(LuminoEvent.RouteChanged, {
        from: previousUrl,
        to: newUrl,
        path: window.location.pathname,
      });
    }
  }
}
