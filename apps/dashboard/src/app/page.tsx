'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Route, CheckCircle, Eye, TrendingUp, HeartPulse, ArrowRight, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';

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
  const published = walkthroughs.filter((w) => w.status.toLowerCase() === 'published').length;
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
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight">Welcome back</h1>
          <Sparkles className="h-5 w-5 text-brand-500" />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s what&apos;s happening with your Lumino platform today
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Loading dashboard...
          </div>
        </div>
      ) : (
        <div className="animate-slide-up">
          {/* Stat Cards */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            <StatCard
              title="Total Walkthroughs"
              value={totalWalkthroughs}
              icon={Route}
              subtitle="All statuses"
              gradient="from-blue-600 to-blue-500"
            />
            <StatCard
              title="Published"
              value={published}
              icon={CheckCircle}
              subtitle="Live for customers"
              gradient="from-emerald-600 to-emerald-500"
            />
            <StatCard
              title="Total Completions"
              value={totalCompletions}
              icon={Eye}
              subtitle="Across all walkthroughs"
              gradient="from-violet-600 to-purple-500"
            />
            <StatCard
              title="Avg Completion Rate"
              value={`${avgRate}%`}
              icon={TrendingUp}
              subtitle="All published"
              gradient="from-brand-500 to-orange-500"
            />
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Recent Walkthroughs */}
            <div className="glass-card rounded-2xl p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-bold">Recent Walkthroughs</h2>
                <Link
                  href="/walkthroughs"
                  className="flex items-center gap-1 text-xs font-semibold text-brand-500 transition hover:text-brand-600"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {recentWalkthroughs.length === 0 ? (
                <div className="flex flex-col items-center py-10">
                  <Route className="mb-3 h-10 w-10 text-gray-200" />
                  <p className="text-sm text-gray-400">
                    No walkthroughs yet. Record one in NovaPay!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentWalkthroughs.map((wt) => {
                    const def = wt.versions[0]?.definition;
                    return (
                      <Link
                        key={wt.id}
                        href={`/walkthroughs/${wt.id}`}
                        className="group flex items-center justify-between rounded-xl border border-transparent p-3.5 transition-all duration-200 hover:border-gray-200 hover:bg-white hover:shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold group-hover:text-brand-600 transition-colors">
                            {def?.title || 'Untitled'}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">
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
            <div className="glass-card rounded-2xl p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-bold">Health Overview</h2>
                <Link
                  href="/health"
                  className="flex items-center gap-1 text-xs font-semibold text-brand-500 transition hover:text-brand-600"
                >
                  Details <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {health ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-orange-500 shadow-lg shadow-brand-500/20">
                      <HeartPulse className="h-7 w-7 text-white" />
                    </div>
                    <div>
                      <p className="text-3xl font-black tracking-tight">
                        {health.totalWalkthroughs}
                      </p>
                      <p className="text-xs text-gray-500">Monitored walkthroughs</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Healthy', count: health.summary.healthy, color: 'emerald' },
                      { label: 'Warning', count: health.summary.warning, color: 'amber' },
                      { label: 'Critical', count: health.summary.critical, color: 'red' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={cn(
                          'relative overflow-hidden rounded-xl p-4 text-center',
                          item.color === 'emerald' && 'bg-emerald-50',
                          item.color === 'amber' && 'bg-amber-50',
                          item.color === 'red' && 'bg-red-50'
                        )}
                      >
                        <p
                          className={cn(
                            'text-2xl font-black',
                            item.color === 'emerald' && 'text-emerald-700',
                            item.color === 'amber' && 'text-amber-700',
                            item.color === 'red' && 'text-red-700'
                          )}
                        >
                          {item.count}
                        </p>
                        <p
                          className={cn(
                            'text-[10px] font-semibold',
                            item.color === 'emerald' && 'text-emerald-600',
                            item.color === 'amber' && 'text-amber-600',
                            item.color === 'red' && 'text-red-600'
                          )}
                        >
                          {item.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-10">
                  <HeartPulse className="mb-3 h-10 w-10 text-gray-200" />
                  <p className="text-sm text-gray-400">
                    No health data available yet
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
