import type { ShadowDomManager } from '../core/shadow-dom';
import type { ApiClient } from '../core/api-client';
import { EventBus } from '../core/event-bus';

interface SearchDeps {
  shadowDom: ShadowDomManager;
  apiClient: ApiClient;
  eventBus: EventBus;
}

/**
 * CommandPalette
 *
 * NL search for walkthroughs. Phase 2 feature (deferred from MVP).
 * Interface is defined now so the SDK entry point compiles.
 */
export class CommandPalette {
  constructor(private readonly deps: SearchDeps) {}

  async open(): Promise<void> {
    // Phase 2: render command palette UI
  }

  close(): void {
    // Phase 2
  }
}
