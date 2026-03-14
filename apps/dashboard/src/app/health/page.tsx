'use client';

import { useEffect, useState } from 'react';
import { HeartPulse, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
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

const STATUS_CONFIG: Record<string, { gradient: string; shadow: string; text: string; icon: typeof ShieldCheck }> = {
  healthy: { gradient: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/20', text: 'text-emerald-700', icon: ShieldCheck },
  warning: { gradient: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/20', text: 'text-amber-700', icon: AlertTriangle },
  critical: { gradient: 'from-red-500 to-red-600', shadow: 'shadow-red-500/20', text: 'text-red-700', icon: XCircle },
  unchecked: { gradient: 'from-gray-400 to-gray-500', shadow: 'shadow-gray-400/20', text: 'text-gray-500', icon: HeartPulse },
};

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

export default function HealthPage() {
  const { appId } = useApp();
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [items, setItems] = useState<WalkthroughHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WalkthroughHealth | null>(null);

  useEffect(() => {
    if (!appId) return;
    async function load() {
      try {
        setLoading(true);
        const encodedAppId = encodeURIComponent(appId);
        const [overviewRes, itemsRes] = await Promise.allSettled([
          api.get<{ data: HealthOverview }>(`/health/apps/${encodedAppId}`),
          api.get<{ data: { items: WalkthroughHealth[] } }>(
            `/health/apps/${encodedAppId}/walkthroughs`
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
  }, [appId]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight">Health Monitoring</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track walkthrough selector health and detect breakages
        </p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            Loading health data...
          </div>
        </div>
      ) : (
        <div className="animate-slide-up">
          {/* Overview cards */}
          {overview && (
            <div className="mb-8 grid grid-cols-4 gap-4">
              <div className="glass-card flex items-center gap-4 rounded-2xl p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 shadow-lg shadow-brand-500/20">
                  <HeartPulse className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-black">{overview.totalWalkthroughs}</p>
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
                      'relative overflow-hidden rounded-2xl p-5 shadow-lg',
                      `bg-gradient-to-br ${cfg.gradient} ${cfg.shadow}`
                    )}
                  >
                    <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/[0.08]" />
                    <div className="relative flex items-center gap-3">
                      <Icon className="h-6 w-6 text-white/80" />
                      <div>
                        <p className="text-2xl font-black text-white">
                          {overview.summary[key]}
                        </p>
                        <p className="text-xs font-medium capitalize text-white/70">{key}</p>
                      </div>
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
                      'glass-card rounded-2xl p-5 text-left transition-all duration-200',
                      selected?.walkthroughId === item.walkthroughId
                        ? 'ring-2 ring-brand-400 shadow-lg'
                        : 'hover:shadow-md hover:-translate-y-0.5'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', cfg.text)} />
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                            item.status === 'healthy' && 'bg-emerald-50 text-emerald-700',
                            item.status === 'warning' && 'bg-amber-50 text-amber-700',
                            item.status === 'critical' && 'bg-red-50 text-red-700',
                            !['healthy', 'warning', 'critical'].includes(item.status) && 'bg-gray-100 text-gray-500'
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                      <ScoreRing score={item.overallScore} size={56} />
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold">
                      {item.walkthroughTitle}
                    </p>
                    <p className="mt-2 text-[10px] text-gray-400">
                      Last checked{' '}
                      {new Date(item.lastCheckedAt).toLocaleDateString()}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="glass-card flex flex-col items-center rounded-2xl py-16">
              <HeartPulse className="mb-3 h-12 w-12 text-gray-200" />
              <p className="text-sm font-medium text-gray-400">
                No health data available yet
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Health checks run automatically after walkthroughs are published
              </p>
            </div>
          )}

          {/* Detail panel */}
          {selected && selected.stepResults && selected.stepResults.length > 0 && (
            <div className="mt-6 glass-card rounded-2xl p-6 animate-fade-in">
              <h2 className="mb-4 text-sm font-bold">
                Step Health — {selected.walkthroughTitle}
              </h2>
              <div className="space-y-3">
                {selected.stepResults.map((step) => {
                  const scoreColor = step.score >= 80 ? 'text-emerald-600' : step.score >= 50 ? 'text-amber-600' : 'text-red-600';
                  return (
                    <div
                      key={step.stepIndex}
                      className="flex items-start gap-4 rounded-xl border border-gray-100 p-4 transition hover:bg-gray-50/50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 text-xs font-bold text-gray-600">
                        {step.stepIndex + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{step.stepTitle}</p>
                          <span className={cn('text-xs font-bold', scoreColor)}>
                            {step.score}/100
                          </span>
                        </div>
                        {step.issues.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {step.issues.map((issue, idx) => (
                              <li key={idx} className="text-xs text-red-500">
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
        </div>
      )}
    </div>
  );
}
