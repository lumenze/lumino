'use client';

import { useState } from 'react';
import { Check, Copy, Code, Globe, Key, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

const SDK_SNIPPET_HTML = `<script
  src="https://your-lumino-server.com/sdk/v1/lumino.js"
  data-lumino-app-id="your-app-id"
  data-lumino-token-endpoint="/api/lumino-token"
  data-lumino-api-url="https://your-lumino-server.com"
></script>`;

const SDK_SNIPPET_REACT = `// components/LuminoLoader.tsx
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
}`;

const TOKEN_ENDPOINT_SNIPPET = `// app/api/lumino-token/route.ts
import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export async function GET() {
  const secret = process.env.JWT_SECRET!;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'user-id',
    role: 'customer', // or 'author'
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(\`\${header}.\${payload}\`)
    .digest('base64url');
  return NextResponse.json({ token: \`\${header}.\${payload}.\${signature}\` });
}`;

const PROXY_SNIPPET = `// next.config.js
module.exports = {
  async rewrites() {
    return [{
      source: '/lumino/:path*',
      destination: 'http://your-lumino-server:3000/:path*',
    }];
  },
};`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-500 transition hover:bg-gray-200"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

function CodeBlock({ title, code, language }: { title: string; code: string; language: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
        <span className="text-xs font-semibold text-gray-600">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto bg-gray-900 p-4 text-xs leading-relaxed text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'integration' | 'config'>('integration');

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          SDK integration guide and configuration
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {(['integration', 'config'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-semibold capitalize transition',
              tab === t
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t === 'integration' ? 'SDK Integration' : 'Configuration'}
          </button>
        ))}
      </div>

      {tab === 'integration' && (
        <div className="space-y-6">
          {/* Step 1: Add SDK */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                1
              </div>
              <h2 className="text-sm font-bold">Add the SDK Script</h2>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Add the Lumino SDK to your web application. Choose the method that fits
              your framework.
            </p>
            <div className="space-y-4">
              <CodeBlock
                title="HTML / MPA"
                code={SDK_SNIPPET_HTML}
                language="html"
              />
              <CodeBlock
                title="React / Next.js"
                code={SDK_SNIPPET_REACT}
                language="tsx"
              />
            </div>
          </div>

          {/* Step 2: Token endpoint */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                2
              </div>
              <h2 className="text-sm font-bold">Create a Token Endpoint</h2>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Your backend must return a JWT signed with the same{' '}
              <code className="rounded bg-gray-100 px-1 text-[10px]">JWT_SECRET</code>{' '}
              configured in your Lumino server.
            </p>
            <CodeBlock
              title="Next.js API Route"
              code={TOKEN_ENDPOINT_SNIPPET}
              language="ts"
            />
          </div>

          {/* Step 3: Proxy */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                3
              </div>
              <h2 className="text-sm font-bold">Set Up a Proxy (Recommended)</h2>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Route <code className="rounded bg-gray-100 px-1 text-[10px]">/lumino/*</code>{' '}
              requests to the Lumino server to avoid CORS issues.
            </p>
            <CodeBlock
              title="Next.js Rewrites"
              code={PROXY_SNIPPET}
              language="js"
            />
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="space-y-4">
          {/* Config cards */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-bold">Application</h2>
            <div className="space-y-3">
              <ConfigRow
                icon={Globe}
                label="App ID"
                value="novapay-dashboard"
              />
              <ConfigRow
                icon={Server}
                label="Lumino Server"
                value={
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/lumino`
                    : '/lumino'
                }
              />
              <ConfigRow
                icon={Code}
                label="Environment"
                value="development"
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-bold">Authentication</h2>
            <div className="space-y-3">
              <ConfigRow
                icon={Key}
                label="JWT Secret"
                value="••••••••••••••••"
                hint="Configured in your Lumino server .env file"
              />
              <ConfigRow
                icon={Key}
                label="Token Endpoint"
                value="/api/lumino-token"
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-bold">Script Attributes</h2>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                      Attribute
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                      Required
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['data-lumino-app-id', 'Yes', 'Your application identifier'],
                    ['data-lumino-token-endpoint', 'Yes*', 'Backend endpoint returning JWT'],
                    ['data-lumino-token', 'Yes*', 'Static JWT (alternative)'],
                    ['data-lumino-api-url', 'No', 'Lumino server URL (default: /lumino)'],
                    ['data-lumino-environment', 'No', 'development | staging | production'],
                    ['data-lumino-debug', 'No', 'Enable verbose console logging'],
                    ['data-lumino-auto-init', 'No', 'Auto-initialize on load (default: true)'],
                    ['data-lumino-role-storage-key', 'No', 'localStorage key for role'],
                  ].map(([attr, req, desc]) => (
                    <tr key={attr} className="border-b border-gray-50">
                      <td className="px-4 py-2.5 font-mono text-[10px] text-brand-600">
                        {attr}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{req}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-gray-400" />
        <div>
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
        </div>
      </div>
      <code className="rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">{value}</code>
    </div>
  );
}
