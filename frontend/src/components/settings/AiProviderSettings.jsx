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
        <div className="space-y-4">
            <section className="border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"><BrainCircuit size={20} /></span>
                        <div><h2 className="font-black text-slate-950 dark:text-white">{t('settings.aiProfiles.title')}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.aiProfiles.description')}</p></div>
                    </div>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                        {[['report', Sparkles], ['pacs', ServerCog]].map(([value, Icon]) => (
                            <button key={value} type="button" onClick={() => { setTarget(value); setSelectedId(''); }} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-bold ${target === value ? 'bg-white text-cyan-700 shadow-sm dark:bg-slate-800 dark:text-cyan-300' : 'text-slate-500'}`}>
                                <Icon size={14} />
                                {t(`settings.aiProfiles.targets.${value}`)} ({numberFormatter.format(counts[value])})
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <div className="grid min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="border-b border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40 lg:border-b-0 lg:border-e">
                    <div className="flex items-center justify-between px-1 pb-3"><p className="text-[10px] font-black uppercase text-slate-500">{t('settings.aiProfiles.savedProfiles')}</p><button type="button" onClick={() => setShowCreate(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40" title={t('settings.aiProfiles.newProfile')} aria-label={t('settings.aiProfiles.newProfile')}><Plus size={16} /></button></div>
                    <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">
                        {profiles.map((profile) => (
                            <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className={`min-w-48 rounded-md border px-3 py-2.5 text-start lg:w-full ${selectedId === profile.id ? 'border-cyan-200 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/30' : 'border-transparent hover:bg-white dark:hover:bg-slate-800'}`}>
                                <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{profile.name}</span>{profile.active && <Check size={13} className="shrink-0 text-emerald-600" />}</div>
                                <p className="mt-1 truncate text-[10px] text-slate-500">{profile.provider} · {profile.model || t('settings.aiProfiles.modelRequired')}</p>
                            </button>
                        ))}
                    </div>
                </aside>

                {selected && <main className="min-w-0 p-4 sm:p-6">
                    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate font-black text-slate-950 dark:text-white">{form.name}</h3>{selected.active && <span className="rounded bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{t('settings.aiProfiles.active')}</span>}</div><p className="mt-1 text-xs text-slate-500">{selected.configured ? t('settings.aiProfiles.ready') : t('settings.aiProfiles.incomplete')}</p></div>
                        <div className="flex flex-wrap gap-2"><button type="button" onClick={duplicate} disabled={busy} className={secondaryBtn}><Copy size={14} />{t('settings.aiProfiles.duplicate')}</button><button type="button" onClick={remove} disabled={busy || selected.active} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 disabled:opacity-40 dark:border-rose-900 dark:text-rose-300"><Trash2 size={14} />{t('settings.aiProfiles.delete')}</button></div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <Field label={t('settings.aiProfiles.fields.name')}><input value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass} /></Field>
                        <Field label={t('settings.aiProfiles.fields.provider')}><select value={form.provider} onChange={(e) => changeProvider(e.target.value)} className={inputClass}>{providers.map((item) => <option key={item.value} value={item.value}>{t(`settings.aiProfiles.providers.${item.value}`, { defaultValue: item.label })}</option>)}</select></Field>
                        <Field label={t('settings.aiProfiles.fields.modelId')}><input dir="ltr" spellCheck={false} list={providerMeta?.models ? `${target}-${form.provider}-models` : undefined} value={form.model} onChange={(e) => setField('model', e.target.value)} className={inputClass} placeholder={providerMeta?.model || t('settings.aiProfiles.fields.modelId')} />{providerMeta?.models && <datalist id={`${target}-${form.provider}-models`}>{providerMeta.models.map((model) => <option key={model} value={model} />)}</datalist>}</Field>
                        {target === 'pacs' && !isCloud && <Field label={t('settings.aiProfiles.fields.modelVersion')}><input value={form.modelVersion} onChange={(e) => setField('modelVersion', e.target.value)} className={inputClass} placeholder={t('settings.aiProfiles.fields.optionalRevision')} /></Field>}
                        {(target === 'report' ? form.provider !== 'gemini' : form.provider === 'cloud-custom') && <Field label={t('settings.aiProfiles.fields.baseUrl')}><input dir="ltr" spellCheck={false} value={form.baseUrl} onChange={(e) => setField('baseUrl', e.target.value)} className={inputClass} placeholder={form.provider.includes('custom') ? 'https://api.provider.com/v1' : t('settings.aiProfiles.fields.baseUrlPlaceholder')} /></Field>}
                        {target === 'pacs' && !isCloud && <Field label={t('settings.aiProfiles.fields.workerUrl')}><input dir="ltr" spellCheck={false} value={form.workerUrl} onChange={(e) => setField('workerUrl', e.target.value)} className={inputClass} placeholder="http://localhost:3015" /></Field>}
                        <Field label={t('settings.aiProfiles.fields.apiKey')}><div className="relative"><KeyRound size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" /><input dir="ltr" autoComplete="new-password" spellCheck={false} type="password" value={form.apiKey} onChange={(e) => setField('apiKey', e.target.value)} className={`${inputClass} ps-9`} placeholder={selected.apiKeyConfigured ? t('settings.aiProfiles.fields.storedKey', { preview: selected.apiKeyPreview }) : t('settings.aiProfiles.fields.apiKeyPlaceholder')} /></div>{selected.apiKeyConfigured && <label className="mt-2 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={form.clearApiKey} onChange={(e) => setField('clearApiKey', e.target.checked)} />{t('settings.aiProfiles.fields.clearKey')}</label>}</Field>
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"><div><p className="text-xs font-black text-slate-800 dark:text-slate-100">{t('settings.aiProfiles.fields.enabled')}</p><p className="text-[10px] text-slate-500">{t('settings.aiProfiles.fields.enabledHelp')}</p></div><Toggle label={t('settings.aiProfiles.fields.enabled')} checked={form.enabled} onChange={(value) => setField('enabled', value)} /></div>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs text-slate-500">{selected.apiKeyConfigured ? <CheckCircle2 size={14} className="text-emerald-600" /> : <EyeOff size={14} />}{selected.apiKeyConfigured ? t('settings.aiProfiles.keyStatus.encrypted', { source: selected.source }) : target === 'pacs' && !isCloud ? t('settings.aiProfiles.keyStatus.optional') : t('settings.aiProfiles.keyStatus.missing')}</div>
                        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={test} disabled={busy || !selected.active} className={secondaryBtn}><TestTube2 size={14} />{t('settings.aiProfiles.test')}</button>{!selected.active && <button type="button" onClick={activate} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-black text-white"><Check size={14} />{t('settings.aiProfiles.saveActivate')}</button>}<button type="button" onClick={() => save()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-xs font-black text-white">{updateState.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{t('settings.aiProfiles.save')}</button></div>
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
