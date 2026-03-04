import { UserRole, type LuminoJwtPayload } from '@lumino/shared';

export class AuthManager {
  private token: string = '';
  private payload: LuminoJwtPayload | null = null;

  constructor(private readonly authCallback: () => Promise<string> | string) {}

  async authenticate(): Promise<void> {
    this.token = await this.authCallback();
    this.payload = this.decodeToken(this.token);
  }

  getToken(): string {
    return this.token;
  }

  getRole(): UserRole {
    return this.payload?.role ?? UserRole.Customer;
  }

  getUserId(): string {
    return this.payload?.sub ?? '';
  }

  getLocale(): string {
    return this.payload?.locale ?? 'en-US';
  }

  isTokenExpired(): boolean {
    if (!this.payload) return true;
    return Date.now() / 1000 > this.payload.exp;
  }

  private decodeToken(token: string): LuminoJwtPayload {
    try {
      const [, payload] = token.split('.');
      if (!payload) throw new Error('Invalid token format');
      // JWT uses base64url encoding — convert to standard base64 for atob
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      return JSON.parse(atob(padded)) as LuminoJwtPayload;
    } catch {
      throw new Error('[Lumino] Failed to decode JWT');
    }
  }
}
