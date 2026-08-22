import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    BrainCircuit, Check, CheckCircle2, Cloud, Copy, EyeOff, KeyRound,
    Loader2, Plus, Save, ServerCog, Sparkles, TestTube2, Trash2
} from 'lucide-react';
import {
    useActivateAiProfileMutation,
    useCreateAiProfileMutation,
    useDeleteAiProfileMutation,
    useGetAiProfilesQuery,
    useTestAiSettingsMutation,
    useUpdateAiProfileMutation
} from '../../store/api';
import Modal from '../ui/Modal';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { inputClass, secondaryBtn } from '../../utils/designTokens';

const OPENAI_DEFAULT_MODEL = 'gpt-5.6-terra';
const OPENAI_MODELS = ['gpt-5.6-sol', OPENAI_DEFAULT_MODEL, 'gpt-5.6-luna'];

const REPORT_PROVIDERS = [
    { value: 'gemini', label: 'Google Gemini', model: 'gemini-3.5-flash', cloud: true },
    { value: 'openrouter', label: 'OpenRouter', model: 'openrouter/auto', cloud: true },
    { value: 'groq', label: 'Groq Cloud', model: 'meta-llama/llama-4-scout-17b-16e-instruct', cloud: true },
    { value: 'anthropic', label: 'Anthropic Claude', model: 'claude-3-5-sonnet-latest', cloud: true },
    { value: 'openai', label: 'OpenAI', model: OPENAI_DEFAULT_MODEL, models: OPENAI_MODELS, cloud: true },
    { value: 'custom', label: 'Custom compatible API', model: '', cloud: true }
];
const PACS_PROVIDERS = [
    { value: 'cloud-gemini', label: 'Google Gemini Vision', model: 'gemini-3.5-flash', cloud: true },
    { value: 'cloud-openrouter', label: 'OpenRouter Vision', model: 'openrouter/auto', cloud: true },
    { value: 'cloud-openai', label: 'OpenAI Vision', model: OPENAI_DEFAULT_MODEL, models: OPENAI_MODELS, cloud: true },
    { value: 'cloud-custom', label: 'Custom cloud endpoint', model: '', cloud: true },
    { value: 'local-torchxrayvision', label: 'Local TorchXRayVision', model: 'densenet121-res224-all', cloud: false },
    { value: 'local-medgemma', label: 'Local MedGemma', model: 'google/medgemma-1.5-4b-it', cloud: false },
    { value: 'custom', label: 'Custom HTTP worker', model: '', cloud: false }
];
const emptyProfile = { name: '', enabled: true, provider: '', model: '', modelVersion: '', baseUrl: '', workerUrl: '', apiKey: '', clearApiKey: false };

const profileToForm = (profile) => ({
    ...emptyProfile,
    ...profile,
    apiKey: '',
    clearApiKey: false
});

const AiProviderSettings = () => {
    const { t, i18n } = useTranslation('settings');
    const { data, isLoading, isError, refetch } = useGetAiProfilesQuery();
    const [createProfile, createState] = useCreateAiProfileMutation();
    const [updateProfile, updateState] = useUpdateAiProfileMutation();
    const [activateProfile, activateState] = useActivateAiProfileMutation();
    const [deleteProfile, deleteState] = useDeleteAiProfileMutation();
    const [testSettings, testState] = useTestAiSettingsMutation();
    const [target, setTarget] = useState('report');
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState(emptyProfile);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');

    const group = data?.[target];
    const profiles = useMemo(() => group?.profiles || [], [group?.profiles]);
    const selected = profiles.find((item) => item.id === selectedId) || null;
    const providers = target === 'report' ? REPORT_PROVIDERS : PACS_PROVIDERS;
    const providerMeta = providers.find((item) => item.value === form.provider);
    const isCloud = target === 'report' || Boolean(providerMeta?.cloud);
    const busy = createState.isLoading || updateState.isLoading || activateState.isLoading || deleteState.isLoading || testState.isLoading;

    useEffect(() => {
        if (!profiles.length) return;
        if (!profiles.some((item) => item.id === selectedId)) {
            setSelectedId(group?.activeProfileId || profiles[0].id);
        }
    }, [group?.activeProfileId, profiles, selectedId]);

    useEffect(() => {
        if (selected) setForm(profileToForm(selected));
    }, [selected]);

    const counts = useMemo(() => ({
        report: data?.report?.profiles?.length || 0,
        pacs: data?.pacs?.profiles?.length || 0
    }), [data]);
    const numberFormatter = useMemo(
        () => new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language || 'en'),
        [i18n.language, i18n.resolvedLanguage]
    );

    const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const changeProvider = (provider) => {
        const meta = providers.find((item) => item.value === provider);
        setForm((current) => ({
            ...current,
            provider,
            model: meta?.model || '',
            modelVersion: '',
            baseUrl: '',
            workerUrl: '',
            apiKey: '',
            clearApiKey: current.provider !== provider && current.apiKeyConfigured,
        }));
    };
    const validate = () => {
        const storedKeyMatches = selected?.apiKeyConfigured && selected.provider === form.provider && !form.clearApiKey;
        const keyReady = Boolean(form.apiKey.trim() || storedKeyMatches);
        if (!form.name.trim()) return t('settings.aiProfiles.validation.nameRequired');
        if (!form.provider) return t('settings.aiProfiles.validation.providerRequired');
        if (form.enabled && !form.model.trim()) return t('settings.aiProfiles.validation.modelRequired');
        if (form.enabled && target === 'report' && !keyReady) return t('settings.aiProfiles.validation.reportKeyRequired');
        if (form.enabled && target === 'pacs' && isCloud && form.provider !== 'cloud-custom' && !keyReady) return t('settings.aiProfiles.validation.pacsKeyRequired');
        if (form.enabled && form.provider.includes('custom') && isCloud && !form.baseUrl.trim()) return t('settings.aiProfiles.validation.baseUrlRequired');
        if (form.enabled && form.provider.includes('custom') && isCloud) {
            try {
                const url = new URL(form.baseUrl.trim());
                if (!['http:', 'https:'].includes(url.protocol)) return t('settings.aiProfiles.validation.httpOnly');
            } catch {
                return t('settings.aiProfiles.validation.invalidBaseUrl');
            }
        }
        return '';
    };

    const save = async ({ quiet = false } = {}) => {
        const error = validate();
        if (error) { toast.error(error); return null; }
        try {
            const result = await updateProfile({
                id: selected.id,
                name: form.name.trim(), enabled: form.enabled, provider: form.provider,
                model: form.model.trim(), modelVersion: form.modelVersion.trim(),
                baseUrl: form.baseUrl.trim(), workerUrl: form.workerUrl.trim(),
                apiKey: form.apiKey.trim() || undefined, clearApiKey: form.clearApiKey
            }).unwrap();
            if (!quiet) toast.success(t('settings.aiProfiles.messages.saved'));
            return result.profile;
        } catch (errorValue) {
            toast.error(getErrorMessage(errorValue, t('settings.aiProfiles.messages.saveFailed')));
            return null;
        }
    };

    const activate = async () => {
        if (!await save({ quiet: true })) return;
        try {
            await activateProfile(selected.id).unwrap();
            toast.success(t('settings.aiProfiles.messages.activated', {
                name: form.name,
                target: t(`settings.aiProfiles.targets.${target}`)
            }));
        } catch (error) { toast.error(getErrorMessage(error, t('settings.aiProfiles.messages.activateFailed'))); }
    };

    const test = async () => {
        if (!selected.active) {
            toast.error(t('settings.aiProfiles.messages.activateBeforeTest'));
            return;
        }
        if (!await save({ quiet: true })) return;
        try {
            const result = await testSettings({ target }).unwrap();
            if (!result?.success) {
                toast.error(result?.message || t('settings.aiProfiles.messages.testFailed'));
                return;
            }
            toast.success(result?.message || t('settings.aiProfiles.messages.testPassed'));
        } catch (error) { toast.error(getErrorMessage(error, t('settings.aiProfiles.messages.testFailed'))); }
    };

    const create = async () => {
        if (newName.trim().length < 2) return;
        const first = providers[0];
        try {
            const result = await createProfile({ target, name: newName.trim(), enabled: false, provider: first.value, model: first.model }).unwrap();
            await refetch();
            setSelectedId(result.profile.id);
            setShowCreate(false);
            setNewName('');
            toast.success(t('settings.aiProfiles.messages.created'));
        } catch (error) { toast.error(getErrorMessage(error, t('settings.aiProfiles.messages.createFailed'))); }
    };

    const duplicate = async () => {
        try {
            const result = await createProfile({
            target, name: t('settings.aiProfiles.copyName', { name: form.name }), enabled: false, provider: form.provider,
                model: form.model, modelVersion: form.modelVersion, baseUrl: form.baseUrl, workerUrl: form.workerUrl
            }).unwrap();
            await refetch();
            setSelectedId(result.profile.id);
            toast.success(t('settings.aiProfiles.messages.duplicated'));
        } catch (error) { toast.error(getErrorMessage(error, t('settings.aiProfiles.messages.duplicateFailed'))); }
    };

    const remove = async () => {
        if (selected.active) return toast.error(t('settings.aiProfiles.messages.activateAnother'));
        if (!window.confirm(t('settings.aiProfiles.messages.deleteConfirm', { name: selected.name }))) return;
        try {
            await deleteProfile(selected.id).unwrap();
            setSelectedId(group.activeProfileId);
            toast.success(t('settings.aiProfiles.messages.deleted'));
        } catch (error) { toast.error(getErrorMessage(error, t('settings.aiProfiles.messages.deleteFailed'))); }
    };

    if (isLoading) return <div className="h-96 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />;
    if (isError) return <button type="button" onClick={refetch} className={secondaryBtn}>{t('settings.aiProfiles.retry')}</button>;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <BrainCircuit size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <Sparkles size={11} />
                                <span>Clinical Intelligence & Vision Routing</span>
                            </span>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('settings.aiProfiles.title', { defaultValue: 'AI Engine & Vision Providers' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.aiProfiles.description', { defaultValue: 'Configure report narrative LLMs, PACS vision models, local worker endpoints, and active inference profiles.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="inline-flex rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/40">
                            {[['report', Sparkles], ['pacs', ServerCog]].map(([value, Icon]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => { setTarget(value); setSelectedId(''); }}
                                    className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-all ${
                                        target === value
                                            ? 'bg-teal-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                                    }`}
                                >
                                    <Icon size={14} />
                                    <span>{t(`settings.aiProfiles.targets.${value}`, { defaultValue: value.toUpperCase() })}</span>
                                    <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px] font-black">
                                        {numberFormatter.format(counts[value])}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Telemetry Facts HUD */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-100/80 px-4 py-3 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Sparkles size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Report LLMs</p>
                            <p className="font-mono text-base font-black text-slate-900 dark:text-white">{counts.report}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-emerald-800 dark:text-emerald-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <ServerCog size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">PACS Vision</p>
                            <p className="font-mono text-base font-black text-emerald-900 dark:text-white">{counts.pacs}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-sky-800 dark:text-sky-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <CheckCircle2 size={16} className="text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">Active Model</p>
                            <p className="font-mono text-sm font-black text-sky-900 dark:text-white truncate">{selected?.name || 'Active'}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-amber-800 dark:text-amber-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <KeyRound size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">Key Vault</p>
                            <p className="font-mono text-xs font-black text-amber-900 dark:text-white truncate">AES-256 Encrypted</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid min-h-[560px] overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90 shadow-sm backdrop-blur-xl lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="border-b border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:border-b-0 lg:border-e">
                    <div className="flex items-center justify-between px-1 pb-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('settings.aiProfiles.savedProfiles', { defaultValue: 'Saved Profiles' })}</p>
                        <button type="button" onClick={() => setShowCreate(true)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/40 transition" title={t('settings.aiProfiles.newProfile')} aria-label={t('settings.aiProfiles.newProfile')}><Plus size={16} /></button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1.5 lg:overflow-visible">
                        {profiles.map((profile) => (
                            <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className={`min-w-48 rounded-2xl border px-3.5 py-3 text-start transition-all lg:w-full ${selectedId === profile.id ? 'border-teal-500/40 bg-teal-500/10 dark:border-teal-500/30 dark:bg-teal-500/10' : 'border-transparent hover:bg-white dark:hover:bg-slate-800/60'}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{profile.name}</span>
                                    {profile.active && <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><Check size={11} /> Live</span>}
                                </div>
                                <p className="mt-1 truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">{profile.provider} · {profile.model || t('settings.aiProfiles.modelRequired')}</p>
                            </button>
                        ))}
                    </div>
                </aside>

                {selected && <main className="min-w-0 p-6 sm:p-8">
                    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="truncate text-lg font-black text-slate-950 dark:text-white">{form.name}</h3>
                                {selected.active && <span className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">{t('settings.aiProfiles.active', { defaultValue: 'Active Inference Profile' })}</span>}
                            </div>
                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{selected.configured ? t('settings.aiProfiles.ready', { defaultValue: 'Profile configured & ready for inference' }) : t('settings.aiProfiles.incomplete', { defaultValue: 'API credentials or model endpoint required' })}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={duplicate} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"><Copy size={14} />{t('settings.aiProfiles.duplicate', { defaultValue: 'Clone' })}</button>
                            <button type="button" onClick={remove} disabled={busy || selected.active} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 text-xs font-bold text-rose-700 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-300"><Trash2 size={14} />{t('settings.aiProfiles.delete', { defaultValue: 'Delete' })}</button>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <Field label={t('settings.aiProfiles.fields.name')}><input value={form.name} onChange={(e) => setField('name', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200" /></Field>
                        <Field label={t('settings.aiProfiles.fields.provider')}><select value={form.provider} onChange={(e) => changeProvider(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200">{providers.map((item) => <option key={item.value} value={item.value}>{t(`settings.aiProfiles.providers.${item.value}`, { defaultValue: item.label })}</option>)}</select></Field>
                        <Field label={t('settings.aiProfiles.fields.modelId')}><input dir="ltr" spellCheck={false} list={providerMeta?.models ? `${target}-${form.provider}-models` : undefined} value={form.model} onChange={(e) => setField('model', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200" placeholder={providerMeta?.model || t('settings.aiProfiles.fields.modelId')} />{providerMeta?.models && <datalist id={`${target}-${form.provider}-models`}>{providerMeta.models.map((model) => <option key={model} value={model} />)}</datalist>}</Field>
                        {target === 'pacs' && !isCloud && <Field label={t('settings.aiProfiles.fields.modelVersion')}><input value={form.modelVersion} onChange={(e) => setField('modelVersion', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200" placeholder={t('settings.aiProfiles.fields.optionalRevision')} /></Field>}
                        {(target === 'report' ? form.provider !== 'gemini' : form.provider === 'cloud-custom') && <Field label={t('settings.aiProfiles.fields.baseUrl')}><input dir="ltr" spellCheck={false} value={form.baseUrl} onChange={(e) => setField('baseUrl', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200" placeholder={form.provider.includes('custom') ? 'https://api.provider.com/v1' : t('settings.aiProfiles.fields.baseUrlPlaceholder')} /></Field>}
                        {target === 'pacs' && !isCloud && <Field label={t('settings.aiProfiles.fields.workerUrl')}><input dir="ltr" spellCheck={false} value={form.workerUrl} onChange={(e) => setField('workerUrl', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200" placeholder="http://localhost:3015" /></Field>}
                        <Field label={t('settings.aiProfiles.fields.apiKey')}><div className="relative"><KeyRound size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /><input dir="ltr" autoComplete="new-password" spellCheck={false} type="password" value={form.apiKey} onChange={(e) => setField('apiKey', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 ps-9 pe-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200" placeholder={selected.apiKeyConfigured ? t('settings.aiProfiles.fields.storedKey', { preview: selected.apiKeyPreview }) : t('settings.aiProfiles.fields.apiKeyPlaceholder')} /></div>{selected.apiKeyConfigured && <label className="mt-2 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={form.clearApiKey} onChange={(e) => setField('clearApiKey', e.target.checked)} />{t('settings.aiProfiles.fields.clearKey')}</label>}</Field>
                        <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/20"><div><p className="text-xs font-black text-slate-800 dark:text-slate-100">{t('settings.aiProfiles.fields.enabled')}</p><p className="text-[10px] text-slate-500">{t('settings.aiProfiles.fields.enabledHelp')}</p></div><Toggle label={t('settings.aiProfiles.fields.enabled')} checked={form.enabled} onChange={(value) => setField('enabled', value)} /></div>
                    </div>

                    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">{selected.apiKeyConfigured ? <CheckCircle2 size={14} className="text-emerald-600" /> : <EyeOff size={14} />}{selected.apiKeyConfigured ? t('settings.aiProfiles.keyStatus.encrypted', { source: selected.source }) : target === 'pacs' && !isCloud ? t('settings.aiProfiles.keyStatus.optional') : t('settings.aiProfiles.keyStatus.missing')}</div>
                        <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={test} disabled={busy || !selected.active} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"><TestTube2 size={14} />{t('settings.aiProfiles.test', { defaultValue: 'Test Model' })}</button>
                            {!selected.active && <button type="button" onClick={activate} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-500 transition shadow-sm"><Check size={14} />{t('settings.aiProfiles.saveActivate', { defaultValue: 'Activate Profile' })}</button>}
                            <button type="button" onClick={() => save()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-black text-white hover:bg-teal-500 transition shadow-sm">{updateState.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{t('settings.aiProfiles.save', { defaultValue: 'Save Profile' })}</button>
                        </div>
                    </div>
                </main>}
            </div>

            <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={t('settings.aiProfiles.createTitle', { target: t(`settings.aiProfiles.targets.${target}`) })} width="max-w-md">
                <div className="space-y-4"><Field label={t('settings.aiProfiles.fields.name')}><input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} className={inputClass} placeholder={t('settings.aiProfiles.namePlaceholder')} /></Field><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className={secondaryBtn}>{t('common:actions.cancel')}</button><button type="button" onClick={create} disabled={newName.trim().length < 2 || createState.isLoading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-xs font-black text-white"><Plus size={14} />{t('settings.aiProfiles.create')}</button></div></div>
            </Modal>
        </div>
    );
};

const Field = ({ label, children }) => <label className="block min-w-0"><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">{label}</span>{children}</label>;
const Toggle = ({ label, checked, onChange }) => <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full ${checked ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'start-6' : 'start-1'}`} /></button>;

export default AiProviderSettings;
