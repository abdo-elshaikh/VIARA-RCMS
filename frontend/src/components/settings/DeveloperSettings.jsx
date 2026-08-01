import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    Copy,
    Database,
    Eye,
    EyeOff,
    Key,
    Lock,
    Plus,
    RefreshCw,
    Save,
    Server,
    ShieldCheck,
    Terminal,
    Trash2,
    Wrench,
    X,
    Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    useCreateApiTokenMutation,
    useGetApiTokensQuery,
    useGetDatabaseSettingsQuery,
    useRevokeApiTokenMutation,
    useTestDatabaseSettingsMutation,
    useUpdateDatabaseSettingsMutation
} from '../../store/api';
import { formatRelativeTime, formatShortDate } from '../../utils/dateFormat';
import { getErrorMessage } from '../../utils/getErrorMessage';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const ACCESS_LEVELS = [
    { id: 'read', labelKey: 'readOnly', badge: 'GET', pill: 'border-cyan-200 bg-cyan-50 text-cyan-700', active: 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20' },
    { id: 'read_write', labelKey: 'readWrite', badge: 'FULL', pill: 'border-amber-200 bg-amber-50 text-amber-700', active: 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' },
];

const EMPTY_DB_FORM = {
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    keepExistingPassword: false,
    sslMode: 'prefer',
    poolMax: 20,
    statementTimeoutMs: 30000,
    idleTimeoutMs: 30000
};

const buttonBase = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = `${buttonBase} bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white`;
const secondaryButton = `${buttonBase} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`;
const dangerButton = `${buttonBase} border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300`;

const CODE_SNIPPET = `const res = await fetch('/api/v1/patients', {
  headers: { Authorization: 'Bearer <YOUR_TOKEN>' },
});

const data = await res.json();`;

const numberOrDefault = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const formFromConfig = (config) => ({
    ...EMPTY_DB_FORM,
    ...config,
    port: numberOrDefault(config?.port, 5432),
    poolMax: numberOrDefault(config?.poolMax, 20),
    statementTimeoutMs: numberOrDefault(config?.statementTimeoutMs, 30000),
    idleTimeoutMs: numberOrDefault(config?.idleTimeoutMs, 30000),
    password: '',
    keepExistingPassword: Boolean(config?.passwordConfigured)
});

const DeveloperSettings = () => {
    const { t } = useTranslation(['settings', 'common']);
    const copy = useCallback((key, options = {}) => t(`settings.developer.${key}`, options), [t]);
    const dbQuery = useGetDatabaseSettingsQuery();
    const { data: tokens = [], isLoading: isLoadingTokens, isError, isFetching, refetch } = useGetApiTokensQuery();
    const [updateDatabaseSettings, { isLoading: isSavingDb }] = useUpdateDatabaseSettingsMutation();
    const [testDatabaseSettings, { isLoading: isTestingDb }] = useTestDatabaseSettingsMutation();
    const [createToken, { isLoading: isGenerating }] = useCreateApiTokenMutation();
    const [revokeToken] = useRevokeApiTokenMutation();

    const [dbForm, setDbForm] = useState(EMPTY_DB_FORM);
    const [dbResult, setDbResult] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [newToken, setNewToken] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [revokeCandidate, setRevokeCandidate] = useState(null);
    const [showSnippet, setShowSnippet] = useState(false);

    const activeDb = dbQuery.data?.active;
    const savedDb = dbQuery.data?.saved;
    const pool = dbQuery.data?.pool || {};
    const readWriteCount = tokens.filter(token => token.accessLevel === 'read_write').length;

    useEffect(() => {
        if (savedDb || activeDb) setDbForm(formFromConfig(savedDb || activeDb));
    }, [savedDb, activeDb]);

    const dbSummary = useMemo(() => {
        if (!activeDb) return copy('dbUnknown');
        return `${activeDb.username}@${activeDb.host}:${activeDb.port}/${activeDb.database}`;
    }, [activeDb, copy]);

    const setDbField = (field, value) => {
        setDbForm(current => ({
            ...current,
            [field]: value,
            ...(field === 'password' ? { keepExistingPassword: false } : {})
        }));
    };

    const handleSaveDb = async (event) => {
        event.preventDefault();
        try {
            const response = await updateDatabaseSettings({
                ...dbForm,
                port: numberOrDefault(dbForm.port, 5432),
                poolMax: numberOrDefault(dbForm.poolMax, 20),
                statementTimeoutMs: numberOrDefault(dbForm.statementTimeoutMs, 30000),
                idleTimeoutMs: numberOrDefault(dbForm.idleTimeoutMs, 30000)
            }).unwrap();
            setDbResult({ success: true, target: 'saved', message: response.message });
            toast.success(copy('dbSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, copy('dbSaveFailed')));
        }
    };

    const handleTestDb = async (target) => {
        try {
            const body = target === 'custom' ? { target, config: dbForm } : { target };
            const response = await testDatabaseSettings(body).unwrap();
            setDbResult(response);
            toast.success(copy('dbTestPassed'));
        } catch (error) {
            setDbResult({ success: false, message: getErrorMessage(error, copy('dbTestFailed')) });
            toast.error(getErrorMessage(error, copy('dbTestFailed')));
        }
    };

    const handleGenerate = async (name, level) => {
        if (!name) return;
        try {
            const res = await createToken({ name, accessLevel: level }).unwrap();
            setNewToken(res.rawToken);
            setShowCreate(false);
            toast.success(copy('created'));
        } catch (err) {
            toast.error(getErrorMessage(err, copy('createFailed')));
        }
    };

    const handleRevoke = async () => {
        try {
            await revokeToken(revokeCandidate.id).unwrap();
            toast.success(copy('revoked'));
            return true;
        } catch (err) {
            toast.error(getErrorMessage(err, copy('revokeFailed')));
            return false;
        }
    };

    return (
        <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <Terminal size={20} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{copy('title')}</h2>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{copy('description')}</p>
                        </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4 xl:min-w-[34rem]">
                        <Metric label={copy('activeDatabase')} value={activeDb ? activeDb.database : '--'} icon={Database} />
                        <Metric label={copy('poolInUse')} value={`${pool.total ?? 0}/${pool.idle ?? 0}`} icon={Activity} />
                        <Metric label={copy('activeTokens')} value={tokens.length} icon={Key} />
                        <Metric label={copy('writeTokens')} value={readWriteCount} icon={ShieldCheck} tone={readWriteCount ? 'warning' : 'neutral'} />
                    </div>
                </div>
            </section>

            <DatabaseConfigPanel
                copy={copy}
                activeDb={activeDb}
                savedDb={savedDb}
                dbForm={dbForm}
                dbResult={dbResult}
                isLoading={dbQuery.isLoading}
                isSaving={isSavingDb}
                isTesting={isTestingDb}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(value => !value)}
                onFieldChange={setDbField}
                onSave={handleSaveDb}
                onTest={handleTestDb}
                onReload={dbQuery.refetch}
                dbSummary={dbSummary}
            />

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <TokenPanel
                    copy={copy}
                    tokens={tokens}
                    isLoading={isLoadingTokens}
                    isError={isError}
                    isFetching={isFetching}
                    isGenerating={isGenerating}
                    showCreate={showCreate}
                    newToken={newToken}
                    onCreateOpen={() => { setShowCreate(true); setNewToken(null); }}
                    onCreateClose={() => setShowCreate(false)}
                    onGenerate={handleGenerate}
                    onDismissToken={() => setNewToken(null)}
                    onRevoke={setRevokeCandidate}
                    onRefresh={refetch}
                />

                <section className="space-y-5">
                    <ToolCard
                        icon={Server}
                        title={copy('runtimeTitle')}
                        description={copy('runtimeDescription')}
                        rows={[
                            [copy('databaseSource'), activeDb?.source || 'env'],
                            [copy('savedDraft'), savedDb ? copy('configured') : copy('notConfigured')],
                            [copy('restartRequired'), copy('yes')]
                        ]}
                    />
                    <ToolCard
                        icon={Wrench}
                        title={copy('integrationReadiness')}
                        description={copy('integrationDescription')}
                        rows={[
                            [copy('apiTokens'), String(tokens.length)],
                            [copy('webhooksTitle'), copy('notEnabled')],
                            [copy('apiExample'), showSnippet ? copy('visible') : copy('hidden')]
                        ]}
                        action={(
                            <button type="button" onClick={() => setShowSnippet(value => !value)} className={secondaryButton}>
                                <Terminal size={16} />
                                {showSnippet ? copy('hideExample') : copy('showExample')}
                            </button>
                        )}
                    />
                    {showSnippet && (
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
                            <div className="border-b border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400">{copy('apiExample')}</div>
                            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-slate-200">{CODE_SNIPPET}</pre>
                        </div>
                    )}
                </section>
            </section>

            <ConfirmDialog
                isOpen={Boolean(revokeCandidate)}
                onClose={() => setRevokeCandidate(null)}
                onConfirm={handleRevoke}
                title={copy('revokeTitle')}
                message={copy('revokeMessage', { name: revokeCandidate?.name })}
                confirmLabel={copy('revokeAction')}
                cancelLabel={t('common:actions.cancel', 'Cancel')}
            />
        </div>
    );
};

const DatabaseConfigPanel = ({
    copy,
    activeDb,
    savedDb,
    dbForm,
    dbResult,
    isLoading,
    isSaving,
    isTesting,
    showPassword,
    onTogglePassword,
    onFieldChange,
    onSave,
    onTest,
    onReload,
    dbSummary
}) => (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                    <Database size={18} aria-hidden="true" />
                </span>
                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{copy('dbTitle')}</h3>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">{copy('dbDescription')}</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onTest('active')} disabled={isTesting} className={secondaryButton}>
                    <Activity size={16} />
                    {copy('testActive')}
                </button>
                <button type="button" onClick={onReload} disabled={isLoading} className={secondaryButton}>
                    <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    {copy('refresh')}
                </button>
            </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <form onSubmit={onSave} className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                    <div className="flex gap-2">
                        <Lock size={15} className="mt-0.5 shrink-0" />
                        <p>{copy('dbRestartNotice')}</p>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <TextField label={copy('host')} value={dbForm.host} onChange={value => onFieldChange('host', value)} placeholder="localhost" required />
                    <TextField label={copy('port')} value={dbForm.port} onChange={value => onFieldChange('port', value)} type="number" min="1" max="65535" required />
                    <TextField label={copy('databaseName')} value={dbForm.database} onChange={value => onFieldChange('database', value)} placeholder="rcms" required />
                    <TextField label={copy('username')} value={dbForm.username} onChange={value => onFieldChange('username', value)} placeholder="rcms" required />
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy('password')}</label>
                        <div className="mt-2 flex rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                            <input
                                value={dbForm.password}
                                onChange={event => onFieldChange('password', event.target.value)}
                                type={showPassword ? 'text' : 'password'}
                                placeholder={dbForm.keepExistingPassword ? copy('keepExistingPassword') : copy('passwordPlaceholder')}
                                className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm text-slate-900 outline-none dark:text-white"
                            />
                            <button type="button" onClick={onTogglePassword} className="px-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label={showPassword ? copy('hidePassword') : copy('showPassword')}>
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {savedDb?.passwordConfigured && (
                            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <input
                                    type="checkbox"
                                    checked={dbForm.keepExistingPassword && !dbForm.password}
                                    onChange={event => onFieldChange('keepExistingPassword', event.target.checked)}
                                    disabled={Boolean(dbForm.password)}
                                    className="h-4 w-4 rounded border-slate-300"
                                />
                                {copy('keepExistingPassword')}
                            </label>
                        )}
                    </div>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy('sslMode')}</span>
                        <select
                            value={dbForm.sslMode}
                            onChange={event => onFieldChange('sslMode', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                            {['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].map(mode => <option key={mode} value={mode}>{mode}</option>)}
                        </select>
                    </label>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <TextField label={copy('poolMax')} value={dbForm.poolMax} onChange={value => onFieldChange('poolMax', value)} type="number" min="1" max="100" />
                    <TextField label={copy('statementTimeout')} value={dbForm.statementTimeoutMs} onChange={value => onFieldChange('statementTimeoutMs', value)} type="number" min="1000" />
                    <TextField label={copy('idleTimeout')} value={dbForm.idleTimeoutMs} onChange={value => onFieldChange('idleTimeoutMs', value)} type="number" min="1000" />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <button type="button" onClick={() => onTest('custom')} disabled={isTesting} className={secondaryButton}>
                        <Zap size={16} className={isTesting ? 'animate-pulse' : ''} />
                        {copy('testDraft')}
                    </button>
                    <button type="button" onClick={() => onTest('saved')} disabled={isTesting || !savedDb} className={secondaryButton}>
                        <Server size={16} />
                        {copy('testSaved')}
                    </button>
                    <button type="submit" disabled={isSaving} className={primaryButton}>
                        {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                        {isSaving ? copy('saving') : copy('saveDb')}
                    </button>
                </div>
            </form>

            <div className="space-y-4">
                <StatusBox title={copy('activeConnection')} value={dbSummary} details={[
                    [copy('sslMode'), activeDb?.sslMode || '--'],
                    [copy('password'), activeDb?.passwordConfigured ? copy('configured') : copy('notConfigured')]
                ]} />
                <StatusBox title={copy('savedDraft')} value={savedDb ? `${savedDb.username}@${savedDb.host}:${savedDb.port}/${savedDb.database}` : copy('notConfigured')} details={[
                    [copy('sslMode'), savedDb?.sslMode || '--'],
                    [copy('password'), savedDb?.passwordConfigured ? copy('configured') : copy('notConfigured')]
                ]} />
                {dbResult && (
                    <div className={`rounded-lg border p-4 ${dbResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100' : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100'}`}>
                        <div className="flex items-start gap-2">
                            {dbResult.success ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                            <div>
                                <p className="text-sm font-semibold">{dbResult.success ? copy('dbTestPassed') : copy('dbTestFailed')}</p>
                                <p className="mt-1 text-xs leading-5">{dbResult.message || `${dbResult.database || ''} ${dbResult.latencyMs ? `(${dbResult.latencyMs} ms)` : ''}`}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </section>
);

const TokenPanel = ({ copy, tokens, isLoading, isError, isFetching, isGenerating, showCreate, newToken, onCreateOpen, onCreateClose, onGenerate, onDismissToken, onRevoke, onRefresh }) => (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Key size={18} aria-hidden="true" />
                </span>
                <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{copy('tokensTitle')}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy('tokensDescription')}</p>
                </div>
            </div>
            <div className="flex gap-2">
                <button type="button" onClick={onRefresh} disabled={isFetching} className={secondaryButton}>
                    <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                    {copy('refresh')}
                </button>
                <button type="button" onClick={onCreateOpen} disabled={isGenerating || Boolean(newToken) || showCreate} className={primaryButton}>
                    <Plus size={16} />
                    {copy('generate')}
                </button>
            </div>
        </div>
        <div className="space-y-4 p-5">
            {showCreate && !newToken && <CreateForm copy={copy} onSubmit={onGenerate} onCancel={onCreateClose} isGenerating={isGenerating} />}
            {newToken && <TokenReveal copy={copy} token={newToken} onDismiss={onDismissToken} />}
            {isLoading && <SkeletonList />}
            {!isLoading && isError && <EmptyError copy={copy} onRefresh={onRefresh} isFetching={isFetching} />}
            {!isLoading && !isError && tokens.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                    <Key size={28} className="mx-auto text-slate-400" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{copy('empty')}</p>
                    <button type="button" onClick={onCreateOpen} className={`${primaryButton} mt-4`}>
                        <Plus size={16} />
                        {copy('generate')}
                    </button>
                </div>
            )}
            {!isLoading && !isError && tokens.length > 0 && tokens.map(token => (
                <TokenRow key={token.id} copy={copy} token={token} onRevoke={onRevoke} />
            ))}
        </div>
    </section>
);

const TokenRow = ({ copy, token, onRevoke }) => {
    const [showPrefix, setShowPrefix] = useState(false);
    const level = ACCESS_LEVELS.find(item => item.id === token.accessLevel) || ACCESS_LEVELS[0];
    const maskedPrefix = `${(token.prefix || '').slice(0, 4)}${'*'.repeat(8)}`;

    const copyPrefix = async () => {
        try {
            await navigator.clipboard.writeText(token.prefix);
            toast.success(copy('prefixCopied'));
        } catch {
            toast.error(copy('copyFailed'));
        }
    };

    return (
        <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{token.name}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${level.pill}`}>{level.badge}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">{showPrefix ? token.prefix : maskedPrefix}</code>
                        <button type="button" onClick={() => setShowPrefix(value => !value)} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label={showPrefix ? copy('hidePrefix') : copy('showPrefix')}>
                            {showPrefix ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button type="button" onClick={copyPrefix} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label={copy('copy')}>
                            <Copy size={14} />
                        </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1"><Clock size={12} />{formatShortDate(token.created)}</span>
                        <span>{copy('lastUsed', { used: token.lastUsed ? formatRelativeTime(token.lastUsed) : copy('never') })}</span>
                    </div>
                </div>
                <button type="button" onClick={() => onRevoke(token)} className={dangerButton} aria-label={copy('revokeNamed', { name: token.name })}>
                    <Trash2 size={14} />
                    {copy('revokeAction')}
                </button>
            </div>
        </article>
    );
};

const TokenReveal = ({ copy, token, onDismiss }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(token);
            setCopied(true);
            toast.success(copy('copied'));
            setTimeout(() => setCopied(false), 2500);
        } catch {
            toast.error(copy('copyFailed'));
        }
    };

    return (
        <section role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">{copy('secretTitle')}</h3>
                    <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-200">{copy('secretDescription')}</p>
                </div>
                <button type="button" onClick={onDismiss} className="rounded-lg p-2 text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40" aria-label="Dismiss">
                    <X size={16} />
                </button>
            </div>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-900/50 dark:bg-slate-950">
                <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs leading-6 text-slate-800 dark:text-slate-100">{token}</code>
            </div>
            <button type="button" onClick={handleCopy} className={`${primaryButton} mt-4`}>
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied ? copy('copied') : copy('copy')}
            </button>
        </section>
    );
};

const CreateForm = ({ copy, onSubmit, onCancel, isGenerating }) => {
    const [name, setName] = useState('');
    const [level, setLevel] = useState('read');

    return (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <form onSubmit={event => { event.preventDefault(); onSubmit(name.trim(), level); }} className="space-y-4">
                <TextField label={copy('tokenName')} value={name} onChange={setName} placeholder={copy('namePlaceholder')} required maxLength={100} />
                <div className="grid gap-3 sm:grid-cols-2">
                    {ACCESS_LEVELS.map(item => {
                        const active = level === item.id;
                        return (
                            <button key={item.id} type="button" onClick={() => setLevel(item.id)} className={`rounded-lg border p-4 text-start transition ${active ? item.active : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`} aria-pressed={active}>
                                <span className="flex items-start justify-between gap-3">
                                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{copy(item.labelKey)}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${item.pill}`}>{item.badge}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onCancel} className={secondaryButton}>{copy('cancel')}</button>
                    <button type="submit" disabled={isGenerating || !name.trim()} className={primaryButton}>
                        {isGenerating ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                        {isGenerating ? copy('generating') : copy('generateAction')}
                    </button>
                </div>
            </form>
        </section>
    );
};

const TextField = ({ label, value, onChange, type = 'text', ...props }) => (
    <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        <input
            {...props}
            type={type}
            value={value ?? ''}
            onChange={event => onChange(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-800"
        />
    </label>
);

const Metric = ({ label, value, icon: Icon, tone = 'neutral' }) => {
    const toneClass = tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200';

    return (
        <div className={`rounded-lg border p-3 ${toneClass}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="truncate text-lg font-semibold leading-none">{value}</p>
                <Icon size={16} className="shrink-0 opacity-70" />
            </div>
            <p className="mt-1 truncate text-xs font-medium">{label}</p>
        </div>
    );
};

const StatusBox = ({ title, value, details }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
        <p className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
        <div className="mt-3 space-y-2">
            {details.map(([label, item]) => (
                <div key={label} className="flex justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>{label}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{item}</span>
                </div>
            ))}
        </div>
    </div>
);

const ToolCard = ({ icon: Icon, title, description, rows, action }) => (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={18} />
            </span>
            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
            </div>
        </div>
        <div className="mt-4 space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{value}</span>
                </div>
            ))}
        </div>
        {action && <div className="mt-4">{action}</div>}
    </section>
);

const SkeletonList = () => (
    <div className="space-y-3">
        {[1, 2].map(item => (
            <div key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-3 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
            </div>
        ))}
    </div>
);

const EmptyError = ({ copy, onRefresh, isFetching }) => (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/60 dark:bg-rose-950/20">
        <AlertCircle size={28} className="mx-auto text-rose-500" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{copy('loadFailed')}</p>
        <button type="button" onClick={onRefresh} className={`${secondaryButton} mt-4`}>
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
            {copy('retry')}
        </button>
    </div>
);

export default DeveloperSettings;
