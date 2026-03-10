'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';

interface Walkthrough {
  id: string;
  appId: string;
  status: string;
  currentVersion: number;
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

interface WalkthroughRow {
  id: string;
  title: string;
  status: string;
  impressions: number;
  starts: number;
  completions: number;
  abandonments: number;
  completionRate: number;
}

type SortKey = 'title' | 'impressions' | 'starts' | 'completions' | 'completionRate';

export default function AnalyticsPage() {
  const [rows, setRows] = useState<WalkthroughRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('completions');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const wtRes = await api.get<{ data: { items: Walkthrough[] } }>(
          '/walkthroughs?appId=novapay-dashboard&limit=50'
        );
        const items = wtRes.data.items;

        const results: WalkthroughRow[] = [];
        await Promise.allSettled(
          items.map(async (wt) => {
            try {
              const s = await api.get<{ data: WalkthroughStats }>(
                `/analytics/walkthroughs/${wt.id}/stats`
              );
              results.push({
                id: wt.id,
                title: wt.versions[0]?.definition?.title || 'Untitled',
                status: wt.status,
                ...s.data,
              });
            } catch {
              results.push({
                id: wt.id,
                title: wt.versions[0]?.definition?.title || 'Untitled',
                status: wt.status,
                impressions: 0,
                starts: 0,
                completions: 0,
                abandonments: 0,
                completionRate: 0,
              });
            }
          })
        );
        setRows(results);
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const totalStarts = rows.reduce((s, r) => s + r.starts, 0);
  const totalCompletions = rows.reduce((s, r) => s + r.completions, 0);
  const avgRate =
    rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.completionRate, 0) / rows.length)
      : 0;

  const top5 = [...rows]
    .filter((r) => r.impressions > 0)
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5)
    .map((r) => ({
      name: r.title.length > 20 ? r.title.slice(0, 20) + '\u2026' : r.title,
      completionRate: r.completionRate,
      completions: r.completions,
    }));

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      onClick={() => handleSort(field)}
      className="cursor-pointer px-5 py-3.5 text-left text-xs font-semibold text-gray-500 select-none hover:text-gray-700 transition"
    >
      {label} {sortKey === field ? (sortAsc ? '\u2191' : '\u2193') : ''}
    </th>
  );

  const SUMMARY = [
    { label: 'Total Impressions', value: totalImpressions, gradient: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/20' },
    { label: 'Total Starts', value: totalStarts, gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/20' },
    { label: 'Total Completions', value: totalCompletions, gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/20' },
    { label: 'Avg Completion Rate', value: `${avgRate}%`, gradient: 'from-brand-500 to-orange-500', shadow: 'shadow-brand-500/20' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Performance metrics across all walkthroughs
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Loading analytics...
          </div>
        </div>
      ) : (
        <div className="animate-slide-up">
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            {SUMMARY.map((card) => (
              <div
                key={card.label}
                className={cn(
                  'relative overflow-hidden rounded-2xl p-5 text-center shadow-lg',
                  `bg-gradient-to-br ${card.gradient} ${card.shadow}`
                )}
              >
                <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/[0.08]" />
                <p className="relative text-3xl font-black text-white">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                </p>
                <p className="relative mt-1 text-xs font-medium text-white/70">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Top 5 chart */}
          {top5.length > 0 && (
            <div className="mb-8 glass-card rounded-2xl p-6">
              <h2 className="mb-4 text-sm font-bold">
                Top Walkthroughs by Completion Rate
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={top5} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value}%`, 'Completion Rate']}
                  />
                  <Bar dataKey="completionRate" fill="url(#brandGradient)" radius={[0, 6, 6, 0]} />
                  <defs>
                    <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#E07A2F" />
                      <stop offset="100%" stopColor="#FB923C" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Full table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white/80 backdrop-blur-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <SortHeader label="Walkthrough" field="title" />
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500">
                    Status
                  </th>
                  <SortHeader label="Impressions" field="impressions" />
                  <SortHeader label="Starts" field="starts" />
                  <SortHeader label="Completions" field="completions" />
                  <SortHeader label="Rate" field="completionRate" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-gray-50 transition hover:bg-brand-50/30"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/analytics/${r.id}`}
                        className="text-sm font-semibold text-brand-600 hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {r.impressions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {r.starts.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">
                      {r.completions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold">{r.completionRate}%</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <BarChart3 className="mx-auto mb-2 h-8 w-8 text-gray-200" />
                      <p className="text-sm text-gray-400">No analytics data yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
