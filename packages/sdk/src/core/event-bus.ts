// ── Event Bus ────────────────────────────────────────────────────────────────

export enum LuminoEvent {
  Initialized = 'lumino:initialized',
  Destroyed = 'lumino:destroyed',
  RouteChanged = 'lumino:route_changed',
  DomMutated = 'lumino:dom_mutated',
  WalkthroughStarted = 'lumino:walkthrough_started',
  WalkthroughCompleted = 'lumino:walkthrough_completed',
  WalkthroughAbandoned = 'lumino:walkthrough_abandoned',
  StepAdvanced = 'lumino:step_advanced',
  RecordingStarted = 'lumino:recording_started',
  RecordingStopped = 'lumino:recording_stopped',
  NotificationShown = 'lumino:notification_shown',
  NotificationDismissed = 'lumino:notification_dismissed',
  TransitionInitiated = 'lumino:transition_initiated',
  TransitionResumed = 'lumino:transition_resumed',
  AuthRefreshed = 'lumino:auth_refreshed',
  Error = 'lumino:error',
}

type EventHandler = (...args: unknown[]) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[Lumino] Event handler error for "${event}":`, error);
      }
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}
