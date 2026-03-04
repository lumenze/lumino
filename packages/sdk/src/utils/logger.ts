export class Logger {
  private debugMode = false;

  constructor(private readonly prefix: string) {}

  setDebug(enabled: boolean): void {
    this.debugMode = enabled;
  }

  info(message: string, data?: unknown): void {
    console.log(`[${this.prefix}] ${message}`, data !== undefined ? data : '');
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[${this.prefix}] ${message}`, data !== undefined ? data : '');
  }

  error(message: string, err?: unknown): void {
    console.error(`[${this.prefix}] ${message}`, err !== undefined ? err : '');
  }

  debug(message: string, data?: unknown): void {
    if (this.debugMode) {
      console.debug(`[${this.prefix}] ${message}`, data !== undefined ? data : '');
    }
  }
}
