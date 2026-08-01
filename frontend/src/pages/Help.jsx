import React, { useMemo, useState } from 'react';
import {
    Activity, BarChart3, BookOpen, CalendarDays, CheckCircle2, ChevronDown, HelpCircle,
    ClipboardList, Copy, CreditCard, FileText, HardDrive, Keyboard, LifeBuoy, Megaphone,
    Search, Settings, ShieldCheck, Stethoscope, Users, Wifi, WifiOff, Wrench, X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../store/authSlice';
import PageHeader from '../components/ui/PageHeader';

const ALL_STAFF = ['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing'];
const ARTICLES = [
    { id: 'start', category: 'gettingStarted', icon: BookOpen, roles: ALL_STAFF, route: '/dashboard', keywords: 'dashboard navigation profile search', steps: 3 },
    { id: 'patients', category: 'operations', icon: Users, roles: ['Admin', 'Receptionist', 'Radiologist', 'Nurse'], route: '/patients', keywords: 'patient registration search mrn duplicates', steps: 4 },
    { id: 'appointments', category: 'operations', icon: CalendarDays, roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse'], route: '/appointments', keywords: 'booking scheduler reschedule no show waitlist', steps: 4 },
    { id: 'payments', category: 'operations', icon: CreditCard, roles: ['Admin', 'Receptionist', 'Cashier', 'Accountant'], route: '/reception', keywords: 'cashier payment shift invoice refund discount', steps: 4 },
    { id: 'worklist', category: 'clinical', icon: ClipboardList, roles: ['Admin', 'Radiologist', 'Technician', 'Nurse'], route: '/worklist', keywords: 'worklist queue scheduler modality preparation', steps: 4 },
    { id: 'reporting', category: 'clinical', icon: Stethoscope, roles: ['Admin', 'Radiologist'], route: '/worklist', keywords: 'report findings impression template finalize amend word pdf', steps: 5 },
    { id: 'insurance', category: 'operations', icon: FileText, roles: ['Admin', 'Receptionist', 'Accountant', 'Insurance_Staff'], route: '/insurance', keywords: 'insurance claim approval rejection coverage', steps: 4 },
    { id: 'analytics', category: 'administration', icon: BarChart3, roles: ['Admin', 'Accountant', 'Marketing'], route: '/analytics', keywords: 'analytics revenue volume performance export trends referral', steps: 4 },
    { id: 'marketing', category: 'operations', icon: Megaphone, roles: ['Admin', 'Receptionist', 'HR', 'Marketing'], route: '/marketing', keywords: 'crm campaign feedback segments loyalty activities follow up', steps: 4 },
    { id: 'equipment', category: 'operations', icon: Wrench, roles: ['Admin', 'Technician'], route: '/equipment', keywords: 'equipment maintenance downtime contract modality asset readiness', steps: 4 },
    { id: 'pacs', category: 'clinical', icon: HardDrive, roles: ['Admin', 'Radiologist', 'Technician'], route: '/pacs/reconciliation', keywords: 'pacs dicom reconciliation images study accession viewer orthanc', steps: 4 },
    { id: 'roles', category: 'administration', icon: ShieldCheck, roles: ['Admin'], route: '/settings?tab=roles', keywords: 'roles permissions access security users', steps: 4 },
    { id: 'settings', category: 'account', icon: Settings, roles: ALL_STAFF, route: '/settings', keywords: 'settings appearance preferences language timezone password', steps: 3 },
    { id: 'troubleshooting', category: 'account', icon: LifeBuoy, roles: ALL_STAFF, route: null, keywords: 'error refresh browser cache access denied offline support', steps: 4 }
];
const CATEGORIES = ['all', 'gettingStarted', 'operations', 'clinical', 'administration', 'account'];
const articleVisibleForRole = (article, role) => (
    article.roles.includes(role) || (role === 'Developer' && article.roles.includes('Admin'))
);

const Help = () => {
    const { t, i18n } = useTranslation('help');
    const user = useSelector(selectCurrentUser);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [expanded, setExpanded] = useState(null);
    const role = user?.role || 'Staff';
    const isOnline = navigator.onLine;
    const visibleArticles = useMemo(() => {
        const query = search.trim().toLowerCase();
        return ARTICLES.filter((article) => articleVisibleForRole(article, role))
            .filter((article) => category === 'all' || article.category === category)
            .filter((article) => !query || `${t(`articles.${article.id}.title`)} ${t(`articles.${article.id}.description`)} ${article.keywords}`.toLowerCase().includes(query));
    }, [category, role, search, t]);
    const availableCategories = CATEGORIES.filter((item) => item === 'all' || ARTICLES.some((article) => article.category === item && articleVisibleForRole(article, role)));
    const quickLinks = ARTICLES.filter((article) => articleVisibleForRole(article, role) && article.route).slice(0, 4);
    const roleArticleCount = ARTICLES.filter((article) => articleVisibleForRole(article, role)).length;

    const copyDiagnostics = async () => {
        const diagnostics = [
            `RCMS role: ${role}`,
            `Language: ${i18n.language}`,
            `Online: ${navigator.onLine}`,
            `Browser: ${navigator.userAgent}`,
            `Time: ${new Date().toISOString()}`
        ].join('\n');
        try { await navigator.clipboard.writeText(diagnostics); toast.success(t('support.copied')); }
        catch { toast.error(t('support.copyFailed')); }
    };

    return (
        <div className="mx-auto max-w-[1480px] space-y-6 pb-12">
            <PageHeader
                icon={HelpCircle}
                eyebrow={t('eyebrow')}
                title={t('title')}
                description={t('description', { role: t(`roles.${role}`, { defaultValue: role }) })}
                meta={
                    <>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><ShieldCheck size={13} className="text-teal-600 dark:text-teal-300" />{t('roleGuide', { role: t(`roles.${role}`, { defaultValue: role }) })}</span>
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold ${isOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'}`}>{isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}{isOnline ? t('online') : t('offline')}</span>
                    </>
                }
                actions={
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800"><label className="relative block"><Search size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchLabel')} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white ps-11 pe-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />{search && <button type="button" onClick={() => setSearch('')} aria-label={t('clearSearch')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X size={14} /></button>}</label></div>
                }
            />

            <section className="grid gap-3 sm:grid-cols-3" aria-label={t('summary.label')}>
                <SummaryCard icon={BookOpen} label={t('summary.guides')} value={roleArticleCount} detail={t('summary.guidesDetail')} />
                <SummaryCard icon={ShieldCheck} label={t('summary.role')} value={t(`roles.${role}`, { defaultValue: role })} detail={t('summary.roleDetail')} />
                <SummaryCard icon={isOnline ? Wifi : WifiOff} label={t('summary.connection')} value={isOnline ? t('onlineShort') : t('offlineShort')} detail={isOnline ? t('summary.onlineDetail') : t('summary.offlineDetail')} tone={isOnline ? 'emerald' : 'amber'} />
            </section>

            <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-900 dark:text-white">{t('quick.title')}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('quick.description')}</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickLinks.map((article) => <Link key={article.id} to={article.route} className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--rcms-accent)] dark:hover:border-[var(--rcms-accent)] hover:shadow-md"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--rcms-accent-soft)] text-[var(--rcms-accent-dark)]"><article.icon size={19} /></span><span className="min-w-0"><strong className="block truncate text-sm text-slate-800 dark:text-slate-200">{t(`articles.${article.id}.title`)}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-400">{t('quick.openWorkspace')}</span></span></Link>)}</div></section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] shadow-sm">
                    <div className="border-b border-slate-100 dark:border-slate-800 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-slate-900 dark:text-white">{t('guides.title')}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('guides.count', { count: visibleArticles.length })}</p></div><div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 p-1">{availableCategories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[10px] font-black transition ${category === item ? 'bg-white dark:bg-[#0b1426] text-[var(--rcms-accent-dark)] dark:text-[var(--rcms-accent)] shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>{t(`categories.${item}`)}</button>)}</div></div></div>
                    {visibleArticles.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><Search size={28} className="text-slate-300 dark:text-slate-600" /><p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-300">{t('empty.title')}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('empty.description')}</p><button type="button" onClick={() => { setSearch(''); setCategory('all'); }} className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-black text-slate-600 dark:text-slate-300">{t('empty.reset')}</button></div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{visibleArticles.map((article) => { const open = expanded === article.id; return <article key={article.id}><button type="button" onClick={() => setExpanded(open ? null : article.id)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-start hover:bg-slate-50 dark:hover:bg-slate-900/50 sm:p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"><article.icon size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800 dark:text-slate-200">{t(`articles.${article.id}.title`)}</strong><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{t(`articles.${article.id}.description`)}</span><span className="mt-2 inline-flex rounded-full bg-[var(--rcms-accent-soft)] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--rcms-accent-dark)]">{t(`categories.${article.category}`)}</span></span><ChevronDown size={18} className={`mt-2 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-5 sm:px-5 sm:ps-[76px]"><ol className="space-y-3">{Array.from({ length: article.steps }, (_, index) => <li key={index} className="flex gap-3 text-xs leading-5 text-slate-700 dark:text-slate-300"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--rcms-accent)] text-[9px] font-black text-white">{index + 1}</span><span>{t(`articles.${article.id}.steps.${index}`)}</span></li>)}</ol>{article.route && <Link to={article.route} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--rcms-accent-dark)] px-4 text-xs font-black text-white"><Activity size={14} />{t('guides.open')}</Link>}</div>}</article>; })}</div>}
                </div>

                <aside className="space-y-5">
                    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] p-5 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400"><Keyboard size={19} /></span><div><h2 className="text-sm font-black text-slate-900 dark:text-white">{t('shortcuts.title')}</h2><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{t('shortcuts.description')}</p></div></div><div className="mt-4 space-y-2">{[['Ctrl K', 'search'], ['?', 'help'], ['Esc', 'close'], ['Ctrl S', 'save']].map(([keys, label]) => <div key={keys} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5"><span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{t(`shortcuts.${label}`)}</span><kbd className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 shadow-sm">{keys}</kbd></div>)}</div></section>
                    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] p-5 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"><LifeBuoy size={19} /></span><div><h2 className="text-sm font-black text-slate-900 dark:text-white">{t('support.title')}</h2><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{t('support.description')}</p></div></div><div className="mt-4 rounded-xl border border-amber-100 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3 text-[11px] leading-5 text-amber-900 dark:text-amber-300">{t('support.admin')}</div><button type="button" onClick={copyDiagnostics} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"><Copy size={14} />{t('support.copy')}</button></section>
                    <section className="rounded-3xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-5"><div className="flex items-center gap-2 text-sm font-black text-emerald-900 dark:text-emerald-400"><CheckCircle2 size={17} />{t('safety.title')}</div><p className="mt-2 text-[11px] leading-5 text-emerald-800 dark:text-emerald-300">{t('safety.description')}</p></section>
                </aside>
            </section>
        </div>
    );
};

const SummaryCard = ({ icon: Icon, label, value, detail, tone = 'cyan' }) => {
    const tones = {
        cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
    };
    return (
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0b1426]">
            <div className="flex items-start gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.cyan}`}><Icon size={19} /></span>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">{label}</p>
                    <p className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">{value}</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
                </div>
            </div>
        </article>
    );
};

export default Help;
