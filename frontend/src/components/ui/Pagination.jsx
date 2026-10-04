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
const Pagination = ({
    currentPage,
    pageCount,
    onPageChange,
    isRtl = false,
    compact = false,
    ariaLabel,
    previousLabel,
    nextLabel,
    className = ''
}) => {
    if (!pageCount || pageCount <= 1) return null;

    const getVisiblePages = () => {
        if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
        if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', pageCount];
        if (currentPage >= pageCount - 3)
            return [1, '...', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', pageCount];
    };

    const btnBase =
        'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]';
    const activeBtn =
        'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-xs';
    const idleBtn =
        'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:border-[var(--VIARA-accent)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent-dark)] dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-muted)] dark:text-[var(--VIARA-ink)] dark:hover:border-[var(--VIARA-accent)] dark:hover:bg-[var(--VIARA-accent-soft)] dark:hover:text-[var(--VIARA-accent-text)]';
    const arrowBtn =
        'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-[var(--VIARA-line-strong)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] disabled:opacity-40 disabled:cursor-not-allowed dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-muted)] dark:text-[var(--VIARA-muted)] dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-[var(--VIARA-ink)]';

    return (
        <nav
            aria-label={ariaLabel || (isRtl ? 'ترقيم الصفحات' : 'Pagination')}
            className={`flex items-center justify-center gap-1.5 ${compact ? '' : 'py-3'} ${className}`}
            dir={isRtl ? 'rtl' : 'ltr'}
        >
            <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`${btnBase} ${arrowBtn}`}
                aria-label={previousLabel || (isRtl ? 'الصفحة السابقة' : 'Previous page')}
            >
                {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {getVisiblePages().map((page, i) =>
                page === '...' ? (
                    <span
                        key={`ellipsis-${i}`}
                        className="px-1 text-xs text-[var(--VIARA-muted)] select-none"
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
                aria-label={nextLabel || (isRtl ? 'الصفحة التالية' : 'Next page')}
            >
                {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
        </nav>
    );
};

export default Pagination;
