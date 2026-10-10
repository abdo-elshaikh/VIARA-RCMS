import React, { useState } from 'react';
import {
    FileQuestion, Clock, Calendar, AlertCircle, Send,
    UserCheck, ShieldCheck, DoorOpen, Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '../../ui/Modal';
import { useCreateAttendancePermissionMutation } from '../../../store/api';
import { getErrorMessage } from '../../../utils/getErrorMessage';

const toDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const AttendancePermissionModal = ({ isOpen, onClose, staff = [], defaultUserId = '' }) => {
    const { i18n, t } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');

    const [createPermission, { isLoading }] = useCreateAttendancePermissionMutation();

    const [form, setForm] = useState({
        userId: defaultUserId || '',
        permissionType: 'EarlyDeparture',
        effectiveDate: toDateInput(new Date()),
        allowedTime: '',
        minutesGranted: 30,
        reason: ''
    });

    React.useEffect(() => {
        if (isOpen) {
            setForm((prev) => ({
                ...prev,
                userId: defaultUserId || prev.userId || '',
                effectiveDate: toDateInput(new Date())
            }));
        }
    }, [isOpen, defaultUserId]);

    const PERMISSION_TYPES = [
        {
            key: 'EarlyDeparture',
            titleAr: 'إذن انصراف مبكر',
            titleEn: 'Early Departure',
            descAr: 'يسمح للموظف بتسجيل الانصراف قبل نهاية الوردية بدون حظر أو مخالفة.',
            descEn: 'Permits staff to clock out before shift end without system restriction.'
        },
        {
            key: 'LateArrival',
            titleAr: 'إذن حضور متأخر',
            titleEn: 'Late Arrival',
            descAr: 'يسمح بتسجيل الحضور بعد موعد الوردية مع إعفاء الدقائق المحددة من التأخير.',
            descEn: 'Permits arriving after shift start, exempting permitted minutes from delay penalty.'
        },
        {
            key: 'EmergencyAccess',
            titleAr: 'إذن دخول طارئ للنظام',
            titleEn: 'Emergency System Access',
            descAr: 'يسمح بتسجيل الدخول للنظام خارج الوردية في حالات الطوارئ والتغطية الاستثنائية.',
            descEn: 'Allows system login outside scheduled shift hours for emergency coverage.'
        }
    ];

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.reason || form.reason.trim().length < 5) {
            toast.error(isArabic ? 'يرجى كتابة سبب مفصل لطلب الإذن (5 أحرف على الأقل)' : 'Please provide a detailed reason (at least 5 characters)');
            return;
        }

        try {
            await createPermission({
                userId: form.userId || undefined,
                permissionType: form.permissionType,
                effectiveDate: form.effectiveDate,
                allowedTime: form.allowedTime || undefined,
                minutesGranted: Number(form.minutesGranted) || 0,
                reason: form.reason.trim()
            }).unwrap();

            toast.success(
                isArabic
                    ? 'تم تقديم طلب الإذن بنجاح وإرساله للمراجعة'
                    : 'Permission request submitted successfully for approval'
            );
            setForm({
                userId: '',
                permissionType: 'EarlyDeparture',
                effectiveDate: toDateInput(new Date()),
                allowedTime: '',
                minutesGranted: 30,
                reason: ''
            });
            onClose();
        } catch (err) {
            toast.error(getErrorMessage(err, isArabic ? 'تعذر تقديم طلب الإذن' : 'Failed to submit permission request'));
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isArabic ? 'تقديم طلب إذن حضور / انصراف' : 'File Attendance Permission Request'}
            size="default"
        >
            <form onSubmit={handleSubmit} className="space-y-4 p-1 text-slate-800 dark:text-slate-200">
                {/* Employee Selector */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {isArabic ? 'الموظف المعني' : 'Target Employee'}
                    </label>
                    <select
                        value={form.userId}
                        onChange={(e) => setForm({ ...form, userId: e.target.value })}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    >
                        <option value="">{isArabic ? '-- اختر الموظف (أو لنفسك) --' : '-- Select Employee (or Self) --'}</option>
                        {staff.map((emp) => (
                            <option key={emp.user_id} value={emp.user_id}>
                                {emp.full_name} ({emp.role})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Permission Type Cards */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {isArabic ? 'نوع الإذن المطلوب' : 'Permission Type'}
                    </label>
                    <div className="grid gap-2 sm:grid-cols-3">
                        {PERMISSION_TYPES.map((pt) => {
                            const isSelected = form.permissionType === pt.key;
                            return (
                                <button
                                    key={pt.key}
                                    type="button"
                                    onClick={() => setForm({ ...form, permissionType: pt.key })}
                                    className={`flex flex-col items-start rounded-xl border p-3 text-start transition ${isSelected ? 'border-teal-500 bg-teal-50/80 text-teal-950 ring-2 ring-teal-200 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-100 dark:ring-teal-900/40' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}
                                >
                                    <span className="text-xs font-black">{isArabic ? pt.titleAr : pt.titleEn}</span>
                                    <span className="mt-1 line-clamp-2 text-[10px] text-slate-400">
                                        {isArabic ? pt.descAr : pt.descEn}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Effective Date & Minutes Granted */}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'تاريخ السريان' : 'Effective Date'}
                        </label>
                        <input
                            type="date"
                            required
                            value={form.effectiveDate}
                            onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'المدة المصرح بها (بالدقائق)' : 'Permitted Minutes'}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="5"
                                max="480"
                                step="5"
                                required
                                value={form.minutesGranted}
                                onChange={(e) => setForm({ ...form, minutesGranted: Math.max(5, parseInt(e.target.value, 10) || 0) })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <div className="flex gap-1">
                                {[30, 60, 120].map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setForm({ ...form, minutesGranted: m })}
                                        className={`rounded-lg px-2 py-1.5 text-[10px] font-bold ${form.minutesGranted === m ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                                    >
                                        {m}m
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Allowed Time (Optional) */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {isArabic ? 'الوقت المحدد المتوقع (اختياري)' : 'Expected Time Target (Optional)'}
                    </label>
                    <input
                        type="time"
                        value={form.allowedTime}
                        onChange={(e) => setForm({ ...form, allowedTime: e.target.value })}
                        placeholder="HH:MM"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                </div>

                {/* Reason */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                        {isArabic ? 'مبرر الطلب والسبب' : 'Reason & Justification'}
                    </label>
                    <textarea
                        required
                        rows={3}
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        placeholder={isArabic ? 'اكتب المبرر والظرف الخاص بطلب الإذن للمراجعة الإدارية...' : 'Provide clear explanation for administrative review...'}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        {isArabic ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50"
                    >
                        <Send size={13} />
                        <span>{isLoading ? (isArabic ? 'جارٍ الإرسال...' : 'Submitting...') : (isArabic ? 'إرسال طلب الإذن' : 'Submit Permission')}</span>
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AttendancePermissionModal;
