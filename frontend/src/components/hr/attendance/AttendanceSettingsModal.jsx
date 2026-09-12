import React, { useState, useEffect } from 'react';
import {
    Sliders, Clock, ShieldCheck, ShieldAlert, CheckCircle2,
    RefreshCw, Save, AlertTriangle, Users, Info, ChevronRight, Lock
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../../ui/Modal';
import { useGetAttendanceSettingsQuery, useUpdateAttendanceSettingsMutation } from '../../../store/api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

const PRESET_ROLES = [
    { key: 'Admin', ar: 'الإدارة العليا', en: 'Administration' },
    { key: 'HR', ar: 'الموارد البشرية', en: 'Human Resources' },
    { key: 'Developer', ar: 'المطورون / الدعم الفني', en: 'Developers / IT' },
    { key: 'Doctor', ar: 'الأطباء الاستشاريون', en: 'Consultant Doctors' },
    { key: 'Radiologist', ar: 'أطباء الأشعة', en: 'Radiologists' },
    { key: 'Technician', ar: 'فنيو الأشعة', en: 'Technologists' },
    { key: 'Nurse', ar: 'التمريض', en: 'Nurses' },
    { key: 'Receptionist', ar: 'الاستقبال', en: 'Receptionists' },
    { key: 'Cashier', ar: 'الخزينة', en: 'Cashiers' }
];

export const AttendanceSettingsModal = ({ isOpen, onClose }) => {
    const { i18n, t } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');

    const { data: serverConfig, isLoading, refetch } = useGetAttendanceSettingsQuery(undefined, { skip: !isOpen });
    const [updateSettings, { isLoading: isSaving }] = useUpdateAttendanceSettingsMutation();

    const [form, setForm] = useState({
        gracePeriodLateMinutes: 15,
        gracePeriodEarlyMinutes: 10,
        deductFullDelayAfterGrace: false,
        requireEarlyLeaveApproval: true,
        enforceShiftLoginRestriction: false,
        loginBufferBeforeMinutes: 30,
        loginBufferAfterMinutes: 30,
        exemptRolesFromLoginRestriction: ['Admin', 'HR', 'Developer']
    });

    useEffect(() => {
        if (serverConfig) {
            setForm({
                gracePeriodLateMinutes: serverConfig.gracePeriodLateMinutes ?? 15,
                gracePeriodEarlyMinutes: serverConfig.gracePeriodEarlyMinutes ?? 10,
                deductFullDelayAfterGrace: Boolean(serverConfig.deductFullDelayAfterGrace),
                requireEarlyLeaveApproval: serverConfig.requireEarlyLeaveApproval !== undefined ? Boolean(serverConfig.requireEarlyLeaveApproval) : true,
                enforceShiftLoginRestriction: Boolean(serverConfig.enforceShiftLoginRestriction),
                loginBufferBeforeMinutes: serverConfig.loginBufferBeforeMinutes ?? 30,
                loginBufferAfterMinutes: serverConfig.loginBufferAfterMinutes ?? 30,
                exemptRolesFromLoginRestriction: Array.isArray(serverConfig.exemptRolesFromLoginRestriction)
                    ? serverConfig.exemptRolesFromLoginRestriction
                    : ['Admin', 'HR', 'Developer']
            });
        }
    }, [serverConfig]);

    const handleRoleToggle = (roleKey) => {
        setForm((prev) => {
            const exists = prev.exemptRolesFromLoginRestriction.includes(roleKey);
            const updated = exists
                ? prev.exemptRolesFromLoginRestriction.filter((r) => r !== roleKey)
                : [...prev.exemptRolesFromLoginRestriction, roleKey];
            return { ...prev, exemptRolesFromLoginRestriction: updated };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await updateSettings(form).unwrap();
            toast.success(
                isArabic
                    ? 'تم تحديث إعدادات وسياسات الانضباط بنجاح'
                    : 'Attendance discipline settings updated successfully'
            );
            onClose();
        } catch (err) {
            toast.error(getErrorMessage(err, isArabic ? 'تعذر حفظ الإعدادات' : 'Failed to save settings'));
        }
    };

    const handleResetDefaults = () => {
        setForm({
            gracePeriodLateMinutes: 15,
            gracePeriodEarlyMinutes: 10,
            deductFullDelayAfterGrace: false,
            requireEarlyLeaveApproval: true,
            enforceShiftLoginRestriction: false,
            loginBufferBeforeMinutes: 30,
            loginBufferAfterMinutes: 30,
            exemptRolesFromLoginRestriction: ['Admin', 'HR', 'Developer']
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isArabic ? 'إعدادات وسياسات الانضباط والحضور' : 'Attendance Governance & Discipline Policies'}
            size="wide"
        >
            {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-teal-600" />
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6 p-1 text-slate-800 dark:text-slate-200">
                    {/* Header Banner */}
                    <div className="flex items-start gap-3.5 rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 dark:bg-teal-500/10">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400">
                            <Sliders size={20} />
                        </span>
                        <div>
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                {isArabic ? 'قواعد الرقابة الإدارية وفترات السماح' : 'Governance Rules & Grace Periods'}
                            </h4>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {isArabic
                                    ? 'تحدد هذه المعايير قواعد تسجيل الحضور والانصراف الآلية، واحتساب التأخير، والتحقق الصارم من الأذونات الإدارية المسبقة.'
                                    : 'These parameters dictate automated shift compliance, delay calculation rules, and strict pre-approved permission checks.'}
                            </p>
                        </div>
                    </div>

                    {/* Section 1: Grace Periods */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                            <Clock size={16} className="text-teal-600 dark:text-teal-400" />
                            <h5 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {isArabic ? '1. فترات السماح المرنة (Grace Periods)' : '1. Flexible Grace Periods'}
                            </h5>
                        </div>

                        <div className="mt-4 grid gap-5 md:grid-cols-2">
                            {/* Grace Period Late */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                        {isArabic ? 'فترة سماح الحضور (التأخير)' : 'Late Arrival Grace Period'}
                                    </label>
                                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-black text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                        {form.gracePeriodLateMinutes} {isArabic ? 'دقيقة' : 'mins'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    {isArabic
                                        ? 'الحضور خلال هذه الدقائق بعد بداية الوردية يُعتبر حاضراً بدون احتساب تأخير.'
                                        : 'Clocking in within these minutes after shift start is marked Present with zero delay.'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="120"
                                        step="5"
                                        value={form.gracePeriodLateMinutes}
                                        onChange={(e) => setForm({ ...form, gracePeriodLateMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                    <div className="flex gap-1">
                                        {[0, 10, 15, 30].map((val) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => setForm({ ...form, gracePeriodLateMinutes: val })}
                                                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${form.gracePeriodLateMinutes === val ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
                                            >
                                                {val}m
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Grace Period Early */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                        {isArabic ? 'فترة سماح الانصراف المبكر' : 'Early Departure Grace Period'}
                                    </label>
                                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-black text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                        {form.gracePeriodEarlyMinutes} {isArabic ? 'دقيقة' : 'mins'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    {isArabic
                                        ? 'الانصراف قبل نهاية الوردية بحد أقصى هذه الدقائق لا يُعتبر خروجاً مبكراً.'
                                        : 'Clocking out within these minutes before shift end is not penalized as early leave.'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="60"
                                        step="5"
                                        value={form.gracePeriodEarlyMinutes}
                                        onChange={(e) => setForm({ ...form, gracePeriodEarlyMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                    <div className="flex gap-1">
                                        {[0, 5, 10, 15].map((val) => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => setForm({ ...form, gracePeriodEarlyMinutes: val })}
                                                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black transition ${form.gracePeriodEarlyMinutes === val ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}
                                            >
                                                {val}m
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Deduct Full Delay Toggle */}
                        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-950/40">
                            <div>
                                <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                    {isArabic ? 'خصم كامل مدة التأخير عند تجاوز فترة السماح' : 'Deduct Full Delay If Grace Period Exceeded'}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    {isArabic
                                        ? 'إذا تأخر الموظف 20 دقيقة وسماحه 15 دقيقة: يتم احتساب 20 دقيقة تأخير بالكامل بدلاً من 5 دقائق فقط.'
                                        : 'If employee arrives 20m late with 15m grace: penalize full 20m instead of net 5m.'}
                                </p>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                    type="checkbox"
                                    checked={form.deductFullDelayAfterGrace}
                                    onChange={(e) => setForm({ ...form, deductFullDelayAfterGrace: e.target.checked })}
                                    className="peer sr-only"
                                />
                                <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-teal-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-slate-700"></div>
                            </label>
                        </div>
                    </div>

                    {/* Section 2: Departure Strict Lock */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                            <Lock size={16} className="text-teal-600 dark:text-teal-400" />
                            <h5 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {isArabic ? '2. الرقابة على الانصراف والأذونات المسبقة' : '2. Departure Control & Prior Permissions'}
                            </h5>
                        </div>

                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <ShieldAlert size={16} className={form.requireEarlyLeaveApproval ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'} />
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                            {isArabic ? 'حظر الانصراف المبكر بدون إذن وموافقة مسبقة من الإدارة' : 'Block Unapproved Early Departure'}
                                        </p>
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        {isArabic
                                            ? 'يمنع النظام تسجيل الانصراف قبل موعد الوردية ما لم يوجد طلب إذن خروج مبكر (EarlyDeparture) معتمد من الموارد البشرية أو الإدارة.'
                                            : 'System prohibits clock-out before shift end unless an approved EarlyDeparture permission is present.'}
                                    </p>
                                </div>
                                <label className="relative inline-flex cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        checked={form.requireEarlyLeaveApproval}
                                        onChange={(e) => setForm({ ...form, requireEarlyLeaveApproval: e.target.checked })}
                                        className="peer sr-only"
                                    />
                                    <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-teal-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-slate-700"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Shift Login Restriction */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                            <ShieldCheck size={16} className="text-teal-600 dark:text-teal-400" />
                            <h5 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {isArabic ? '3. صلاحيات الدخول للنظام بحسب الوردية' : '3. Shift-Based System Access Control'}
                            </h5>
                        </div>

                        <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40">
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                        {isArabic ? 'تقييد تسجيل دخول الموظفين بأوقات الورديات المجدولة' : 'Restrict Staff Login to Scheduled Shifts'}
                                    </p>
                                    <p className="text-[11px] text-slate-400">
                                        {isArabic
                                            ? 'يمنع الموظفين من تسجيل الدخول للنظام خارج وردياتهم إلا مع وجود إذن دخول طارئ أو استثناء الوظيفة.'
                                            : 'Prevents staff from logging in outside their assigned shifts unless emergency access is granted.'}
                                    </p>
                                </div>
                                <label className="relative inline-flex cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        checked={form.enforceShiftLoginRestriction}
                                        onChange={(e) => setForm({ ...form, enforceShiftLoginRestriction: e.target.checked })}
                                        className="peer sr-only"
                                    />
                                    <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-teal-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-slate-700"></div>
                                </label>
                            </div>

                            {form.enforceShiftLoginRestriction && (
                                <div className="grid gap-4 rounded-xl border border-teal-500/20 bg-teal-50/30 p-4 sm:grid-cols-2 dark:bg-teal-950/20">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                            {isArabic ? 'نافذة السماح قبل الوردية' : 'Buffer Window Before Shift'}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                max="180"
                                                step="15"
                                                value={form.loginBufferBeforeMinutes}
                                                onChange={(e) => setForm({ ...form, loginBufferBeforeMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900"
                                            />
                                            <span className="text-xs font-bold text-slate-500">{isArabic ? 'دقيقة' : 'mins'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                            {isArabic ? 'نافذة السماح بعد الوردية' : 'Buffer Window After Shift'}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                max="180"
                                                step="15"
                                                value={form.loginBufferAfterMinutes}
                                                onChange={(e) => setForm({ ...form, loginBufferAfterMinutes: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900"
                                            />
                                            <span className="text-xs font-bold text-slate-500">{isArabic ? 'دقيقة' : 'mins'}</span>
                                        </div>
                                    </div>

                                    {/* Exempt Roles */}
                                    <div className="sm:col-span-2 space-y-2">
                                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                            {isArabic ? 'الوظائف المستثناة دائماً من قيود الدخول' : 'Exempt Roles (Never Restricted)'}
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {PRESET_ROLES.map((role) => {
                                                const isExempt = form.exemptRolesFromLoginRestriction.includes(role.key);
                                                return (
                                                    <button
                                                        key={role.key}
                                                        type="button"
                                                        onClick={() => handleRoleToggle(role.key)}
                                                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${isExempt ? 'bg-teal-600 text-white shadow-2xs' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'}`}
                                                    >
                                                        {isExempt && <CheckCircle2 size={13} />}
                                                        <span>{isArabic ? role.ar : role.en}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={handleResetDefaults}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                        >
                            {isArabic ? 'استعادة الافتراضيات' : 'Reset Defaults'}
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                                {isArabic ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
                            >
                                <Save size={14} />
                                <span>{isSaving ? (isArabic ? 'جارٍ الحفظ...' : 'Saving...') : (isArabic ? 'حفظ السياسات' : 'Save Policies')}</span>
                            </button>
                        </div>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default AttendanceSettingsModal;
