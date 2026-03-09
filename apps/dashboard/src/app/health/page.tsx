'use client';

import { useEffect, useState } from 'react';
import { HeartPulse, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface HealthOverview {
  totalWalkthroughs: number;
  summary: { healthy: number; warning: number; critical: number; unchecked: number };
}

interface WalkthroughHealth {
  walkthroughId: string;
  walkthroughTitle: string;
  overallScore: number;
  status: string;
  lastCheckedAt: string;
  stepResults: Array<{
    stepIndex: number;
    stepTitle: string;
    status: string;
    score: number;
    issues: string[];
  }>;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; icon: typeof ShieldCheck }> = {
  healthy: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: ShieldCheck },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', icon: AlertTriangle },
  critical: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle },
  unchecked: { bg: 'bg-gray-50', text: 'text-gray-500', icon: HeartPulse },
};

export default function HealthPage() {
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [items, setItems] = useState<WalkthroughHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WalkthroughHealth | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [overviewRes, itemsRes] = await Promise.allSettled([
          api.get<{ data: HealthOverview }>('/health/apps/novapay-dashboard'),
          api.get<{ data: { items: WalkthroughHealth[] } }>(
            '/health/apps/novapay-dashboard/walkthroughs'
          ),
        ]);

        if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data);
        if (itemsRes.status === 'fulfilled') setItems(itemsRes.value.data.items);
      } catch (err) {
        console.error('Failed to load health:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function scoreColor(score: number) {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  }

  function scoreBg(score: number) {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Health Monitoring</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track walkthrough selector health and detect breakages
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Loading health data...
        </div>
      ) : (
        <>
          {/* Overview cards */}
          {overview && (
            <div className="mb-8 grid grid-cols-4 gap-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5">
                <HeartPulse className="h-10 w-10 text-brand-500" />
                <div>
                  <p className="text-2xl font-extrabold">{overview.totalWalkthroughs}</p>
                  <p className="text-xs text-gray-500">Monitored</p>
                </div>
              </div>
              {(['healthy', 'warning', 'critical'] as const).map((key) => {
                const cfg = STATUS_CONFIG[key];
                const Icon = cfg.icon;
                return (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center gap-4 rounded-xl border border-gray-200 p-5',
                      cfg.bg
                    )}
                  >
                    <Icon className={cn('h-8 w-8', cfg.text)} />
                    <div>
                      <p className={cn('text-2xl font-extrabold', cfg.text)}>
                        {overview.summary[key]}
                      </p>
                      <p className="text-xs capitalize text-gray-500">{key}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Walkthrough health grid */}
          {items.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {items.map((item) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.unchecked;
                const Icon = cfg.icon;
                return (
                  <button
                    key={item.walkthroughId}
                    onClick={() =>
                      setSelected(
                        selected?.walkthroughId === item.walkthroughId ? null : item
                      )
                    }
                    className={cn(
                      'rounded-xl border bg-white p-5 text-left transition hover:shadow-md',
                      selected?.walkthroughId === item.walkthroughId
                        ? 'border-brand-300 ring-2 ring-brand-100'
                        : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-5 w-5', cfg.text)} />
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                            cfg.bg,
                            cfg.text
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className={cn('text-xl font-extrabold', scoreColor(item.overallScore))}>
                        {item.overallScore}
                      </p>
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold">
                      {item.walkthroughTitle}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={cn('h-full rounded-full', scoreBg(item.overallScore))}
                        style={{ width: `${item.overallScore}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-gray-400">
                      Last checked{' '}
                      {new Date(item.lastCheckedAt).toLocaleDateString()}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
              <HeartPulse className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-400">
                No health data available yet. Health checks run automatically after
                walkthroughs are published.
              </p>
            </div>
          )}

          {/* Detail panel */}
          {selected && selected.stepResults && selected.stepResults.length > 0 && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-bold">
                Step Health — {selected.walkthroughTitle}
              </h2>
              <div className="space-y-3">
                {selected.stepResults.map((step) => {
                  const stepCfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.unchecked;
                  return (
                    <div
                      key={step.stepIndex}
                      className="flex items-start gap-4 rounded-lg border border-gray-100 p-4"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                        {step.stepIndex + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{step.stepTitle}</p>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                              stepCfg.bg,
                              stepCfg.text
                            )}
                          >
                            {step.status}
                          </span>
                          <span className={cn('text-xs font-bold', scoreColor(step.score))}>
                            {step.score}/100
                          </span>
                        </div>
                        {step.issues.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {step.issues.map((issue, idx) => (
                              <li
                                key={idx}
                                className="text-xs text-red-500"
                              >
                                {issue}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
