const API_BASE = '/lumino/api/v1';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch('/api/lumino-token');
  if (!res.ok) throw new Error('Failed to fetch auth token');
  const data = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 50 * 60 * 1000; // refresh after 50 min
  return cachedToken!;
}

async function request<T>(path: string, options?: RequestInit & { appId?: string }): Promise<T> {
  const token = await getToken();
  const { appId, ...fetchOptions } = options ?? {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(appId ? { 'X-Lumino-App': appId } : {}),
      ...fetchOptions?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, appId?: string) => request<T>(path, { appId }),
  post: <T>(path: string, body?: unknown, appId?: string) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined, appId }),
  put: <T>(path: string, body?: unknown, appId?: string) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined, appId }),
  delete: <T>(path: string, appId?: string) => request<T>(path, { method: 'DELETE', appId }),
};
