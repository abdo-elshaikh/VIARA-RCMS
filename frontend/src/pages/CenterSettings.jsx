import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Building,
    Building2,
    CalendarClock,
    CheckCircle2,
    Clock3,
    FileText,
    Hash,
    Image,
    Mail,
    MapPin,
    Phone,
    RefreshCw,
    RotateCcw,
    Save
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useGetCenterSettingsQuery, useUpdateCenterSettingsMutation } from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { normalizeCenterSettings } from '../utils/centerSettings';
import PageHeader from '../components/ui/PageHeader';

const DEFAULT_HOURS = { start: 6, end: 22, holidays: [] };

const normalizeSettings = (settings = {}) => {
    const normalized = normalizeCenterSettings(settings);
    const hours = settings.working_hours || DEFAULT_HOURS;
    return {
        center_name: normalized.center_name,
        branch_name: normalized.branch_name,
        logo_url: normalized.logo_url,
        contact_person: normalized.contact_person,
        other_details: normalized.other_details,
        tax_id: normalized.tax_id,
        phone: normalized.phone,
        email: normalized.email,
        address: normalized.address,
        invoice_prefix: normalized.invoice_prefix,
        report_header: normalized.report_header,
        report_footer: normalized.report_footer,
        working_hours: {
            start: hours.start ?? DEFAULT_HOURS.start,
            end: hours.end ?? DEFAULT_HOURS.end,
            holidays: Array.isArray(hours.holidays) ? hours.holidays : []
        },
        print_settings: normalized.print_settings,
        homepage_settings: normalized.homepage_settings
    };
};

const CenterSettings = ({ embedded = false }) => {
    const { t } = useTranslation('facilitySettings');
    const settingsQuery = useGetCenterSettingsQuery();
    const [updateSettings, updateState] = useUpdateCenterSettingsMutation();
    const [form, setForm] = useState(() => normalizeSettings());
    const [savedForm, setSavedForm] = useState(() => normalizeSettings());
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-700 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`,
        style: { transitionDelay: `${delay}ms` },
    });

    useEffect(() => {
        if (!settingsQuery.data) return;
        const next = normalizeSettings(settingsQuery.data);
        setForm(next);
        setSavedForm(next);
    }, [settingsQuery.data]);

    const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
    const hoursValid = Number(form.working_hours.start) >= 0
        && Number(form.working_hours.start) <= 23
        && Number(form.working_hours.end) >= 0
        && Number(form.working_hours.end) <= 23;

    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
    const setHour = (field, value) => setForm((current) => ({
        ...current,
        working_hours: { ...current.working_hours, [field]: Number(value) }
    }));
    const handleLogoUpload = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('messages.logoImageOnly', { defaultValue: 'Choose an image file for the logo.' }));
            return;
        }
        if (file.size > 300000) {
            toast.error(t('messages.logoTooLarge', { defaultValue: 'Logo image must be smaller than 300 KB.' }));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setField('logo_url', reader.result);
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const reset = () => setForm(savedForm);

    const handleSave = async (event) => {
        event.preventDefault();
        if (!hoursValid) return;
        try {
            const updated = await updateSettings(form).unwrap();
            const next = normalizeSettings(updated || form);
            setForm(next);
            setSavedForm(next);
            toast.success(t('messages.saved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.saveFailed')));
        }
    };

    if (settingsQuery.isLoading) return <SettingsLoading label={t('states.loading')} />;
    if (settingsQuery.isError && !settingsQuery.data) return <SettingsError title={t('states.errorTitle')} description={t('states.errorDescription')} retry={t('actions.retry')} onRetry={settingsQuery.refetch} />;

    return (
        <div className="space-y-6">
            {!embedded && (
                <PageHeader
                    icon={Building2}
                    eyebrow={t('header.eyebrow')}
                    title={t('header.title')}
                    description={t('header.description')}
                    actions={
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <HeaderSignal icon={Building2} label={t('header.signals.identity')} />
                            <HeaderSignal icon={CalendarClock} label={t('header.signals.operations')} />
                        </div>
                    }
                />
            )}

            {settingsQuery.isError ? (
                <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
                    <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={18} /><div><p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('states.refreshError')}</p><p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400/80">{t('states.showingSaved')}</p></div></div>
                    <button type="button" onClick={settingsQuery.refetch} className="shrink-0 rounded-lg border border-amber-200 bg-white p-2 text-amber-800 dark:border-amber-900/40 dark:bg-slate-900 dark:text-amber-300" aria-label={t('actions.retry')}><RefreshCw size={16} /></button>
                </div>
            ) : null}

            <form onSubmit={handleSave} style={reveal(80).style} className={`grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)] ${reveal(80).className}`}>
                <aside className="space-y-3 lg:sticky lg:top-6">
                    <nav className="rounded-xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-2" aria-label={t('navigation.label')}>
                        <SectionLink href="#facility-profile" icon={Building2} label={t('navigation.profile')} />
                        <SectionLink href="#operating-hours" icon={Clock3} label={t('navigation.hours')} />
                    </nav>
                    <div className="rounded-xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('status.title')}</p>
                        <div className="mt-3 flex items-center gap-2 text-sm font-semibold" aria-live="polite">
                            {dirty ? <><span className="h-2.5 w-2.5 rounded-full bg-amber-405 animate-pulse" /><span className="text-amber-700 dark:text-amber-300">{t('status.unsaved')}</span></> : <><CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /><span className="text-emerald-700 dark:text-emerald-300">{t('status.saved')}</span></>}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{dirty ? t('status.unsavedHelp') : t('status.savedHelp')}</p>
                    </div>
                </aside>

                <div className="min-w-0 space-y-5">
                    <SettingsSection id="facility-profile" icon={Building2} title={t('profile.title')} description={t('profile.description')}>
                        <div className="grid gap-5 md:grid-cols-2">
                            <Field label={t('fields.centerName')} hint={t('fields.centerNameHint')} required icon={Building2}>
                                <input id="center-name" type="text" required maxLength={200} value={form.center_name} onChange={(event) => setField('center_name', event.target.value)} className="input-field w-full text-base font-bold" autoComplete="organization" />
                            </Field>
                            <Field label={t('fields.branchName')} hint={t('fields.branchNameHint')} icon={Building}>
                                <input id="branch-name" type="text" maxLength={200} value={form.branch_name} onChange={(event) => setField('branch_name', event.target.value)} className="input-field w-full text-base" />
                            </Field>
                            <Field className="md:col-span-2" label={t('fields.logoUrl')} hint={t('fields.logoUrlHint')} icon={Image}>
                                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
                                    <div className="flex h-24 w-28 items-center justify-center rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                                        {form.logo_url ? (
                                            <img src={form.logo_url} alt={t('fields.logoPreview')} className="max-h-full max-w-full object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} onLoad={(event) => { event.currentTarget.style.display = 'block'; }} />
                                        ) : (
                                            <Image size={28} className="text-slate-300" aria-hidden="true" />
                                        )}
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <input id="logo-url" type="text" value={form.logo_url} onChange={(event) => setField('logo_url', event.target.value)} className="input-field w-full" placeholder="https://example.com/logo.png or uploaded image data" />
                                        <div className="flex flex-wrap gap-2">
                                            <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                                                {t('fields.uploadLogo', { defaultValue: 'Upload logo' })}
                                                <input type="file" accept="image/*" onChange={handleLogoUpload} className="sr-only" />
                                            </label>
                                            {form.logo_url ? (
                                                <button type="button" onClick={() => setField('logo_url', '')} className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                                    {t('fields.removeLogo', { defaultValue: 'Remove' })}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </Field>
                            <Field label={t('fields.taxId')} hint={t('fields.taxIdHint')} icon={Hash}>
                                <input id="tax-id" type="text" maxLength={50} value={form.tax_id} onChange={(event) => setField('tax_id', event.target.value)} className="input-field w-full font-mono" />
                            </Field>
                            <Field label={t('fields.contactPerson')} hint={t('fields.contactPersonHint')} icon={Phone}>
                                <input id="contact-person" type="text" maxLength={200} value={form.contact_person} onChange={(event) => setField('contact_person', event.target.value)} className="input-field w-full" />
                            </Field>
                            <Field label={t('fields.phone')} icon={Phone}>
                                <input id="facility-phone" type="tel" maxLength={30} value={form.phone} onChange={(event) => setField('phone', event.target.value)} className="input-field w-full" autoComplete="tel" />
                            </Field>
                            <Field label={t('fields.email')} icon={Mail}>
                                <input id="facility-email" type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} className="input-field w-full" autoComplete="email" />
                            </Field>
                            <Field className="md:col-span-2" label={t('fields.address')} icon={MapPin} counter={`${form.address.length}/500`}>
                                <textarea id="facility-address" maxLength={500} value={form.address} onChange={(event) => setField('address', event.target.value)} className="input-field min-h-24 w-full resize-y" rows={3} autoComplete="street-address" />
                            </Field>
                            <Field className="md:col-span-2" label={t('fields.otherDetails')} hint={t('fields.otherDetailsHint')} icon={FileText}>
                                <textarea id="other-details" value={form.other_details} onChange={(event) => setField('other_details', event.target.value)} className="input-field min-h-24 w-full resize-y" rows={3} />
                            </Field>
                        </div>
                    </SettingsSection>

                    <SettingsSection id="operating-hours" icon={CalendarClock} title={t('hours.title')} description={t('hours.description')}>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={t('hours.open')} hint={t('hours.hourHint')} icon={Clock3}>
                                <input id="opening-hour" type="number" min={0} max={23} required value={form.working_hours.start} onChange={(event) => setHour('start', event.target.value)} className="input-field w-full font-mono text-lg font-bold" aria-describedby="hours-validation" />
                            </Field>
                            <Field label={t('hours.close')} hint={t('hours.hourHint')} icon={Clock3}>
                                <input id="closing-hour" type="number" min={0} max={23} required value={form.working_hours.end} onChange={(event) => setHour('end', event.target.value)} className="input-field w-full font-mono text-lg font-bold" aria-describedby="hours-validation" />
                            </Field>
                        </div>
                        {!hoursValid ? <p id="hours-validation" role="alert" className="mt-3 flex items-center gap-2 text-sm font-bold text-rose-700"><AlertTriangle size={16} />{t('hours.invalid')}</p> : null}
                        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('hours.window')}</p><p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatHour(form.working_hours.start)} <span className="mx-2 text-slate-400">-</span> {formatHour(form.working_hours.end)}</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{t('hours.duration', { count: calculateDuration(form.working_hours.start, form.working_hours.end) })}</span></div>
                            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true"><div className="h-full rounded-full bg-slate-700 dark:bg-slate-300" style={{ marginInlineStart: `${Number(form.working_hours.start) / 24 * 100}%`, width: `${calculateDuration(form.working_hours.start, form.working_hours.end) / 24 * 100}%` }} /></div>
                            <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-500"><span>00:00</span><span>12:00</span><span>24:00</span></div>
                        </div>
                        <p className="mt-4 text-xs leading-5 text-slate-500">{t('hours.operationalNote')}</p>
                    </SettingsSection>

                </div>

                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/60 bg-white/80 p-3 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/90 md:start-auto md:end-6 md:bottom-6 md:rounded-xl md:border md:p-2.5 shadow-xl">
                    <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 md:max-w-none">
                        <div className="hidden px-3 md:block"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{dirty ? t('status.unsaved') : t('status.saved')}</p><p className="text-[10px] text-slate-400">{t('actions.saveHint')}</p></div>
                        <div className="flex w-full gap-2 md:w-auto">
                            <button type="button" onClick={reset} disabled={!dirty || updateState.isLoading} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-650 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 md:flex-none"><RotateCcw size={16} />{t('actions.discard')}</button>
                            <button type="submit" disabled={!dirty || !hoursValid || updateState.isLoading} className="inline-flex flex-[2] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-800 to-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 dark:from-slate-50 dark:to-white dark:text-slate-950 md:flex-none"><Save size={17} />{updateState.isLoading ? t('actions.saving') : t('actions.save')}</button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};

const HeaderSignal = ({ icon: Icon, label }) => <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Icon size={15} className="shrink-0 text-teal-600 dark:text-teal-300" aria-hidden="true" /><span>{label}</span></div>;
const SectionLink = ({ href, icon: Icon, label }) => <a href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-cyan-50 hover:text-cyan-800 dark:text-slate-300 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-300"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"><Icon size={16} /></span><span className="truncate">{label}</span></a>;
const SettingsSection = ({ id, icon: Icon, title, description, children }) => <section id={id} className="scroll-mt-6 rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50"><div className="flex items-start gap-3 border-b border-slate-100/50 p-4 dark:border-slate-800/50 sm:p-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-900/20 text-cyan-750 dark:text-cyan-400 ring-1 ring-cyan-105 dark:ring-cyan-900/50"><Icon size={19} /></span><div><h2 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p></div></div><div className="p-4 sm:p-5">{children}</div></section>;
const Field = ({ label, hint, required, icon: Icon, counter, className = '', children }) => <label className={`block ${className}`}><span className="mb-1.5 flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{Icon ? <Icon size={14} className="text-slate-400" /> : null}{label}{required ? <span className="text-rose-500" aria-hidden="true">*</span> : null}</span>{counter ? <span className="text-[10px] font-medium text-slate-400">{counter}</span> : null}</span>{children}{hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</span> : null}</label>;
const SettingsLoading = ({ label }) => <div className="mx-auto max-w-[1500px] space-y-5 pb-10" aria-label={label}><div className="h-52 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" /><div className="grid gap-5 xl:grid-cols-[250px_1fr]"><div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" /><div className="space-y-5">{[1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />)}</div></div></div>;
const SettingsError = ({ title, description, retry, onRetry }) => <div className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900"><span className="rounded-xl bg-rose-50 p-4 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"><AlertTriangle size={28} /></span><h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{title}</h1><p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p><button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-950"><RefreshCw size={16} />{retry}</button></div>;
const calculateDuration = (start, end) => { const from = Number(start); const to = Number(end); if (!Number.isFinite(from) || !Number.isFinite(to)) return 0; return Math.max(0, to - from); };
const formatHour = (value) => `${String(Math.min(23, Math.max(0, Number(value) || 0))).padStart(2, '0')}:00`;

export default CenterSettings;
