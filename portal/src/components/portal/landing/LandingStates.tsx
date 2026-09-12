import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Shared loading/error affordances for landing sections.
 *
 * Sections render skeletons (instead of returning null) while real data
 * loads, which avoids layout jumps, and offer an inline retry when the
 * public overview request fails — the section never silently disappears.
 */

export const LandingSectionSkeleton = ({
  rows = 1,
  className = '',
  minHeight = 'min-h-[280px]',
}: {
  rows?: number;
  className?: string;
  minHeight?: string;
}) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded-2xl border border-border/70 bg-surface/60 p-5 ${minHeight} ${className}`}
  >
    <div className="mb-4 h-3.5 w-28 rounded-full bg-muted" />
    <div className="mb-2.5 h-6 w-2/3 rounded-lg bg-muted" />
    <div className={`grid gap-3 ${rows > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="min-h-[150px] rounded-xl border border-border/60 bg-background/80" />
      ))}
    </div>
  </div>
);

export const LandingRetryBox = ({
  onRetry,
  messageAr = 'تعذر تحميل هذا الجزء حالياً.',
  messageEn = 'This section could not load right now.',
}: {
  onRetry: () => void;
  messageAr?: string;
  messageEn?: string;
}) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-10 text-center"
    >
      <p className="text-sm font-medium text-muted-foreground">{isRtl ? messageAr : messageEn}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/35 px-4 text-xs font-bold text-primary transition hover:bg-primary-soft/40"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {isRtl ? 'إعادة المحاولة' : 'Try again'}
      </button>
    </div>
  );
};
