'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface WalkthroughStats {
  impressions: number;
  starts: number;
  completions: number;
  abandonments: number;
  completionRate: number;
}

interface AnalyticsSummary {
  period: string;
  totalImpressions: number;
  totalStarts: number;
  totalCompletions: number;
  totalAbandonments: number;
  completionRate: number;
  averageTimeToComplete: number;
  stepDropOff: Array<{ stepIndex: number; stepTitle: string; dropOffRate: number }>;
  dailyBreakdown: Array<{
    date: string;
    impressions: number;
    starts: number;
    completions: number;
    abandonments: number;
  }>;
}

interface WalkthroughInfo {
  id: string;
  versions: Array<{ definition: { title: string; description: string } }>;
}

const METRIC_CARDS: Array<{ key: keyof WalkthroughStats; label: string; gradient: string; shadow: string; suffix?: string }> = [
  { key: 'impressions', label: 'Impressions', gradient: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/20' },
  { key: 'starts', label: 'Starts', gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/20' },
  { key: 'completions', label: 'Completions', gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/20' },
  { key: 'abandonments', label: 'Abandonments', gradient: 'from-red-500 to-red-600', shadow: 'shadow-red-500/20' },
  { key: 'completionRate', label: 'Completion Rate', gradient: 'from-brand-500 to-orange-500', shadow: 'shadow-brand-500/20', suffix: '%' },
];

export default function AnalyticsDetailPage() {
  const params = useParams();
  const walkthroughId = params.walkthroughId as string;

  const [info, setInfo] = useState<WalkthroughInfo | null>(null);
  const [stats, setStats] = useState<WalkthroughStats | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [infoRes, statsRes, summaryRes] = await Promise.allSettled([
          api.get<{ data: WalkthroughInfo }>(`/walkthroughs/${walkthroughId}`),
          api.get<{ data: WalkthroughStats }>(
            `/analytics/walkthroughs/${walkthroughId}/stats`
          ),
          api.get<{ data: AnalyticsSummary }>(
            `/analytics/walkthroughs/${walkthroughId}/summary?period=30d`
          ),
        ]);

        if (infoRes.status === 'fulfilled') setInfo(infoRes.value.data);
        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data);
      } catch (err) {
        console.error('Failed to load analytics detail:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [walkthroughId]);

  const title = info?.versions[0]?.definition?.title || 'Walkthrough';

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

  return (
    <div className="p-8">
      <Link
        href="/analytics"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to analytics
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Detailed analytics breakdown</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="mb-8 grid grid-cols-5 gap-4 animate-slide-up">
          {METRIC_CARDS.map((card) => {
            const value = stats[card.key as keyof WalkthroughStats];
            return (
              <div
                key={card.key}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.gradient} p-4 text-center shadow-lg ${card.shadow}`}
              >
                <div className="absolute -right-2 -top-2 h-14 w-14 rounded-full bg-white/[0.08]" />
                <p className="relative text-2xl font-black text-white">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                  {card.suffix || ''}
                </p>
                <p className="relative mt-1 text-[10px] font-medium text-white/70">{card.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {summary ? (
        <div className="space-y-6 animate-fade-in">
          {/* Daily trend chart */}
          {summary.dailyBreakdown && summary.dailyBreakdown.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="mb-4 text-sm font-bold">Daily Trend (Last 30 Days)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={summary.dailyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d: string) =>
                      new Date(d).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    }
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="starts" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completions" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="abandonments" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Step drop-off funnel */}
          {summary.stepDropOff && summary.stepDropOff.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="mb-4 text-sm font-bold">Step Drop-off</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={summary.stepDropOff.map((s) => ({
                    name: s.stepTitle.length > 18 ? s.stepTitle.slice(0, 18) + '\u2026' : s.stepTitle,
                    dropOff: s.dropOffRate,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value}%`, 'Drop-off Rate']}
                  />
                  <Bar dataKey="dropOff" fill="url(#redGradient)" radius={[6, 6, 0, 0]} />
                  <defs>
                    <linearGradient id="redGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#f87171" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Average time */}
          {summary.averageTimeToComplete > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-sm font-bold">Average Time to Complete</h2>
              <p className="mt-2 text-3xl font-black tracking-tight text-gray-900">
                {Math.round(summary.averageTimeToComplete)}s
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Average across all completed sessions
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card flex flex-col items-center rounded-2xl py-16">
          <p className="text-sm text-gray-400">
            No detailed analytics data available yet. Publish the walkthrough and let
            customers interact with it.
          </p>
        </div>
      )}
    </div>
  );
}
