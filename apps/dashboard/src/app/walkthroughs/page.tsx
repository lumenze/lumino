'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
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

const STATUS_TABS = ['all', 'draft', 'published', 'archived'] as const;

export default function WalkthroughsPage() {
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({ appId: 'novapay-dashboard', limit: '100' });
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const res = await api.get<{ data: { items: Walkthrough[] } }>(
          `/walkthroughs?${params}`
        );
        setWalkthroughs(res.data.items);
      } catch (err) {
        console.error('Failed to load walkthroughs:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [statusFilter]);

  const filtered = walkthroughs.filter((wt) => {
    const title = wt.versions[0]?.definition?.title ?? '';
    return title.toLowerCase().includes(search.toLowerCase());
  });

  async function publishWalkthrough(id: string) {
    try {
      await api.post(`/walkthroughs/${id}/publish`);
      setWalkthroughs((prev) =>
        prev.map((wt) => (wt.id === id ? { ...wt, status: 'published' } : wt))
      );
    } catch (err) {
      console.error('Publish failed:', err);
    }
  }

  async function archiveWalkthrough(id: string) {
    try {
      await api.post(`/walkthroughs/${id}/archive`);
      setWalkthroughs((prev) =>
        prev.map((wt) => (wt.id === id ? { ...wt, status: 'archived' } : wt))
      );
    } catch (err) {
      console.error('Archive failed:', err);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Walkthroughs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your recorded walkthroughs
          </p>
        </div>
        <a
          href="http://localhost:3100"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          Record in NovaPay
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search walkthroughs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition',
                statusFilter === tab
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-sm text-gray-400">
            <p>No walkthroughs found</p>
            <p className="mt-1 text-xs">
              Record one by opening NovaPay as an Author
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                  Title
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                  Status
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                  Steps
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                  Version
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
                  Updated
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((wt) => {
                const def = wt.versions[0]?.definition;
                return (
                  <tr
                    key={wt.id}
                    className="border-b border-gray-50 transition hover:bg-gray-50/50"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/walkthroughs/${wt.id}`}
                        className="text-sm font-semibold text-gray-900 hover:text-brand-500"
                      >
                        {def?.title || 'Untitled'}
                      </Link>
                      <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400">
                        {def?.description || ''}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={wt.status} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {def?.steps?.length ?? 0}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      v{wt.currentVersion}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {new Date(wt.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/walkthroughs/${wt.id}`}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
                        >
                          View
                        </Link>
                        {wt.status === 'draft' && (
                          <button
                            onClick={() => publishWalkthrough(wt.id)}
                            className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Publish
                          </button>
                        )}
                        {wt.status === 'published' && (
                          <button
                            onClick={() => archiveWalkthrough(wt.id)}
                            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
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
        )}
      </div>
    </div>
  );
}
