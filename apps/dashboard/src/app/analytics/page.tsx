'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  Legend,
} from 'recharts';

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

  // Top 5 by completion rate for the bar chart
  const top5 = [...rows]
    .filter((r) => r.impressions > 0)
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5)
    .map((r) => ({
      name: r.title.length > 20 ? r.title.slice(0, 20) + '…' : r.title,
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
      className="cursor-pointer px-5 py-3 text-left text-xs font-semibold text-gray-500 select-none hover:text-gray-700"
    >
      {label} {sortKey === field ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Performance metrics across all walkthroughs
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Loading analytics...
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <p className="text-3xl font-extrabold text-blue-600">
                {totalImpressions.toLocaleString()}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">Total Impressions</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <p className="text-3xl font-extrabold text-violet-600">
                {totalStarts.toLocaleString()}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">Total Starts</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <p className="text-3xl font-extrabold text-emerald-600">
                {totalCompletions.toLocaleString()}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-500">Total Completions</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <p className="text-3xl font-extrabold text-brand-600">{avgRate}%</p>
              <p className="mt-1 text-xs font-medium text-gray-500">Avg Completion Rate</p>
            </div>
          </div>

          {/* Top 5 chart */}
          {top5.length > 0 && (
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
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
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number) => [`${value}%`, 'Completion Rate']}
                  />
                  <Bar dataKey="completionRate" fill="#E07A2F" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Full table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <SortHeader label="Walkthrough" field="title" />
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500">
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
                    className="border-b border-gray-50 transition hover:bg-gray-50"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/analytics/${r.id}`}
                        className="text-sm font-semibold text-brand-600 hover:underline"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {r.impressions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {r.starts.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {r.completions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold">{r.completionRate}%</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-sm text-gray-400"
                    >
                      No analytics data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
