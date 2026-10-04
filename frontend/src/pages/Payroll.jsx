import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
    AlertCircle,
    AlertTriangle,
    BadgeDollarSign,
    Banknote,
    BookOpen,
    Briefcase,
    Building2,
    Calculator,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardCheck,
    Clock,
    Coins,
    CreditCard,
    Download,
    Eye,
    FileCheck,
    FileSpreadsheet,
    FileText,
    Filter,
    HelpCircle,
    Layers,
    LayoutDashboard,
    Lock,
    LockKeyhole,
    MinusCircle,
    Percent,
    Plus,
    Printer,
    Receipt,
    RefreshCw,
    Scale,
    ScrollText,
    Search,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    TrendingDown,
    TrendingUp,
    UserCheck,
    Users,
    X,
    Zap
} from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import PageHeader from '../components/ui/PageHeader';
import SalarySimulatorModal from '../components/hr/SalarySimulatorModal';
import { printWhenReady } from '../utils/printDocument';
import {
    useCalculatePayrollRunMutation,
    useCancelPayrollPeriodMutation,
    useCreatePayrollCompensationMutation,
    useCreatePayrollDeductionMutation,
    useCreatePayrollPenaltyMutation,
    useCreatePayrollPeriodMutation,
    useCreatePayrollRuleMutation,
    useGetPayrollEmployeesQuery,
    useGetPayrollCompensationQuery,
    useGetPayrollDeductionsQuery,
    useGetPayrollOverviewQuery,
    useGetPayrollPenaltiesQuery,
    useGetPayrollPeriodsQuery,
    useGetPayrollRulesQuery,
    useGetPayrollRunQuery,
    useGetCenterSettingsQuery,
    useUpdatePayrollDeductionStatusMutation,
    useUpdatePayrollPenaltyStatusMutation,
    useResolvePayrollPenaltyDisputeMutation,
    useUpdatePayrollRuleStatusMutation,
    useUpdatePayrollRunStatusMutation,
    useUpdatePayrollCompensationMutation,
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import {
    clearStoredPayrollPaymentKey,
    firstDayOfCurrentMonthInput,
    getPayrollPermissions,
    getStoredPayrollPaymentKey,
    lastDayOfCurrentMonthInput,
    todayInput,
} from '../utils/payrollWorkflow';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../utils/centerSettings';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_FINANCIAL_BRANCH_ID = '00000000-0000-4000-8000-000000000001';

const money = (value, currency = 'EGP') => {
    const amount = Number(value || 0);
    const formatted = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
    return formatted.replace(/\s+/g, '\u00A0');
};

const csvCell = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
};

const getErrorMessage = (error, fallback) => (
    error?.data?.error || error?.data?.message || error?.error || fallback
);

const statusTone = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Calculated: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300',
    Reviewed: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300',
    Approved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    Paid: 'bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300',
    Locked: 'bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300',
    Cancelled: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300',
};

const WORKFLOW_STEPS = ['Draft', 'Calculated', 'Reviewed', 'Approved', 'Paid', 'Locked'];

/* ── Comprehensive Official Employment & Appointment Contract Modal ────────────────────── */
const ContractModal = ({ profile, currency, identity, onClose, isArabic }) => {
    const { t } = useTranslation('payroll');
    if (!profile) return null;
    const contractId = `CTR-${(profile.profile_id || 'PRO').slice(0, 8).toUpperCase()}`;
    const issueDate = new Date().toISOString().slice(0, 10);
    const startDate = profile.effective_from?.slice(0, 10) || issueDate;
    const endDate = profile.effective_to ? profile.effective_to.slice(0, 10) : (t('indefiniteDurationAutoRenewing'));
    const standardHours = profile.standard_hours_per_day || 8;
    const standardDays = profile.standard_days_per_period || 22;
    const monthlyRate = profile.salary_type === 'Monthly' ? Number(profile.base_salary || 0) : Number(profile.hourly_rate || 0) * standardHours * standardDays;
    const legalName = isArabic
        ? (identity?.legal_name_ar || identity?.legal_name)
        : (identity?.legal_name || identity?.legal_name_ar);
    const organizationName = legalName || identity?.displayName || identity?.centerName || (t('medicalCenter'));
    const legalReferences = [
        identity?.medicalLicense && `${t('healthMinistryLic')}: ${identity.medicalLicense}`,
        identity?.commercialRegistration && `${t('cr')}: ${identity.commercialRegistration}`,
        identity?.taxNumber && `${t('taxId')}: ${identity.taxNumber}`,
    ].filter(Boolean);

    return createPortal(
        <div className="payslip-print-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="payslip-print-root flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200 sm:max-h-[92vh] sm:rounded-3xl">
                {/* Header Action Bar */}
                <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20">
                            <ScrollText size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('unifiedOfficialEmploymentAppointmentContract')}
                                </h2>
                                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-black text-teal-800 dark:text-teal-300 border border-teal-500/30">
                                    {profile.salary_type === 'Monthly' ? (t('fullTime')) : (t('partTime'))}
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-400">
                                {t('payslip.docRef', { contractId, issueDate })}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => printWhenReady()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xs transition hover:brightness-110"
                        >
                            <Printer size={14} />
                            <span>{t('printContract')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition"
                        >
                            <X size={17} />
                        </button>
                    </div>
                </div>

                {/* Printable Official Contract Body */}
                <div className="payslip-scroll flex-1 space-y-5 overflow-y-auto p-4 text-xs text-slate-800 dark:text-slate-200 sm:p-8">
                    {/* Official Medical Center Letterhead */}
                    <div className="relative overflow-hidden rounded-2xl border-2 border-teal-600/30 bg-gradient-to-br from-teal-50/70 via-white to-slate-50 p-5 dark:border-teal-500/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                                {identity?.logoUrl ? (
                                    <img
                                        src={identity.logoUrl}
                                        alt=""
                                        className="h-12 w-12 shrink-0 rounded-xl border border-teal-100 bg-white object-contain p-1 shadow-xs"
                                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                    />
                                ) : null}
                                <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Building2 className="text-teal-700 dark:text-teal-400" size={24} />
                                    <h1 className="truncate text-lg font-black text-teal-950 dark:text-teal-100">
                                        {organizationName}
                                    </h1>
                                </div>
                                <p className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                    {legalReferences.length
                                        ? legalReferences.join(' · ')
                                        : (t('registeredCenterAndBranchIdentity'))}
                                </p>
                                </div>
                            </div>
                            <div className="rounded-xl border border-teal-500/30 bg-white/90 p-2.5 text-start sm:text-end dark:bg-slate-900 shadow-2xs shrink-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    {t('contractRef')}
                                </p>
                                <p className="font-mono text-sm font-black text-slate-900 dark:text-white">{contractId}</p>
                                <p className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400">
                                    {t('verifiedDigitalContract')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Legal Preamble */}
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80 dark:bg-slate-950/40 dark:border-slate-800 text-[11.5px] leading-relaxed">
                        <p className="font-bold text-slate-700 dark:text-slate-300">
                            {isArabic
                                ? `إنه في يوم (${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})، الموافق (${issueDate})، تم الاتفاق والتراضي والتعاقد بين كل من:`
                                : `On this day (${issueDate}), this Employment & Appointment Contract is entered into by and between:`}
                        </p>
                    </div>

                    {/* Parties Definition Cards */}
                    <div className="grid gap-3.5 sm:grid-cols-2">
                        <div className="rounded-2xl border border-teal-200/90 bg-teal-50/50 p-4 dark:border-teal-500/20 dark:bg-slate-950/50">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                <ShieldCheck size={12} />
                                {t('firstPartyEmployerMedicalCenter')}
                            </span>
                            <p className="mt-1.5 text-sm font-black text-slate-900 dark:text-white">
                                {organizationName}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                                {t('representedByMedicalManagingDirector')}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-slate-500">
                                {identity?.address
                                    ? `${t('location')}: ${identity.address}`
                                    : (t('branchAddressIsNotConfiguredYet'))}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-teal-200/90 bg-teal-50/50 p-4 dark:border-teal-500/20 dark:bg-slate-950/50">
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                <UserCheck size={12} />
                                {t('secondPartyEmployeePhysicianStaff')}
                            </span>
                            <p className="mt-1.5 text-sm font-black text-slate-900 dark:text-white">
                                {profile.employee_name}
                            </p>
                            <p className="mt-0.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                                {t('payslip.designation', { role: profile.role })}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-slate-500">
                                {t('payslip.staffId', { id: profile.user_id ? profile.user_id.slice(0, 8).toUpperCase() : '-' })}
                            </p>
                        </div>
                    </div>

                    {/* Financial Summary Strip */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                        <h3 className="text-xs font-black uppercase tracking-wider text-teal-900 dark:text-teal-200 mb-3">
                            {t('contractedCompensationSummary')}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-xl bg-white p-3 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-slate-400">{t('baseSalary')}</p>
                                <p className="mt-1 font-mono text-sm font-black whitespace-nowrap text-teal-700 dark:text-teal-300">
                                    {profile.salary_type === 'Monthly' ? money(profile.base_salary, currency) : `${money(profile.hourly_rate, currency)}/hr`}
                                </p>
                            </div>
                            <div className="rounded-xl bg-white p-3 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-slate-400">{t('overtimeRate')}</p>
                                <p className="mt-1 font-mono text-sm font-black whitespace-nowrap text-slate-800 dark:text-slate-200">
                                    {money(Number(profile.hourly_rate || (profile.base_salary ? profile.base_salary / (standardDays * standardHours) : 0)), currency)}
                                </p>
                            </div>
                            <div className="rounded-xl bg-white p-3 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-slate-400">{t('dailyHours')}</p>
                                <p className="mt-1 font-mono text-sm font-black text-slate-800 dark:text-slate-200">
                                    {standardHours} {t('hrsDay')}
                                </p>
                            </div>
                            <div className="rounded-xl bg-white p-3 border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-slate-400">{t('monthlyDays')}</p>
                                <p className="mt-1 font-mono text-sm font-black text-slate-800 dark:text-slate-200">
                                    {standardDays} {t('daysPeriod')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Legal & Healthcare Clauses (10 Clauses) */}
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/60 leading-relaxed text-xs">
                        {/* Clause 1 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause1AppointmentDutiesReporting')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {isArabic
                                    ? `يعين الطرف الأول الطرف الثاني للعمل بوظيفة (${profile.role}) ويلتزم الطرف الثاني بأداء المهام والواجبات المنوطة به بدقة متناهية وطبقاً لأعلى المعايير الطبية والإدارية المعتمدة في مركز طيبة للأشعة، مع الخضوع المباشر لتوجيهات الإدارة الطبية ورؤساء الأقسام.`
                                    : `The First Party hereby appoints the Second Party to the role of (${profile.role}). The Second Party undertakes to perform all clinical and administrative duties with utmost diligence, adhering to all professional standards and reporting to the Medical Director.`}
                            </p>
                        </div>

                        {/* Clause 2 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause2TermProbationAutoRenewal')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {isArabic
                                    ? `يسري هذا العقد اعتباراً من تاريخ (${startDate}) وحتى تاريخ (${endDate}). وتعتبر الأشهر الثلاثة الأولى من بدء العمل فترة اختبار وتقييم أداء يحق خلالها للمنشأة إنهاء العقد إذا ثبت عدم الكفاءة. ويتجدد العقد تلقائياً لمدد مماثلة ما لم يخطر أحد الطرفين الآخر برغبته في عدم التجديد قبل نهاية المدة بـ (٣٠) يوماً على الأقل.`
                                    : `This contract takes effect on (${startDate}) and remains valid until (${endDate}). The first 3 months serve as a probation period. The contract shall automatically renew for successive terms unless either party gives written notice at least 30 days prior.`}
                            </p>
                        </div>

                        {/* Clause 3 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause3CompensationMonthlyDisbursement')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {isArabic
                                    ? `يستحق الطرف الثاني نظير قيامه بواجباته راتباً تعاقدياً قدره (${profile.salary_type === 'Monthly' ? money(profile.base_salary, currency) : `${money(profile.hourly_rate, currency)} لكل ساعة عمل`})، ويتم الصرف شهرياً في نهاية كل شهر ميلادي عبر التحويل البنكي لحساب الموظف أو عبر الخزينة، بعد خصم الاستقطاعات والتأمينات القانونية وأي جزاءات معتمدة.`
                                    : `The Second Party is entitled to a contracted salary of (${profile.salary_type === 'Monthly' ? money(profile.base_salary, currency) : `${money(profile.hourly_rate, currency)} per hour`}), disbursed monthly via bank transfer or cashier, net of mandatory deductions.`}
                            </p>
                        </div>

                        {/* Clause 4 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause4WorkingHoursRosterShifts')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {isArabic
                                    ? `يلتزم الطرف الثاني بالعمل لمدة (${standardHours}) ساعات يومياً بواقع (${standardDays}) يوماً في الشهر، مع الالتزام التام بجدول الورديات والنوبتجيات الطارئة المحددة من إدارة المركز، وتسجيل الحضور والانصراف عبر النظام الإلكتروني المعتمد.`
                                    : `The Second Party agrees to work (${standardHours}) hours per day across (${standardDays}) days per period, adhering to shift rosters and electronic attendance clocking.`}
                            </p>
                        </div>

                        {/* Clause 5 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause5RadiationClinicalSafetyStandards')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('theSecondPartyMustStrictlyObserve')}
                            </p>
                        </div>

                        {/* Clause 6 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause6AnnualPublicMedicalLeaves')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('theSecondPartyIsEntitledTo')}
                            </p>
                        </div>

                        {/* Clause 7 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause7SocialInsuranceHealthcareCoverage')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('theEmployerCommitsToRegisteringThe')}
                            </p>
                        </div>

                        {/* Clause 8 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause8MedicalRecordConfidentiality')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('theSecondPartyIsStrictlyBound')}
                            </p>
                        </div>

                        {/* Clause 9 */}
                        <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause9CustodyOfEquipmentTermination')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('theSecondPartyIsCustodianOf')}
                            </p>
                        </div>

                        {/* Clause 10 */}
                        <div>
                            <h4 className="font-black text-slate-900 dark:text-white text-xs mb-1 text-teal-800 dark:text-teal-300">
                                {t('clause10GoverningLawJurisdiction')}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300">
                                {t('thisContractIsGovernedByApplicable')}
                            </p>
                        </div>
                    </div>

                    {/* Official Signatures & Seal Table */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t-2 border-slate-200 dark:border-slate-800">
                        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/60 p-4 text-center dark:border-slate-800 dark:bg-slate-950/40">
                            <p className="font-black text-slate-900 dark:text-white mb-1">
                                {t('firstPartyMedicalCenter')}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-500 mb-8">
                                {t('medicalAdminDirector')}
                            </p>
                            <div className="border-t border-dashed border-slate-400 pt-2 text-[10.5px] text-slate-500 flex flex-col items-center">
                                <span>{t('signature')}</span>
                                <span className="mt-1 font-bold text-teal-800 dark:text-teal-300">{t('officialSeal')}</span>
                            </div>
                        </div>
                        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50/60 p-4 text-center dark:border-slate-800 dark:bg-slate-950/40">
                            <p className="font-black text-slate-900 dark:text-white mb-1">
                                {t('secondPartyEmployee')}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-500 mb-8">
                                {profile.employee_name} ({profile.role})
                            </p>
                            <div className="border-t border-dashed border-slate-400 pt-2 text-[10.5px] text-slate-500 flex flex-col items-center">
                                <span>{t('signature')}</span>
                                <span className="mt-1">{t('nationalId')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="payslip-actions flex items-center justify-between border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <button
                        type="button"
                        onClick={() => printWhenReady()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2 text-xs font-black text-white shadow-xs hover:brightness-110 transition"
                    >
                        <Printer size={14} />
                        <span>{t('printOfficialContract')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                        {t('close')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ── Itemized Payslip Modal ─────────────────────────────────── */
const PayslipModal = ({ item, period, currency, identity, onClose, isArabic }) => {
    const { t } = useTranslation('payroll');
    if (!item) return null;
    const gross = Number(item.gross_earnings || 0);
    const deductions = Number(item.total_deductions || 0);
    const penalties = Number(item.total_penalties || 0);
    const employerContributions = Number(item.total_employer_contributions || 0);
    const net = Number(item.net_pay || gross - deductions - penalties);
    const lineItems = Array.isArray(item.line_items) ? item.line_items : [];

    // Safe extraction of attendance snapshot
    const attendance = typeof item.attendance_snapshot === 'object' && item.attendance_snapshot !== null
        ? item.attendance_snapshot
        : {};
    const calculation = typeof item.calculation_snapshot === 'object' && item.calculation_snapshot !== null
        ? item.calculation_snapshot
        : {};

    const hoursWorked = Number(attendance.hours_worked ?? calculation.hoursWorked ?? 0);
    const daysWorked = Number(attendance.days_worked ?? calculation.payableDays ?? 0);
    const lateMinutes = Number(attendance.late_minutes ?? calculation.lateMinutes ?? 0);
    const absenceDays = Number(attendance.absent_days ?? calculation.absenceDays ?? 0);
    const overtimeHours = Number(calculation.overtimeHours ?? 0);

    return createPortal(
        <div className="payslip-print-overlay fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md animate-in fade-in duration-200 sm:p-4" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="payslip-print-root flex max-h-[96vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200 sm:max-h-[92vh] sm:rounded-3xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-600/20">
                            <Receipt size={22} />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                {t('officialElectronicPayslip')}
                            </h2>
                            <p className="text-xs font-semibold text-slate-400">
                                {period?.name} ({period?.start_date?.slice(0, 10)} - {period?.end_date?.slice(0, 10)})
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Content */}
                <div className="payslip-scroll flex-1 space-y-4 overflow-y-auto p-4 text-xs sm:p-6">
                    {/* Facility Identification Header */}
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 to-white p-3.5 dark:border-teal-500/20 dark:from-teal-500/10 dark:to-slate-950">
                        <div className="flex min-w-0 items-center gap-3">
                            {identity?.logoUrl ? (
                                <img
                                    src={identity.logoUrl}
                                    alt=""
                                    className="h-11 w-11 shrink-0 rounded-xl border border-teal-100 bg-white object-contain p-1"
                                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                                />
                            ) : (
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-600 text-white">
                                    <Building2 size={20} />
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                                    {identity?.centerName || (t('medicalCenter'))}
                                </p>
                                <p className="truncate text-[11px] font-bold text-teal-700 dark:text-teal-300">
                                    {identity?.branchName || (t('mainBranch'))}
                                    {identity?.branch_code ? ` · ${identity.branch_code}` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="shrink-0 text-end text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            {identity?.medicalLicense ? <p>{t('license')}: {identity.medicalLicense}</p> : null}
                            {identity?.taxNumber ? <p>{t('taxIdX')}: {identity.taxNumber}</p> : null}
                        </div>
                    </div>

                    {/* Employee Profile Inset */}
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-slate-900 dark:text-white">{item.employee_name}</p>
                                <p className="text-xs font-bold text-teal-700 dark:text-teal-400 mt-0.5">{item.role}</p>
                            </div>
                            <span className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black text-teal-800 dark:text-teal-300 border border-teal-500/30">
                                {currency}
                            </span>
                        </div>
                    </div>

                    {/* Attendance & Shift Execution Strip */}
                    {(hoursWorked > 0 || daysWorked > 0 || lateMinutes > 0 || absenceDays > 0) && (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'ملخص الحضور وساعات العمل المسجلة' : 'Attendance & Work Hours Record'}
                                </span>
                                <span className="text-[10px] font-bold text-teal-700 dark:text-teal-300">
                                    {isArabic ? 'موثق عبر البصمة' : 'Biometric Verified'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] font-semibold text-slate-400">{isArabic ? 'أيام العمل' : 'Days Worked'}</div>
                                    <div className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">{daysWorked}</div>
                                </div>
                                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] font-semibold text-slate-400">{isArabic ? 'ساعات العمل' : 'Hours Worked'}</div>
                                    <div className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">{hoursWorked.toFixed(1)} h</div>
                                </div>
                                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] font-semibold text-slate-400">{isArabic ? 'دقائق التأخير' : 'Late Minutes'}</div>
                                    <div className={`font-mono text-xs font-black mt-0.5 ${lateMinutes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {lateMinutes} m
                                    </div>
                                </div>
                                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                    <div className="text-[10px] font-semibold text-slate-400">{isArabic ? 'أيام الغياب' : 'Absence Days'}</div>
                                    <div className={`font-mono text-xs font-black mt-0.5 ${absenceDays > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {absenceDays}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Financial Ledger Breakdown */}
                    <div className="space-y-3">
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                            {t('earningsAdjustmentsLedger')}
                        </h3>

                        <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800 overflow-hidden">
                            {lineItems.map((line) => {
                                const subtracts = ['Deduction', 'Penalty'].includes(line.item_type);
                                const isEmployer = line.item_type === 'EmployerContribution';
                                return (
                                    <div key={line.line_item_id} className="flex items-center justify-between gap-4 p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="truncate font-bold text-slate-800 dark:text-slate-200">{line.description}</p>
                                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                                    line.item_type === 'Earning'
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                                        : line.item_type === 'Deduction'
                                                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                                            : line.item_type === 'Penalty'
                                                                ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                                                                : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300'
                                                }`}>
                                                    {isArabic
                                                        ? (line.item_type === 'Earning' ? 'استحقاق' : line.item_type === 'Deduction' ? 'استقطاع' : line.item_type === 'Penalty' ? 'جزاء' : 'مساهمة عمل')
                                                        : line.item_type}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={`shrink-0 font-mono font-black whitespace-nowrap ${subtracts ? 'text-rose-600 dark:text-rose-400' : isEmployer ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                            {subtracts ? '- ' : '+ '}{money(line.amount, currency)}
                                        </span>
                                    </div>
                                );
                            })}
                            {!lineItems.length && (
                                <div className="p-3.5 text-center font-semibold text-slate-400">
                                    {t('noItemizedLinesAreAvailable')}
                                </div>
                            )}
                            <div className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{t('grossEarningsAllowances')}</span>
                                <span className="font-mono font-black whitespace-nowrap text-slate-900 dark:text-white">{money(gross, currency)}</span>
                            </div>
                            <div className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{t('deductionsContributions')}</span>
                                <span className="font-mono font-black whitespace-nowrap text-amber-600 dark:text-amber-400">- {money(deductions, currency)}</span>
                            </div>
                            <div className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{t('penaltiesViolations')}</span>
                                <span className="font-mono font-black whitespace-nowrap text-rose-600 dark:text-rose-400">- {money(penalties, currency)}</span>
                            </div>
                            {employerContributions > 0 && (
                                <div className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-900/40">
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{t('employerContributionsNotDeductedFromNet')}</span>
                                    <span className="font-mono font-black whitespace-nowrap text-indigo-600 dark:text-indigo-400">{money(employerContributions, currency)}</span>
                                </div>
                            )}
                        </div>

                        {/* Net Disbursed Card */}
                        <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">{t('netDisbursedAmount')}</p>
                                    <p className="mt-1 font-mono text-2xl font-black whitespace-nowrap text-teal-900 dark:text-teal-200">{money(net, currency)}</p>
                                </div>
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600 text-white shadow-xs">
                                    <Coins size={20} />
                                </span>
                            </div>
                        </div>

                        {/* Official Certification Seal */}
                        <div className="pt-2 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            <p>{isArabic ? 'وثيقة كشف راتب رسمية معتمدة إلكترونياً من النظام المالي والإداري لـ VIARA' : 'Official Electronic Payslip Certified by VIARA Healthcare Financial & HR Engine'}</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="payslip-actions flex items-center justify-between border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <button
                        type="button"
                        onClick={() => printWhenReady()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <Printer size={14} />
                        <span>{t('printPayslip')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white shadow-xs hover:bg-teal-500 transition"
                    >
                        {t('close')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const adjustmentActions = (kind, status) => {
    if (kind === 'penalty') {
        if (status === 'Pending Approval') return ['Approved', 'Rejected'];
        if (status === 'Approved') return ['Cancelled'];
        return [];
    }
    if (status === 'Draft') return ['Approved', 'Cancelled'];
    if (status === 'Approved') return ['Paused', 'Cancelled'];
    if (status === 'Paused') return ['Approved', 'Cancelled'];
    return [];
};

const actionLabel = (status, t) => ({
    Approved: t('approve'),
    Rejected: t('reject'),
    Paused: t('pause'),
    Cancelled: t('cancel'),
}[status] || status);

/* ── Create Deduction / Loan Modal ────────────────────────────── */
const CreateDeductionModal = ({
    isOpen,
    onClose,
    form,
    setForm,
    onSubmit,
    isLoading,
    staff,
    currency,
    isArabic,
    t
}) => {
    if (!isOpen) return null;
    const isLoanOrAdvance = ['Installment', 'Advance', 'Loan'].includes(form.deductionType);
    const isPercentage = form.deductionType === 'Percentage';

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
            <form
                onSubmit={onSubmit}
                className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200"
            >
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            <MinusCircle size={20} />
                        </span>
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">{t('addDeductionOrLoan')}</h3>
                            <p className="text-xs font-semibold text-slate-400">{t('addDeductionHelp')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="mt-4 space-y-3.5 max-h-[70vh] overflow-y-auto pe-1">
                    {/* Employee & Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.employee')} *</span>
                            <select
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                value={form.userId}
                                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                                required
                            >
                                <option value="">{t('placeholders.employee')}</option>
                                {staff.map((emp) => (
                                    <option key={emp.user_id} value={emp.user_id}>{emp.full_name} ({emp.role})</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.salaryType', { defaultValue: 'نوع البند' })}</span>
                            <select
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                value={form.deductionType}
                                onChange={(e) => {
                                    const deductionType = e.target.value;
                                    const isInstallment = ['Installment', 'Advance', 'Loan'].includes(deductionType);
                                    const recurrenceType = isInstallment
                                        ? 'Installment'
                                        : form.recurrenceType === 'Installment' ? 'OneTime' : form.recurrenceType;
                                    setForm({
                                        ...form,
                                        deductionType,
                                        recurrenceType,
                                        maxOccurrences: recurrenceType === 'Recurring' ? form.maxOccurrences : '',
                                        amount: deductionType === 'Percentage'
                                            ? '0'
                                            : form.deductionType === 'Percentage' ? '' : form.amount,
                                        percentage: deductionType === 'Percentage' ? form.percentage : '',
                                        name: form.name || (deductionType === 'Loan' ? (isArabic ? 'قرض موظف' : 'Employee Loan') : deductionType === 'Advance' ? (isArabic ? 'سلفة نقدية' : 'Cash Advance') : form.name)
                                    });
                                }}
                            >
                                <option value="Fixed">{t('deductionTypes.Fixed')}</option>
                                <option value="Percentage">{t('deductionTypes.Percentage')}</option>
                                <option value="Installment">{t('deductionTypes.Installment')}</option>
                                <option value="Advance">{t('deductionTypes.Advance')}</option>
                                <option value="Loan">{t('deductionTypes.Loan')}</option>
                            </select>
                        </label>
                    </div>

                    {/* Name */}
                    <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.name')} *</span>
                        <input
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder={isArabic ? 'مثال: سلفة شهرية، قسط قرض، اشتراك نقابة...' : 'e.g., Emergency Advance, Loan installment...'}
                            required
                        />
                    </label>

                    {/* Amount / Percentage Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {isPercentage ? (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.percentage')} (%) *</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    type="number"
                                    min="0.01"
                                    max="100"
                                    step="0.01"
                                    value={form.percentage}
                                    onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                                    required
                                />
                            </label>
                        ) : (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    {isLoanOrAdvance ? (isArabic ? 'مبلغ القسط الشهري *' : 'Monthly Installment *') : `${t('fields.amount')} *`} ({currency})
                                </span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={form.amount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setForm(prev => ({
                                            ...prev,
                                            amount: val,
                                            totalAmount: isLoanOrAdvance && !prev.totalAmount ? val : prev.totalAmount,
                                            remainingAmount: isLoanOrAdvance && !prev.remainingAmount ? val : prev.remainingAmount
                                        }));
                                    }}
                                    required
                                />
                            </label>
                        )}

                        {isLoanOrAdvance ? (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('totalPrincipal')} ({currency})</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={form.totalAmount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setForm(prev => ({
                                            ...prev,
                                            totalAmount: val,
                                            remainingAmount: prev.remainingAmount === '' || prev.remainingAmount === prev.totalAmount ? val : prev.remainingAmount
                                        }));
                                    }}
                                />
                            </label>
                        ) : (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.notes', { defaultValue: 'ملاحظات' })}</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    placeholder={t('notesPlaceholderDeduction')}
                                />
                            </label>
                        )}
                    </div>

                    {isLoanOrAdvance && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('remainingBalance')} ({currency})</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.remainingAmount}
                                    onChange={(e) => setForm({ ...form, remainingAmount: e.target.value })}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.notes', { defaultValue: 'ملاحظات' })}</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    placeholder={t('notesPlaceholderDeduction')}
                                />
                            </label>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.recurrenceType')}</span>
                            {isLoanOrAdvance ? (
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                                    value={t('recurrenceTypes.Installment')}
                                    readOnly
                                />
                            ) : (
                                <select
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    value={form.recurrenceType}
                                    onChange={(e) => setForm({ ...form, recurrenceType: e.target.value, maxOccurrences: e.target.value === 'Recurring' ? form.maxOccurrences : '' })}
                                >
                                    <option value="OneTime">{t('recurrenceTypes.OneTime')}</option>
                                    <option value="Recurring">{t('recurrenceTypes.Recurring')}</option>
                                </select>
                            )}
                        </label>
                        {form.recurrenceType === 'Recurring' && !isLoanOrAdvance ? (
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.maxOccurrences')} ({t('optional')})</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    type="number"
                                    min="1"
                                    max="120"
                                    step="1"
                                    value={form.maxOccurrences}
                                    onChange={(e) => setForm({ ...form, maxOccurrences: e.target.value })}
                                />
                            </label>
                        ) : null}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.startDate')} *</span>
                            <input
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                type="date"
                                value={form.startDate}
                                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.endDate')} ({isArabic ? 'اختياري' : 'Optional'})</span>
                            <input
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                type="date"
                                value={form.endDate}
                                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                            />
                        </label>
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 transition"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:brightness-110 disabled:opacity-50 transition"
                    >
                        {isLoading ? t('saving') : t('saveDeduction')}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
};

/* ── Create Disciplinary Penalty Modal ─────────────────────────── */
const CreatePenaltyModal = ({
    isOpen,
    onClose,
    form,
    setForm,
    onSubmit,
    isLoading,
    staff,
    periods,
    currency,
    isArabic,
    t
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in" dir={isArabic ? 'rtl' : 'ltr'}>
            <form
                onSubmit={onSubmit}
                className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200"
            >
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300">
                            <AlertTriangle size={20} />
                        </span>
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">{t('recordDisciplinaryPenalty')}</h3>
                            <p className="text-xs font-semibold text-slate-400">{t('recordPenaltyHelp')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="mt-4 space-y-3.5 max-h-[70vh] overflow-y-auto pe-1">
                    {/* Employee & Penalty Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.employee')} *</span>
                            <select
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                value={form.userId}
                                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                                required
                            >
                                <option value="">{t('placeholders.employee')}</option>
                                {staff.map((emp) => (
                                    <option key={emp.user_id} value={emp.user_id}>{emp.full_name} ({emp.role})</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.penaltyType')} *</span>
                            <select
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                value={form.penaltyType}
                                onChange={(e) => setForm({ ...form, penaltyType: e.target.value })}
                            >
                                <option value="Policy">{t('penaltyTypes.Policy')}</option>
                                <option value="Late">{t('penaltyTypes.Late')}</option>
                                <option value="Absence">{t('penaltyTypes.Absence')}</option>
                                <option value="Disciplinary">{t('penaltyTypes.Disciplinary')}</option>
                                <option value="Damage">{t('penaltyTypes.Damage')}</option>
                                <option value="Other">{t('penaltyTypes.Other')}</option>
                            </select>
                        </label>
                    </div>

                    {/* Amount & Incident Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.amount')} ({currency}) *</span>
                            <input
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.amount}
                                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                required
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('incidentDate')} *</span>
                            <input
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                type="date"
                                value={form.incidentDate || ''}
                                onChange={(e) => setForm({ ...form, incidentDate: e.target.value })}
                                required
                            />
                        </label>
                    </div>

                    {/* Source & Target Period */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.source', { defaultValue: 'المصدر' })}</span>
                            <select
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                value={form.source}
                                onChange={(e) => setForm({ ...form, source: e.target.value })}
                            >
                                <option value="Manual">{t('penaltySources.Manual')}</option>
                                <option value="Attendance">{t('penaltySources.Attendance')}</option>
                                <option value="Policy">{t('penaltySources.Policy')}</option>
                                <option value="Import">{t('penaltySources.Import')}</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('optionalTargetPeriod')}</span>
                            <select
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                value={form.payrollPeriodId || ''}
                                onChange={(e) => setForm({ ...form, payrollPeriodId: e.target.value || undefined })}
                            >
                                <option value="">{isArabic ? 'تلقائي على أقرب دورة رواتب' : 'Auto-apply to next cycle'}</option>
                                {periods.filter(p => ['Draft', 'Calculated'].includes(p.status)).map((p) => (
                                    <option key={p.period_id} value={p.period_id}>{p.name} ({t(`payrollStatuses.${p.status}`, { defaultValue: p.status })})</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {/* Reason */}
                    <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.reason')} *</span>
                        <textarea
                            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-800 outline-none focus:border-rose-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 resize-none h-24"
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                            placeholder={t('reasonPlaceholder')}
                            required
                        />
                    </label>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 transition"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-rose-600/20 hover:brightness-110 disabled:opacity-50 transition"
                    >
                        {isLoading ? t('saving') : t('savePenalty')}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    );
};

/* ── Main Payroll Suite ──────────────────────────────────────── */
const Payroll = () => {
    const { t, i18n } = useTranslation('payroll');
    const isArabic = i18n.language === 'ar';
    const isRtl = i18n.dir() === 'rtl';
    const user = useSelector(selectCurrentUser);
    const permissions = useMemo(() => getPayrollPermissions(user), [user]);
    const initialToday = todayInput();

    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const activeTab = ['overview', 'compensation', 'adjustments', 'rules'].includes(requestedTab) ? requestedTab : 'overview';
    const setActiveTab = (tab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next);
    };
    const [selectedPeriodId, setSelectedPeriodId] = useState(null);
    const [showCreatePeriodModal, setShowCreatePeriodModal] = useState(false);
    const [showCreateDeductionModal, setShowCreateDeductionModal] = useState(false);
    const [showCreatePenaltyModal, setShowCreatePenaltyModal] = useState(false);
    const [showSopGuide, setShowSopGuide] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('BankTransfer');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentDate, setPaymentDate] = useState(initialToday);
    const [workflowDecision, setWorkflowDecision] = useState(null);
    const [runSearch, setRunSearch] = useState('');
    const [compSearch, setCompSearch] = useState('');
    const [adjustmentFilter, setAdjustmentFilter] = useState('all');
    const [adjustmentCategory, setAdjustmentCategory] = useState('all');
    const [adjustmentSearch, setAdjustmentSearch] = useState('');
    const [selectedPayslipItem, setSelectedPayslipItem] = useState(null);
    const [selectedContractProfile, setSelectedContractProfile] = useState(null);
    const [compensationEndDates, setCompensationEndDates] = useState({});
    const [setupDecision, setSetupDecision] = useState(null);
    const [showSalarySimulator, setShowSalarySimulator] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [periodForm, setPeriodForm] = useState({
        name: '',
        startDate: firstDayOfCurrentMonthInput(),
        endDate: lastDayOfCurrentMonthInput(),
        currencyCode: 'EGP',
        notes: '',
    });
    const [compForm, setCompForm] = useState({
        userId: '',
        salaryType: 'Monthly',
        baseSalary: '',
        hourlyRate: '',
        standardHoursPerDay: 8,
        standardDaysPerPeriod: 22,
        effectiveFrom: initialToday,
        effectiveTo: '',
        notes: '',
    });
    const [deductionForm, setDeductionForm] = useState({
        userId: '',
        name: '',
        deductionType: 'Fixed',
        amount: '',
        percentage: '',
        totalAmount: '',
        remainingAmount: '',
        recurrenceType: 'OneTime',
        maxOccurrences: '',
        startDate: initialToday,
        endDate: '',
        status: 'Draft',
        notes: '',
    });
    const [penaltyForm, setPenaltyForm] = useState({
        userId: '',
        penaltyType: 'Policy',
        amount: '',
        reason: '',
        source: 'Manual',
        status: 'Pending Approval',
        incidentDate: initialToday,
        payrollPeriodId: '',
    });
    const [ruleForm, setRuleForm] = useState({
        ruleType: 'Allowance',
        name: '',
        calculationMethod: 'FixedAmount',
        value: '',
        currencyCode: 'EGP',
        effectiveFrom: initialToday,
        notes: '',
    });

    const { data: rawCenterSettings, isLoading: centerSettingsLoading } = useGetCenterSettingsQuery();
    const centerSettings = useMemo(
        () => normalizeCenterSettings(rawCenterSettings),
        [rawCenterSettings]
    );
    const configuredBranchId = useMemo(() => {
        const candidate = user?.branch_id || user?.branchId || centerSettings.branch_id;
        return UUID_PATTERN.test(String(candidate || '')) ? candidate : DEFAULT_FINANCIAL_BRANCH_ID;
    }, [centerSettings.branch_id, user?.branchId, user?.branch_id]);
    const hasExplicitBranch = UUID_PATTERN.test(String(user?.branch_id || user?.branchId || centerSettings.branch_id || ''));
    const branchQuery = useMemo(
        () => configuredBranchId ? { branchId: configuredBranchId } : {},
        [configuredBranchId]
    );

    useEffect(() => {
        const configuredCurrency = String(centerSettings.currency || '').toUpperCase();
        if (!/^[A-Z]{3}$/.test(configuredCurrency)) return;
        setPeriodForm((previous) => previous.currencyCode === 'EGP'
            ? { ...previous, currencyCode: configuredCurrency }
            : previous);
        setRuleForm((previous) => previous.currencyCode === 'EGP'
            ? { ...previous, currencyCode: configuredCurrency }
            : previous);
    }, [centerSettings.currency]);

    // Queries
    const { data: periods = [], isLoading: periodsLoading, refetch: refetchPeriods } = useGetPayrollPeriodsQuery(branchQuery);
    const { data: staff = [] } = useGetPayrollEmployeesQuery();
    const { data: compensation = [], refetch: refetchComp } = useGetPayrollCompensationQuery({ limit: 500 });
    const { data: deductions = [], refetch: refetchDeductions } = useGetPayrollDeductionsQuery({ limit: 500 });
    const { data: penalties = [], refetch: refetchPenalties } = useGetPayrollPenaltiesQuery({ limit: 500 });
    const { data: rules = [], refetch: refetchRules } = useGetPayrollRulesQuery();

    const selectedPeriod = useMemo(
        () => periods.find((p) => p.period_id === selectedPeriodId) || periods[0] || null,
        [periods, selectedPeriodId]
    );
    const documentIdentity = useMemo(
        () => resolveDocumentIdentity(centerSettings, selectedPeriod || {}, {
            language: i18n.language,
            kind: 'payroll'
        }),
        [centerSettings, i18n.language, selectedPeriod]
    );
    const branchName = documentIdentity.branchName || (t('mainBranch'));
    const branchCode = documentIdentity.branch_code || centerSettings.branch_code || '';

    const activePeriodId = selectedPeriod?.period_id;
    const { data: run, refetch: refetchRun } = useGetPayrollRunQuery(activePeriodId, { skip: !activePeriodId });

    // Filtered Run Items
    const filteredRunItems = useMemo(() => {
        const items = run?.items || [];
        if (!runSearch.trim()) return items;
        const q = runSearch.toLowerCase();
        return items.filter(it => (it.employee_name || '').toLowerCase().includes(q) || (it.role || '').toLowerCase().includes(q));
    }, [run?.items, runSearch]);

    // Filtered Compensation Profiles
    const filteredCompensation = useMemo(() => {
        if (!compSearch.trim()) return compensation;
        const q = compSearch.toLowerCase();
        return compensation.filter(c => (c.employee_name || '').toLowerCase().includes(q) || (c.role || '').toLowerCase().includes(q));
    }, [compensation, compSearch]);

    // Filtered Adjustments
    const filteredDeductions = useMemo(() => {
        if (adjustmentCategory === 'penalties') return [];
        let list = deductions;
        if (adjustmentCategory === 'loans') {
            list = list.filter(d => ['Installment', 'Advance', 'Loan'].includes(d.deduction_type));
        } else if (adjustmentCategory === 'deductions') {
            list = list.filter(d => !['Installment', 'Advance', 'Loan'].includes(d.deduction_type));
        }
        if (adjustmentFilter !== 'all') {
            const expectedStatus = adjustmentFilter === 'Pending Approval' ? 'Draft' : adjustmentFilter;
            list = list.filter(d => d.status?.toLowerCase() === expectedStatus.toLowerCase());
        }
        if (adjustmentSearch.trim()) {
            const q = adjustmentSearch.toLowerCase();
            list = list.filter(d =>
                (d.name || '').toLowerCase().includes(q) ||
                (d.employee_name || '').toLowerCase().includes(q) ||
                (d.deduction_type || '').toLowerCase().includes(q) ||
                (d.notes || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [deductions, adjustmentCategory, adjustmentFilter, adjustmentSearch]);

    const filteredPenalties = useMemo(() => {
        if (adjustmentCategory === 'loans' || adjustmentCategory === 'deductions') return [];
        let list = penalties;
        if (adjustmentFilter !== 'all') {
            list = list.filter(p => p.status?.toLowerCase() === adjustmentFilter.toLowerCase());
        }
        if (adjustmentSearch.trim()) {
            const q = adjustmentSearch.toLowerCase();
            list = list.filter(p =>
                (p.penalty_type || '').toLowerCase().includes(q) ||
                (p.employee_name || '').toLowerCase().includes(q) ||
                (p.reason || '').toLowerCase().includes(q) ||
                (p.source || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [penalties, adjustmentCategory, adjustmentFilter, adjustmentSearch]);

    // KPI Summary Metrics for Adjustments
    const adjustmentStats = useMemo(() => {
        const activeLoans = deductions.filter(d =>
            ['Installment', 'Advance', 'Loan'].includes(d.deduction_type) &&
            ['Approved', 'Draft'].includes(d.status)
        );
        const totalLoanBalance = activeLoans.reduce((sum, d) => sum + Number(d.remaining_amount ?? d.total_amount ?? d.amount ?? 0), 0);
        const activeRecurringCount = deductions.filter(d =>
            d.recurrence_type === 'Recurring' &&
            d.status === 'Approved'
        ).length;
        const pendingPenalties = penalties.filter(p => p.status === 'Pending Approval').length;
        const approvedPenaltiesTotal = penalties.filter(p => p.status === 'Approved').reduce((sum, p) => sum + Number(p.amount || 0), 0);

        return {
            totalLoanBalance,
            activeRecurringCount,
            pendingPenalties,
            approvedPenaltiesTotal,
            totalAdjustmentsCount: deductions.length + penalties.length
        };
    }, [deductions, penalties]);

    // Pre-Flight Calculation Readiness Audit
    const preflightAudit = useMemo(() => {
        const staffWithoutComp = staff.filter(emp => !compensation.some(cp => String(cp.user_id) === String(emp.user_id) && (!cp.effective_to || new Date(cp.effective_to) >= new Date())));
        const pendingPenalties = penalties.filter(p => p.status === 'Pending Approval');
        const disputedPenalties = penalties.filter(p => p.acknowledgement_status === 'Disputed');
        const draftDeductions = deductions.filter(d => d.status === 'Draft');
        const isReady = staffWithoutComp.length === 0 && pendingPenalties.length === 0 && disputedPenalties.length === 0 && draftDeductions.length === 0;

        return {
            staffWithoutComp,
            pendingPenalties,
            disputedPenalties,
            draftDeductions,
            isReady
        };
    }, [staff, compensation, penalties, deductions]);

    // Mutations
    const [createPeriod, { isLoading: creatingPeriod }] = useCreatePayrollPeriodMutation();
    const [cancelPeriod, { isLoading: cancellingPeriod }] = useCancelPayrollPeriodMutation();
    const [calculateRun, { isLoading: calculating }] = useCalculatePayrollRunMutation();
    const [updateRunStatus, { isLoading: updatingStatus }] = useUpdatePayrollRunStatusMutation();
    const [createCompensation, { isLoading: savingCompensation }] = useCreatePayrollCompensationMutation();
    const [updateCompensation, { isLoading: updatingCompensation }] = useUpdatePayrollCompensationMutation();
    const [createDeduction, { isLoading: savingDeduction }] = useCreatePayrollDeductionMutation();
    const [createPenalty, { isLoading: savingPenalty }] = useCreatePayrollPenaltyMutation();
    const [createRule, { isLoading: savingRule }] = useCreatePayrollRuleMutation();
    const [updateDeductionStatus, { isLoading: updatingDeductionStatus }] = useUpdatePayrollDeductionStatusMutation();
    const [updatePenaltyStatus, { isLoading: updatingPenaltyStatus }] = useUpdatePayrollPenaltyStatusMutation();
    const [resolvePayrollPenaltyDispute, { isLoading: resolvingPenaltyDispute }] = useResolvePayrollPenaltyDisputeMutation();
    const [updateRuleStatus, { isLoading: updatingRuleStatus }] = useUpdatePayrollRuleStatusMutation();

    const centerCurrency = /^[A-Z]{3}$/.test(String(centerSettings.currency || '').toUpperCase())
        ? String(centerSettings.currency).toUpperCase()
        : 'EGP';
    const currency = selectedPeriod?.currency_code || centerCurrency;
    const { data: overview, refetch: refetchOverview } = useGetPayrollOverviewQuery({
        currencyCode: currency,
        limit: 1,
        ...branchQuery,
    });
    const runId = selectedPeriod?.run_id || run?.run_id;
    const runStatus = run?.status || selectedPeriod?.run_status || selectedPeriod?.status || 'Draft';
    const paymentReferenceRequired = paymentMethod !== 'Cash';
    const paymentReady = !paymentReferenceRequired || Boolean(paymentReference.trim());
    const missingPermissionText = t('validation.permissionDenied', { defaultValue: 'You do not have permission for this payroll action.' });
    const disabledReason = (allowed) => (allowed ? undefined : missingPermissionText);

    const currentStepIndex = WORKFLOW_STEPS.indexOf(runStatus);

    const refreshAll = () => {
        refetchPeriods();
        refetchComp();
        refetchDeductions();
        refetchPenalties();
        refetchRules();
        refetchOverview();
        if (activePeriodId) refetchRun();
    };

    const onCreatePeriod = async (event) => {
        event.preventDefault();
        if (!permissions.createPeriod) {
            toast.error(missingPermissionText);
            return;
        }
        try {
            const created = await createPeriod({
                ...periodForm,
                branchId: configuredBranchId,
            }).unwrap();
            setSelectedPeriodId(created.period_id);
            setPeriodForm((prev) => ({ ...prev, name: '', notes: '' }));
            setShowCreatePeriodModal(false);
            toast.success(t('toast.periodCreated'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.createPeriodFailed')));
        }
    };

    const onCalculate = async (periodId) => {
        if (!permissions.calculate) {
            toast.error(missingPermissionText);
            return false;
        }
        try {
            await calculateRun(periodId).unwrap();
            setSelectedPeriodId(periodId);
            toast.success(t('toast.calculated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.calculateFailed')));
            return false;
        }
    };

    const onStatus = async (targetRunId, status, notes = '') => {
        const idempotencyKey = status === 'Paid' ? getStoredPayrollPaymentKey(targetRunId) : undefined;
        try {
            await updateRunStatus({
                runId: targetRunId,
                status,
                paymentMethod: status === 'Paid' ? paymentMethod : undefined,
                paidAmount: status === 'Paid' ? Number(run?.total_net ?? selectedPeriod?.total_net ?? 0) : undefined,
                paidDate: status === 'Paid' ? paymentDate : undefined,
                referenceNumber: status === 'Paid' ? paymentReference : undefined,
                notes: notes || undefined,
                idempotencyKey,
            }).unwrap();
            if (status === 'Paid') clearStoredPayrollPaymentKey(targetRunId);
            toast.success(t('toast.statusUpdated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
            return false;
        }
    };

    const onCancelDraftPeriod = async (periodId, notes) => {
        try {
            await cancelPeriod({ id: periodId, status: 'Cancelled', notes }).unwrap();
            toast.success(t('toast.statusUpdated'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
            return false;
        }
    };

    const executeWorkflowDecision = async (notes = '') => {
        if (!workflowDecision) return false;
        const { type, periodId, runId: decisionRunId, status } = workflowDecision;
        const completed = type === 'calculate'
            ? await onCalculate(periodId)
            : type === 'cancelPeriod'
                ? await onCancelDraftPeriod(periodId, notes)
                : await onStatus(decisionRunId, status, notes);
        if (completed) setWorkflowDecision(null);
        return completed;
    };

    const exportBankFile = () => {
        if (!permissions.export) {
            toast.error(missingPermissionText);
            return;
        }
        const exportItems = run?.items || [];
        if (!exportItems.length) {
            toast.error(t('noPayrollDataToExport'));
            return;
        }
        const headers = [
            'employeeName', 'role', 'grossEarnings', 'deductions', 'penalties', 'employerContributions',
            'netPay', 'currency', 'period', 'paymentDate', 'paymentMethod', 'paymentReference', 'runStatus'
        ].map((key) => csvCell(t(`exportColumns.${key}`)));
        const lines = exportItems.map(it => [
            csvCell(it.employee_name),
            csvCell(it.role),
            Number(it.gross_earnings || 0),
            Number(it.total_deductions || 0),
            Number(it.total_penalties || 0),
            Number(it.total_employer_contributions || 0),
            Number(it.net_pay || 0),
            csvCell(currency),
            csvCell(selectedPeriod?.name),
            csvCell(paymentDate),
            csvCell(paymentMethod),
            csvCell(paymentReference || '-'),
            csvCell(t(`payrollStatuses.${runStatus}`, { defaultValue: runStatus }))
        ].join(','));
        const blob = new Blob(['\uFEFF' + [headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const branchFilePart = String(branchCode || branchName || 'branch').replace(/[^\p{L}\p{N}-]+/gu, '-');
        Object.assign(document.createElement('a'), { href: url, download: `payroll-bank-register-${branchFilePart}-${selectedPeriod?.name || 'run'}-${new Date().toISOString().slice(0, 10)}.csv` }).click();
        URL.revokeObjectURL(url);
        toast.success(t('payrollBankRegisterExported'));
    };

    const exportWpsFile = () => {
        if (!permissions.export) {
            toast.error(missingPermissionText);
            return;
        }
        const exportItems = run?.items || [];
        if (!exportItems.length) {
            toast.error(t('noPayrollDataToExport'));
            return;
        }
        const wpsHeaders = [
            'Employee ID', 'Employee Name', 'Role', 'Fixed Pay', 'Variable / Allowances',
            'Deductions', 'Penalties', 'Net Pay', 'Currency', 'Payment Method', 'Period Name', 'Disbursement Date'
        ].map(h => csvCell(h));

        const lines = exportItems.map(it => {
            const gross = Number(it.gross_earnings || 0);
            const ded = Number(it.total_deductions || 0);
            const pen = Number(it.total_penalties || 0);
            const net = Number(it.net_pay || 0);
            return [
                csvCell(it.user_id ? String(it.user_id).slice(0, 8).toUpperCase() : 'EMP'),
                csvCell(it.employee_name),
                csvCell(it.role),
                gross,
                0,
                ded,
                pen,
                net,
                csvCell(currency),
                csvCell(paymentMethod),
                csvCell(selectedPeriod?.name),
                csvCell(paymentDate)
            ].join(',');
        });

        const blob = new Blob(['\uFEFF' + [wpsHeaders.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const branchFilePart = String(branchCode || branchName || 'branch').replace(/[^\p{L}\p{N}-]+/gu, '-');
        Object.assign(document.createElement('a'), { href: url, download: `WPS-SIF-Disbursement-${branchFilePart}-${selectedPeriod?.name || 'run'}-${new Date().toISOString().slice(0, 10)}.csv` }).click();
        URL.revokeObjectURL(url);
        toast.success(t('exportWpsSuccess'));
    };

    const onCreateCompensation = async (e) => {
        e.preventDefault();
        try {
            await createCompensation({
                ...compForm,
                baseSalary: Number(compForm.baseSalary || 0),
                hourlyRate: Number(compForm.hourlyRate || 0),
                effectiveTo: compForm.effectiveTo || undefined,
            }).unwrap();
            setCompForm(prev => ({ ...prev, baseSalary: '', hourlyRate: '', effectiveTo: '', notes: '' }));
            toast.success(t('toast.compensationSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreateDeduction = async (e) => {
        e.preventDefault();
        try {
            await createDeduction({
                ...deductionForm,
                amount: Number(deductionForm.amount || 0),
                percentage: Number(deductionForm.percentage || 0),
                totalAmount: deductionForm.totalAmount === '' ? undefined : Number(deductionForm.totalAmount),
                remainingAmount: deductionForm.remainingAmount === '' ? undefined : Number(deductionForm.remainingAmount),
                maxOccurrences: deductionForm.maxOccurrences === '' ? undefined : Number(deductionForm.maxOccurrences),
                branchId: configuredBranchId,
                currencyCode: currency,
            }).unwrap();
            setDeductionForm(prev => ({
                ...prev,
                name: '',
                amount: '',
                percentage: '',
                totalAmount: '',
                remainingAmount: '',
                maxOccurrences: '',
                recurrenceType: ['Installment', 'Advance', 'Loan'].includes(prev.deductionType) ? 'Installment' : 'OneTime',
                notes: ''
            }));
            setShowCreateDeductionModal(false);
            toast.success(t('toast.deductionSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreatePenalty = async (e) => {
        e.preventDefault();
        try {
            await createPenalty({
                ...penaltyForm,
                amount: Number(penaltyForm.amount || 0),
                branchId: configuredBranchId,
                currencyCode: currency,
                incidentDate: penaltyForm.incidentDate || todayInput(),
                payrollPeriodId: penaltyForm.payrollPeriodId || undefined,
            }).unwrap();
            setPenaltyForm(prev => ({ ...prev, amount: '', reason: '' }));
            setShowCreatePenaltyModal(false);
            toast.success(t('toast.penaltySaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const onCreateRule = async (e) => {
        e.preventDefault();
        try {
            await createRule({ ...ruleForm, value: Number(ruleForm.value || 0), metadata: {} }).unwrap();
            setRuleForm(prev => ({ ...prev, name: '', value: '' }));
            toast.success(t('toast.ruleSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const executeSetupDecision = async (reason = '') => {
        if (!setupDecision) return;
        const { kind, id, status } = setupDecision;
        try {
            if (kind === 'penaltyDispute') {
                await resolvePayrollPenaltyDispute({ id, status, resolution: reason }).unwrap();
            } else {
                const mutation = kind === 'deduction'
                    ? updateDeductionStatus
                    : kind === 'penalty' ? updatePenaltyStatus : updateRuleStatus;
                await mutation({
                    id,
                    status,
                    notes: reason || (kind === 'penalty' && status === 'Cancelled'
                        ? undefined
                        : t('actionCompletedFromPayrollWorkspace'))
                }).unwrap();
            }
            toast.success(t('statusUpdated'));
            setSetupDecision(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.statusFailed')));
        }
    };

    const onCloseCompensation = async (profile) => {
        const effectiveTo = compensationEndDates[profile.profile_id] || todayInput();
        try {
            await updateCompensation({
                id: profile.profile_id,
                effectiveTo,
                isActive: true,
                notes: t('compensationPeriodClosedFromPayrollWorkspace')
            }).unwrap();
            toast.success(t('compensationEndDateSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('toast.saveFailed')));
        }
    };

    const workflowNeedsNotes = ['Approved', 'Cancelled'].includes(workflowDecision?.status);
    const setupDecisionNeedsReason = setupDecision?.kind === 'penaltyDispute'
        || (setupDecision?.kind === 'penalty' && setupDecision.status === 'Cancelled');
    const updatingSetupStatus = updatingDeductionStatus || updatingPenaltyStatus || updatingRuleStatus || resolvingPenaltyDispute;

    // Tabs Definition
    const navTabs = [
        {
            id: 'overview',
            label: t('runsWorkflow'),
            icon: LayoutDashboard,
            badge: runStatus
        },
        {
            id: 'compensation',
            label: t('compensationProfilesContracts'),
            icon: FileCheck,
            badge: `${compensation.length}`
        },
        {
            id: 'adjustments',
            label: t('deductionsPenalties'),
            icon: MinusCircle,
            badge: `${deductions.length + penalties.length}`
        },
        {
            id: 'rules',
            label: t('payrollRules'),
            icon: Settings2,
            badge: `${rules.length}`
        }
    ];

    const sopSteps = [
        { step: 1, title: t('contractCompensationSetup'), desc: t('setContractedBaseSalaryHourlyRates') },
        { step: 2, title: t('periodInitialization'), desc: t('createPayrollPeriodWithDefinedDate') },
        { step: 3, title: t('automatedRunCalculation'), desc: t('computeEarningsApprovedPenaltiesAndDeductions') },
        { step: 4, title: t('auditReview'), desc: t('auditItemizedPayslipsAndResolveDiscrepancies') },
        { step: 5, title: t('executiveApproval'), desc: t('officialManagementApprovalWithAuditLog') },
        { step: 6, title: t('disbursementLedgerLock'), desc: t('bankTransferExportIdempotentPaymentAnd') },
    ];

    return (
        <main className="mx-auto max-w-[1680px] space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* 1. Unified PageHeader */}
            <PageHeader
                icon={BadgeDollarSign}
                eyebrowIcon={ShieldCheck}
                eyebrow={t('header.eyebrow')}
                title={t('header.title')}
                description={t('header.description')}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/10 px-3 py-1 text-xs font-black text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                            <Building2 size={13} />
                            <span>{branchName}</span>
                            {branchCode ? <span className="font-mono opacity-70">({branchCode})</span> : null}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300 whitespace-nowrap">
                            <Zap size={13} className="text-teal-600 dark:text-teal-400" />
                            <span>{selectedPeriod?.name || (t('noPeriodSelected'))}</span>
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-nowrap">
                            {currency} · {t('header.controlled')}
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-black whitespace-nowrap ${statusTone[runStatus] || statusTone.Draft}`}>
                            {t(`payrollStatuses.${runStatus}`, { defaultValue: runStatus })}
                        </span>
                    </div>
                }
                metrics={[
                    {
                        key: 'net',
                        icon: Banknote,
                        label: t('netPayroll'),
                        value: money(overview?.total_net ?? (run?.total_net ?? selectedPeriod?.total_net ?? 0), currency),
                        detail: t('stats.netDetail'),
                        tone: 'emerald'
                    },
                    {
                        key: 'gross',
                        icon: Scale,
                        label: t('grossEarnings'),
                        value: money(overview?.total_gross ?? (run?.total_gross ?? selectedPeriod?.total_gross ?? 0), currency),
                        detail: t('stats.grossDetail'),
                        tone: 'teal'
                    },
                    {
                        key: 'controls',
                        icon: MinusCircle,
                        label: t('deductionsPenalties'),
                        value: money((Number(overview?.total_deductions || 0) + Number(overview?.total_penalties || 0)), currency),
                        detail: `${overview?.pending_penalties || 0} ${t('pending')}`,
                        tone: 'amber'
                    },
                    {
                        key: 'employer',
                        icon: Briefcase,
                        label: t('employerContributions'),
                        value: money(overview?.total_employer_contributions || 0, currency),
                        detail: t('additionalCost'),
                        tone: 'indigo'
                    }
                ]}
                metricsLabel={t('payrollRecordIndicators')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowSopGuide(!showSopGuide)}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 whitespace-nowrap"
                        >
                            <BookOpen size={14} className="text-teal-600" />
                            <span>{t('operatingSop')}</span>
                            {showSopGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreatePeriodModal(true)}
                            disabled={!permissions.createPeriod}
                            title={disabledReason(permissions.createPeriod)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-teal-600/20 transition hover:brightness-110 disabled:opacity-40 whitespace-nowrap"
                        >
                            <Plus size={15} />
                            <span>{t('actions.createPeriod')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSalarySimulator(true)}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 text-xs font-bold text-teal-800 transition hover:bg-teal-500/20 dark:text-teal-300 whitespace-nowrap"
                        >
                            <Calculator size={14} className="text-teal-600 dark:text-teal-400" />
                            <span>{t('salarySimulator')}</span>
                        </button>

                        {/* Unified Export Menu */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                disabled={!permissions.export}
                                title={disabledReason(permissions.export)}
                                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap"
                            >
                                <Download size={14} className="text-teal-600 dark:text-teal-400" />
                                <span>{isArabic ? 'تصدير مسير الرواتب' : 'Export Payroll'}</span>
                                <ChevronDown size={13} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                            </button>

                            {showExportMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                                    <div className="absolute end-0 top-full mt-1.5 z-50 min-w-[240px] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-in fade-in zoom-in-95">
                                        <button
                                            type="button"
                                            onClick={() => { setShowExportMenu(false); exportBankFile(); }}
                                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                                        >
                                            <FileSpreadsheet size={15} className="text-teal-600 shrink-0" />
                                            <div>
                                                <div className="font-black">{t('exportBankFile')}</div>
                                                <div className="text-[10px] font-normal text-slate-400">{isArabic ? 'سجل الرواتب التفصيلي (Excel / CSV)' : 'Detailed Payroll Register'}</div>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowExportMenu(false); exportWpsFile(); }}
                                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-xs font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition"
                                        >
                                            <Building2 size={15} className="text-emerald-600 shrink-0" />
                                            <div>
                                                <div className="font-black">{t('exportWps')}</div>
                                                <div className="text-[10px] font-normal text-slate-400">{isArabic ? 'مسير حماية الأجور والتحويل المباشر' : 'Wage Protection System (WPS / SIF)'}</div>
                                            </div>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={refreshAll}
                            title={t('refresh')}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            <RefreshCw size={14} className={periodsLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                }
            />

            <section className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:flex-row sm:items-center sm:justify-between" aria-label={t('payrollDataScope')}>
                <div className="flex min-w-0 items-center gap-3">
                    {documentIdentity.logoUrl ? (
                        <img
                            src={documentIdentity.logoUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1.5 shadow-xs dark:border-slate-700"
                            onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        />
                    ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white">
                            <Building2 size={22} />
                        </span>
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                            {documentIdentity.centerName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            <span className="text-teal-700 dark:text-teal-300">{branchName}</span>
                            {branchCode ? <span className="font-mono">{branchCode}</span> : null}
                            {documentIdentity.address ? <span className="truncate">· {documentIdentity.address}</span> : null}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    <LockKeyhole size={14} />
                    <span>
                        {centerSettingsLoading
                            ? (t('loadingBranchData'))
                            : hasExplicitBranch
                                ? (t('periodsAndTotalsAreScopedTo'))
                                : (t('usingTheDefaultFinancialBranch'))}
                    </span>
                </div>
            </section>

            {/* 2. Interactive SOP Guide Drawer */}
            {showSopGuide && (
                <div className="rounded-2xl border border-teal-500/30 bg-teal-50/80 p-4 shadow-sm backdrop-blur-xl dark:border-teal-500/20 dark:bg-slate-900/90 animate-in fade-in">
                    <div className="flex items-center justify-between pb-2 border-b border-teal-500/20 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <BookOpen size={16} className="text-teal-700 dark:text-teal-400" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-teal-950 dark:text-teal-200">
                                {t('standardOperatingPayrollWorkflow')}
                            </h3>
                        </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        {sopSteps.map((s) => (
                            <div key={s.step} className="rounded-xl border border-teal-200/80 bg-white/90 p-3 shadow-xs dark:border-slate-800 dark:bg-slate-950/60">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-[11px] font-black text-white">
                                    {s.step}
                                </span>
                                <h4 className="mt-2 text-xs font-black text-slate-900 dark:text-white">{s.title}</h4>
                                <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 3. Single-Tier Segmented Tabs Navigation Bar */}
<div data-workspace-tabs className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
                <nav aria-label={t('payrollSections')} className="flex flex-wrap gap-1">
                    {navTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex min-h-9 items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${isActive
                                        ? 'bg-teal-700 text-white shadow-sm font-black'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Icon size={14} aria-hidden="true" />
                                <span className="whitespace-nowrap">{tab.label}</span>
                                {tab.badge && (
                                    <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-black whitespace-nowrap ${isActive
                                            ? 'bg-teal-900/60 text-teal-200'
                                            : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}>
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* 4. Create Period Modal */}
            {showCreatePeriodModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <form
                        onSubmit={onCreatePeriod}
                        className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                    >
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2.5">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                                    <Calendar size={20} />
                                </span>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">{t('periods.createTitle')}</h3>
                                    <p className="text-xs font-semibold text-slate-400">{t('periods.createHelp')}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreatePeriodModal(false)}
                                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2.5">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Building2 size={15} className="shrink-0 text-teal-700 dark:text-teal-300" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                            {t('payrollPeriodBranch')}
                                        </p>
                                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">{branchName}</p>
                                    </div>
                                </div>
                                {branchCode ? <span className="rounded-lg bg-white/80 px-2 py-1 font-mono text-[10px] font-black text-slate-600 dark:bg-slate-900 dark:text-slate-300">{branchCode}</span> : null}
                            </div>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.periodName')}</span>
                                <input
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    value={periodForm.name}
                                    onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                                    placeholder={t('placeholders.periodName')}
                                    required
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.startDate')}</span>
                                    <input
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                        type="date"
                                        value={periodForm.startDate}
                                        onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                                        required
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.endDate')}</span>
                                    <input
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                        type="date"
                                        value={periodForm.endDate}
                                        onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                                        required
                                    />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.currency')}</span>
                                    <input
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                        pattern="[A-Z]{3}"
                                        value={periodForm.currencyCode}
                                        onChange={(e) => setPeriodForm({ ...periodForm, currencyCode: e.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3) })}
                                        required
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">{t('fields.notes')}</span>
                                    <input
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                        value={periodForm.notes}
                                        onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })}
                                        placeholder="Optional notes"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowCreatePeriodModal(false)}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={creatingPeriod}
                                className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
                            >
                                {creatingPeriod ? (t('creating')) : t('actions.createPeriod')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* TAB 1: RUNS & WORKFLOW */}
            {activeTab === 'overview' && (
                <div className="space-y-4">
                    {/* Period Selector Pills Carousel */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <Calendar size={15} className="text-teal-600" />
                                <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    {t('periods.title')} ({periods.length})
                                </h2>
                            </div>
                        </div>
                        <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
                            {periods.map((period) => {
                                const isSelected = selectedPeriod?.period_id === period.period_id;
                                return (
                                    <button
                                        key={period.period_id}
                                        type="button"
                                        onClick={() => setSelectedPeriodId(period.period_id)}
                                        className={`flex shrink-0 items-center gap-2.5 rounded-xl border p-2.5 text-start transition-all ${isSelected
                                                ? 'border-teal-500/50 bg-teal-50 shadow-xs dark:border-teal-500/30 dark:bg-teal-500/10'
                                                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950'
                                            }`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-black text-slate-900 dark:text-white">{period.name}</span>
                                                <span className={`rounded-full border px-1.5 py-0.2 text-[9px] font-black ${statusTone[period.status] || statusTone.Draft}`}>
                                                    {t(`payrollStatuses.${period.status}`, { defaultValue: period.status })}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                                                <span>{period.start_date?.slice(0, 10)} → {period.end_date?.slice(0, 10)}</span>
                                                <span>·</span>
                                                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{money(period.total_net, period.currency_code)}</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                            {!periods.length && (
                                <div className="p-4 text-xs font-bold text-slate-400">
                                    {t('periods.empty')}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
                        {/* Left: Employee Run Items */}
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                                <div>
                                    <h2 className="text-sm font-black text-slate-900 dark:text-white">{t('run.title')}</h2>
                                    <p className="text-xs font-semibold text-slate-400">{filteredRunItems.length} {t('periods.employees')}</p>
                                </div>
                                <div className="relative min-w-[200px]">
                                    <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={runSearch}
                                        onChange={e => setRunSearch(e.target.value)}
                                        placeholder={t('searchStaff')}
                                        className="h-8 w-full rounded-xl border border-slate-200 bg-white ps-8 pe-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 max-h-[580px] space-y-2 overflow-y-auto pe-1">
                                {(run?.skipped_employees || []).length > 0 && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                                            <p className="text-xs font-black text-amber-800 dark:text-amber-300">{t('run.skippedTitle')} ({run.skipped_employees.length})</p>
                                        </div>
                                        <p className="mt-1.5 text-[11px] font-bold text-amber-700/90 dark:text-amber-300/80" style={{ direction: isArabic ? 'rtl' : 'ltr' }}>
                                            {run.skipped_employees.map((entry) => entry.fullName).join('، ')}
                                        </p>
                                        <p className="mt-1.5 text-[10.5px] font-semibold text-amber-700/70 dark:text-amber-400/70">{t('run.skippedHelp')}</p>
                                    </div>
                                )}
                                {filteredRunItems.map((item) => (
                                    <div
                                        key={item.item_id}
                                        onClick={() => setSelectedPayslipItem(item)}
                                        className="group cursor-pointer rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition-all hover:border-teal-500/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-black text-slate-900 group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">
                                                    {item.employee_name}
                                                </p>
                                                <p className="text-[10px] font-semibold text-slate-400">{item.role}</p>
                                            </div>
                                            <div className="text-end">
                                                <p className="font-mono text-xs font-black whitespace-nowrap text-teal-700 dark:text-teal-400">{money(item.net_pay, currency)}</p>
                                                <span className="inline-flex items-center gap-1 text-[9.5px] font-black text-slate-400 group-hover:text-teal-600">
                                                    <Eye size={10} />
                                                    <span>{t('payslip.title', { defaultValue: 'قسيمة الراتب' })}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10.5px] font-bold">
                                            <span className="rounded-lg bg-white p-1.5 dark:bg-slate-900 text-slate-500">
                                                {t('summary.gross')}
                                                <b className="block font-mono font-black text-slate-900 dark:text-white whitespace-nowrap">{money(item.gross_earnings, currency)}</b>
                                            </span>
                                            <span className="rounded-lg bg-white p-1.5 dark:bg-slate-900 text-slate-500">
                                                {t('summary.deductions')}
                                                <b className="block font-mono font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">{money(item.total_deductions, currency)}</b>
                                            </span>
                                            <span className="rounded-lg bg-white p-1.5 dark:bg-slate-900 text-slate-500">
                                                {t('summary.penalties')}
                                                <b className="block font-mono font-black text-rose-600 dark:text-rose-400 whitespace-nowrap">{money(item.total_penalties, currency)}</b>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {!filteredRunItems.length && (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                                        <AlertTriangle className="mx-auto text-slate-300" size={24} />
                                        <p className="mt-2 text-xs font-bold text-slate-500">{t('run.empty')}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Workflow Command Deck */}
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3.5">
                                <div className="flex items-start justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <div>
                                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">{t('workflow.title')}</h2>
                                        <p className="text-xs font-semibold text-slate-400">{selectedPeriod?.name || t('workflow.noPeriod')}</p>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone[runStatus] || statusTone.Draft}`}>
                                        {t(`payrollStatuses.${runStatus}`, { defaultValue: runStatus })}
                                    </span>
                                </div>

                                {/* Visual Workflow Stepper */}
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                                    <div className="grid grid-cols-6 gap-1 text-center">
                                        {WORKFLOW_STEPS.map((st, idx) => {
                                            const isDone = currentStepIndex >= idx;
                                            const isCurrent = currentStepIndex === idx;
                                            return (
                                                <div key={st} className="flex flex-col items-center">
                                                    <div className={`grid h-5 w-5 place-items-center rounded-full text-[9px] font-black transition ${isCurrent
                                                            ? 'bg-teal-600 text-white ring-2 ring-teal-500/30'
                                                            : isDone
                                                                ? 'bg-emerald-500 text-white'
                                                                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                        }`}>
                                                        {isDone && !isCurrent ? <Check size={10} /> : idx + 1}
                                                    </div>
                                                    <span className={`mt-1 text-[8.5px] font-black truncate max-w-full ${isCurrent ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400'}`}>
                                                        {st}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Pre-Flight Calculation Readiness Widget */}
                                <div className={`rounded-2xl border p-3.5 transition-colors ${
                                    preflightAudit.isReady
                                        ? 'border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-500/20'
                                        : 'border-amber-500/30 bg-amber-500/10 dark:border-amber-500/20'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {preflightAudit.isReady ? (
                                                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                                            ) : (
                                                <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
                                            )}
                                            <span className="text-xs font-black text-slate-900 dark:text-white">
                                                {t('preflightCheck.title')}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                            preflightAudit.isReady
                                                ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                                                : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                        }`}>
                                            {preflightAudit.isReady ? (isArabic ? 'جاهز للاحتساب' : 'Ready') : (isArabic ? 'تنبيهات تدقيق' : 'Audit Notices')}
                                        </span>
                                    </div>

                                    {preflightAudit.isReady ? (
                                        <p className="mt-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                            {t('preflightCheck.allReady')}
                                        </p>
                                    ) : (
                                        <div className="mt-2.5 space-y-1.5 text-[10.5px] font-bold">
                                            {preflightAudit.staffWithoutComp.length > 0 && (
                                                <div className="flex items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
                                                    <span className="truncate">• {t('preflightCheck.missingComp', { count: preflightAudit.staffWithoutComp.length })}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveTab('compensation')}
                                                        className="shrink-0 text-[10px] font-black text-teal-700 dark:text-teal-400 hover:underline"
                                                    >
                                                        {isArabic ? 'إعداد' : 'Setup'}
                                                    </button>
                                                </div>
                                            )}
                                            {preflightAudit.pendingPenalties.length > 0 && (
                                                <div className="flex items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
                                                    <span className="truncate">• {t('preflightCheck.pendingPenalties', { count: preflightAudit.pendingPenalties.length })}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setActiveTab('adjustments'); setAdjustmentCategory('penalties'); }}
                                                        className="shrink-0 text-[10px] font-black text-teal-700 dark:text-teal-400 hover:underline"
                                                    >
                                                        {isArabic ? 'مراجعة' : 'Review'}
                                                    </button>
                                                </div>
                                            )}
                                            {preflightAudit.disputedPenalties.length > 0 && (
                                                <div className="flex items-center justify-between gap-2 text-indigo-800 dark:text-indigo-300">
                                                    <span className="truncate">• {t('preflightCheck.disputedPenalties', { count: preflightAudit.disputedPenalties.length })}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setActiveTab('adjustments'); setAdjustmentCategory('penalties'); }}
                                                        className="shrink-0 text-[10px] font-black text-indigo-700 dark:text-indigo-400 hover:underline"
                                                    >
                                                        {isArabic ? 'النزاعات' : 'Disputes'}
                                                    </button>
                                                </div>
                                            )}
                                            {preflightAudit.draftDeductions.length > 0 && (
                                                <div className="flex items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
                                                    <span className="truncate">• {t('preflightCheck.draftDeductions', { count: preflightAudit.draftDeductions.length })}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setActiveTab('adjustments'); setAdjustmentCategory('loans'); }}
                                                        className="shrink-0 text-[10px] font-black text-teal-700 dark:text-teal-400 hover:underline"
                                                    >
                                                        {isArabic ? 'اعتماد' : 'Approve'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons Grid */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        disabled={!selectedPeriod || calculating || !permissions.calculate || !['Draft', 'Calculated'].includes(selectedPeriod.status)}
                                        title={disabledReason(permissions.calculate)}
                                        onClick={() => setWorkflowDecision({ type: 'calculate', periodId: selectedPeriod.period_id, title: selectedPeriod.name })}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 disabled:opacity-40"
                                    >
                                        <Calculator size={14} />
                                        <span>{t('actions.calculate')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!runId || updatingStatus || !permissions.review || runStatus !== 'Calculated'}
                                        title={disabledReason(permissions.review)}
                                        onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Reviewed', title: selectedPeriod?.name })}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-indigo-500 disabled:opacity-40"
                                    >
                                        <ClipboardCheck size={14} />
                                        <span>{t('actions.review')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!runId || updatingStatus || !permissions.approve || runStatus !== 'Reviewed'}
                                        title={disabledReason(permissions.approve)}
                                        onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Approved', title: selectedPeriod?.name })}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-40"
                                    >
                                        <CheckCircle2 size={14} />
                                        <span>{t('actions.approve')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!runId || updatingStatus || !permissions.pay || runStatus !== 'Approved' || !paymentReady}
                                        title={!paymentReady ? t('validation.paymentReference', { defaultValue: 'Enter a payment reference for this method.' }) : disabledReason(permissions.pay)}
                                        onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Paid', title: selectedPeriod?.name })}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-black text-white shadow-xs transition hover:bg-teal-600 disabled:opacity-40"
                                    >
                                        <Banknote size={14} />
                                        <span>{t('actions.markPaid')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={
                                            !selectedPeriod
                                            || cancellingPeriod
                                            || updatingStatus
                                            || !permissions.cancel
                                            || !['Draft', 'Calculated', 'Reviewed'].includes(runStatus)
                                        }
                                        title={disabledReason(permissions.cancel)}
                                        onClick={() => setWorkflowDecision(runId
                                            ? { type: 'status', runId, status: 'Cancelled', title: selectedPeriod?.name }
                                            : { type: 'cancelPeriod', periodId: selectedPeriod.period_id, status: 'Cancelled', title: selectedPeriod.name })}
                                        className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                                    >
                                        <X size={13} />
                                        <span>{t('actions.cancelPayroll', { defaultValue: 'Cancel payroll' })}</span>
                                    </button>
                                </div>

                                {/* Payment Details Section */}
                                <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('disbursementDetails')}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                            type="date"
                                            value={paymentDate}
                                            onChange={(e) => setPaymentDate(e.target.value)}
                                            aria-label={t('fields.paymentDate')}
                                        />
                                        <select
                                            className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                        >
                                            <option value="BankTransfer">{t('paymentMethods.BankTransfer', { defaultValue: 'Bank transfer' })}</option>
                                            <option value="Cash">{t('paymentMethods.Cash', { defaultValue: 'Cash' })}</option>
                                            <option value="Check">{t('paymentMethods.Check', { defaultValue: 'Check' })}</option>
                                            <option value="Wallet">{t('paymentMethods.Wallet', { defaultValue: 'Wallet' })}</option>
                                            <option value="Other">{t('paymentMethods.Other', { defaultValue: 'Other' })}</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            className="h-8 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                            value={paymentReference}
                                            onChange={(e) => setPaymentReference(e.target.value)}
                                            placeholder={t('placeholders.paymentReference')}
                                        />
                                        <button
                                            type="button"
                                            disabled={!runId || updatingStatus || !permissions.lock || runStatus !== 'Paid'}
                                            title={disabledReason(permissions.lock)}
                                            onClick={() => setWorkflowDecision({ type: 'status', runId, status: 'Locked', title: selectedPeriod?.name })}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-purple-600 px-3 text-xs font-bold text-white shadow-xs transition hover:bg-purple-500 disabled:opacity-40"
                                        >
                                            <LockKeyhole size={13} />
                                            <span>{t('actions.lock')}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: COMPENSATION PROFILES & CONTRACTS */}
            {activeTab === 'compensation' && (
                <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                    {/* Add Compensation Profile Form */}
                    <form onSubmit={onCreateCompensation} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <FileCheck size={16} className="text-teal-600" />
                            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {t('newCompensationContract')}
                            </h2>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.employee')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={compForm.userId} onChange={(e) => setCompForm({ ...compForm, userId: e.target.value })} required>
                                <option value="">{t('placeholders.employee')}</option>
                                {staff.map((emp) => <option key={emp.user_id} value={emp.user_id}>{emp.full_name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.salaryType')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={compForm.salaryType} onChange={(e) => setCompForm({ ...compForm, salaryType: e.target.value })}>
                                <option value="Monthly">{t('monthlyBase')}</option>
                                <option value="Hourly">{t('hourlyRate')}</option>
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.baseSalary')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min={compForm.salaryType === 'Monthly' ? '0.01' : '0'} step="0.01" required={compForm.salaryType === 'Monthly'} value={compForm.baseSalary} onChange={(e) => setCompForm({ ...compForm, baseSalary: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.hourlyRate')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min={compForm.salaryType === 'Hourly' ? '0.01' : '0'} step="0.01" required={compForm.salaryType === 'Hourly'} value={compForm.hourlyRate} onChange={(e) => setCompForm({ ...compForm, hourlyRate: e.target.value })} />
                            </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('standardHoursDay')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="0.25" max="24" step="0.25" required value={compForm.standardHoursPerDay} onChange={(e) => setCompForm({ ...compForm, standardHoursPerDay: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('standardDaysPeriod')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" min="1" max="31" required value={compForm.standardDaysPerPeriod} onChange={(e) => setCompForm({ ...compForm, standardDaysPerPeriod: e.target.value })} />
                            </label>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.effectiveFrom')}</span>
                            <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="date" required value={compForm.effectiveFrom} onChange={(e) => setCompForm({ ...compForm, effectiveFrom: e.target.value })} />
                        </label>
                        <button type="submit" disabled={savingCompensation} className="w-full h-9 rounded-xl bg-teal-600 text-xs font-black text-white shadow-xs hover:bg-teal-500 disabled:opacity-50">
                            {savingCompensation ? (t('saving')) : (t('saveCertifyContract'))}
                        </button>
                    </form>

                    {/* Profiles & Contracts List */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">{t('employeeContractsCompensation')}</h3>
                                <p className="text-xs font-semibold text-slate-400">{filteredCompensation.length} {t('certifiedContracts')}</p>
                            </div>
                            <div className="relative min-w-[200px]">
                                <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={compSearch}
                                    onChange={e => setCompSearch(e.target.value)}
                                    placeholder={t('searchStaff')}
                                    className="h-8 w-full rounded-xl border border-slate-200 bg-white ps-8 pe-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>
                        </div>

                        <div className="mt-3 max-h-[580px] space-y-2.5 overflow-y-auto pe-1">
                            {filteredCompensation.map((profile) => (
                                <div key={profile.profile_id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40 hover:border-teal-500/30 transition-all">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-xs font-black text-slate-900 dark:text-white">{profile.employee_name}</p>
                                                <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.2 text-[9px] font-black text-teal-800 dark:text-teal-300">
                                                    {profile.salary_type === 'Monthly' ? (t('fullTime')) : (t('hourly'))}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{profile.role} · {profile.standard_hours_per_day || 8}h/day</p>
                                        </div>
                                        <div className="text-end">
                                            <p className="font-mono text-xs font-black whitespace-nowrap text-slate-900 dark:text-white">
                                                {profile.salary_type === 'Monthly' ? money(profile.base_salary, currency) : `${money(profile.hourly_rate, currency)}/hr`}
                                            </p>
                                            <span className={`inline-flex rounded-full px-2 py-0.2 text-[9px] font-black ${profile.is_active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                                                {profile.is_active ? (t('active')) : (t('terminated'))}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-500 dark:border-slate-800">
                                        <span>{t('term')} {profile.effective_from?.slice(0, 10)} {profile.effective_to ? `→ ${profile.effective_to.slice(0, 10)}` : (t('ongoing'))}</span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedContractProfile(profile)}
                                                className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-[10px] font-black text-teal-800 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300 transition"
                                            >
                                                <FileText size={11} />
                                                <span>{t('viewContract')}</span>
                                            </button>
                                            {!profile.effective_to && (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="date"
                                                        value={compensationEndDates[profile.profile_id] || ''}
                                                        onChange={(e) => setCompensationEndDates({ ...compensationEndDates, [profile.profile_id]: e.target.value })}
                                                        className="h-6 rounded-md border border-slate-200 bg-white px-1 text-[10px] dark:border-slate-800 dark:bg-slate-900"
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={updatingCompensation}
                                                        onClick={() => onCloseCompensation(profile)}
                                                        className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                                                    >
                                                        {t('end')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!filteredCompensation.length && (
                                <div className="p-8 text-center text-xs font-bold text-slate-400">
                                    {t('inputs.emptyProfiles')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: DEDUCTIONS, LOANS & PENALTIES */}
            {activeTab === 'adjustments' && (
                <div className="space-y-4">
                    {/* 1. KPI Summary Cards Strip */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 backdrop-blur-xl dark:border-teal-500/10 dark:bg-teal-500/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                    {t('activeLoanBalances')}
                                </span>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-600 text-white shadow-2xs">
                                    <Coins size={16} />
                                </span>
                            </div>
                            <p className="mt-2 font-mono text-xl font-black text-teal-950 dark:text-teal-100">
                                {money(adjustmentStats.totalLoanBalance, currency)}
                            </p>
                            <p className="mt-0.5 text-[10.5px] font-bold text-teal-700/80 dark:text-teal-300/80">
                                {t('loansAndAdvances')}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur-xl dark:border-amber-500/10 dark:bg-amber-500/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                    {t('activeDeductionsCount')}
                                </span>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-600 text-white shadow-2xs">
                                    <MinusCircle size={16} />
                                </span>
                            </div>
                            <p className="mt-2 font-mono text-xl font-black text-amber-950 dark:text-amber-100">
                                {adjustmentStats.activeRecurringCount}
                            </p>
                            <p className="mt-0.5 text-[10.5px] font-bold text-amber-700/80 dark:text-amber-300/80">
                                {t('recurringDeductions')}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 backdrop-blur-xl dark:border-rose-500/10 dark:bg-rose-500/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300">
                                    {t('pendingPenaltiesCount')}
                                </span>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-rose-600 text-white shadow-2xs">
                                    <AlertTriangle size={16} />
                                </span>
                            </div>
                            <p className="mt-2 font-mono text-xl font-black text-rose-950 dark:text-rose-100">
                                {adjustmentStats.pendingPenalties}
                            </p>
                            <p className="mt-0.5 text-[10.5px] font-bold text-rose-700/80 dark:text-rose-300/80">
                                {t('pendingApproval')}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 backdrop-blur-xl dark:border-indigo-500/10 dark:bg-indigo-500/5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                                    {t('approvedPenaltiesCount')}
                                </span>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-white shadow-2xs">
                                    <ShieldCheck size={16} />
                                </span>
                            </div>
                            <p className="mt-2 font-mono text-xl font-black text-indigo-950 dark:text-indigo-100">
                                {money(adjustmentStats.approvedPenaltiesTotal, currency)}
                            </p>
                            <p className="mt-0.5 text-[10.5px] font-bold text-indigo-700/80 dark:text-indigo-300/80">
                                {t('disciplinaryPenalties')}
                            </p>
                        </div>
                    </div>

                    {/* 2. Unified Toolbar (Search, Category Filters, Status Filters & Action Buttons) */}
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 lg:flex-row lg:items-center lg:justify-between">
                        {/* Search & Category Pills */}
                        <div className="flex flex-1 flex-wrap items-center gap-2">
                            <div className="relative min-w-[220px] max-w-xs flex-1">
                                <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={adjustmentSearch}
                                    onChange={(e) => setAdjustmentSearch(e.target.value)}
                                    placeholder={t('searchAdjustments')}
                                    className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                {[
                                    { key: 'all', label: t('allCategories') },
                                    { key: 'loans', label: t('loansAndAdvances') },
                                    { key: 'deductions', label: t('setup.deductions') },
                                    { key: 'penalties', label: t('disciplinaryPenalties') },
                                ].map((cat) => (
                                    <button
                                        key={cat.key}
                                        type="button"
                                        onClick={() => setAdjustmentCategory(cat.key)}
                                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${adjustmentCategory === cat.key
                                            ? 'bg-white text-teal-800 shadow-2xs font-black dark:bg-slate-900 dark:text-teal-300'
                                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-1 border-s border-slate-200 ps-2 dark:border-slate-800">
                                {[
                                    { key: 'all', label: t('allAdjustments') },
                                    { key: 'Pending Approval', label: t('pendingApproval') },
                                    { key: 'Approved', label: t('approved') },
                                    { key: 'Paused', label: t('paused') },
                                ].map((filter) => (
                                    <button
                                        key={filter.key}
                                        type="button"
                                        onClick={() => setAdjustmentFilter(filter.key)}
                                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${adjustmentFilter === filter.key
                                            ? 'bg-teal-700 text-white shadow-2xs font-black'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                            }`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setDeductionForm({
                                        userId: '',
                                        name: '',
                                        deductionType: 'Advance',
                                        amount: '',
                                        percentage: '',
                                        totalAmount: '',
                                        remainingAmount: '',
                                        recurrenceType: 'Installment',
                                        maxOccurrences: '',
                                        startDate: initialToday,
                                        endDate: '',
                                        status: 'Draft',
                                        notes: '',
                                    });
                                    setShowCreateDeductionModal(true);
                                }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs hover:brightness-110 transition"
                            >
                                <Plus size={14} />
                                <span>{t('addDeductionOrLoan')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPenaltyForm({
                                        userId: '',
                                        penaltyType: 'Policy',
                                        amount: '',
                                        reason: '',
                                        source: 'Manual',
                                        status: 'Pending Approval',
                                        incidentDate: initialToday,
                                        payrollPeriodId: '',
                                    });
                                    setShowCreatePenaltyModal(true);
                                }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 px-3.5 text-xs font-bold text-white shadow-xs hover:brightness-110 transition"
                            >
                                <Plus size={14} />
                                <span>{t('recordDisciplinaryPenalty')}</span>
                            </button>
                        </div>
                    </div>

                    {/* 3. Deductions, Loans & Penalties Lists Grid */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* Left: Deductions & Loans */}
                        {adjustmentCategory !== 'penalties' && (
                            <div className={`rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 ${adjustmentCategory === 'loans' || adjustmentCategory === 'deductions' ? 'lg:col-span-2' : ''}`}>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Coins size={16} className="text-teal-600" />
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                            {t('setup.deductions')} & {t('loansAndAdvances')} ({filteredDeductions.length})
                                        </h3>
                                    </div>
                                </div>
                                <div className="mt-3 max-h-[580px] space-y-3 overflow-y-auto pe-1">
                                    {filteredDeductions.map((row) => {
                                        const isLoan = ['Installment', 'Advance', 'Loan'].includes(row.deduction_type);
                                        const createdByCurrentUser = String(row.created_by) === String(user?.user_id) && user?.role !== 'Developer';
                                        const totalAmt = Number(row.total_amount || row.amount || 0);
                                        const remAmt = Number(row.remaining_amount ?? totalAmt);
                                        const paidAmt = Math.max(0, totalAmt - remAmt);
                                        const progressPercent = totalAmt > 0 ? Math.min(100, Math.round((paidAmt / totalAmt) * 100)) : 0;

                                        return (
                                            <div
                                                key={row.deduction_id}
                                                className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 transition-all hover:border-teal-500/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/80 shadow-2xs"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{row.name}</p>
                                                            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.2 text-[9px] font-black border ${row.deduction_type === 'Advance'
                                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                                                : row.deduction_type === 'Loan'
                                                                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300'
                                                                    : row.deduction_type === 'Installment'
                                                                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300'
                                                                        : row.deduction_type === 'Percentage'
                                                                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                                                            : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                }`}>
                                                                {t(`deductionTypes.${row.deduction_type}`, { defaultValue: row.deduction_type })}
                                                            </span>
                                                        </div>
                                                        <p className="mt-0.5 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                                                            {row.employee_name} · {row.start_date?.slice(0, 10)} {row.end_date ? `→ ${row.end_date.slice(0, 10)}` : ''}
                                                        </p>
                                                    </div>
                                                    <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-black ${statusTone[row.status] || statusTone.Draft}`}>
                                                        {t(`deductionStatuses.${row.status}`, { defaultValue: row.status })}
                                                    </span>
                                                </div>

                                                {/* Financials Strip */}
                                                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 rounded-xl bg-white p-2.5 border border-slate-100 dark:bg-slate-900/90 dark:border-slate-800">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-400">{t('summary.deductions')}</span>
                                                        <p className="font-mono text-xs font-black text-slate-900 dark:text-white">
                                                            {row.deduction_type === 'Percentage' ? `${Number(row.percentage || 0)}%` : money(row.amount, currency)}
                                                        </p>
                                                    </div>
                                                    {isLoan && (
                                                        <>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-slate-400">{t('totalPrincipal')}</span>
                                                                <p className="font-mono text-xs font-black text-slate-700 dark:text-slate-300">
                                                                    {money(totalAmt, currency)}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-slate-400">{t('remainingBalance')}</span>
                                                                <p className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                                                                    {money(remAmt, currency)}
                                                                </p>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Loan Repayment Progress Bar */}
                                                {isLoan && totalAmt > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                            <span>{t('loanProgress')}: {progressPercent}% ({t('repaid')} {money(paidAmt, currency)})</span>
                                                            <span className="font-mono">{money(remAmt, currency)} {t('rem')}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                                            <div
                                                                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                                                                style={{ width: `${progressPercent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {row.notes && (
                                                    <p className="mt-2 text-[10.5px] italic text-slate-500 dark:text-slate-400">
                                                        "{row.notes}"
                                                    </p>
                                                )}

                                                {/* Action Buttons */}
                                                {!!adjustmentActions('deduction', row.status).length && (
                                                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                                                        {adjustmentActions('deduction', row.status).map((status) => (
                                                            <button
                                                                key={status}
                                                                type="button"
                                                                disabled={!permissions.approve
                                                                    || updatingSetupStatus
                                                                    || (status === 'Approved' && createdByCurrentUser)
                                                                    || (Boolean(row.payroll_period_id) && status !== 'Approved')}
                                                                title={status === 'Approved' && createdByCurrentUser
                                                                    ? t('deductionReview.selfApprovalBlocked')
                                                                    : Boolean(row.payroll_period_id) && status !== 'Approved'
                                                                        ? t('deductionReview.runReservationBlocked')
                                                                        : disabledReason(permissions.approve)}
                                                                onClick={() => setSetupDecision({ kind: 'deduction', id: row.deduction_id, status, name: row.name })}
                                                                className={`rounded-lg px-2.5 py-1 text-[10px] font-black text-white transition ${status === 'Approved'
                                                                    ? 'bg-emerald-600 hover:bg-emerald-500'
                                                                    : status === 'Paused'
                                                                        ? 'bg-amber-600 hover:bg-amber-500'
                                                                        : 'bg-rose-600 hover:bg-rose-500'
                                                                    }`}
                                                            >
                                                                {actionLabel(status, t)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!filteredDeductions.length && (
                                        <div className="p-8 text-center text-xs font-bold text-slate-400">
                                            {t('inputs.emptyDeductions')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Right: Disciplinary Penalties */}
                        {adjustmentCategory !== 'loans' && adjustmentCategory !== 'deductions' && (
                            <div className={`rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 ${adjustmentCategory === 'penalties' ? 'lg:col-span-2' : ''}`}>
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={16} className="text-rose-600" />
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                            {t('setup.penalties')} ({filteredPenalties.length})
                                        </h3>
                                    </div>
                                </div>
                                <div className="mt-3 max-h-[580px] space-y-3 overflow-y-auto pe-1">
                                    {filteredPenalties.map((row) => {
                                        const canReviewPenalty = user?.role === 'Developer' || String(row.created_by) !== String(user?.user_id);
                                        return (
                                        <div
                                            key={row.penalty_id}
                                            className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 transition-all hover:border-rose-500/40 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/80 shadow-2xs"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.2 text-[9px] font-black text-rose-800 dark:text-rose-300">
                                                            {t(`penaltyTypes.${row.penalty_type}`, { defaultValue: row.penalty_type })}
                                                        </span>
                                                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.2 text-[9px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                                            {t(`penaltySources.${row.source}`, { defaultValue: row.source })}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-xs font-black text-slate-900 dark:text-white">
                                                        {row.employee_name}
                                                    </p>
                                                    <p className="text-[10px] font-semibold text-slate-400">
                                                        {t('incidentDate')}: {row.incident_date?.slice(0, 10) || row.created_at?.slice(0, 10)}
                                                    </p>
                                                </div>
                                                <div className="text-end">
                                                    <p className="font-mono text-xs font-black text-rose-600 dark:text-rose-400">
                                                        {money(row.amount, currency)}
                                                    </p>
                                                    <span className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[9.5px] font-black ${statusTone[row.status] || statusTone.Draft}`}>
                                                        {t(`penaltyStatuses.${row.status}`, { defaultValue: row.status })}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Reason Box */}
                                            <div className="mt-2.5 rounded-xl border border-rose-100 bg-rose-50/50 p-2.5 text-[11px] leading-relaxed text-slate-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-slate-300">
                                                <p className="font-bold text-rose-950 dark:text-rose-200">{t('fields.reason')}:</p>
                                                <p className="mt-0.5">{row.reason}</p>
                                            </div>

                                            {row.acknowledgement_status ? (
                                                <div className="mt-2.5 rounded-xl border border-slate-200 bg-white p-2.5 text-[11px] dark:border-slate-800 dark:bg-slate-900">
                                                    <p className="font-bold text-slate-700 dark:text-slate-200">{t(`acknowledgementStatuses.${row.acknowledgement_status}`, { defaultValue: row.acknowledgement_status })}</p>
                                                    {row.acknowledgement_status === 'Disputed' && row.dispute_reason ? (
                                                        <p className="mt-1 text-slate-600 dark:text-slate-400">{row.dispute_reason}</p>
                                                    ) : null}
                                                    {row.acknowledgement_status === 'Resolved' && row.dispute_resolution ? (
                                                        <p className="mt-1 text-slate-600 dark:text-slate-400">{row.dispute_resolution}</p>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            {row.acknowledgement_status === 'Disputed' ? (
                                                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                                                    <button
                                                        type="button"
                                                        disabled={!permissions.approve || resolvingPenaltyDispute}
                                                        onClick={() => setSetupDecision({ kind: 'penaltyDispute', id: row.penalty_id, status: 'Approved', name: row.penalty_type })}
                                                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white transition hover:bg-emerald-500 disabled:opacity-50"
                                                    >
                                                        {t('disputeReview.uphold')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={!permissions.approve || resolvingPenaltyDispute}
                                                        onClick={() => setSetupDecision({ kind: 'penaltyDispute', id: row.penalty_id, status: 'Rejected', name: row.penalty_type })}
                                                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-black text-white transition hover:bg-rose-500 disabled:opacity-50"
                                                    >
                                                        {t('disputeReview.reject')}
                                                    </button>
                                                </div>
                                            ) : null}

                                            {/* Action Buttons */}
                                            {canReviewPenalty && !!adjustmentActions('penalty', row.status).length && (
                                                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                                                    {adjustmentActions('penalty', row.status).map((status) => (
                                                        <button
                                                            key={status}
                                                            type="button"
                                                            disabled={!permissions.approve || updatingSetupStatus}
                                                            onClick={() => setSetupDecision({ kind: 'penalty', id: row.penalty_id, status, name: row.penalty_type })}
                                                            className={`rounded-lg px-2.5 py-1 text-[10px] font-black text-white transition ${status === 'Approved'
                                                                ? 'bg-emerald-600 hover:bg-emerald-500'
                                                                : 'bg-rose-600 hover:bg-rose-500'
                                                                }`}
                                                        >
                                                            {actionLabel(status, t)}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}
                                    {!filteredPenalties.length && (
                                        <div className="p-8 text-center text-xs font-bold text-slate-400">
                                            {t('inputs.emptyPenalties')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: PAYROLL RULES */}
            {activeTab === 'rules' && (
                <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                    {/* Add Rule Form */}
                    <form onSubmit={onCreateRule} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <Settings2 size={16} className="text-teal-600" />
                            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {t('addCalculationRule')}
                            </h2>
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.ruleType')}</span>
                            <select className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={ruleForm.ruleType} onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value })}>
                                {['Allowance', 'Overtime', 'Late', 'Absence', 'Deduction', 'Penalty', 'EmployerContribution'].map((rt) => (
                                    <option key={rt} value={rt}>{rt}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.name')}</span>
                            <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} required />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.method')}</span>
                                <select className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" value={ruleForm.calculationMethod} onChange={(e) => setRuleForm({ ...ruleForm, calculationMethod: e.target.value })}>
                                    <option value="FixedAmount">FixedAmount</option>
                                    <option value="PercentageOfBase">PercentageOfBase</option>
                                    <option value="HourlyMultiplier">HourlyMultiplier</option>
                                    <option value="PerDay">PerDay</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-xs font-bold text-slate-500">{t('fields.value')}</span>
                                <input className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200" type="number" step="0.01" value={ruleForm.value} onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })} required />
                            </label>
                        </div>
                        <button type="submit" disabled={savingRule} className="w-full h-9 rounded-xl bg-teal-600 text-xs font-black text-white shadow-xs hover:bg-teal-500 disabled:opacity-50">
                            {savingRule ? (t('saving')) : (t('saveRule'))}
                        </button>
                    </form>

                    {/* Rules List */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
                            {t('inputs.rulesTitle')} ({rules.length})
                        </h3>
                        <div className="mt-3 max-h-[500px] space-y-2 overflow-y-auto pe-1">
                            {rules.map((rule) => (
                                <div key={rule.rule_id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{rule.name}</p>
                                            <p className="text-[10px] font-semibold text-slate-400">{rule.rule_type} · {rule.calculation_method}</p>
                                        </div>
                                        <span className="font-mono text-xs font-black text-slate-900 dark:text-white">{rule.value}</span>
                                    </div>
                                </div>
                            ))}
                            {!rules.length && (
                                <p className="py-8 text-center text-xs font-bold text-slate-400">{t('inputs.emptyRules')}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dialogs & Modals */}
            {workflowDecision && (
                workflowNeedsNotes ? (
                    <TextPromptDialog
                        isOpen={Boolean(workflowDecision)}
                        title={workflowDecision.title}
                        message={t('pleaseProvideDecisionNotes')}
                        onConfirm={executeWorkflowDecision}
                        onClose={() => setWorkflowDecision(null)}
                    />
                ) : (
                    <ConfirmDialog
                        isOpen={Boolean(workflowDecision)}
                        title={workflowDecision.title}
                        message={t('areYouSureYouWantTo')}
                        onConfirm={() => executeWorkflowDecision('')}
                        onClose={() => setWorkflowDecision(null)}
                    />
                )
            )}

            {setupDecision && (setupDecisionNeedsReason ? (
                <TextPromptDialog
                    isOpen
                    title={setupDecision.kind === 'penaltyDispute' ? t('disputeReview.title') : t('penaltyReview.cancelTitle')}
                    message={setupDecision.kind === 'penaltyDispute'
                        ? t('disputeReview.message', { status: t(`disputeReview.outcomes.${setupDecision.status}`), name: setupDecision.name })
                        : t('penaltyReview.cancelMessage', { name: setupDecision.name })}
                    label={t('penaltyReview.reason')}
                    placeholder={setupDecision.kind === 'penaltyDispute' ? t('disputeReview.resolutionPlaceholder') : t('penaltyReview.cancelPlaceholder')}
                    validationMessage={t('penaltyReview.reasonRequired')}
                    confirmLabel={setupDecision.kind === 'penaltyDispute'
                        ? t(`disputeReview.actions.${setupDecision.status}`)
                        : t('penaltyReview.cancelAction')}
                    cancelLabel={t('cancel')}
                    onConfirm={executeSetupDecision}
                    onClose={() => setSetupDecision(null)}
                    isLoading={updatingSetupStatus}
                    validate={(value) => value.length < 3 ? t('penaltyReview.reasonRequired') : ''}
                />
            ) : (
                <ConfirmDialog
                    isOpen
                    title={setupDecision.name}
                    message={t('payrollSetup.changeStatusConfirm', { status: setupDecision.status })}
                    onConfirm={executeSetupDecision}
                    onClose={() => setSetupDecision(null)}
                />
            ))}

            {selectedPayslipItem && (
                <PayslipModal
                    item={selectedPayslipItem}
                    period={selectedPeriod}
                    currency={currency}
                    identity={documentIdentity}
                    onClose={() => setSelectedPayslipItem(null)}
                    isArabic={isArabic}
                />
            )}

            {selectedContractProfile && (
                <ContractModal
                    profile={selectedContractProfile}
                    currency={currency}
                    identity={documentIdentity}
                    onClose={() => setSelectedContractProfile(null)}
                    isArabic={isArabic}
                />
            )}

            <CreateDeductionModal
                isOpen={showCreateDeductionModal}
                onClose={() => setShowCreateDeductionModal(false)}
                form={deductionForm}
                setForm={setDeductionForm}
                onSubmit={onCreateDeduction}
                isLoading={savingDeduction}
                staff={staff}
                currency={currency}
                isArabic={isArabic}
                t={t}
            />

            <CreatePenaltyModal
                isOpen={showCreatePenaltyModal}
                onClose={() => setShowCreatePenaltyModal(false)}
                form={penaltyForm}
                setForm={setPenaltyForm}
                onSubmit={onCreatePenalty}
                isLoading={savingPenalty}
                staff={staff}
                periods={periods}
                currency={currency}
                isArabic={isArabic}
                t={t}
            />

            <SalarySimulatorModal
                isOpen={showSalarySimulator}
                onClose={() => setShowSalarySimulator(false)}
                staff={staff}
                compensationProfiles={compensation}
                rules={rules}
                currency={currency}
            />
        </main>
    );
};

export default Payroll;
