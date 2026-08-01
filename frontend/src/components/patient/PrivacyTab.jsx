import { useMemo, useState } from 'react';
import {
    useAddPatientConsentMutation,
    useCreatePrivacyRequestMutation,
    useGetCurrentPatientConsentsQuery,
    useGetPatientConsentsQuery,
    useRevokePatientConsentMutation
} from '../../store/api';
import { CheckCircle2, Download, FileText, RefreshCw, Shield, ShieldOff, Trash2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../ui/ConfirmDialog';
import TextPromptDialog from '../ui/TextPromptDialog';

const consentTypes = [
    { type: 'Treatment', labelKey: 'treatmentLabel', detailKey: 'treatmentDetail' },
    { type: 'DataSharing', labelKey: 'dataSharingLabel', detailKey: 'dataSharingDetail' },
    { type: 'Marketing', labelKey: 'marketingLabel', detailKey: 'marketingDetail' }
];

const flagLabels = {
    consent_email: 'email',
    consent_sms: 'sms',
    consent_whatsapp: 'whatsapp',
    consent_marketing: 'marketing',
    consent_data_sharing: 'dataSharing'
};

const PrivacyTab = ({ patient }) => {
    const { t, i18n } = useTranslation('patientDetail');
    const patientId = patient.patient_id;
    const patientLabel = patient.name || [patient.first_name, patient.last_name].filter(Boolean).join(' ') || patient.mrn;
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
    const { data: consents = [], isLoading: isLoadingConsents, refetch } = useGetPatientConsentsQuery(patientId);
    const { data: currentState } = useGetCurrentPatientConsentsQuery(patientId);
    const [addConsent, { isLoading: isAdding }] = useAddPatientConsentMutation();
    const [revokeConsent, { isLoading: isRevoking }] = useRevokePatientConsentMutation();
    const [createPrivacyRequest] = useCreatePrivacyRequestMutation();

    const [pendingRequestType, setPendingRequestType] = useState(null);
    const [requestingType, setRequestingType] = useState(null);
    const [revokeTarget, setRevokeTarget] = useState(null);

    const activeConsentByType = useMemo(() => {
        const map = new Map();
        consents.forEach(consent => {
            if (!map.has(consent.type) && consent.status !== 'Revoked') map.set(consent.type, consent);
        });
        return map;
    }, [consents]);

    const handleAddConsent = async (type) => {
        try {
            await addConsent({ patientId, type, source: 'Staff' }).unwrap();
            toast.success(t('privacy.consentRecorded', { type }));
        } catch {
            toast.error(t('privacy.consentError'));
        }
    };

    const handleRevokeConsent = async (reason) => {
        if (!revokeTarget) return false;
        try {
            await revokeConsent({ consentId: revokeTarget.consent_id, reason }).unwrap();
            toast.success(t('privacy.consentRevoked', { defaultValue: 'Consent revoked.' }));
            setRevokeTarget(null);
            return true;
        } catch {
            toast.error(t('privacy.revokeError', { defaultValue: 'Consent could not be revoked.' }));
            return false;
        }
    };

    const handlePrivacyRequest = async (type) => {
        try {
            setRequestingType(type);
            await createPrivacyRequest({
                patient_id: patientId,
                request_type: type,
                notes: `Initiated by staff for ${patient.mrn}`
            }).unwrap();
            toast.success(t('privacy.requestSubmitted', { type }));
            return true;
        } catch {
            toast.error(t('privacy.requestError', { type }));
            return false;
        } finally {
            setRequestingType(null);
        }
    };

    return (
        <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={t('privacy.currentState', { defaultValue: 'Current privacy state' })}>
                {Object.entries(flagLabels).map(([key, labelKey]) => {
                    const enabled = Boolean(currentState?.current?.[key]);
                    return (
                        <div key={key} className={`rounded-2xl border p-4 ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-black uppercase">{t(`privacy.flags.${labelKey}`)}</p>
                                {enabled ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                            </div>
                            <p className="mt-2 text-sm font-bold">{enabled ? t('privacy.enabled', { defaultValue: 'Enabled' }) : t('privacy.disabled', { defaultValue: 'Disabled' })}</p>
                        </div>
                    );
                })}
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <FileText className="text-blue-500" size={20} />
                            <h3 className="text-lg font-bold text-slate-800">{t('privacy.legalConsents', { defaultValue: 'Legal consents' })}</h3>
                        </div>
                        <button type="button" onClick={refetch} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={t('common.refresh', { defaultValue: 'Refresh' })}>
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        {consentTypes.map(item => {
                            const active = activeConsentByType.get(item.type);
                            return (
                                <article key={item.type} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{t(`privacy.consentTypes.${item.labelKey}`)}</p>
                                            <p className="mt-1 text-xs leading-5 text-slate-500">{t(`privacy.consentTypes.${item.detailKey}`)}</p>
                                        </div>
                                        {active ? <Shield className="text-emerald-500" size={18} /> : <ShieldOff className="text-slate-400" size={18} />}
                                    </div>
                                    <div className="mt-4 flex items-center gap-2">
                                        {active ? (
                                            <button type="button" onClick={() => setRevokeTarget(active)} disabled={isRevoking} className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg">
                                                {t('privacy.revoke', { defaultValue: 'Revoke' })}
                                            </button>
                                        ) : (
                                            <button type="button" onClick={() => handleAddConsent(item.type)} disabled={isAdding} className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                                                {t('privacy.record', { defaultValue: 'Record' })}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">{t('privacy.consentHistory', { defaultValue: 'Consent history' })}</h4>
                        {isLoadingConsents ? (
                            <div className="text-sm text-slate-400">{t('common.loading', { defaultValue: 'Loading...' })}</div>
                        ) : consents.length === 0 ? (
                            <div className="text-sm text-slate-400">{t('privacy.noConsents', { defaultValue: 'No consents recorded yet.' })}</div>
                        ) : (
                            <ul className="space-y-2">
                                {consents.map(consent => (
                                    <li key={consent.consent_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-xs">
                                        <span className="font-semibold text-slate-700">{t(`privacy.types.${consent.type}`, { defaultValue: consent.type })}</span>
                                        <span className={consent.status === 'Revoked' ? 'font-bold text-red-600' : 'font-bold text-emerald-600'}>{t(`privacy.statuses.${consent.status}`, { defaultValue: consent.status })}</span>
                                        <span className="text-slate-500">{new Date(consent.revoked_at || consent.signed_at).toLocaleDateString(locale)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <Shield className="text-emerald-500" size={20} />
                        <h3 className="text-lg font-bold text-slate-800">{t('privacy.dataRequests', { defaultValue: 'Data-subject requests' })}</h3>
                    </div>

                    <p className="mb-6 text-sm leading-6 text-slate-600">
                        {t('privacy.dataRequestsDescription', { defaultValue: 'Submit export, correction, or anonymization requests to the Privacy Center for controlled review and audit.' })}
                    </p>

                    <div className="space-y-3">
                        <button type="button" onClick={() => setPendingRequestType('Export')} disabled={requestingType === 'Export'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">
                            <Download size={18} /> {requestingType === 'Export' ? t('privacy.submitting', { defaultValue: 'Submitting...' }) : t('privacy.requestExport', { defaultValue: 'Request data export' })}
                        </button>

                        <button type="button" onClick={() => setPendingRequestType('Correction')} disabled={requestingType === 'Correction'} className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50">
                            <FileText size={18} /> {requestingType === 'Correction' ? t('privacy.submitting', { defaultValue: 'Submitting...' }) : t('privacy.requestCorrection', { defaultValue: 'Request correction' })}
                        </button>

                        <button type="button" onClick={() => setPendingRequestType('Anonymize')} disabled={requestingType === 'Anonymize'} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50">
                            <Trash2 size={18} /> {requestingType === 'Anonymize' ? t('privacy.submitting', { defaultValue: 'Submitting...' }) : t('privacy.requestAnonymize', { defaultValue: 'Request anonymization' })}
                        </button>
                    </div>
                </section>
            </div>

            <ConfirmDialog
                isOpen={Boolean(pendingRequestType)}
                onClose={() => setPendingRequestType(null)}
                onConfirm={() => handlePrivacyRequest(pendingRequestType)}
                title={pendingRequestType === 'Anonymize' ? t('privacy.anonymizeTitle') : pendingRequestType === 'Correction' ? t('privacy.correctionTitle') : t('privacy.exportTitle')}
                message={pendingRequestType === 'Anonymize' ? t('privacy.anonymizeMessage', { patient: patientLabel }) : pendingRequestType === 'Correction' ? t('privacy.correctionMessage', { patient: patientLabel }) : t('privacy.exportMessage', { patient: patientLabel })}
                confirmLabel={pendingRequestType === 'Anonymize' ? t('privacy.anonymizeConfirm') : pendingRequestType === 'Correction' ? t('privacy.correctionConfirm') : t('privacy.exportConfirm')}
                cancelLabel={t('privacy.cancel')}
                variant={pendingRequestType === 'Anonymize' ? 'danger' : 'info'}
                isLoading={Boolean(requestingType)}
            />

            <TextPromptDialog
                isOpen={Boolean(revokeTarget)}
                onClose={() => setRevokeTarget(null)}
                onConfirm={handleRevokeConsent}
                title={t('privacy.revokeTitle', { defaultValue: 'Revoke consent' })}
                message={t('privacy.revokeMessage', { defaultValue: 'Record a reason for revoking this consent.' })}
                label={t('privacy.revokeReason', { defaultValue: 'Reason' })}
                placeholder={t('privacy.revokeReasonPlaceholder', { defaultValue: 'Patient withdrew consent' })}
                confirmLabel={t('privacy.revokeConfirm', { defaultValue: 'Revoke consent' })}
                cancelLabel={t('privacy.cancel')}
                validationMessage={t('privacy.revokeRequired', { defaultValue: 'Enter a revocation reason.' })}
                inputProps={{ maxLength: 1000 }}
                isLoading={isRevoking}
            />
        </div>
    );
};

export default PrivacyTab;
