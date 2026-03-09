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

        // Load stats and versions in parallel
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
      <div className="flex h-96 items-center justify-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  if (!wt) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-sm text-gray-400">
        Walkthrough not found
        <Link href="/walkthroughs" className="mt-2 text-brand-500">
          Back to list
        </Link>
      </div>
    );
  }

  const def = wt.versions[0]?.definition;
  const steps = def?.steps ?? [];

  async function handlePublish() {
    try {
      await api.post(`/walkthroughs/${id}/publish`);
      setWt((prev) => (prev ? { ...prev, status: 'published' } : prev));
    } catch (err) {
      console.error('Publish failed:', err);
    }
  }

  async function handleArchive() {
    try {
      await api.post(`/walkthroughs/${id}/archive`);
      setWt((prev) => (prev ? { ...prev, status: 'archived' } : prev));
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
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to walkthroughs
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{def?.title || 'Untitled'}</h1>
            <StatusBadge status={wt.status} />
          </div>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            {def?.description || 'No description'}
          </p>
          <p className="mt-2 text-xs text-gray-400">
            {steps.length} steps · v{wt.currentVersion} · Created{' '}
            {new Date(wt.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {wt.status === 'draft' && (
            <button
              onClick={handlePublish}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Publish
            </button>
          )}
          {wt.status === 'published' && (
            <button
              onClick={handleArchive}
              className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
            >
              Archive
            </button>
          )}
          <button
            onClick={handleDelete}
            className="rounded-lg px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {TABS.map((t) => (
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
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'steps' && (
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = ACTION_ICONS[step.actionType] ?? MousePointerClick;
            return (
              <div
                key={step.id}
                className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 capitalize">
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
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {stats ? (
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-blue-50 p-4 text-center">
                <p className="text-2xl font-bold text-blue-700">{stats.impressions}</p>
                <p className="text-xs font-medium text-blue-600">Impressions</p>
              </div>
              <div className="rounded-lg bg-violet-50 p-4 text-center">
                <p className="text-2xl font-bold text-violet-700">{stats.starts}</p>
                <p className="text-xs font-medium text-violet-600">Starts</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">
                  {stats.completions}
                </p>
                <p className="text-xs font-medium text-emerald-600">Completions</p>
              </div>
              <div className="rounded-lg bg-brand-50 p-4 text-center">
                <p className="text-2xl font-bold text-brand-700">
                  {stats.completionRate}%
                </p>
                <p className="text-xs font-medium text-brand-600">Completion Rate</p>
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
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No version history
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                    Version
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                    Created By
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                    Date
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                    Changelog
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 text-sm font-semibold">v{v.version}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{v.createdBy}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
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
