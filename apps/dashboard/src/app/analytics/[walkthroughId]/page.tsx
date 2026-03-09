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
      <div className="flex h-96 items-center justify-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link
        href="/analytics"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to analytics
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Detailed analytics breakdown</p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="mb-8 grid grid-cols-5 gap-4">
          {[
            { label: 'Impressions', value: stats.impressions, color: 'blue' },
            { label: 'Starts', value: stats.starts, color: 'violet' },
            { label: 'Completions', value: stats.completions, color: 'emerald' },
            { label: 'Abandonments', value: stats.abandonments, color: 'red' },
            {
              label: 'Completion Rate',
              value: `${stats.completionRate}%`,
              color: 'brand',
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 bg-white p-4 text-center"
            >
              <p className={`text-2xl font-extrabold text-${card.color}-600`}>
                {typeof card.value === 'number'
                  ? card.value.toLocaleString()
                  : card.value}
              </p>
              <p className="mt-1 text-[10px] font-medium text-gray-500">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {summary ? (
        <div className="space-y-6">
          {/* Daily trend chart */}
          {summary.dailyBreakdown && summary.dailyBreakdown.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
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
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="impressions"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="starts"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="completions"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="abandonments"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Step drop-off funnel */}
          {summary.stepDropOff && summary.stepDropOff.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-bold">Step Drop-off</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={summary.stepDropOff.map((s) => ({
                    name:
                      s.stepTitle.length > 18
                        ? s.stepTitle.slice(0, 18) + '…'
                        : s.stepTitle,
                    dropOff: s.dropOffRate,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`${value}%`, 'Drop-off Rate']}
                  />
                  <Bar dataKey="dropOff" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Average time */}
          {summary.averageTimeToComplete > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="text-sm font-bold">Average Time to Complete</h2>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">
                {Math.round(summary.averageTimeToComplete)}s
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Average across all completed sessions
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-sm text-gray-400">
            No detailed analytics data available yet. Publish the walkthrough and let
            customers interact with it.
          </p>
        </div>
      )}
    </div>
  );
}
