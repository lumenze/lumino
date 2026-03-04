/**
 * Shadow DOM Manager
 *
 * Creates and manages the shadow DOM container that isolates
 * Lumino's UI from the host product. All Preact components
 * render inside this shadow root.
 */
export class ShadowDomManager {
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private styleContainer: HTMLStyleElement | null = null;

  constructor(private readonly hostId: string) {}

  /** Create the shadow DOM host element and attach shadow root */
  create(): void {
    if (this.shadow) return;

    // Reuse existing host if present (prevents duplicates from double init)
    const existing = document.getElementById(this.hostId);
    if (existing?.shadowRoot) {
      this.host = existing;
      this.shadow = existing.shadowRoot;
      this.styleContainer = this.shadow.querySelector('style');
      return;
    }

    // Create host element
    this.host = document.createElement('div');
    this.host.id = this.hostId;
    this.host.setAttribute('data-lumino', 'true');

    // Ensure host doesn't interfere with layout
    this.host.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      overflow: visible;
      z-index: 2147483647;
      pointer-events: none;
    `;

    // Attach shadow root
    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Create style container for Tailwind CSS
    this.styleContainer = document.createElement('style');
    this.shadow.appendChild(this.styleContainer);

    // Add to document
    document.body.appendChild(this.host);
  }

  /** Get the shadow root for rendering Preact components */
  getRoot(): ShadowRoot {
    if (!this.shadow) {
      throw new Error('[Lumino] Shadow DOM not created. Call create() first.');
    }
    return this.shadow;
  }

  /** Get or create a container element for a specific feature */
  getContainer(name: string): HTMLDivElement {
    const root = this.getRoot();
    let container = root.querySelector(`[data-lumino-container="${name}"]`) as HTMLDivElement;

    if (!container) {
      container = document.createElement('div');
      container.setAttribute('data-lumino-container', name);
      container.style.pointerEvents = 'auto';
      root.appendChild(container);
    }

    return container;
  }

  /** Inject compiled CSS into shadow DOM */
  injectStyles(css: string): void {
    if (this.styleContainer) {
      this.styleContainer.textContent = css;
    }
  }

  /** Append additional styles */
  appendStyles(css: string): void {
    const style = document.createElement('style');
    style.textContent = css;
    this.shadow?.appendChild(style);
  }

  /** Remove shadow DOM and clean up */
  destroy(): void {
    if (this.host) {
      this.host.remove();
      this.host = null;
      this.shadow = null;
      this.styleContainer = null;
    }
  }
}
