import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import React from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { CalendarPlus, Receipt, ShieldCheck, UserRound, X, KeyRound } from 'lucide-react';
import {
    useCreateInsurancePolicyMutation,
    useCreateInvoiceMutation,
    useGetInsurancePoliciesQuery,
    useGetInsuranceProvidersQuery,
    useGetPatientHistoryQuery,
    useGeneratePortalPasswordMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { formatRelativeTime } from '../utils/dateFormat';
import { getPatientPortalLoginUrl } from '../utils/portalUrls';
import CredentialHandoffDialog from './CredentialHandoffDialog';

const emptyPolicy = {
    providerId: '',
    policyNumber: '',
    memberNumber: '',
    planName: '',
    holderName: '',
    relationshipToHolder: '',
    validTo: '',
    isPrimary: true,
    approvalDocumentUrl: ''
};

const fieldClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-ink)] dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20';

const PatientDetail = ({ patientId, onClose, onBook }) => {
    const { t, i18n } = useTranslation('patientDetail');
    const { data, isLoading } = useGetPatientHistoryQuery(patientId);
    const { data: providers = [] } = useGetInsuranceProvidersQuery();
    const { data: policies = [] } = useGetInsurancePoliciesQuery({ patientId }, { skip: !patientId });
    const [activeTab, setActiveTab] = useState('overview');
    const [policyForm, setPolicyForm] = useState(emptyPolicy);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const [createInvoice, { isLoading: isCreatingInvoice }] = useCreateInvoiceMutation();
    const [createPolicy, { isLoading: isCreatingPolicy }] = useCreateInsurancePolicyMutation();
    const [generatePortalPassword, { isLoading: isGeneratingPassword }] = useGeneratePortalPasswordMutation();
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

    if (!patientId) return null;

    const actualData = data?.data || data || {};
    const patient = actualData.patient || {};
    const history = actualData.history || [];
    const summary = actualData.summary || {};
    
    const latestAppointment = history[0];
    const na = t('fallback.na');
    const formatDate = (value, withTime = false) => value ? new Date(value).toLocaleString(locale, withTime ? {} : { day: '2-digit', month: 'short', year: 'numeric' }) : na;

    const createPatientInvoice = async () => {
        try {
            await createInvoice({ appointmentId: latestAppointment?.appointment_id, patientId: patient?.patient_id }).unwrap();
            toast.success(t('invoiceCreated'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('invoiceError')));
        }
    };

    const createPatientPolicy = async () => {
        try {
            await createPolicy({
                patientId,
                providerId: policyForm.providerId,
                policyNumber: policyForm.policyNumber.trim(),
                memberNumber: policyForm.memberNumber.trim() || undefined,
                planName: policyForm.planName.trim() || undefined,
                holderName: policyForm.holderName.trim() || undefined,
                relationshipToHolder: policyForm.relationshipToHolder.trim() || undefined,
                validTo: policyForm.validTo || undefined,
                isPrimary: policyForm.isPrimary,
                approvalDocumentUrl: policyForm.approvalDocumentUrl.trim() || undefined,
            }).unwrap();
            toast.success(t('policyAdded'));
            setPolicyForm(emptyPolicy);
        } catch (error) {
            toast.error(getErrorMessage(error, t('policyError')));
        }
    };

    const handleGeneratePassword = async () => {
        try {
            const result = await generatePortalPassword(patientId).unwrap();
            setCredentialDialog({
                title: t('page.credentialsTitle'),
                portalLabel: t('page.portal'),
                subjectLabel: t('fields.fullName'),
                subjectName: `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim(),
                identifierLabel: 'MRN',
                identifier: result.mrn,
                password: result.portalPassword,
                loginUrl: getPatientPortalLoginUrl(),
                deliveryHint: t('page.credentialsHint'),
                duration: 20000,
                style: { maxWidth: '500px', backgroundColor: '#f0fdfa', color: '#0f766e', fontWeight: 'bold', border: '1px solid #14b8a6', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }
            });
        } catch (error) {
            toast.error(getErrorMessage(error, t('page.loadError'))); // FIXED error key
        }
    };

    const updatePolicy = (field) => (event) => setPolicyForm((current) => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
    const tabs = ['overview', 'details', 'insurance', 'results'];

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-sm" onMouseDown={onClose}>
            <aside role="dialog" aria-modal="true" aria-label={patient ? `${patient.first_name} ${patient.last_name}` : t('close')} className="fixed inset-y-0 end-0 flex w-full max-w-3xl flex-col bg-white text-slate-900 shadow-2xl dark:bg-[var(--rcms-surface)] dark:text-[var(--rcms-ink)]" onMouseDown={(event) => event.stopPropagation()}>
                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-cyan-700 border-e-transparent dark:border-cyan-500 dark:border-e-transparent" />
                    </div>
                ) : (
                    <>
                        <header className="border-b border-slate-200 bg-slate-50/50 px-5 py-5 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)] sm:px-6">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                                        <UserRound size={22} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="truncate text-2xl font-semibold tracking-[-.03em] text-slate-950 dark:text-white">
                                                {patient?.first_name} {patient?.last_name}
                                            </h2>
                                            {patient?.gender && (
                                                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    {t(`gender.${patient.gender}`)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[var(--rcms-muted)]">
                                            <span className="font-mono ltr-embed">{patient?.mrn}</span>
                                            {patient?.phone && (
                                                <>
                                                    <span aria-hidden="true">&bull;</span>
                                                    <span className="ltr-embed">{patient.phone}</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <button type="button" onClick={onClose} aria-label={t('close')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)] dark:hover:bg-[var(--rcms-line)] dark:hover:text-[var(--rcms-ink)]">
                                    <X size={17} />
                                </button>
                            </div>
                            <div className="mt-5 grid gap-2 sm:grid-cols-3">
                                <button type="button" onClick={() => onBook(patient)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 text-sm font-bold text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-700">
                                    <CalendarPlus size={17} />
                                    {t('book')}
                                </button>
                                <button type="button" onClick={createPatientInvoice} disabled={isCreatingInvoice || !latestAppointment} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40">
                                    <Receipt size={17} />
                                    {isCreatingInvoice ? t('creatingInvoice') : t('createInvoice')}
                                </button>
                                <button type="button" onClick={handleGeneratePassword} disabled={isGeneratingPassword} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40">
                                    <KeyRound size={17} />
                                    {isGeneratingPassword ? t('fallback.generating') : t('fallback.password')}
                                </button>
                            </div>
                        </header>

                        <section className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/50 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)]">
                            {[
                                [t('stats.visits'), summary?.visit_count || 0],
                                [t('stats.lastVisit'), summary?.last_visit ? formatRelativeTime(summary.last_visit, locale) : t('stats.never')],
                                [t('stats.spent'), `${summary?.total_spent || 0} ${t('currency.egp')}`]
                            ].map(([label, value]) => (
                                <div key={label} className="border-e border-slate-200 p-3 text-center last:border-e-0 dark:border-[var(--rcms-line)] sm:p-4">
                                    <p className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-500 dark:text-[var(--rcms-muted)]">
                                        {label}
                                    </p>
                                    <p className="mt-1 text-sm font-black text-slate-900 dark:text-[var(--rcms-ink)] sm:text-base">
                                        {value}
                                    </p>
                                </div>
                            ))}
                        </section>

                        <nav className="flex overflow-x-auto border-b border-slate-200 bg-white px-2 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]">
                            {tabs.map((tab) => (
                                <button type="button" key={tab} onClick={() => setActiveTab(tab)} className={`min-w-fit flex-1 border-b-2 px-3 py-3 text-xs font-bold transition ${activeTab === tab ? 'border-cyan-700 text-cyan-800 dark:border-cyan-400 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-[var(--rcms-muted)] dark:hover:text-[var(--rcms-ink)]'}`}>
                                    {t(`tabs.${tab}`)}
                                </button>
                            ))}
                        </nav>

                        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-[var(--rcms-surface-muted)] sm:p-6">
                            {activeTab === 'overview' && (
                                <div className="space-y-3">
                                    {history.length === 0 ? (
                                        <Empty>{t('history.empty')}</Empty>
                                    ) : (
                                        history.map((appointment, index) => (
                                            <article key={appointment.appointment_id} className="relative rounded-2xl border border-slate-200 bg-white p-4 ps-14 shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]">
                                                <span className={`absolute start-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${index === 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)]'}`}>
                                                    {history.length - index}
                                                </span>
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                    <div>
                                                        <h3 className="font-bold text-slate-900 dark:text-[var(--rcms-ink)]">
                                                            {appointment.machine_name}
                                                            {appointment.exam_type_name && (
                                                                <> <span aria-hidden="true">&bull;</span> {appointment.exam_type_name}</>
                                                            )}
                                                        </h3>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-[var(--rcms-muted)]">
                                                            {appointment.status} <span aria-hidden="true">&bull;</span> {appointment.payment_amount || 0} {t('currency.egp')} ({appointment.payment_method || na})
                                                        </p>
                                                    </div>
                                                    <time className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                                                        {formatDate(appointment.start_time, true)}
                                                    </time>
                                                </div>
                                            </article>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'details' && (
                                <div className="space-y-4">
                                    <InfoSection title={t('sections.personal')} items={[[t('fields.fullName'), `${patient?.first_name || ''} ${patient?.last_name || ''}`], [t('fields.dob'), patient?.date_of_birth], [t('fields.gender'), patient?.gender ? t(`gender.${patient.gender}`) : na], [t('fields.status'), t(`status.${patient?.patient_status || 'Active'}`)], [t('fields.nationalId'), patient?.national_id], [t('fields.passport'), patient?.passport_number]]} fallback={na} />
                                    <InfoSection title={t('sections.contact')} items={[[t('fields.address'), patient?.address], [t('fields.phone'), patient?.phone], [t('fields.emergencyContact'), patient?.emergency_contact_name], [t('fields.emergencyPhone'), patient?.emergency_contact_phone]]} fallback={na} />
                                    <InfoSection title={t('sections.medical')} items={[[t('fields.allergies'), patient?.allergies], [t('fields.diseases'), patient?.chronic_diseases], [t('fields.surgeries'), patient?.prior_surgeries], [t('fields.pregnancy'), patient?.pregnancy_status || t('fallback.unknown')], [t('fields.implants'), patient?.implants_devices], [t('fields.renal'), patient?.renal_function_notes]]} fallback={t('fallback.none')} />
                                </div>
                            )}

                            {activeTab === 'insurance' && (
                                <div className="space-y-4">
                                    <Card title={t('sections.policies')} icon={ShieldCheck}>
                                        {policies.length === 0 ? (
                                            <Empty>{t('policy.empty')}</Empty>
                                        ) : (
                                            <div className="space-y-2">
                                                {policies.map((policy) => (
                                                    <article key={policy.policy_id} className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3.5 dark:border-cyan-900/40 dark:bg-cyan-900/20">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h4 className="font-bold text-cyan-950 dark:text-cyan-100">{policy.provider_name}</h4>
                                                            {policy.is_primary && (
                                                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-cyan-800 shadow-sm dark:bg-cyan-950 dark:text-cyan-300">
                                                                    {t('policy.primary')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-cyan-900 ltr-embed dark:text-cyan-200">
                                                            <span>{policy.policy_number}</span>
                                                            {policy.member_number && (
                                                                <>
                                                                    <span aria-hidden="true">&bull;</span>
                                                                    <span>{policy.member_number}</span>
                                                                </>
                                                            )}
                                                        </p>
                                                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-cyan-700 dark:text-cyan-400">
                                                            <span>{policy.plan_name || t('policy.noPlan')}</span>
                                                            {policy.valid_to && (
                                                                <>
                                                                    <span aria-hidden="true">&bull;</span>
                                                                    <span>{t('policy.validTo', { date: formatDate(policy.valid_to) })}</span>
                                                                </>
                                                            )}
                                                        </p>
                                                        {policy.approval_document_url && (
                                                            <a href={policy.approval_document_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-cyan-800 hover:underline dark:text-cyan-300">
                                                                {t('policy.document')}
                                                            </a>
                                                        )}
                                                    </article>
                                                ))}
                                            </div>
                                        )}
                                    </Card>
                                    <Card title={t('sections.addPolicy')} icon={ShieldCheck}>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <select value={policyForm.providerId} onChange={updatePolicy('providerId')} className={fieldClass}>
                                                <option value="">{t('policy.provider')}</option>
                                                {providers.map((provider) => (
                                                    <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>
                                                ))}
                                            </select>
                                            {[['policyNumber', 'number'], ['memberNumber', 'member'], ['planName', 'plan'], ['holderName', 'holder'], ['relationshipToHolder', 'relationship']].map(([field, key]) => (
                                                <input key={field} value={policyForm[field]} onChange={updatePolicy(field)} placeholder={t(`policy.${key}`)} className={fieldClass} />
                                            ))}
                                            <input type="date" value={policyForm.validTo} onChange={updatePolicy('validTo')} className={fieldClass} />
                                            <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-ink)]">
                                                <input type="checkbox" checked={policyForm.isPrimary} onChange={updatePolicy('isPrimary')} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-600 dark:border-slate-600 dark:bg-slate-700 dark:ring-offset-slate-900" />
                                                {t('policy.primaryLabel')}
                                            </label>
                                            <input value={policyForm.approvalDocumentUrl} onChange={updatePolicy('approvalDocumentUrl')} placeholder={t('policy.documentUrl')} className={`${fieldClass} sm:col-span-2`} />
                                            <button type="button" onClick={createPatientPolicy} disabled={isCreatingPolicy || !policyForm.providerId || !policyForm.policyNumber.trim()} className="h-11 rounded-xl bg-cyan-700 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50 sm:col-span-2 dark:bg-cyan-600 dark:hover:bg-cyan-700">
                                                {isCreatingPolicy ? t('policy.saving') : t('policy.add')}
                                            </button>
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {activeTab === 'results' && (
                                <div className="space-y-3">
                                    {history.filter((item) => item.exam_id).length === 0 ? (
                                        <Empty>{t('results.empty')}</Empty>
                                    ) : (
                                        history.filter((item) => item.exam_id).map((item) => (
                                            <article key={item.exam_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <h3 className="font-bold text-slate-900 dark:text-[var(--rcms-ink)]">
                                                            {item.exam_type_name || item.machine_name || t('results.fallback')}
                                                        </h3>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-[var(--rcms-muted)]">
                                                            {formatDate(item.start_time, true)}
                                                        </p>
                                                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                                                            {t('results.report')}: {item.report_status || item.status || t('results.pending')}
                                                        </p>
                                                    </div>
                                                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${item.delivered_at ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                                        {item.latest_delivery_status || (item.delivered_at ? t('results.delivered') : t('results.notDelivered'))}
                                                    </span>
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                                                    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-[var(--rcms-surface-muted)]">
                                                        {t('results.copies')}: <strong className="dark:text-[var(--rcms-ink)]">{item.print_copy_count || 0}</strong>
                                                    </div>
                                                    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-[var(--rcms-surface-muted)]">
                                                        {t('results.lastDelivery')}: <strong className="dark:text-[var(--rcms-ink)]">{item.last_result_delivery_at ? formatRelativeTime(item.last_result_delivery_at, locale) : t('results.none')}</strong>
                                                    </div>
                                                </div>
                                            </article>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </aside>
            <CredentialHandoffDialog isOpen={Boolean(credentialDialog)} credentials={credentialDialog} onClose={() => setCredentialDialog(null)} />
        </div>,
        document.body
    );
};

const Card = ({ title, icon: Icon, children }) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]">
        <h3 className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-[var(--rcms-ink)]">
            <Icon size={16} className="text-cyan-700 dark:text-cyan-400" />
            {title}
        </h3>
        {children}
    </section>
);

const InfoSection = ({ title, items, fallback }) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-raised)]">
        <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-[var(--rcms-ink)]">
            {title}
        </h3>
        <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
            {items.map(([label, value]) => (
                <div key={label}>
                    <dt className="text-xs text-slate-500 dark:text-[var(--rcms-muted)]">{label}</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-[var(--rcms-ink)]">{value || fallback}</dd>
                </div>
            ))}
        </dl>
    </section>
);

const Empty = ({ children }) => (
    <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-[var(--rcms-muted)]">
        {children}
    </div>
);

export default PatientDetail;
