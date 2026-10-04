import React, { useState } from 'react';
import { Search, X, Loader } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';
import { useTranslation } from 'react-i18next';

/**
 * Enhanced Search Input component with debouncing
 */
const SearchInput = ({
    onSearch,
    placeholder = 'Search...',
    debounceMs = 300,
    className = '',
    showLoader = true,
    ariaLabel,
    clearLabel,
}) => {
    const { t } = useTranslation('common');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);

    // Effect to call onSearch when debounced value changes
    React.useEffect(() => {
        const performSearch = async () => {
            try {
                if (debouncedSearchTerm) {
                    setIsSearching(true);
                    await onSearch(debouncedSearchTerm);
                } else {
                    await onSearch('');
                }
            } finally {
                setIsSearching(false);
            }
        };

        performSearch();
    }, [debouncedSearchTerm, onSearch]);

    const handleClear = () => {
        setSearchTerm('');
        onSearch('');
    };

    return (
        <div className={`relative ${className}`}>
            {/* Search Icon */}
            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--VIARA-muted)]" />

            {/* Input */}
            <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-field)] py-3 pe-12 ps-12 text-[var(--VIARA-ink)] outline-none transition-all placeholder:text-[var(--VIARA-muted)] focus:border-[var(--VIARA-accent)] focus:ring-4 focus:ring-[rgba(var(--VIARA-accent-rgb),0.14)]"
                aria-label={ariaLabel || placeholder || t('actions.search')}
                aria-busy={isSearching || undefined}
            />

            {/* Loading or Clear Button */}
            <div className="absolute end-4 top-1/2 -translate-y-1/2">
                {isSearching && showLoader ? (
                    <Loader className="w-5 h-5 text-[var(--VIARA-accent)] animate-spin" />
                ) : searchTerm ? (
                    <button
                        onClick={handleClear}
                        className="p-1 hover:bg-[var(--VIARA-surface-hover)] rounded-full transition-colors text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]"
                        aria-label={clearLabel || t('topbar.search.clear')}
                    >
                        <X className="w-4 h-4" />
                    </button>
                ) : null}
            </div>
        </div>
    );
};

export default SearchInput;
