import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Shared pagination component.
 * Renders at most 7 page buttons with ellipsis for large ranges.
 *
 * @param {number}   currentPage   - 1-based current page index
 * @param {number}   pageCount     - total number of pages
 * @param {function} onPageChange  - called with the new page number
 * @param {boolean}  isRtl         - flip chevron direction for RTL layouts
 */
const Pagination = ({ currentPage, pageCount, onPageChange, isRtl = false }) => {
    if (!pageCount || pageCount <= 1) return null;

    const getVisiblePages = () => {
        if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
        if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', pageCount];
        if (currentPage >= pageCount - 3)
            return [1, '...', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', pageCount];
    };

    const btnBase =
        'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40';
    const activeBtn =
        'bg-teal-600 text-white shadow-sm shadow-teal-600/25 dark:bg-teal-500';
    const idleBtn =
        'border border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-700 dark:hover:bg-teal-950/30';
    const arrowBtn =
        'border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800';

    return (
        <nav
            aria-label="Pagination"
            className="flex items-center justify-center gap-1.5 py-3"
            dir={isRtl ? 'rtl' : 'ltr'}
        >
            <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`${btnBase} ${arrowBtn}`}
                aria-label="Previous page"
            >
                {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {getVisiblePages().map((page, i) =>
                page === '...' ? (
                    <span
                        key={`ellipsis-${i}`}
                        className="px-1 text-xs text-slate-400 select-none"
                        aria-hidden="true"
                    >
                        …
                    </span>
                ) : (
                    <button
                        key={page}
                        type="button"
                        onClick={() => onPageChange(page)}
                        aria-current={page === currentPage ? 'page' : undefined}
                        className={`${btnBase} ${page === currentPage ? activeBtn : idleBtn}`}
                    >
                        {page}
                    </button>
                )
            )}

            <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === pageCount}
                className={`${btnBase} ${arrowBtn}`}
                aria-label="Next page"
            >
                {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
        </nav>
    );
};

export default Pagination;
