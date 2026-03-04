import type { ApiResponse, CrossAppTransition } from '@lumino/shared';
import { API_ROUTES } from '@lumino/shared';

interface ApiClientConfig {
  baseUrl: string;
  appId: string;
}

export class ApiClient {
  private token: string = '';

  constructor(private readonly config: ApiClientConfig) {}

  setAuthToken(token: string): void {
    this.token = token;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete(path: string): Promise<void> {
    await fetch(`${this.config.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  async getPendingTransition(appId: string): Promise<CrossAppTransition | null> {
    try {
      return await this.get<CrossAppTransition>(
        `${API_ROUTES.TRANSITIONS}/pending?app_id=${appId}`
      );
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

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`[Lumino API] ${response.status}: ${error.message ?? 'Request failed'}`);
    }
    const data: ApiResponse<T> = await response.json();
    return data.data;
  }
}
