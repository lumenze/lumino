import type { ApiResponse, CrossAppTransition } from '@lumino/shared';
import { API_ROUTES } from '@lumino/shared';
import { DebugLogger } from '../utils/debug-logger';

interface ApiClientConfig {
  baseUrl: string;
  appId: string;
}

export class ApiClient {
  private token: string = '';
  private dbg = DebugLogger.getInstance();

  constructor(private readonly config: ApiClientConfig) {}

  setAuthToken(token: string): void {
    this.token = token;
  }

  async get<T>(path: string): Promise<T> {
    this.dbg.log('debug', 'api', `GET ${path}`);
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response, 'GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    this.dbg.log('debug', 'api', `POST ${path}`, { body });
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, 'POST', path);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    this.dbg.log('debug', 'api', `PUT ${path}`, { body });
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, 'PUT', path);
  }

  async delete(path: string): Promise<void> {
    this.dbg.log('debug', 'api', `DELETE ${path}`);
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      this.dbg.log('error', 'api', `DELETE ${path} failed: ${response.status}`, error);
      throw new Error(`[Lumino API] ${response.status}: ${error.message ?? 'Delete failed'}`);
    }
  }

  async getPendingTransition(appId: string): Promise<CrossAppTransition | null> {
    try {
      return await this.get<CrossAppTransition>(
        `${API_ROUTES.TRANSITIONS}/pending?appId=${encodeURIComponent(appId)}`
      );
    } catch {
      return null;
    }
  }

  async createTransition(params: {
    walkthroughId: string;
    walkthroughVersion: number;
    fromApp: string;
    toApp: string;
    currentStep: number;
    nextStep: number;
    ttlSeconds: number;
    targetUrl: string;
    urlParamKey: string;
  }): Promise<{ token: string; redirectUrl: string; transition: CrossAppTransition }> {
    return this.post<{ token: string; redirectUrl: string; transition: CrossAppTransition }>(
      API_ROUTES.TRANSITIONS,
      params,
    );
  }

  async consumeTransition(token: string): Promise<CrossAppTransition | null> {
    try {
      return await this.post<CrossAppTransition>(`${API_ROUTES.TRANSITIONS}/consume`, { token });
    } catch {
      return null;
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
      'X-Lumino-App': this.config.appId,
    };
  }

  private async handleResponse<T>(response: Response, method = '', path = ''): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      this.dbg.log('error', 'api', `${method} ${path} failed: ${response.status}`, {
        status: response.status,
        error,
        url: response.url,
      });
      throw new Error(`[Lumino API] ${response.status}: ${error.message ?? 'Request failed'}`);
    }
    const data: ApiResponse<T> = await response.json();
    this.dbg.log('debug', 'api', `${method} ${path} -> ${response.status}`);
    return data.data;
  }
}
