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
    { id: 'read', labelKey: 'readOnly', badge: 'GET', pill: 'ds-status ds-status-accent border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', active: 'settings-choice-selected' },
    { id: 'read_write', labelKey: 'readWrite', badge: 'FULL', pill: 'ds-status ds-status-warning border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', active: 'settings-choice-selected border-[var(--VIARA-warning-border)] bg-[var(--VIARA-warning-soft)]' },
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

const primaryButton = 'ds-button ds-button-primary ds-button-sm';
const secondaryButton = 'ds-button ds-button-secondary ds-button-sm';
const dangerButton = 'ds-button ds-button-danger ds-button-sm';
const panelShell = 'settings-section overflow-hidden';
const panelHeader = 'settings-section-header flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between';
const panelBody = 'settings-section-body';
const panelIcon = 'settings-section-icon flex h-10 w-10 shrink-0 items-center justify-center';
const mutedText = 'text-[var(--VIARA-muted)]';
const strongText = 'text-[var(--VIARA-ink)]';
const monoValue = 'font-mono font-bold text-[var(--VIARA-ink)]';

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

const DeveloperSettings = ({ embedded = false }) => {
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
            ...(field === 'password'
                ? { keepExistingPassword: value ? false : Boolean(savedDb?.passwordConfigured || activeDb?.passwordConfigured) }
                : {})
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
        <div className={`mx-auto max-w-7xl ${embedded ? 'space-y-4 pb-4' : 'space-y-5 pb-10'}`}>
            {/* VIARA Hero Command Deck */}
            <div className={`settings-section relative overflow-hidden p-[var(--VIARA-density-card-padding)] ${embedded ? 'space-y-4' : 'space-y-5'}`}>
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-[rgba(var(--VIARA-accent-rgb),0.14)] blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-[var(--VIARA-info-soft)] blur-3xl" />

                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
                        <div className={`settings-section-icon grid shrink-0 place-items-center shadow-inner ${embedded ? 'h-11 w-11' : 'h-12 w-12'}`}>
                            <Terminal size={embedded ? 22 : 26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <span className="ds-status ds-status-accent inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                                <Key size={11} />
                                <span>{copy('eyebrow', { defaultValue: 'API engine & database architecture' })}</span>
                            </span>
                            <h1 className={`mt-1 break-words font-black text-[var(--VIARA-ink)] ${embedded ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>
                                {copy('title', { defaultValue: 'Developer Operations & Database Infrastructure' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-[var(--VIARA-muted)] sm:text-sm">
                                {copy('description', { defaultValue: 'Manage PostgreSQL database connection pools, test cluster health, issue scoped Bearer API tokens, and monitor runtime telemetry.' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Telemetry Facts HUD */}
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="settings-fact flex items-center gap-3 shadow-2xs">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface)] shadow-2xs">
                            <Database size={16} className="text-[var(--VIARA-accent)]" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{copy('activeDatabase', { defaultValue: 'Active Database' })}</p>
                            <p className="break-all font-mono text-base font-black text-[var(--VIARA-ink)]">{activeDb ? activeDb.database : '--'}</p>
                        </div>
                    </div>

                    <div className="settings-fact flex items-center gap-3 shadow-2xs">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-success-soft)] shadow-2xs">
                            <Activity size={16} className="text-[var(--VIARA-success)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{copy('poolInUse', { defaultValue: 'Connection Pool' })}</p>
                            <p className="font-mono text-base font-black text-[var(--VIARA-ink)]">{`${pool.total ?? 0}/${pool.idle ?? 0}`}</p>
                        </div>
                    </div>

                    <div className="settings-fact flex items-center gap-3 shadow-2xs">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-info-soft)] shadow-2xs">
                            <Key size={16} className="text-[var(--VIARA-info)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{copy('activeTokens', { defaultValue: 'Active API Tokens' })}</p>
                            <p className="font-mono text-base font-black text-[var(--VIARA-ink)]">{tokens.length}</p>
                        </div>
                    </div>

                    <div className="settings-fact flex items-center gap-3 shadow-2xs">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-warning-soft)] shadow-2xs">
                            <ShieldCheck size={16} className="text-[var(--VIARA-warning)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{copy('writeTokens', { defaultValue: 'Full Access' })}</p>
                            <p className="font-mono text-base font-black text-[var(--VIARA-ink)]">{readWriteCount}</p>
                        </div>
                    </div>
                </div>
            </div>

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
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950 dark:border-slate-800 shadow-sm">
                            <div className="border-b border-slate-800 px-4 py-2.5 text-xs font-bold text-slate-400">{copy('apiExample')}</div>
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
    <section className={panelShell}>
        <div className={panelHeader}>
            <div className="flex min-w-0 items-start gap-3">
                <span className={panelIcon}>
                    <Database size={18} aria-hidden="true" />
                </span>
                <div>
                    <h3 className={`text-sm font-bold ${strongText}`}>{copy('dbTitle')}</h3>
                    <p className={`mt-1 max-w-3xl text-xs leading-5 ${mutedText}`}>{copy('dbDescription')}</p>
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

        <div className={`${panelBody} grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]`}>
            <form onSubmit={onSave} className="space-y-4">
                <div className="rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-warning-border)] bg-[var(--VIARA-warning-soft)] p-4 text-xs leading-5 text-[var(--VIARA-warning)]">
                    <div className="flex gap-2">
                        <Lock size={15} className="mt-0.5 shrink-0" />
                        <p>{copy('dbRestartNotice')}</p>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <TextField label={copy('host')} value={dbForm.host} onChange={value => onFieldChange('host', value)} placeholder="localhost" required autoComplete="off" />
                    <TextField label={copy('port')} value={dbForm.port} onChange={value => onFieldChange('port', value)} type="number" min="1" max="65535" required />
                    <TextField label={copy('username')} value={dbForm.username} onChange={value => onFieldChange('username', value)} placeholder="VIARA" required autoComplete="off" />
                    <div>
                        <label className={`block text-xs font-semibold uppercase tracking-wide ${mutedText}`}>{copy('password')}</label>
                        <div className="mt-2 flex rounded-[var(--VIARA-radius-control)] border border-[var(--VIARA-line)] bg-[var(--VIARA-field)]">
                            <input
                                value={dbForm.password}
                                onChange={event => onFieldChange('password', event.target.value)}
                                type={showPassword ? 'text' : 'password'}
                                placeholder={dbForm.keepExistingPassword ? copy('keepExistingPassword') : copy('passwordPlaceholder')}
                                autoComplete="new-password"
                                className="min-w-0 flex-1 rounded-[var(--VIARA-radius-control)] bg-transparent px-[var(--VIARA-density-control-x)] py-[var(--VIARA-density-control-y)] text-sm text-[var(--VIARA-ink)] outline-none placeholder:text-[var(--VIARA-muted)]"
                            />
                            <button type="button" onClick={onTogglePassword} className="px-3 text-[var(--VIARA-muted)] hover:text-[var(--VIARA-accent-text)]" aria-label={showPassword ? copy('hidePassword') : copy('showPassword')}>
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {(savedDb?.passwordConfigured || activeDb?.passwordConfigured) && (
                            <label className={`mt-2 flex items-center gap-2 text-xs ${mutedText}`}>
                                <input
                                    type="checkbox"
                                    checked={dbForm.keepExistingPassword && !dbForm.password}
                                    onChange={event => onFieldChange('keepExistingPassword', event.target.checked)}
                                    disabled={Boolean(dbForm.password)}
                                    className="h-4 w-4 rounded-[var(--VIARA-radius-control)] border-[var(--VIARA-line)] accent-[var(--VIARA-accent)]"
                                />
                                {copy('keepExistingPassword')}
                            </label>
                        )}
                    </div>
                    <label className="block">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>{copy('sslMode')}</span>
                        <select
                            value={dbForm.sslMode}
                            onChange={event => onFieldChange('sslMode', event.target.value)}
                            className="ds-field mt-2 text-sm"
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

                <div className="settings-row flex flex-wrap gap-2 pt-4">
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
                    <div role="status" className={`rounded-[var(--VIARA-radius-surface)] border p-4 ${dbResult.success ? 'border-[var(--VIARA-success-border)] bg-[var(--VIARA-success-soft)] text-[var(--VIARA-success)]' : 'border-[var(--VIARA-danger-border)] bg-[var(--VIARA-danger-soft)] text-[var(--VIARA-danger)]'}`}>
                        <div className="flex items-start gap-2">
                            {dbResult.success ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
                            <div>
                                <p className="text-sm font-bold">{dbResult.success ? copy('dbTestPassed') : copy('dbTestFailed')}</p>
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
    <section className={panelShell}>
        <div className={`${panelHeader} sm:flex-row sm:items-center`}>
            <div className="flex min-w-0 items-start gap-3">
                <span className={panelIcon}>
                    <Key size={18} aria-hidden="true" />
                </span>
                <div>
                    <h3 className={`text-sm font-bold ${strongText}`}>{copy('tokensTitle')}</h3>
                    <p className={`mt-1 text-xs leading-5 ${mutedText}`}>{copy('tokensDescription')}</p>
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
        <div className={`${panelBody} space-y-4`}>
            <div className="rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-info-border)] bg-[var(--VIARA-info-soft)] p-3 text-xs leading-5 text-[var(--VIARA-info)]">
                <div className="flex gap-2">
                    <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                    <p>{copy('tokenGovernance', { defaultValue: 'These are personal access tokens for the current user. Read/write tokens require developer-grade authorization and should be issued only for trusted automation.' })}</p>
                </div>
            </div>
            {showCreate && !newToken && <CreateForm copy={copy} onSubmit={onGenerate} onCancel={onCreateClose} isGenerating={isGenerating} />}
            {newToken && <TokenReveal copy={copy} token={newToken} onDismiss={onDismissToken} />}
            {isLoading && <SkeletonList />}
            {!isLoading && isError && <EmptyError copy={copy} onRefresh={onRefresh} isFetching={isFetching} />}
            {!isLoading && !isError && tokens.length === 0 && (
                <div className="rounded-[var(--VIARA-radius-surface)] border border-dashed border-[var(--VIARA-line-strong)] p-8 text-center">
                    <Key size={28} className="mx-auto text-[var(--VIARA-muted)]" aria-hidden="true" />
                    <p className={`mt-3 text-sm font-semibold ${strongText}`}>{copy('empty')}</p>
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
        <article className="settings-fact p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`truncate text-sm font-semibold ${strongText}`}>{token.name}</h3>
                        <span className={level.pill}>{level.badge}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface)] px-2 py-1 font-mono text-xs tracking-wide text-[var(--VIARA-ink)]">{showPrefix ? token.prefix : maskedPrefix}</code>
                        <button type="button" onClick={() => setShowPrefix(value => !value)} className="rounded-[var(--VIARA-radius-control)] p-1.5 text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-accent-text)]" aria-label={showPrefix ? copy('hidePrefix') : copy('showPrefix')}>
                            {showPrefix ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button type="button" onClick={copyPrefix} className="rounded-[var(--VIARA-radius-control)] p-1.5 text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-accent-text)]" aria-label={copy('copy')}>
                            <Copy size={14} />
                        </button>
                    </div>
                    <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${mutedText}`}>
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
        <section role="status" className="rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-success-border)] bg-[var(--VIARA-success-soft)] p-4 text-[var(--VIARA-success)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold">{copy('secretTitle')}</h3>
                    <p className="mt-1 text-xs leading-5">{copy('secretDescription')}</p>
                </div>
                <button type="button" onClick={onDismiss} className="rounded-[var(--VIARA-radius-control)] p-2 transition hover:bg-[var(--VIARA-surface-hover)]" aria-label={copy('dismiss', { defaultValue: 'Dismiss' })}>
                    <X size={16} />
                </button>
            </div>
            <div className="mt-4 rounded-[var(--VIARA-radius-control)] border border-[var(--VIARA-success-border)] bg-[var(--VIARA-surface)] p-3">
                <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs leading-6 text-[var(--VIARA-ink)]">{token}</code>
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
        <section className="settings-fact p-4">
            <form onSubmit={event => { event.preventDefault(); onSubmit(name.trim(), level); }} className="space-y-4">
                <TextField label={copy('tokenName')} value={name} onChange={setName} placeholder={copy('namePlaceholder')} required maxLength={100} />
                <div className="grid gap-3 sm:grid-cols-2">
                    {ACCESS_LEVELS.map(item => {
                        const active = level === item.id;
                        return (
                            <button key={item.id} type="button" onClick={() => setLevel(item.id)} className={`settings-choice text-start ${active ? item.active : ''}`} aria-pressed={active}>
                                <span className="flex items-start justify-between gap-3">
                                    <span className={`text-sm font-semibold ${strongText}`}>{copy(item.labelKey)}</span>
                                    <span className={item.pill}>{item.badge}</span>
                                </span>
                                {item.id === 'read_write' && (
                                    <span className="mt-2 block text-[11px] font-semibold leading-4 text-[var(--VIARA-warning)]">
                                        {copy('writeTokenWarning', { defaultValue: 'Write access can modify clinical data and is limited by backend policy.' })}
                                    </span>
                                )}
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
        <span className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>{label}</span>
        <input
            {...props}
            type={type}
            value={value ?? ''}
            onChange={event => onChange(event.target.value)}
            className="ds-field mt-2 text-sm"
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
                <p className="break-words text-lg font-semibold leading-tight">{value}</p>
                <Icon size={16} className="shrink-0 opacity-70" />
            </div>
            <p className="mt-1 break-words text-xs font-medium leading-4">{label}</p>
        </div>
    );
};

const StatusBox = ({ title, value, details }) => (
    <div className="settings-fact p-4">
        <p className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>{title}</p>
        <p className={`mt-2 break-words text-sm font-semibold ${strongText}`}>{value}</p>
        <div className="mt-3 space-y-2">
            {details.map(([label, item]) => (
                <div key={label} className={`flex justify-between gap-3 text-xs ${mutedText}`}>
                    <span>{label}</span>
                    <span className="font-semibold text-[var(--VIARA-ink)]">{item}</span>
                </div>
            ))}
        </div>
    </div>
);

const ToolCard = ({ icon: Icon, title, description, rows, action }) => (
    <section className={`${panelShell} space-y-4 p-[var(--VIARA-density-card-padding)]`}>
        <div className="flex items-start gap-3">
            <span className={panelIcon}>
                <Icon size={18} />
            </span>
            <div>
                <h3 className={`text-sm font-bold ${strongText}`}>{title}</h3>
                <p className={`mt-1 text-xs leading-5 ${mutedText}`}>{description}</p>
            </div>
        </div>
        <div className="settings-fact space-y-2 p-4">
            {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-xs">
                    <span className={`font-medium ${mutedText}`}>{label}</span>
                    <span className={monoValue}>{value}</span>
                </div>
            ))}
        </div>
        {action && <div>{action}</div>}
    </section>
);

const SkeletonList = () => (
    <div className="space-y-3">
        {[1, 2].map(item => (
            <div key={item} className="settings-fact flex items-center gap-3 p-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-[var(--VIARA-radius-control)] bg-[var(--VIARA-surface-muted)]" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-36 animate-pulse rounded-[var(--VIARA-radius-pill)] bg-[var(--VIARA-surface-muted)]" />
                    <div className="h-3 w-56 animate-pulse rounded-[var(--VIARA-radius-pill)] bg-[var(--VIARA-surface-muted)]" />
                </div>
            </div>
        ))}
    </div>
);

const EmptyError = ({ copy, onRefresh, isFetching }) => (
    <div className="rounded-[var(--VIARA-radius-surface)] border border-[var(--VIARA-danger-border)] bg-[var(--VIARA-danger-soft)] p-6 text-center text-[var(--VIARA-danger)]">
        <AlertCircle size={28} className="mx-auto" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold">{copy('loadFailed')}</p>
        <button type="button" onClick={onRefresh} className={`${secondaryButton} mt-4`}>
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
            {copy('retry')}
        </button>
    </div>
);

export default DeveloperSettings;
