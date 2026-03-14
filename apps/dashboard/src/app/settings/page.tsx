'use client';

import { useState } from 'react';
import { Check, Copy, Code, Globe, Key, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/app-context';

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
      className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-medium text-gray-400 transition hover:bg-white/20 hover:text-white"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-400" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> Copy
        </>
      )}
    </button>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800/50">
      <div className="flex items-center justify-between bg-gray-900 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[11px] font-medium text-gray-500">{title}</span>
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto bg-gray-950 p-4 text-[12px] leading-relaxed text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function SettingsPage() {
  const { appId } = useApp();
  const [tab, setTab] = useState<'integration' | 'config'>('integration');

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          SDK integration guide and configuration
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          {(['integration', 'config'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative pb-3 text-sm font-semibold transition',
                tab === t
                  ? 'text-brand-600'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              {t === 'integration' ? 'SDK Integration' : 'Configuration'}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'integration' && (
        <div className="relative space-y-8 animate-fade-in">
          {/* Connecting line */}
          <div className="absolute left-[19px] top-8 bottom-8 w-px bg-gradient-to-b from-brand-300 via-brand-200 to-transparent" />

          {/* Step 1 */}
          <div className="relative pl-14">
            <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 text-sm font-bold text-white shadow-lg shadow-brand-500/20">
              1
            </div>
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-sm font-bold">Add the SDK Script</h2>
              <p className="mt-1 mb-4 text-xs text-gray-500">
                Add the Lumino SDK to your web application. Choose the method that fits
                your framework.
              </p>
              <div className="space-y-4">
                <CodeBlock title="HTML / MPA" code={SDK_SNIPPET_HTML} />
                <CodeBlock title="React / Next.js" code={SDK_SNIPPET_REACT} />
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative pl-14">
            <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 text-sm font-bold text-white shadow-lg shadow-brand-500/20">
              2
            </div>
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-sm font-bold">Create a Token Endpoint</h2>
              <p className="mt-1 mb-4 text-xs text-gray-500">
                Your backend must return a JWT signed with the same{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold">JWT_SECRET</code>{' '}
                configured in your Lumino server.
              </p>
              <CodeBlock title="Next.js API Route" code={TOKEN_ENDPOINT_SNIPPET} />
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative pl-14">
            <div className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 text-sm font-bold text-white shadow-lg shadow-brand-500/20">
              3
            </div>
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-sm font-bold">Set Up a Proxy (Recommended)</h2>
              <p className="mt-1 mb-4 text-xs text-gray-500">
                Route <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold">/lumino/*</code>{' '}
                requests to the Lumino server to avoid CORS issues.
              </p>
              <CodeBlock title="Next.js Rewrites" code={PROXY_SNIPPET} />
            </div>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className="space-y-4 animate-fade-in">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold">Application</h2>
            <div className="space-y-3">
              <ConfigRow icon={Globe} label="App ID" value={appId || '—'} />
              <ConfigRow
                icon={Server}
                label="Lumino Server"
                value={
                  typeof window !== 'undefined'
                    ? `${window.location.origin}/lumino`
                    : '/lumino'
                }
              />
              <ConfigRow icon={Code} label="Environment" value="development" />
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold">Authentication</h2>
            <div className="space-y-3">
              <ConfigRow
                icon={Key}
                label="JWT Secret"
                value="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                hint="Configured in your Lumino server .env file"
              />
              <ConfigRow icon={Key} label="Token Endpoint" value="/api/lumino-token" />
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-bold">Script Attributes</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200/60">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                      Attribute
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                      Required
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
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
                    <tr key={attr} className="border-b border-gray-50 transition hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-[10px] text-brand-600 font-semibold">
                        {attr}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{req}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{desc}</td>
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
    <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3.5 transition hover:bg-gray-50/50">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
          <Icon className="h-4 w-4 text-gray-500" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-700">{label}</p>
          {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
        </div>
      </div>
      <code className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">{value}</code>
    </div>
  );
}
