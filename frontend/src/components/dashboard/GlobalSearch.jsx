import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Search, UserRound, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser } from '../../store/authSlice';
import { useGetPatientsQuery } from '../../store/api';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import { canAccessRoute, getSearchRoutes } from '../../config/routes';

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

    const canSearchPatients = hasDeveloperOrAdminRole(user?.role) || ['Receptionist', 'Radiologist', 'Nurse'].includes(user?.role);
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

    useKeyboardShortcut('k', focusSearch, { ctrl: true });
    useKeyboardShortcut('/', focusSearch, { ctrl: true });

    const moduleResults = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        if (!normalized) return [];
        return destinations
            .filter(({ to }) => canAccessRoute(to.split('?')[0], user?.role))
            .map(({ key, to }) => ({
                id: `module-${key}`,
                type: 'module',
                label: t(`items.${key}`, { ns: 'navigation' }),
                meta: t('topbar.search.module'),
                to,
            }))
            .filter((item) => item.label.toLocaleLowerCase().includes(normalized))
            .slice(0, 5);
    }, [query, t, user?.role]);

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
            <button type="button" onClick={focusSearch} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] dark:text-[var(--rcms-muted)] md:hidden" aria-label={t('topbar.search.open')}>
                <Search size={18} />
            </button>

            <div className={`${mobileOpen ? 'fixed inset-x-4 top-20 z-50 flex' : 'hidden'} items-center md:static md:flex md:w-full`}>
                <div className="group relative w-full">
                    <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-cyan-700" size={18} />
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
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-10 pe-20 text-sm text-slate-700 shadow-lg outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-field)] dark:text-[var(--rcms-ink)] dark:placeholder:text-slate-500 md:h-10 md:bg-slate-50/80 md:shadow-none md:focus:bg-white md:dark:bg-[var(--rcms-surface-raised)] md:dark:focus:bg-[var(--rcms-field)]"
                    />
                    {query ? (
                        <button type="button" onClick={() => setQuery('')} className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[var(--rcms-surface-hover)]" aria-label={t('topbar.search.clear')}><X size={15} /></button>
                    ) : (
                        <kbd className="absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] dark:text-[var(--rcms-muted)] lg:block">Ctrl K</kbd>
                    )}
                </div>
            </div>

            {showResults && (
                <div id="global-search-results" role="listbox" className="fixed inset-x-4 top-[8.25rem] z-50 max-h-[min(70vh,30rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-xl p-2 shadow-[0_24px_70px_-20px_rgba(15,23,42,.35)] dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]/95 md:absolute md:inset-x-0 md:top-14 md:w-full">
                    {isFetching && <p className="px-3 py-2 text-xs font-semibold text-slate-400">{t('topbar.search.searching')}</p>}
                    {!isFetching && results.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('common.noResults')}</p>}
                    {results.map((result, index) => {
                        const Icon = result.type === 'patient' ? UserRound : Activity;
                        return (
                            <button type="button" role="option" aria-selected={index === activeIndex} key={result.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectResult(result)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition ${index === activeIndex ? 'bg-cyan-50 text-cyan-950 dark:bg-cyan-400/12 dark:text-cyan-50' : 'text-slate-700 hover:bg-slate-50 dark:text-[var(--rcms-ink)] dark:hover:bg-[var(--rcms-surface-hover)]'}`}>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-700 shadow-sm ring-1 ring-slate-100 dark:bg-cyan-400/12 dark:text-cyan-200 dark:ring-cyan-300/20"><Icon size={17} /></span>
                                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{result.label}</span><span className="block truncate text-[11px] text-slate-400 dark:text-[var(--rcms-muted)] ltr-embed">{result.meta}</span></span>
                                <ArrowUpRight size={15} className="text-slate-300" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
