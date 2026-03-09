import { cn } from '@/lib/utils';

const VARIANTS = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
  in_review: 'bg-amber-50 text-amber-700',
  healthy: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
} as const;

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = VARIANTS[status.toLowerCase() as keyof typeof VARIANTS] ?? VARIANTS.draft;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize',
        variant,
        className
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
