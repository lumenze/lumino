/**
 * DebugLogger — Captures detailed diagnostic events for troubleshooting.
 * Buffered in memory, exportable as JSON for bug reports.
 */

export interface DebugEntry {
  ts: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: unknown;
}

const MAX_ENTRIES = 500;

export class DebugLogger {
  private static instance: DebugLogger | null = null;
  private entries: DebugEntry[] = [];
  private enabled = false;
  private sessionId = `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  enable(): void {
    this.enabled = true;
    this.log('info', 'debug', 'Debug logging enabled', {
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      timestamp: new Date().toISOString(),
    });
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  log(level: DebugEntry['level'], category: string, message: string, data?: unknown): void {
    if (!this.enabled) return;

    const entry: DebugEntry = {
      ts: Date.now(),
      level,
      category,
      message,
      data: data !== undefined ? this.safeClone(data) : undefined,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }

    // Also log to console in debug mode
    const prefix = `[Lumino:${category}]`;
    if (level === 'error') {
      console.error(prefix, message, data ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, message, data ?? '');
    } else {
      console.log(prefix, message, data ?? '');
    }
  }

  /** Get all captured entries */
  getEntries(): DebugEntry[] {
    return [...this.entries];
  }

  /** Export full diagnostic report as JSON */
  export(): string {
    const report = {
      sessionId: this.sessionId,
      exportedAt: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      entryCount: this.entries.length,
      entries: this.entries,
    };
    return JSON.stringify(report, null, 2);
  }

  /** Download report as a file */
  downloadReport(): void {
    const json = this.export();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lumino-debug-${this.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
  }

  private safeClone(data: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return String(data);
    }
  }
}
