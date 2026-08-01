import React from 'react';

interface SkeletonProps {
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
    return (
        <div
            className={`animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800/80 ${className}`}
            role="status"
            aria-label="Loading..."
        />
    );
};

export const CardSkeleton: React.FC = () => (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="pt-2 flex justify-end gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
    </div>
);

export const TableRowSkeleton: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
    <div className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-slate-800/60 px-4 space-x-4">
        {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-36' : i === 1 ? 'w-24' : 'w-16'}`} />
        ))}
    </div>
);

export const ReportSkeleton: React.FC = () => (
    <div className="space-y-6 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
        </div>
        <div className="pt-4 flex gap-3">
            <Skeleton className="h-10 w-28 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
    </div>
);
