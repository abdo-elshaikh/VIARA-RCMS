import React from 'react';
import { RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetSystemUpdateStatusQuery, useGetSystemUpdateHistoryQuery } from '../../store/api';

const SystemUpdateSettings = () => {
    const { i18n } = useTranslation(['settings', 'common']);
    const ar = i18n.dir() === 'rtl';
    const { data: status, isLoading, isError, refetch } = useGetSystemUpdateStatusQuery();
    const { data: history = [], refetch: refreshHistory } = useGetSystemUpdateHistoryQuery(20);
    return (
        <section className="space-y-5" aria-busy={isLoading}>
            <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Server aria-hidden="true" />
                        <h2 className="text-xl font-bold">{ar ? '????? ??????' : 'System release'}</h2>
                        {status?.currentVersion && <span className="rounded-full bg-[var(--VIARA-surface-muted)] px-3 py-1 font-mono">v{status.currentVersion}</span>}
                    </div>
                    <button type="button" className="ds-button ds-button-secondary" disabled={isLoading} onClick={() => { refetch(); refreshHistory(); }}>
                        <RefreshCw size={16} aria-hidden="true" /> {ar ? '????? ??????' : 'Refresh status'}
                    </button>
                </div>
                {isError && <p role="alert" className="mt-4">{ar ? '???? ????? ???? ???????. ??? ????????.' : 'Release status could not be loaded. Try again.'}</p>}
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4">
                    <ShieldCheck size={22} className="shrink-0" aria-hidden="true" />
                    <div>
                        <h3 className="font-bold">{ar ? '??????? ??? ???? ??? ??????' : 'Updates use an approved release deployment'}</h3>
                        <p className="mt-2 text-sm leading-7 text-[var(--VIARA-muted)]">
                            {ar ? '????? ??????? ?????? ????? ??????? ??? ????? ???? ???????? ??????? ?????????. ??? ????? ???????? ?? ???? ??????? ??? ???? ?? ??? ???????.' : 'The operations administrator deploys releases after creating a backup and testing recovery. Package uploads and in-app installation are unavailable in this release.'}
                        </p>
                    </div>
                </div>
                <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                    <div><dt>{ar ? '??????' : 'Environment'}</dt><dd>{status?.environment || '?'}</dd></div>
                    <div><dt>{ar ? '????????? ???????' : 'Recorded migrations'}</dt><dd>{status?.migrationsCount ?? '?'}</dd></div>
                    <div><dt>{ar ? '??? ?????' : 'Last migration'}</dt><dd className="break-all text-sm">{status?.lastMigration?.version || '?'}</dd></div>
                </dl>
            </div>
            <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-6">
                <h3 className="font-bold">{ar ? '????? ??????' : 'Historical records'}</h3>
                <p className="mt-2 text-sm text-[var(--VIARA-muted)]">{ar ? '????? ???????? ?? ???? ???? ???????? ?????? ??????? ?????? ?????? ??? ?????.' : 'Historical records do not prove a successful upgrade. Verify the running release and deployment checks.'}</p>
                {!history.length ? <p className="mt-4 text-sm">{ar ? '?? ???? ????? ?????.' : 'No historical records.'}</p> : (
                    <ul className="mt-4 divide-y divide-[var(--VIARA-line)]">
                        {history.map(row => <li key={row.update_id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{row.from_version} ? {row.to_version}</span><span>{row.status}</span><time>{row.applied_at ? new Date(row.applied_at).toLocaleString(i18n.language) : '?'}</time></li>)}
                    </ul>
                )}
            </div>
        </section>
    );
};
export default SystemUpdateSettings;
