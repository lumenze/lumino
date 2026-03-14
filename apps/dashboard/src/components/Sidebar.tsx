'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Route,
  BarChart3,
  HeartPulse,
  Settings,
  Sparkles,
  ChevronDown,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/app-context';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/walkthroughs', label: 'Walkthroughs', icon: Route },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/health', label: 'Health', icon: HeartPulse },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { appId, setAppId, appIds, loading: appsLoading } = useApp();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-5">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 via-brand-500 to-orange-600 text-sm font-black text-white shadow-lg shadow-brand-500/30">
          L
          <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
        </div>
        <div>
          <div className="text-base font-bold text-white tracking-tight">Lumino</div>
          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
            <Sparkles className="h-2.5 w-2.5" />
            AI-Native DAP
          </div>
        </div>
      </div>

      {/* App Selector */}
      <div className="border-b border-white/[0.06] px-3 py-3">
        <label className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <Globe className="h-3 w-3" />
          Application
        </label>
        <div className="relative">
          <select
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            disabled={appsLoading || appIds.length === 0}
            className={cn(
              'w-full appearance-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 pr-8 text-xs font-medium text-slate-200 transition',
              'hover:bg-white/[0.06] focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {appsLoading ? (
              <option>Loading...</option>
            ) : appIds.length === 0 ? (
              <option>No apps found</option>
            ) : (
              appIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500" />
              )}
              <Icon className={cn('h-4 w-4', isActive && 'text-brand-400')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-xs font-bold text-white shadow-md shadow-violet-500/20">
            A
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-300">Admin</div>
            <div className="text-[10px] text-slate-500">admin@lumino.dev</div>
          </div>
        </div>
        <div className="mt-3 rounded-md bg-white/[0.04] px-2.5 py-1.5 text-center text-[10px] font-medium text-slate-500">
          Lumino v1.0 MVP
        </div>
      </div>
    </aside>
  );
}
