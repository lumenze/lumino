import { cn } from '@/lib/utils';

const VARIANTS: Record<string, { classes: string; dot?: string }> = {
  draft: { classes: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200' },
  published: {
    classes: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    dot: 'bg-emerald-500 animate-pulse-slow',
  },
  archived: { classes: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
  in_review: { classes: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  healthy: {
    classes: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  warning: {
    classes: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    dot: 'bg-amber-500',
  },
  critical: {
    classes: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    dot: 'bg-red-500 animate-pulse',
  },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status.toLowerCase().replace('_', '') as string;
  const variant =
    VARIANTS[status.toLowerCase() as keyof typeof VARIANTS] ??
    VARIANTS[key as keyof typeof VARIANTS] ??
    VARIANTS.draft;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize',
        variant.classes,
        className
      )}
    >
      {variant.dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', variant.dot)} />
      )}
      {status.toLowerCase().replace('_', ' ')}
    </span>
  );
}
