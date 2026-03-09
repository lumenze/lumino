# Lumino SDK Integration Guide

## Quick Start

Add the Lumino SDK to your web app with a single script tag. The SDK handles walkthrough playback, recording (for authors), and analytics automatically.

## 1. Add the SDK Script

### Plain HTML / MPA Apps

```html
<script
  src="https://your-lumino-server.com/sdk/v1/lumino.js"
  data-lumino-app-id="your-app-id"
  data-lumino-token-endpoint="/api/lumino-token"
  data-lumino-api-url="https://your-lumino-server.com"
></script>
```

Place the script tag before `</body>` in your HTML.

### React / Next.js (App Router)

Create a client component to inject the SDK:

```tsx
// components/LuminoLoader.tsx
'use client';

import { useEffect } from 'react';

export default function LuminoLoader() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://your-lumino-server.com/sdk/v1/lumino.js';
    script.setAttribute('data-lumino-app-id', 'your-app-id');
    script.setAttribute('data-lumino-token-endpoint', '/api/lumino-token');
    script.setAttribute('data-lumino-api-url', 'https://your-lumino-server.com');
    document.body.appendChild(script);
  }, []);

  return null;
}
```

Add it to your root layout:

```tsx
// app/layout.tsx
import LuminoLoader from './components/LuminoLoader';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <LuminoLoader />
      </body>
    </html>
  );
}
```

> **Note:** Do not use `next/script` with the Lumino SDK — it can cause issues with data attribute forwarding. The `useEffect` approach above is the recommended method.

### Vue / Angular / Other SPAs

Use the same `document.createElement('script')` approach in your app's mount lifecycle hook (e.g., `onMounted` in Vue, `ngOnInit` in Angular).

## 2. Create a Token Endpoint

The SDK calls your token endpoint to authenticate the current user. Your backend must return a JWT signed with the same `JWT_SECRET` you configured in your Lumino server's `.env` file during deployment. You choose this secret — Lumino does not generate or distribute it. It is a shared secret between your app's backend and your Lumino server instance.

### Request

```
GET /api/lumino-token
```

The SDK may append a `?role=author` query parameter if role switching is enabled.

### Response

Return JSON with a `token` field:

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoiY3VzdG9tZXIiLCJleHAiOjk5OTk5OTk5OTl9.signature"
}
```

Or return the raw JWT string as plain text.

### JWT Payload

Sign with HS256 using your `JWT_SECRET`.

| Field    | Required | Type   | Description                         |
|----------|----------|--------|-------------------------------------|
| `sub`    | Yes      | string | Unique user ID                      |
| `role`   | Yes      | string | `customer`, `author`, or `admin`    |
| `locale` | No       | string | User locale, e.g. `en-US`           |
| `exp`    | Yes      | number | Expiration (Unix timestamp)         |
| `iat`    | No       | number | Issued at (Unix timestamp)          |

### Example (Node.js / Express)

```js
const crypto = require('crypto');

app.get('/api/lumino-token', (req, res) => {
  const secret = process.env.JWT_SECRET;
  const user = req.user; // from your auth middleware

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.isAdmin ? 'author' : 'customer',
    locale: user.locale || 'en-US',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  res.json({ token: `${header}.${payload}.${signature}` });
});
```

### Example (Next.js App Router)

```ts
// app/api/lumino-token/route.ts
import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { getServerSession } from 'next-auth'; // or your auth library

export async function GET() {
  const session = await getServerSession();
  const secret = process.env.JWT_SECRET!;

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: session.user.id,
    role: session.user.role === 'admin' ? 'author' : 'customer',
    locale: 'en-US',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return NextResponse.json({ token: `${header}.${payload}.${signature}` });
}
```

## 3. Script Attributes Reference

| Attribute                        | Required | Default      | Description                                      |
|----------------------------------|----------|--------------|--------------------------------------------------|
| `data-lumino-app-id`             | Yes      | —            | Your application identifier                      |
| `data-lumino-token-endpoint`     | Yes*     | —            | Backend endpoint that returns a JWT               |
| `data-lumino-token`              | Yes*     | —            | Static JWT (alternative to endpoint)              |
| `data-lumino-api-url`            | No       | `/lumino`    | Lumino server URL or proxy path                   |
| `data-lumino-environment`        | No       | `production` | `development`, `staging`, or `production`         |
| `data-lumino-debug`              | No       | `false`      | Enable verbose console logging                    |
| `data-lumino-auto-init`          | No       | `true`       | Auto-initialize on script load                    |
| `data-lumino-role-param`         | No       | `role`       | Query param name for role in token endpoint       |
| `data-lumino-role-storage-key`   | No       | —            | localStorage key to read current role from        |

\* One of `data-lumino-token-endpoint` or `data-lumino-token` is required.

## 4. Proxy Setup (Recommended)

Route `/lumino/*` requests from your app to the Lumino server. This avoids CORS issues and keeps the SDK API calls same-origin.

### Next.js

```js
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/lumino/:path*',
        destination: 'http://your-lumino-server:3000/:path*',
      },
    ];
  },
};
```

### Nginx

```nginx
location /lumino/ {
    proxy_pass http://lumino-server:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Apache

```apache
ProxyPass /lumino/ http://lumino-server:3000/
ProxyPassReverse /lumino/ http://lumino-server:3000/
```

When using a proxy, set `data-lumino-api-url="/lumino"` (relative path).

## 5. Programmatic API

If you set `data-lumino-auto-init="false"`, you can initialize manually:

```js
const sdk = await window.LuminoBootstrap.initFromScript();
```

Or use the `Lumino` class directly:

```js
const lumino = await window.Lumino.init({
  appId: 'your-app-id',
  auth: async () => {
    const res = await fetch('/api/lumino-token');
    const data = await res.json();
    return data.token;
  },
  apiUrl: '/lumino',
  environment: 'production',
});
```

## 6. Events

Listen for SDK lifecycle events on `window`:

```js
// SDK initialized successfully
window.addEventListener('lumino:ready', (e) => {
  console.log('Lumino ready', e.detail); // { appId, version }
});

// SDK encountered an error
window.addEventListener('lumino:error', (e) => {
  console.error('Lumino error', e.detail); // { code, message }
});
```

## 7. User Roles

| Role       | Capabilities                                    |
|------------|------------------------------------------------|
| `customer` | View and follow published walkthroughs          |
| `author`   | Record, edit, and publish walkthroughs          |
| `admin`    | All author capabilities + manage settings       |

The role is determined by the `role` field in the JWT payload returned by your token endpoint.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No Lumino UI appears | SDK script not loading | Check Network tab for the script request. Verify the Lumino server is reachable. |
| `LUMINO_CONFIG_ERROR` in console | Missing required attributes | Ensure `data-lumino-app-id` and `data-lumino-token-endpoint` are set. |
| `LUMINO_TOKEN_FETCH_ERROR` | Token endpoint unreachable or returning errors | Verify your `/api/lumino-token` endpoint returns valid JSON with a `token` field. |
| `LUMINO_INIT_ERROR` | JWT invalid or Lumino server down | Check that `JWT_SECRET` matches between your app and Lumino server. |
| 500 errors on API calls | Database or server misconfiguration | Check Lumino server logs. |
| Author FAB not showing | User role is `customer` | Ensure your token endpoint returns `role: "author"` for content creators. |
