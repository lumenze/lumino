import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  gradient?: string;
  className?: string;
}

const DEFAULT_GRADIENT = 'from-brand-500 to-orange-500';

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  gradient = DEFAULT_GRADIENT,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5',
        `bg-gradient-to-br ${gradient}`,
        className
      )}
    >
      {/* Decorative circles */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/[0.08]" />
      <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-white/[0.06]" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/70">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">{value}</p>
          {subtitle && (
            <p className="mt-1.5 text-[11px] font-medium text-white/50">{subtitle}</p>
          )}
          {trend && (
            <p
              className={cn(
                'mt-1.5 text-xs font-bold',
                trend.positive ? 'text-emerald-300' : 'text-red-300'
              )}
            >
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur-sm">
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}
