'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Route, CheckCircle, Eye, TrendingUp, HeartPulse } from 'lucide-react';
import { api } from '@/lib/api';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';

interface Walkthrough {
  id: string;
  appId: string;
  status: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  versions: Array<{
    definition: { title: string; description: string; steps: unknown[] };
  }>;
}

interface WalkthroughStats {
  impressions: number;
  starts: number;
  completions: number;
  abandonments: number;
  completionRate: number;
}

interface HealthOverview {
  totalWalkthroughs: number;
  summary: { healthy: number; warning: number; critical: number; unchecked: number };
}

export default function OverviewPage() {
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
  const [stats, setStats] = useState<Map<string, WalkthroughStats>>(new Map());
  const [health, setHealth] = useState<HealthOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const wtRes = await api.get<{ data: { items: Walkthrough[] } }>(
          '/walkthroughs?appId=novapay-dashboard&limit=50'
        );
        const items = wtRes.data.items;
        setWalkthroughs(items);

        // Fetch stats for each walkthrough
        const statsMap = new Map<string, WalkthroughStats>();
        await Promise.allSettled(
          items.map(async (wt) => {
            try {
              const s = await api.get<{ data: WalkthroughStats }>(
                `/analytics/walkthroughs/${wt.id}/stats`
              );
              statsMap.set(wt.id, s.data);
            } catch {
              /* no stats yet */
            }
          })
        );
        setStats(statsMap);

        // Fetch health
        try {
          const h = await api.get<{ data: HealthOverview }>(
            '/health/apps/novapay-dashboard'
          );
          setHealth(h.data);
        } catch {
          /* health module may not have data */
        }
      } catch (err) {
        console.error('Failed to load overview:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalWalkthroughs = walkthroughs.length;
  const published = walkthroughs.filter((w) => w.status === 'published').length;
  const totalCompletions = Array.from(stats.values()).reduce(
    (sum, s) => sum + s.completions,
    0
  );
  const avgRate =
    stats.size > 0
      ? Math.round(
          Array.from(stats.values()).reduce((sum, s) => sum + s.completionRate, 0) /
            stats.size
        )
      : 0;

  const recentWalkthroughs = [...walkthroughs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your Lumino platform at a glance
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Loading dashboard...
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            <StatCard
              title="Total Walkthroughs"
              value={totalWalkthroughs}
              icon={Route}
              subtitle="All statuses"
            />
            <StatCard
              title="Published"
              value={published}
              icon={CheckCircle}
              subtitle="Live for customers"
            />
            <StatCard
              title="Total Completions"
              value={totalCompletions}
              icon={Eye}
              subtitle="Across all walkthroughs"
            />
            <StatCard
              title="Avg Completion Rate"
              value={`${avgRate}%`}
              icon={TrendingUp}
              subtitle="All published"
            />
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Recent Walkthroughs */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">Recent Walkthroughs</h2>
                <Link
                  href="/walkthroughs"
                  className="text-xs font-medium text-brand-500 hover:text-brand-600"
                >
                  View all →
                </Link>
              </div>
              {recentWalkthroughs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No walkthroughs yet. Record one in NovaPay!
                </p>
              ) : (
                <div className="space-y-3">
                  {recentWalkthroughs.map((wt) => {
                    const def = wt.versions[0]?.definition;
                    return (
                      <Link
                        key={wt.id}
                        href={`/walkthroughs/${wt.id}`}
                        className="flex items-center justify-between rounded-lg border border-gray-100 p-3 transition hover:bg-gray-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {def?.title || 'Untitled'}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {def?.steps?.length ?? 0} steps ·{' '}
                            {new Date(wt.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <StatusBadge status={wt.status} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Health Overview */}
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">Health Overview</h2>
                <Link
                  href="/health"
                  className="text-xs font-medium text-brand-500 hover:text-brand-600"
                >
                  Details →
                </Link>
              </div>
              {health ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <HeartPulse className="h-10 w-10 text-brand-500" />
                    <div>
                      <p className="text-2xl font-extrabold">
                        {health.totalWalkthroughs}
                      </p>
                      <p className="text-xs text-gray-500">Monitored walkthroughs</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-emerald-50 p-3 text-center">
                      <p className="text-lg font-bold text-emerald-700">
                        {health.summary.healthy}
                      </p>
                      <p className="text-[10px] font-medium text-emerald-600">
                        Healthy
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3 text-center">
                      <p className="text-lg font-bold text-amber-700">
                        {health.summary.warning}
                      </p>
                      <p className="text-[10px] font-medium text-amber-600">
                        Warning
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3 text-center">
                      <p className="text-lg font-bold text-red-700">
                        {health.summary.critical}
                      </p>
                      <p className="text-[10px] font-medium text-red-600">
                        Critical
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-gray-400">
                  No health data available yet
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
