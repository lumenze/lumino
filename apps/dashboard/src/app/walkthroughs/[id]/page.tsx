'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MousePointerClick, Type, ListChecks, Navigation } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  order: number;
  title: string;
  description: string;
  actionType: string;
  selector: { primary: string };
}

interface WalkthroughDetail {
  id: string;
  appId: string;
  status: string;
  currentVersion: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  versions: Array<{
    id: string;
    version: number;
    createdBy: string;
    createdAt: string;
    changelog: string | null;
    definition: {
      title: string;
      description: string;
      steps: Step[];
      tags: string[];
    };
  }>;
}

interface VersionHistoryItem {
  id: string;
  version: number;
  createdBy: string;
  createdAt: string;
  changelog: string | null;
}

interface WalkthroughStats {
  impressions: number;
  starts: number;
  completions: number;
  abandonments: number;
  completionRate: number;
}

const ACTION_ICONS: Record<string, typeof MousePointerClick> = {
  click: MousePointerClick,
  input: Type,
  select: ListChecks,
  navigate: Navigation,
};

const TABS = ['steps', 'analytics', 'versions'] as const;
type Tab = (typeof TABS)[number];

export default function WalkthroughDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [wt, setWt] = useState<WalkthroughDetail | null>(null);
  const [versions, setVersions] = useState<VersionHistoryItem[]>([]);
  const [stats, setStats] = useState<WalkthroughStats | null>(null);
  const [tab, setTab] = useState<Tab>('steps');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [wtRes] = await Promise.all([
          api.get<{ data: WalkthroughDetail }>(`/walkthroughs/${id}`),
        ]);
        setWt(wtRes.data);

        const [statsRes, versionsRes] = await Promise.allSettled([
          api.get<{ data: WalkthroughStats }>(`/analytics/walkthroughs/${id}/stats`),
          api.get<{ data: { items: VersionHistoryItem[] } }>(
            `/walkthroughs/${id}/versions`
          ),
        ]);

        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (versionsRes.status === 'fulfilled')
          setVersions(versionsRes.value.data.items);
      } catch (err) {
        console.error('Failed to load walkthrough:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          Loading...
        </div>
      </div>
    );
  }

  if (!wt) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-sm text-gray-400">
        Walkthrough not found
        <Link href="/walkthroughs" className="mt-2 text-brand-500 font-medium">
          Back to list
        </Link>
      </div>
    );
  }

  const def = wt.versions[0]?.definition;
  const steps = def?.steps ?? [];
  const status = wt.status.toLowerCase();

  async function handlePublish() {
    try {
      await api.post(`/walkthroughs/${id}/publish`);
      setWt((prev) => (prev ? { ...prev, status: 'PUBLISHED' } : prev));
    } catch (err) {
      console.error('Publish failed:', err);
    }
  }

  async function handleArchive() {
    try {
      await api.post(`/walkthroughs/${id}/archive`);
      setWt((prev) => (prev ? { ...prev, status: 'ARCHIVED' } : prev));
    } catch (err) {
      console.error('Archive failed:', err);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this walkthrough permanently?')) return;
    try {
      await api.delete(`/walkthroughs/${id}`);
      router.push('/walkthroughs');
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  return (
    <div className="p-8">
      {/* Back + Header */}
      <Link
        href="/walkthroughs"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to walkthroughs
      </Link>

      <div className="mb-6 flex items-start justify-between animate-slide-up">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight">{def?.title || 'Untitled'}</h1>
            <StatusBadge status={wt.status} />
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-gray-500">
            {def?.description || 'No description'}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {steps.length} steps · v{wt.currentVersion} · Created{' '}
            {new Date(wt.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === 'draft' && (
            <button
              onClick={handlePublish}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl hover:-translate-y-0.5"
            >
              Publish
            </button>
          )}
          {status === 'published' && (
            <button
              onClick={handleArchive}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Archive
            </button>
          )}
          <button
            onClick={handleDelete}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabs — underline style */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'relative pb-3 text-sm font-semibold capitalize transition',
                tab === t
                  ? 'text-brand-600'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              {t}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'steps' && (
        <div className="space-y-3 animate-fade-in">
          {steps.map((step, i) => {
            const Icon = ACTION_ICONS[step.actionType] ?? MousePointerClick;
            return (
              <div
                key={step.id}
                className="group flex items-start gap-4 rounded-2xl border border-gray-200/60 bg-white/80 p-5 backdrop-blur-sm transition-all hover:shadow-md hover:border-gray-200"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 text-sm font-bold text-white shadow-sm">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <span className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 capitalize">
                      <Icon className="h-3 w-3" />
                      {step.actionType}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{step.description}</p>
                  <p className="mt-2 font-mono text-[10px] text-gray-300">
                    {step.selector?.primary}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="animate-fade-in rounded-2xl border border-gray-200/60 bg-white/80 p-6 backdrop-blur-sm">
          {stats ? (
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-center shadow-lg shadow-blue-500/20">
                <p className="text-3xl font-black text-white">{stats.impressions}</p>
                <p className="mt-1 text-xs font-medium text-blue-100">Impressions</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-center shadow-lg shadow-violet-500/20">
                <p className="text-3xl font-black text-white">{stats.starts}</p>
                <p className="mt-1 text-xs font-medium text-violet-100">Starts</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-center shadow-lg shadow-emerald-500/20">
                <p className="text-3xl font-black text-white">{stats.completions}</p>
                <p className="mt-1 text-xs font-medium text-emerald-100">Completions</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 p-5 text-center shadow-lg shadow-brand-500/20">
                <p className="text-3xl font-black text-white">{stats.completionRate}%</p>
                <p className="mt-1 text-xs font-medium text-orange-100">Completion Rate</p>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No analytics data yet. Publish the walkthrough and let customers use it.
            </p>
          )}
        </div>
      )}

      {tab === 'versions' && (
        <div className="animate-fade-in overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 backdrop-blur-sm">
          {versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No version history
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                    Version
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                    Created By
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                    Date
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                    Changelog
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-gray-50 transition hover:bg-brand-50/30">
                    <td className="px-5 py-3.5 text-sm font-semibold">v{v.version}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{v.createdBy}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {v.changelog || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
