import { useEffect, useState } from 'react';
import { Clock, Database, Download, FileJson, HardDrive, LockKeyhole, RotateCcw, ShieldAlert, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import { useGenerateBackupMutation, useGetBackupsQuery, useRestoreBackupMutation } from '../store/api';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageHeader from '../components/ui/PageHeader';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const formatBytes = (bytes, decimals = 2) => {
    if (!Number(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Number((bytes / (1024 ** index)).toFixed(Math.max(0, decimals)))} ${units[index]}`;
};

const BackupManagement = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('governance');
    const { data: backups = [], isLoading } = useGetBackupsQuery();
    const [generateBackup, { isLoading: isGenerating }] = useGenerateBackupMutation();
    const [restoreBackup, { isLoading: isRestoring }] = useRestoreBackupMutation();
    const [restoreCandidate, setRestoreCandidate] = useState(null);
    const [mounted, setMounted] = useState(false);
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

    useEffect(() => { setMounted(true); }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-700 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`,
        style: { transitionDelay: `${delay}ms` },
    });

    const handleGenerate = async () => {
        try {
            const result = await generateBackup().unwrap();
            toast.success(result.verified ? t('backups.verifiedGenerated') : t('backups.snapshotGenerated'));
        } catch (error) {
            toast.error(error?.data?.error || t('backups.generateError'));
        }
    };

    const handleDownload = async (filename) => {
        try {
            await downloadAuthenticatedFile(`${API_BASE}/backups/${filename}/download`, filename);
            toast.success(t('backups.downloaded'));
        } catch {
            toast.error(t('backups.downloadError'));
        }
    };

    const handleRestore = async () => {
        if (!restoreCandidate) return false;
        try {
            const response = await restoreBackup({ filename: restoreCandidate.filename, confirm: true }).unwrap();
            toast.success(t('backups.restored', { count: response.restoredRows }));
            return true;
        } catch (error) {
            toast.error(error?.data?.message || t('backups.restoreError'));
            return false;
        }
    };

    return (
        <div className={embedded ? 'space-y-6' : 'mx-auto max-w-6xl space-y-6 pb-10'}>
            {embedded ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t('backups.description')}</p>
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                    >
                        <Zap size={16} className={isGenerating ? 'animate-pulse' : ''} />
                        {isGenerating ? t('backups.generating') : t('backups.generate')}
                    </button>
                </div>
            ) : (
                <PageHeader
                    icon={Database}
                    title={t('backups.title')}
                    description={t('backups.description')}
                    actions={
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isGenerating}
                        className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-sm shadow-cyan-500/20 transition hover:bg-cyan-200 disabled:opacity-50"
                        >
                            <Zap size={18} className={isGenerating ? 'animate-pulse' : ''} />
                            <span>{isGenerating ? t('backups.generating') : t('backups.generate')}</span>
                        </button>
                    }
                />
            )}

            <section style={reveal(80).style} className={`grid gap-5 rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-5 sm:grid-cols-[1fr_auto] sm:items-center ${reveal(80).className}`}>
                <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <HardDrive size={20} />
                    </span>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('backups.healthTitle')}</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('backups.healthDescription')}</p>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-slate-50/30 px-5 py-4 dark:border-slate-800/60 dark:bg-slate-950/20 sm:text-end">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('backups.retention')}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{t('backups.retentionValue')}</p>
                </div>
            </section>

            <section style={reveal(120).style} className={`rounded-2xl border border-blue-200/70 bg-blue-50/70 p-5 text-sm text-blue-900 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100 ${reveal(120).className}`}>
                <div className="flex gap-3">
                    <LockKeyhole size={20} className="mt-0.5 shrink-0" />
                    <div>
                        <h2 className="font-semibold">{t('backups.restoreGuardTitle')}</h2>
                        <p className="mt-1 text-blue-800/80 dark:text-blue-100/75">{t('backups.restoreGuardDescription')}</p>
                    </div>
                </div>
            </section>

            <section style={reveal(160).style} className={`overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 ${reveal(160).className}`}>
                <div className="flex items-center gap-3 border-b border-slate-200/60 bg-slate-50/40 px-6 py-5 dark:border-slate-800/60 dark:bg-slate-950/20">
                    <FileJson size={20} className="text-slate-400" />
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t('backups.available')}</h2>
                </div>
                
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center p-16">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                        <p className="mt-4 text-sm font-semibold text-slate-500">{t('backups.loading')}</p>
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200/60 bg-slate-50/30 dark:border-slate-800/60 dark:bg-slate-950/20">
                            <ShieldAlert size={36} className="text-slate-400" />
                        </div>
                        <h3 className="mt-5 text-lg font-bold text-slate-800 dark:text-slate-200">{t('backups.emptyTitle')}</h3>
                        <p className="mt-2 text-sm text-slate-500 max-w-sm">{t('backups.emptyDescription')}</p>
                    </div>
                ) : (
                    <BackupList 
                        backups={backups} 
                        locale={locale} 
                        onDownload={handleDownload} 
                        onRestore={setRestoreCandidate} 
                        isRestoring={isRestoring} 
                        t={t} 
                    />
                )}
            </section>

            <ConfirmDialog 
                isOpen={Boolean(restoreCandidate)} 
                onClose={() => setRestoreCandidate(null)} 
                onConfirm={handleRestore} 
                title={t('backups.restoreTitle')} 
                message={t('backups.restoreMessage', { filename: restoreCandidate?.filename })} 
                confirmLabel={t('backups.restoreAction')} 
                cancelLabel={t('backups.cancel')} 
                variant="warning" 
                isLoading={isRestoring} 
            />
        </div>
    );
};

const isPostgresBackup = (backup) => backup.type?.includes('PostgreSQL') || backup.filename.endsWith('.dump') || backup.filename.endsWith('.dump.enc');
const isEncryptedBackup = (backup) => backup.type?.toLowerCase().includes('encrypted') || backup.filename.endsWith('.enc');

const BackupActions = ({ backup, onDownload, onRestore, isRestoring, t }) => (
    <div className="flex flex-wrap justify-end gap-2">
        <button 
            type="button" 
            onClick={() => onDownload(backup.filename)} 
            className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
            <Download size={15} className="text-slate-400 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-200" />
            {t('backups.download')}
        </button>
        {!isPostgresBackup(backup) && (
            <button 
                type="button" 
                onClick={() => onRestore(backup)} 
                disabled={isRestoring} 
                className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:border-amber-800/60 dark:hover:bg-amber-900/40"
            >
                <RotateCcw size={15} className="text-amber-600 dark:text-amber-500 transition-transform group-hover:-rotate-90" />
                {t('backups.restore')}
            </button>
        )}
    </div>
);

const BackupList = ({ backups, locale, onDownload, onRestore, isRestoring, t }) => (
    <>
        <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-start text-sm">
                <thead className="border-b border-slate-200/60 bg-slate-50/40 text-slate-500 dark:border-slate-800/60 dark:bg-slate-950/20 dark:text-slate-400">
                    <tr>
                        <th scope="col" className="px-6 py-4 text-start text-[10px] font-semibold uppercase tracking-wide">{t('backups.filename')}</th>
                        <th scope="col" className="px-6 py-4 text-start text-[10px] font-semibold uppercase tracking-wide">{t('backups.generated')}</th>
                        <th scope="col" className="px-6 py-4 text-start text-[10px] font-semibold uppercase tracking-wide">{t('backups.size')}</th>
                        <th scope="col" className="px-6 py-4 text-end text-[10px] font-semibold uppercase tracking-wide">{t('backups.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50/50 dark:divide-slate-800/50">
                    {backups.map((backup, index) => (
                        <tr key={backup.filename} className="group transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                            <td className="px-6 py-5">
                                <BackupIdentity backup={backup} latest={index === 0} t={t} />
                            </td>
                            <td className="px-6 py-5">
                                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    <Clock size={14} className="text-slate-400" />
                                    {new Date(backup.created_at).toLocaleString(locale)}
                                </span>
                            </td>
                            <td className="px-6 py-5">
                                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                    {formatBytes(backup.size_bytes)}
                                </span>
                            </td>
                            <td className="px-6 py-5">
                                <BackupActions backup={backup} onDownload={onDownload} onRestore={onRestore} isRestoring={isRestoring} t={t} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        
        {/* Mobile View */}
        <div className="divide-y divide-slate-100/80 dark:divide-slate-800 md:hidden">
            {backups.map((backup, index) => (
                <article key={backup.filename} className="p-6 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <BackupIdentity backup={backup} latest={index === 0} t={t} />
                    <div className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-slate-200/60 bg-slate-50/30 p-4 text-xs dark:border-slate-800/60 dark:bg-slate-950/20">
                        <div>
                            <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">{t('backups.generated')}</p>
                            <p className="mt-1.5 font-semibold text-slate-700 dark:text-slate-300">{new Date(backup.created_at).toLocaleString(locale)}</p>
                        </div>
                        <div>
                            <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">{t('backups.size')}</p>
                            <p className="mt-1.5 font-mono font-bold text-slate-700 dark:text-slate-300">{formatBytes(backup.size_bytes)}</p>
                        </div>
                    </div>
                    <div className="mt-5">
                        <BackupActions backup={backup} onDownload={onDownload} onRestore={onRestore} isRestoring={isRestoring} t={t} />
                    </div>
                </article>
            ))}
        </div>
    </>
);

const BackupIdentity = ({ backup, latest, t }) => (
    <div className="flex min-w-0 items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${
            isPostgresBackup(backup) 
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 ring-blue-200 dark:ring-blue-800/50' 
                : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 ring-indigo-200 dark:ring-indigo-800/50'
        }`}>
            {isPostgresBackup(backup) ? <Database size={20} /> : <FileJson size={20} />}
        </span>
        <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 ltr-embed">{backup.filename}</p>
                {latest && (
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                        {t('backups.latest')}
                    </span>
                )}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">
                {isEncryptedBackup(backup) ? t('backups.encryptedPostgres') : isPostgresBackup(backup) ? t('backups.postgres') : t('backups.development')}
            </p>
        </div>
    </div>
);

export default BackupManagement;
