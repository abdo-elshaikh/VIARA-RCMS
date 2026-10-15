import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    useGetCrmActivitiesQuery, 
    useCreateCrmActivityMutation, 
    useUpdateCrmActivityMutation, 
    useUpdateLoyaltyPointsMutation,
    useGetLoyaltyHistoryQuery,
    useGetCenterSettingsQuery
} from '../../store/api';
import toast from 'react-hot-toast';
import { 
    Phone, MessageSquare, Heart, Plus, Calendar, CheckCircle, 
    Clock, Send, Sparkles, Award, User, Trash2, Mail, ExternalLink, HelpCircle, Download
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { NotificationPreferences } from '../../pages/NotificationSettings';
import { formatLocalizedDate } from '../../utils/localizedDate';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { getCenterDisplayName, normalizeCenterSettings } from '../../utils/centerSettings';
import { hasDeveloperOrAdminRole } from '../../utils/roles';

const getLoyaltyTier = (points = 0, isArabic = false) => {
    if (points >= 1500) return { name: isArabic ? 'الفئة البلاتينية' : 'Platinum Tier', gradient: 'from-[#0f172a] via-[#1e293b] to-[#334155]', text: 'text-slate-100', badge: 'bg-slate-700/80 text-white border-slate-600' };
    if (points >= 800) return { name: isArabic ? 'الفئة الذهبية' : 'Gold Tier', gradient: 'from-[#78350f] via-[#92400e] to-[#b45309]', text: 'text-amber-50', badge: 'bg-amber-800/80 text-amber-100 border-amber-600' };
    if (points >= 300) return { name: isArabic ? 'الفئة الفضية' : 'Silver Tier', gradient: 'from-[#334155] via-[#475569] to-[#64748b]', text: 'text-slate-50', badge: 'bg-slate-700/80 text-slate-100 border-slate-500' };
    return { name: isArabic ? 'الفئة البرونزية' : 'Bronze Tier', gradient: 'from-[#7c2d12] via-[#9a3412] to-[#c2410c]', text: 'text-orange-50', badge: 'bg-orange-950/80 text-orange-200 border-orange-800' };
};

const PatientCrmTab = ({ patient }) => {
    const user = useSelector(selectCurrentUser);
    const { t, i18n } = useTranslation(['patients', 'common']);
    const isArabic = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const locale = isArabic ? 'ar-EG' : 'en-US';

    const noteTemplates = useMemo(() => isArabic ? [
        'تم الاتصال بالمريض لتأكيد الحضور للفحص المجدول.',
        'تم إرسال تعليمات وإرشادات التحضير قبل الفحص.',
        'تم تسجيل استبيان رضا المريض بعد الفحص: استجابة إيجابية جداً.',
        'طلب المريض إعادة جدولة الموعد لظروف خاصة.',
        'متابعة بخصوص استلام التقرير النهائي ونتائج الفحص.'
    ] : [
        'Called patient to confirm attendance for scheduled scan.',
        'Sent pre-examination preparation guidelines.',
        'Collected post-exam satisfaction survey: very positive.',
        'Patient requested rescheduling due to travel constraint.',
        'Followed up regarding pending laboratory result submissions.'
    ], [isArabic]);

    const { data: activities = [], isLoading, refetch } = useGetCrmActivitiesQuery({ patientId: patient.patient_id });
    const { data: loyaltyHistory = [], refetch: refetchHistory } = useGetLoyaltyHistoryQuery(patient.patient_id);
    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const [createActivity] = useCreateCrmActivityMutation();
    const [updateActivity] = useUpdateCrmActivityMutation();
    const [updateLoyalty] = useUpdateLoyaltyPointsMutation();

    const [activeSubTab, setActiveSubTab] = useState('timeline');
    const [showNewForm, setShowNewForm] = useState(false);
    const [form, setForm] = useState({ activityType: 'Call', notes: '', dueDate: '' });
    const [customPoints, setCustomPoints] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);
    const centerSettings = normalizeCenterSettings(rawCenterSettings || {});
    const centerDisplayName = getCenterDisplayName(centerSettings);
    const careClubName = `${centerSettings.center_name || 'VIARA'} ${isArabic ? 'نادي الرعاية والولاء' : 'CARE CLUB'}`;

    const formatDate = (dateStr, showTime = false) => {
        if (!dateStr) return '—';
        const options = showTime 
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'medium' };
        return formatLocalizedDate(dateStr, locale, options);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await createActivity({
                patientId: patient.patient_id,
                assignedTo: user?.user_id,
                activityType: form.activityType,
                notes: form.notes,
                dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined
            }).unwrap();
            toast.success(isArabic ? 'تم تسجيل النشاط بنجاح' : 'Activity logged successfully');
            setShowNewForm(false);
            setForm({ activityType: 'Call', notes: '', dueDate: '' });
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'فشل تسجيل النشاط' : 'Failed to log activity'));
        }
    };

    const handleComplete = async (id) => {
        try {
            await updateActivity({ id, status: 'Completed' }).unwrap();
            toast.success(isArabic ? 'تم تحديد المهمة كمكتملة' : 'Activity marked as completed');
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'فشل تحديث الحالة' : 'Failed to update status'));
        }
    };

    const handleLoyaltyChange = async (points, reasonCode = 'MANUAL_REWARD', description = '') => {
        if (isUpdatingPoints) return;
        setIsUpdatingPoints(true);
        try {
            const res = await updateLoyalty({
                patientId: patient.patient_id,
                points,
                reasonCode,
                description: description || (points > 0 ? (isArabic ? 'مكافأة ولاء تقديرية' : 'Loyalty bonus') : (isArabic ? 'استبدال نقاط' : 'Redemption'))
            }).unwrap();
            if (res.tierUpgraded) {
                toast.success(isArabic ? `🎉 تهانينا! ترقى المريض إلى ${res.newTier} (+${points} نقطة)` : `🎉 Patient promoted to ${res.newTier}! (+${points} pts)`, { duration: 5000 });
            } else {
                toast.success(isArabic ? `تمت إضافة ${points > 0 ? '+' : ''}${points} نقطة بنجاح` : `Points updated: ${points > 0 ? '+' : ''}${points}`);
            }
            refetchHistory();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'فشل تحديث النقاط' : 'Failed to update points'));
        } finally {
            setIsUpdatingPoints(false);
        }
    };

    const handleCustomPointsSubmit = (e) => {
        e.preventDefault();
        const pts = parseInt(customPoints, 10);
        if (isNaN(pts)) {
            toast.error(isArabic ? 'يرجى إدخال رقم صحيح' : 'Please enter a valid number');
            return;
        }
        handleLoyaltyChange(pts, pts > 0 ? 'MANUAL_REWARD' : 'REDEMPTION', customReason.trim());
        setCustomPoints('');
        setCustomReason('');
    };

    const handleWhatsAppTemplate = (activity) => {
        if (!patient.phone) {
            toast.error(isArabic ? 'رقم هاتف المريض غير متوفر' : 'Patient phone number is not available');
            return;
        }
        const text = isArabic
            ? `مرحباً ${patient.first_name || ''}،\n\nنتواصل معك من ${centerDisplayName} بخصوص متابعة زيارتك الأخيرة. ${activity.notes || ''}\n\nمع تمنياتنا لك بدوام الصحة والعافية.`
            : `Hello ${patient.first_name || ''},\n\nThis is a follow-up regarding your recent visit. ${activity.notes || ''}\n\nBest regards,\n${centerDisplayName}`;
        const cleanPhone = patient.phone.replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.startsWith('01') ? `20${cleanPhone.slice(1)}` : cleanPhone;
        const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'WhatsApp':
                return <MessageSquare size={16} className="text-emerald-500" />;
            case 'Call':
                return <Phone size={16} className="text-sky-500" />;
            case 'Email':
                return <Mail size={16} className="text-amber-500" />;
            case 'Visit':
                return <Calendar size={16} className="text-indigo-500" />;
            case 'Feedback Follow-up':
                return <MessageSquare size={16} className="text-amber-600" />;
            default:
                return <Clock size={16} className="text-purple-500" />;
        }
    };

    const tier = getLoyaltyTier(patient.loyalty_points || 0, isArabic);
    const pendingCount = activities.filter(a => a.status === 'Pending').length;

    return (
        <div className="space-y-6">
            {/* Loyalty Membership Card */}
            <div className="grid gap-6 md:grid-cols-12">
                <div className="md:col-span-7 flex flex-col justify-between overflow-hidden relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-6 text-white shadow-lg border border-slate-800 shadow-slate-950/20 aspect-video md:aspect-auto md:h-52">
                    <div className={`absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br ${tier.gradient} opacity-20 blur-2xl pointer-events-none`} />
                    <div className="absolute left-6 top-6 opacity-10 pointer-events-none">
                        <Award size={80} />
                    </div>

                    <div className="relative flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase font-mono">{careClubName}</span>
                            <h4 className="text-base font-black tracking-tight mt-1">{patient.first_name} {patient.last_name}</h4>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-black rounded-lg border uppercase tracking-wider ${tier.badge}`}>
                            <Sparkles size={10} className="animate-pulse" />
                            {tier.name}
                        </span>
                    </div>

                    <div className="relative mt-4">
                        <div className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">
                            {isArabic ? 'رصيد نقاط الولاء' : 'Member points balance'}
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-black tracking-tight text-white">{patient.loyalty_points || 0}</span>
                            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest font-mono">
                                {isArabic ? 'نقطة' : 'PTS'}
                            </span>
                        </div>
                    </div>

                    <div className="relative flex justify-between items-center border-t border-slate-800/80 pt-4 mt-2">
                        <div>
                            <div className="text-[8px] font-bold text-slate-500 uppercase">
                                {isArabic ? 'الرقم الطبي' : 'Patient MRN'}
                            </div>
                            <div className="font-mono text-xs font-bold mt-0.5 text-slate-300">{patient.mrn}</div>
                        </div>
                        <div className="text-end">
                            <div className="text-[8px] font-bold text-slate-500 uppercase">
                                {isArabic ? 'مستوى الرعاية' : 'Status Level'}
                            </div>
                            <div className="text-xs font-black mt-0.5 text-teal-400">
                                {isArabic ? 'رعاية مميزة VIP' : 'VIP CARE'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Instant Loyalty Rewards & Adjust Controls */}
                <div className="md:col-span-5 flex flex-col justify-between rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                    <div>
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles size={14} className="text-teal-600 dark:text-teal-400" />
                                {isArabic ? 'المكافآت الفورية وإدارة النقاط' : 'Instant Rewards & Balance'}
                            </h4>
                            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded-md border border-teal-100 dark:border-teal-900/40">
                                {isArabic ? 'مكافآت فورية' : 'Instant Rewards'}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">
                            {isArabic ? 'منح مكافآت فورية للمريض لتكرار الزيارة، الالتزام بالموعد، أو الفحص الوقائي:' : 'Grant instant rewards for repeat visits, on-time arrivals, or preventive scans:'}
                        </p>
                        
                        {/* Instant Reward Presets */}
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(30, 'REPEAT_VISIT', isArabic ? 'مكافأة الزيارة المتكررة' : 'Repeat visit reward')}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/20 text-xs font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-100/60 active:scale-95 transition-all text-start px-2"
                                title={isArabic ? 'مكافأة فورية لتكرار الزيارة' : 'Instant reward for repeat visit'}
                            >
                                <span>🔄</span>
                                <span>+30 {isArabic ? 'زيارة متكررة' : 'Repeat Visit'}</span>
                            </button>
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(15, 'ON_TIME_ARRIVAL', isArabic ? 'مكافأة الالتزام بالموعد والحضور في الوقت' : 'On-time arrival bonus')}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/20 text-xs font-bold text-sky-800 dark:text-sky-300 hover:bg-sky-100/60 active:scale-95 transition-all text-start px-2"
                                title={isArabic ? 'مكافأة فورية للحضور في الموعد المحدد' : 'Instant reward for prompt arrival'}
                            >
                                <span>⏰</span>
                                <span>+15 {isArabic ? 'التزام بالموعد' : 'On-time'}</span>
                            </button>
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(50, 'CLINICAL_RECALL_COMPLETED', isArabic ? 'مكافأة إتمام الفحص الوقائي / الاستدعاء الدوري' : 'Clinical recall scan reward')}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-pink-200 dark:border-pink-900/60 bg-pink-50/60 dark:bg-pink-950/20 text-xs font-bold text-pink-800 dark:text-pink-300 hover:bg-pink-100/60 active:scale-95 transition-all text-start px-2"
                                title={isArabic ? 'مكافأة فورية لإتمام فحص وقائي دوري' : 'Instant reward for preventive scan'}
                            >
                                <span>🩺</span>
                                <span>+50 {isArabic ? 'فحص وقائي' : 'Recall Scan'}</span>
                            </button>
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(100, 'MANUAL_REWARD', isArabic ? 'مكافأة تميز خاصة VIP' : 'VIP loyalty award')}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 active:scale-95 transition-all text-start px-2"
                                title={isArabic ? 'مكافأة تقديرية للمريض المميز' : 'VIP loyalty award'}
                            >
                                <span>⭐</span>
                                <span>+100 {isArabic ? 'مكافأة VIP' : 'VIP Bonus'}</span>
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleCustomPointsSubmit} className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-3">
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                            <input
                                type="number"
                                required
                                value={customPoints}
                                onChange={e => setCustomPoints(e.target.value)}
                                placeholder={isArabic ? 'عدد نقاط...' : 'Points...'}
                                className="h-9 w-24 shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 focus:border-teal-500 focus:outline-hidden"
                            />
                            <input
                                type="text"
                                value={customReason}
                                onChange={e => setCustomReason(e.target.value)}
                                placeholder={isArabic ? 'سبب المكافأة (اختياري)...' : 'Reason (optional)...'}
                                className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-500 focus:outline-hidden"
                            />
                            <button
                                type="submit"
                                disabled={isUpdatingPoints}
                                className="inline-flex h-9 shrink-0 items-center justify-center px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                            >
                                {isArabic ? 'إضافة' : 'Add'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Subtabs Bar: Timeline / Loyalty Ledger / Guide */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('timeline')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                            activeSubTab === 'timeline'
                                ? 'bg-teal-600 text-white shadow-xs'
                                : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <Clock size={14} />
                        <span>{isArabic ? 'سجل التفاعلات والمتابعات' : 'Interaction Timeline'}</span>
                        {pendingCount > 0 && (
                            <span className="rounded-full bg-amber-400/20 text-amber-300 px-1.5 py-0.2 text-[9px] font-black">
                                {pendingCount}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveSubTab('ledger')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                            activeSubTab === 'ledger'
                                ? 'bg-teal-600 text-white shadow-xs'
                                : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <Award size={14} />
                        <span>{isArabic ? 'سجل حركات ونقاط المكافآت' : 'Loyalty Points Ledger'}</span>
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 text-[9px] font-black">
                            {loyaltyHistory.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveSubTab('guide')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                            activeSubTab === 'guide'
                                ? 'bg-teal-600 text-white shadow-xs'
                                : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        <Sparkles size={14} />
                        <span>{isArabic ? 'دليل كسب المكافآت' : 'Rewards Guide'}</span>
                    </button>
                </div>
            </div>

            {/* Active SubTab Content */}
            {activeSubTab === 'ledger' ? (
                /* Loyalty Ledger Tab */
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] overflow-hidden shadow-xs">
                    <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-5 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-slate-200">
                                    {isArabic ? 'سجل حركات نقاط الولاء والمكافآت الفورية' : 'Loyalty Points Ledger'}
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'تفاصيل كل حركة نقاط، سبب المكافأة، والرصيد بعد التحديث' : 'Detailed transaction history of earned and redeemed loyalty points'}
                                </p>
                            </div>
                            <span className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                                {loyaltyHistory.length} {isArabic ? 'حركة مسجلة' : 'transactions'}
                            </span>
                        </div>
                    </div>

                    {loyaltyHistory.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Award size={36} className="mx-auto mb-3 text-teal-600/40" />
                            <p className="text-xs font-bold">{isArabic ? 'لا توجد حركات نقاط ولاء مسجلة حتى الآن' : 'No loyalty transactions recorded yet'}</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                                {isArabic ? 'ستظهر النقاط تلقائياً عند إتمام الزيارات، الالتزام بالموعد، أو تقييمات الرضا.' : 'Transactions will appear here as visits and surveys are completed.'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-start text-xs">
                                <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3.5 text-start">{isArabic ? 'النقاط' : 'Points'}</th>
                                        <th className="px-5 py-3.5 text-start">{isArabic ? 'نوع المكافأة' : 'Reward Type'}</th>
                                        <th className="px-5 py-3.5 text-start">{isArabic ? 'الوصف والسبب' : 'Description'}</th>
                                        <th className="px-5 py-3.5 text-start">{isArabic ? 'الرصيد بعدها' : 'Balance After'}</th>
                                        <th className="px-5 py-3.5 text-start">{isArabic ? 'المسؤول' : 'Performed By'}</th>
                                        <th className="px-5 py-3.5 text-start">{isArabic ? 'التاريخ' : 'Date'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {loyaltyHistory.map((entry) => {
                                        const isPositive = entry.points_change > 0;
                                        return (
                                            <tr key={entry.ledger_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-5 py-3.5 whitespace-nowrap">
                                                    <span className={`inline-flex items-center font-mono font-black text-xs px-2 py-0.5 rounded-lg border ${
                                                        isPositive 
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40'
                                                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/40'
                                                    }`}>
                                                        {isPositive ? `+${entry.points_change}` : entry.points_change} {isArabic ? 'نقطة' : 'pts'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 whitespace-nowrap">
                                                    <span className="inline-flex rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                                        {entry.reason_code}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                                                    {entry.description || '—'}
                                                </td>
                                                <td className="px-5 py-3.5 whitespace-nowrap font-mono font-bold text-slate-900 dark:text-white">
                                                    {entry.balance_after}
                                                </td>
                                                <td className="px-5 py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400 text-[11px]">
                                                    {entry.performed_by_name || (isArabic ? 'النظام الآلي' : 'Automated')}
                                                </td>
                                                <td className="px-5 py-3.5 whitespace-nowrap text-slate-400 text-[11px]">
                                                    {formatDate(entry.created_at, true)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : activeSubTab === 'guide' ? (
                /* Rewards Guide Tab */
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] p-6 shadow-xs space-y-6">
                    <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <Sparkles size={18} className="text-teal-600" />
                            {isArabic ? 'دليل كسب نقاط الولاء والمكافآت التلقائية' : 'Care Club Automated Rewards Guide'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            {isArabic
                                ? 'يحصل المريض على نقاط ولاء فورية ومكافآت تلقائية في عدة محطات من رحلته العلاجية بالمركز:'
                                : 'Patients earn instant points automatically at multiple milestones along their clinical journey:'}
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl border border-teal-100 dark:border-teal-900/40 bg-teal-50/30 dark:bg-teal-950/10 p-4">
                            <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-bold text-xs">
                                <span className="text-base">🌟</span>
                                {isArabic ? 'مكافأة أول زيارة (Welcome Bonus)' : 'Welcome Bonus'}
                            </div>
                            <div className="mt-2 text-xl font-black text-teal-900 dark:text-teal-100">+50 {isArabic ? 'نقطة' : 'pts'}</div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isArabic ? 'تمنح تلقائياً فور إتمام أول فحص للمريض بالمركز.' : 'Awarded upon completing the first examination.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/10 p-4">
                            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-bold text-xs">
                                <span className="text-base">🔄</span>
                                {isArabic ? 'مكافأة تكرار الزيارات (Repeat Visits)' : 'Repeat Visits'}
                            </div>
                            <div className="mt-2 text-xl font-black text-sky-900 dark:text-sky-100">+30 إلى +100 {isArabic ? 'نقطة' : 'pts'}</div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isArabic ? 'الزيارة الثانية (+30)، الثالثة (+40)، ومحطة التميز الخامسة (+100).' : '2nd visit (+30), 3rd visit (+40), 5th visit milestone (+100).'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 p-4">
                            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                                <span className="text-base">⏰</span>
                                {isArabic ? 'مكافأة الالتزام بالموعد (On-time)' : 'On-time Arrival'}
                            </div>
                            <div className="mt-2 text-xl font-black text-emerald-900 dark:text-emerald-100">+15 {isArabic ? 'نقطة' : 'pts'}</div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isArabic ? 'تمنح فورياً عند وصول المريض وحضوره في الموعد المحدد.' : 'Awarded when patient checks in on or before appointment time.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-pink-100 dark:border-pink-900/40 bg-pink-50/30 dark:bg-pink-950/10 p-4">
                            <div className="flex items-center gap-2 text-pink-700 dark:text-pink-300 font-bold text-xs">
                                <span className="text-base">🩺</span>
                                {isArabic ? 'الفحص الوقائي (Clinical Recall)' : 'Clinical Recall Scan'}
                            </div>
                            <div className="mt-2 text-xl font-black text-pink-900 dark:text-pink-100">+50 {isArabic ? 'نقطة' : 'pts'}</div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isArabic ? 'تمنح عند إجراء فحص الاستدعاء الدوري (ماموجرام، هشاشة عظام، متابعات).' : 'Awarded upon completing periodic follow-up scans.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 p-4">
                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-xs">
                                <span className="text-base">⭐</span>
                                {isArabic ? 'تقييم الرضا 5 نجوم (CSAT)' : '5-Star Feedback'}
                            </div>
                            <div className="mt-2 text-xl font-black text-amber-900 dark:text-amber-100">+20 {isArabic ? 'نقطة' : 'pts'}</div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isArabic ? 'تمنح تلقائياً عند تقييم تجربة الفحص والمركز بأعلى درجة.' : 'Awarded automatically when giving a 5-star rating.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/30 dark:bg-purple-950/10 p-4">
                            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-xs">
                                <span className="text-base">💳</span>
                                {isArabic ? 'ترقية فئات العضوية' : 'Tier Upgrades'}
                            </div>
                            <div className="mt-2 text-sm font-black text-purple-900 dark:text-purple-100">
                                {isArabic ? 'فضي (300) • ذهبي (800) • بلاتيني (1500)' : 'Silver (300) • Gold (800) • Plat (1500)'}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isArabic ? 'كل ترقية تفتح مزايا وخصومات حصرية وخدمات أولوية.' : 'Each tier unlocks discounts, priority appointments, and perks.'}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Interactions Timeline Section */
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-5 py-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-slate-900 dark:text-slate-200">
                                {isArabic ? 'سجل التفاعلات والمتابعات (CRM Timeline)' : 'Interactions & Patient Logs'}
                            </h3>
                            {pendingCount > 0 && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-100 dark:border-amber-900/30">
                                    {pendingCount} {isArabic ? 'قيد الانتظار' : 'Pending'}
                                </span>
                            )}
                        </div>
                        
                        {!showNewForm && (
                            <button
                                type="button"
                                onClick={() => setShowNewForm(true)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 px-3 text-xs font-bold text-white shadow-xs active:scale-95 transition-all"
                            >
                                <Plus size={14} />
                                <span>{isArabic ? 'تسجيل تفاعل جديد' : 'Log Interaction'}</span>
                            </button>
                        )}
                    </div>

                <div className="p-5">
                    {showNewForm && (
                        <form onSubmit={handleCreate} className="mb-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 space-y-4 animate-in slide-in-from-top-2 duration-200">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                        {isArabic ? 'نوع التفاعل' : 'Interaction Type'}
                                    </label>
                                    <select
                                        className="mt-1.5 h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-teal-500 focus:outline-hidden"
                                        value={form.activityType}
                                        onChange={e => setForm({...form, activityType: e.target.value})}
                                    >
                                        <option value="Call">{isArabic ? 'مكالمة هاتفية' : 'Call'}</option>
                                        <option value="WhatsApp">{isArabic ? 'رسالة واتساب' : 'WhatsApp'}</option>
                                        <option value="Visit">{isArabic ? 'زيارة شخصية' : 'Visit'}</option>
                                        <option value="Email">{isArabic ? 'بريد إلكتروني' : 'Email'}</option>
                                        <option value="Feedback Follow-up">{isArabic ? 'متابعة تقييم/شكوى' : 'Feedback Follow-up'}</option>
                                        <option value="Patient Reminder">{isArabic ? 'تذكير بموعد سريري' : 'Patient Reminder'}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                        {isArabic ? 'تاريخ ووقت الاستحقاق' : 'Follow-up Due Date'}
                                    </label>
                                    <input
                                        type="datetime-local"
                                        required={form.activityType === 'Patient Reminder'}
                                        value={form.dueDate}
                                        onChange={e => setForm({...form, dueDate: e.target.value})}
                                        className="mt-1.5 h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-teal-500 focus:outline-hidden"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {isArabic ? 'ملاحظات وتفاصيل التفاعل' : 'Activity Note'}
                                </label>
                                <textarea
                                    required
                                    rows={2}
                                    placeholder={isArabic ? 'اكتب تفاصيل المكالمة أو سبب المتابعة...' : 'Enter details of follow up or phone conversation...'}
                                    value={form.notes}
                                    onChange={e => setForm({...form, notes: e.target.value})}
                                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-teal-500 focus:outline-hidden"
                                />
                            </div>

                            {/* Suggestion Chips */}
                            <div>
                                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                                    {isArabic ? 'نماذج ملاحظات سريعة' : 'Quick Note Templates'}
                                </span>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {noteTemplates.map((tmpl, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, notes: tmpl }))}
                                            className="px-2.5 py-1 text-[9px] font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-teal-500/50 hover:text-teal-600 transition-all"
                                        >
                                            {tmpl.slice(0, 36)}...
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowNewForm(false);
                                        setForm({ activityType: 'Call', notes: '', dueDate: '' });
                                    }}
                                    className="inline-flex h-8 items-center justify-center px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 active:scale-95 transition-all"
                                >
                                    {isArabic ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    className="inline-flex h-8 items-center justify-center px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                                >
                                    {isArabic ? 'حفظ النشاط' : 'Log Activity'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Timeline List */}
                    <div className="relative space-y-4 before:absolute before:bottom-2 before:start-3.5 before:top-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800 max-h-96 overflow-y-auto pr-1">
                        {isLoading ? (
                            <div className="py-12 text-center text-xs font-bold text-slate-400 animate-pulse">
                                {isArabic ? 'جاري تحميل السجلات...' : 'Loading logs...'}
                            </div>
                        ) : activities.length === 0 ? (
                            <div className="py-12 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20 dark:bg-slate-900/10">
                                {isArabic ? 'لا توجد أنشطة متابعة مسجلة لهذا المريض بعد.' : 'No follow-up activities logged yet for this patient.'}
                            </div>
                        ) : (
                            activities.map((act) => {
                                const isPending = act.status === 'Pending';
                                const isEscalation = act.activity_type === 'Feedback Follow-up' || act.notes?.includes('⚠️') || act.notes?.includes('تصعيد');

                                return (
                                    <div key={act.activity_id} className="relative flex gap-4 ps-8">
                                        <div className={`absolute start-0 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg border shadow-xs ring-4 ring-white dark:ring-[#0b1426] ${
                                            isEscalation && isPending
                                                ? 'bg-amber-100 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
                                                : isPending 
                                                    ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' 
                                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                        }`}>
                                            {getTypeIcon(act.activity_type)}
                                        </div>

                                        <div className={`flex-1 rounded-2xl border p-4 transition ${
                                            isEscalation && isPending
                                                ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/20 ring-1 ring-amber-400/40'
                                                : isPending 
                                                    ? 'border-blue-100 bg-blue-50/20 dark:border-blue-900/30 dark:bg-blue-950/5' 
                                                    : 'border-slate-100 bg-slate-50/30 dark:border-slate-800/80 dark:bg-slate-900/10'
                                        }`}>
                                            {isEscalation && isPending && (
                                                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black text-amber-800 dark:text-amber-300">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                                                    </span>
                                                    <span>{isArabic ? 'تصعيد عاجل لمتابعة شكوى المريض' : 'Urgent Complaint Escalation'}</span>
                                                </div>
                                            )}
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{act.activity_type}</span>
                                                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
                                                        isPending 
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/30' 
                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/30'
                                                    }`}>
                                                        {isPending ? (isArabic ? 'قيد المتابعة' : 'Pending') : (isArabic ? 'مكتملة' : 'Completed')}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {act.due_date ? `${isArabic ? 'الاستحقاق:' : 'Due:'} ${formatDate(act.due_date, true)}` : formatDate(act.created_at)}
                                                </span>
                                            </div>

                                            {act.notes && (
                                                <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                                                    {act.notes}
                                                </p>
                                            )}

                                            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-3 text-[10px] text-slate-400">
                                                <span className="font-semibold flex items-center gap-1">
                                                    <User size={11} className="text-slate-400" />
                                                    {isArabic ? 'المسؤول:' : 'Logged by:'} {act.assignee_name || (isArabic ? 'النظام الآلي' : 'System')}
                                                </span>

                                                <div className="flex items-center gap-1.5">
                                                    {act.activity_type === 'WhatsApp' && patient.phone && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleWhatsAppTemplate(act)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10 text-[9px] font-black text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/50 transition-all"
                                                        >
                                                            <ExternalLink size={10} />
                                                            {isArabic ? 'إرسال واتساب' : 'Send WhatsApp'}
                                                        </button>
                                                    )}
                                                    {isPending && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleComplete(act.activity_id)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-600 text-[9px] font-black text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-xs"
                                                        >
                                                            <CheckCircle size={10} />
                                                            {isArabic ? 'تم الإنجاز' : 'Mark Done'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
            )}

            {/* Notification settings panel */}
            {(hasDeveloperOrAdminRole(user?.role) || user?.role === 'Receptionist') && (
                <div className="animate-in fade-in duration-300">
                    <NotificationPreferences patientId={patient.patient_id} />
                </div>
            )}
        </div>
    );
};

export default PatientCrmTab;
