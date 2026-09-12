import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Search, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser } from '../../store/authSlice';
import { useGetPatientsQuery } from '../../store/api';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';
import { canAccessRoute, canAccessRouteTarget, getAccessibleNavigationTree, getSearchRoutes } from '../../config/routes';
import { confirmNavigation } from '../../utils/navigationGuard';

const destinations = getSearchRoutes();

const GlobalSearch = () => {
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);
    const { t } = useTranslation(['common', 'navigation']);
    const inputRef = useRef(null);
    const rootRef = useRef(null);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const canSearchPatients = canAccessRoute('/patients', user);
    const { data: patientResponse, isFetching } = useGetPatientsQuery(
        { search: debouncedQuery, limit: 6 },
        { skip: !canSearchPatients || debouncedQuery.length < 2 },
    );

    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
        const closeOnOutsideClick = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
                setMobileOpen(false);
            }
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => document.removeEventListener('mousedown', closeOnOutsideClick);
    }, []);

    const focusSearch = () => {
        setOpen(true);
        if (window.innerWidth < 768) setMobileOpen(true);
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    useKeyboardShortcut('k', focusSearch, { ctrl: true, ignoreInputs: false });
    useKeyboardShortcut('/', focusSearch, { ctrl: true, ignoreInputs: false });

    const moduleResults = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        if (!normalized) return [];
        const sections = getAccessibleNavigationTree(user).flatMap((route) => route.children);
        const accessibleDestinations = [...new Map([...destinations, ...sections].map((entry) => [entry.to, entry])).values()];
        return accessibleDestinations
            .filter(({ to }) => canAccessRouteTarget(to, user))
            .map(({ key, to }) => ({
                id: `module-${key}`,
                type: 'module',
                label: t(`items.${key}`, { ns: 'navigation' }),
                meta: t('topbar.search.module'),
                to,
            }))
            .filter((item) => item.label.toLocaleLowerCase().includes(normalized))
            .slice(0, 5);
    }, [query, t, user]);

    const patientResults = useMemo(() => (patientResponse?.data || []).map((patient) => ({
        id: `patient-${patient.patient_id}`,
        type: 'patient',
        label: `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.mrn,
        meta: patient.mrn,
        to: `/patients/${encodeURIComponent(patient.patient_id)}`,
    })), [patientResponse?.data]);

    const results = [...patientResults, ...moduleResults];
    const showResults = open && query.trim().length > 0;

    useEffect(() => { setActiveIndex(0); }, [query]);

    const selectResult = (result) => {
        if (!confirmNavigation()) return;
        navigate(result.to);
        setQuery('');
        setOpen(false);
        setMobileOpen(false);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            setOpen(false);
            setMobileOpen(false);
            inputRef.current?.blur();
        } else if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % results.length);
        } else if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault();
            setActiveIndex((current) => (current - 1 + results.length) % results.length);
        } else if (event.key === 'Enter' && results[activeIndex]) {
            event.preventDefault();
            selectResult(results[activeIndex]);
        }
    };

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={focusSearch}
                className="topbar-action topbar-action-idle flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm md:hidden"
                aria-label={t('topbar.search.open')}
            >
                <Search size={16} />
            </button>

            <div className={`${mobileOpen ? 'fixed inset-x-4 top-20 z-50 flex' : 'hidden'} items-center md:static md:flex md:w-full`}>
                <div className="group relative w-full">
                    <Search className="topbar-search-icon absolute start-3 top-1/2 -translate-y-1/2 transition-colors" size={15} />
                    <input
                        ref={inputRef}
                        type="search"
                        role="combobox"
                        aria-expanded={showResults}
                        aria-controls="global-search-results"
                        aria-autocomplete="list"
                        value={query}
                        onFocus={() => setOpen(true)}
                        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
                        onKeyDown={handleKeyDown}
                        placeholder={t('common.search_placeholder')}
                        className="topbar-search-input h-9 w-full rounded-2xl border ps-9 pe-20 text-[13px] shadow-none outline-none transition-all"
                    />
                    {query ? (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="topbar-search-clear absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg"
                            aria-label={t('topbar.search.clear')}
                        >
                            <X size={13} />
                        </button>
                    ) : (
                        <kbd className="topbar-search-kbd absolute end-2.5 top-1/2 hidden -translate-y-1/2 rounded-lg border px-1.5 py-0.5 text-[9px] font-black lg:block">⌘K</kbd>
                    )}
                </div>
            </div>

            {showResults && (
                <div id="global-search-results" role="listbox" className="topbar-search-results fixed inset-x-4 top-[8.25rem] z-50 max-h-[min(70vh,30rem)] overflow-y-auto rounded-2xl border p-2 backdrop-blur-xl md:absolute md:inset-x-0 md:top-14 md:w-full">
                    {isFetching && <p className="topbar-muted-copy px-3 py-2 text-xs font-semibold">{t('topbar.search.searching')}</p>}
                    {!isFetching && results.length === 0 && <p className="topbar-muted-copy px-4 py-8 text-center text-sm">{t('common.noResults')}</p>}
                    {results.map((result, index) => {
                        const Icon = result.type === 'patient' ? UserRound : Activity;
                        return (
                            <button
                                type="button"
                                role="option"
                                aria-selected={index === activeIndex}
                                key={result.id}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => selectResult(result)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition ${index === activeIndex ? 'topbar-search-option-active' : 'topbar-search-option-idle'}`}
                            >
                                <span className="topbar-search-result-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1">
                                    <Icon size={17} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold">{result.label}</span>
                                    <span className="topbar-muted-copy block truncate text-[11px] ltr-embed">{result.meta}</span>
                                </span>
                                <ArrowUpRight size={15} className="topbar-muted-copy" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
