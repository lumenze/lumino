'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ExternalLink, Route } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';

interface Walkthrough {
  id: string;
  appId: string;
  status: string;
  currentVersion: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  versions: Array<{
    definition: { title: string; description: string; steps: unknown[] };
  }>;
}

const FILTERS = ['all', 'draft', 'published', 'archived'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_DOTS: Record<string, string> = {
  all: 'bg-gray-400',
  draft: 'bg-gray-400',
  published: 'bg-emerald-500',
  archived: 'bg-slate-400',
};

export default function WalkthroughsPage() {
  const { appId } = useApp();
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!appId) return;
    async function load() {
      try {
        setLoading(true);
        const res = await api.get<{ data: { items: Walkthrough[] } }>(
          `/walkthroughs?appId=${encodeURIComponent(appId)}&limit=50`
        );
        setWalkthroughs(res.data.items);
      } catch (err) {
        console.error('Failed to load walkthroughs:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [appId]);

  const filtered = walkthroughs.filter((wt) => {
    const title = wt.versions[0]?.definition?.title?.toLowerCase() ?? '';
    const matchesSearch = title.includes(search.toLowerCase());
    const matchesFilter =
      filter === 'all' || wt.status.toLowerCase() === filter;
    return matchesSearch && matchesFilter;
  });

  async function handlePublish(id: string) {
    try {
      await api.post(`/walkthroughs/${id}/publish`);
      setWalkthroughs((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'PUBLISHED' } : w))
      );
    } catch (err) {
      console.error('Publish failed:', err);
    }
  }

  async function handleArchive(id: string) {
    try {
      await api.post(`/walkthroughs/${id}/archive`);
      setWalkthroughs((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: 'ARCHIVED' } : w))
      );
    } catch (err) {
      console.error('Archive failed:', err);
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Walkthroughs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your interactive guides
          </p>
        </div>
        <a
          href="http://localhost:3100"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:shadow-xl hover:-translate-y-0.5"
        >
          Record in NovaPay <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Search + Filters */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search walkthroughs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200/60 bg-white/80 py-2.5 pl-10 pr-4 text-sm backdrop-blur-sm transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-gray-200/60 bg-white/80 p-1 backdrop-blur-sm">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold capitalize transition-all',
                filter === f
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', FILTER_DOTS[f])} />
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Loading...
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card flex flex-col items-center rounded-2xl py-16">
          <Route className="mb-3 h-12 w-12 text-gray-200" />
          <p className="text-sm font-medium text-gray-400">No walkthroughs found</p>
          <p className="mt-1 text-xs text-gray-300">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="animate-slide-up overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 backdrop-blur-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                  Walkthrough
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                  Status
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                  Steps
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                  Version
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                  Updated
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wt) => {
                const def = wt.versions[0]?.definition;
                const s = wt.status.toLowerCase();
                return (
                  <tr
                    key={wt.id}
                    className="group border-b border-gray-50 transition-colors hover:bg-brand-50/30"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/walkthroughs/${wt.id}`}
                        className="text-sm font-semibold text-gray-900 transition hover:text-brand-600"
                      >
                        {def?.title || 'Untitled'}
                      </Link>
                      {def?.description && (
                        <p className="mt-0.5 max-w-xs truncate text-[11px] text-gray-400">
                          {def.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={wt.status} />
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {def?.steps?.length ?? 0}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      v{wt.currentVersion}
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-400">
                      {new Date(wt.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/walkthroughs/${wt.id}`}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                          View
                        </Link>
                        {s === 'draft' && (
                          <button
                            onClick={() => handlePublish(wt.id)}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
                          >
                            Publish
                          </button>
                        )}
                        {s === 'published' && (
                          <button
                            onClick={() => handleArchive(wt.id)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
