import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    useGetCrmActivitiesQuery, 
    useCreateCrmActivityMutation, 
    useUpdateCrmActivityMutation, 
    useUpdateLoyaltyPointsMutation,
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

const getLoyaltyTier = (points = 0) => {
    if (points >= 1500) return { name: 'Platinum Tier', gradient: 'from-[#0f172a] via-[#1e293b] to-[#334155]', text: 'text-slate-100', badge: 'bg-slate-700/80 text-white border-slate-600' };
    if (points >= 800) return { name: 'Gold Tier', gradient: 'from-[#78350f] via-[#92400e] to-[#b45309]', text: 'text-amber-50', badge: 'bg-amber-800/80 text-amber-100 border-amber-600' };
    if (points >= 300) return { name: 'Silver Tier', gradient: 'from-[#334155] via-[#475569] to-[#64748b]', text: 'text-slate-50', badge: 'bg-slate-700/80 text-slate-100 border-slate-500' };
    return { name: 'Bronze Tier', gradient: 'from-[#7c2d12] via-[#9a3412] to-[#c2410c]', text: 'text-orange-50', badge: 'bg-orange-950/80 text-orange-200 border-orange-800' };
};

const NOTE_TEMPLATES = [
    'Called patient to confirm attendance for scheduled scan.',
    'Sent pre-examination preparation guidelines.',
    'Collected post-exam satisfaction survey: very positive.',
    'Patient requested rescheduling due to travel constraint.',
    'Followed up regarding pending laboratory result submissions.'
];

const PatientCrmTab = ({ patient }) => {
    const user = useSelector(selectCurrentUser);
    const { t, i18n } = useTranslation(['patientDetail', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';

    const { data: activities = [], isLoading, refetch } = useGetCrmActivitiesQuery({ patientId: patient.patient_id });
    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const [createActivity] = useCreateCrmActivityMutation();
    const [updateActivity] = useUpdateCrmActivityMutation();
    const [updateLoyalty] = useUpdateLoyaltyPointsMutation();

    const [showNewForm, setShowNewForm] = useState(false);
    const [form, setForm] = useState({ activityType: 'Call', notes: '', dueDate: '' });
    const [customPoints, setCustomPoints] = useState('');
    const [isUpdatingPoints, setIsUpdatingPoints] = useState(false);
    const centerSettings = normalizeCenterSettings(rawCenterSettings || {});
    const centerDisplayName = getCenterDisplayName(centerSettings);
    const careClubName = `${centerSettings.center_name || 'Center'} CARE CLUB`;

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
            toast.success('Activity logged successfully');
            setShowNewForm(false);
            setForm({ activityType: 'Call', notes: '', dueDate: '' });
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to log activity'));
        }
    };

    const handleComplete = async (id) => {
        try {
            await updateActivity({ id, status: 'Completed' }).unwrap();
            toast.success('Activity marked as completed');
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update status'));
        }
    };

    const handleLoyaltyChange = async (points) => {
        if (isUpdatingPoints) return;
        setIsUpdatingPoints(true);
        try {
            await updateLoyalty({ patientId: patient.patient_id, points }).unwrap();
            toast.success('Loyalty points updated');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update points'));
        } finally {
            setIsUpdatingPoints(false);
        }
    };

    const handleCustomPointsSubmit = (e) => {
        e.preventDefault();
        const pts = parseInt(customPoints, 10);
        if (isNaN(pts)) {
            toast.error('Please enter a valid number');
            return;
        }
        handleLoyaltyChange(pts);
        setCustomPoints('');
    };

    const handleWhatsAppTemplate = (activity) => {
        if (!patient.phone) {
            toast.error('Patient phone number is not available');
            return;
        }
        const text = `Hello ${patient.first_name || ''},\n\nThis is a follow-up regarding your recent visit. ${activity.notes || ''}\n\nBest regards,\n${centerDisplayName}`;
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
            default:
                return <Clock size={16} className="text-purple-500" />;
        }
    };

    const tier = getLoyaltyTier(patient.loyalty_points || 0);
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
                        <div className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">Member points balance</div>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-black tracking-tight text-white">{patient.loyalty_points || 0}</span>
                            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest font-mono">PTS</span>
                        </div>
                    </div>

                    <div className="relative flex justify-between items-center border-t border-slate-800/80 pt-4 mt-2">
                        <div>
                            <div className="text-[8px] font-bold text-slate-500 uppercase">Patient MRN</div>
                            <div className="font-mono text-xs font-bold mt-0.5 text-slate-300">{patient.mrn}</div>
                        </div>
                        <div className="text-end">
                            <div className="text-[8px] font-bold text-slate-500 uppercase">Status Level</div>
                            <div className="text-xs font-black mt-0.5 text-teal-400">VIP CARE</div>
                        </div>
                    </div>
                </div>

                {/* Loyalty Adjust Controls */}
                <div className="md:col-span-5 flex flex-col justify-between rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                    <div>
                        <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">Adjust Loyalty Balance</h4>
                        <p className="text-[11px] text-slate-500 mt-1">Reward or redeem points based on engagement, visits, or survey replies.</p>
                        
                        <div className="grid grid-cols-3 gap-1.5 mt-4">
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(50)}
                                className="inline-flex h-8 items-center justify-center rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 text-xs font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 active:scale-95 transition-all"
                            >
                                +50 pts
                            </button>
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(100)}
                                className="inline-flex h-8 items-center justify-center rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 text-xs font-bold text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 active:scale-95 transition-all"
                            >
                                +100 pts
                            </button>
                            <button
                                type="button"
                                disabled={isUpdatingPoints}
                                onClick={() => handleLoyaltyChange(-50)}
                                className="inline-flex h-8 items-center justify-center rounded-xl border border-rose-200 dark:border-rose-950/50 bg-rose-50/50 dark:bg-rose-950/10 text-xs font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/25 active:scale-95 transition-all"
                            >
                                -50 pts
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleCustomPointsSubmit} className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
                        <div className="flex gap-2">
                            <input
                                type="number"
                                required
                                value={customPoints}
                                onChange={e => setCustomPoints(e.target.value)}
                                placeholder="Enter custom amount..."
                                className="h-9 flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 focus:border-teal-500 focus:outline-hidden"
                            />
                            <button
                                type="submit"
                                disabled={isUpdatingPoints}
                                className="inline-flex h-9 items-center justify-center px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                            >
                                Apply
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Interactions Timeline Section */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] overflow-hidden shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-200">Interactions & Patient Logs</h3>
                        {pendingCount > 0 && (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-100 dark:border-amber-900/30">
                                {pendingCount} Pending
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
                            <span>Log Interaction</span>
                        </button>
                    )}
                </div>

                <div className="p-5">
                    {showNewForm && (
                        <form onSubmit={handleCreate} className="mb-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 space-y-4 animate-in slide-in-from-top-2 duration-200">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Interaction Type</label>
                                    <select
                                        className="mt-1.5 h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-teal-500 focus:outline-hidden"
                                        value={form.activityType}
                                        onChange={e => setForm({...form, activityType: e.target.value})}
                                    >
                                        <option value="Call">Call</option>
                                        <option value="WhatsApp">WhatsApp</option>
                                        <option value="Visit">Visit</option>
                                        <option value="Email">Email</option>
                                        <option value="Patient Reminder">Patient Reminder</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Follow-up Due Date</label>
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
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Activity Note</label>
                                <textarea
                                    required
                                    rows={2}
                                    placeholder="Enter details of follow up or phone conversation..."
                                    value={form.notes}
                                    onChange={e => setForm({...form, notes: e.target.value})}
                                    className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-teal-500 focus:outline-hidden"
                                />
                            </div>

                            {/* Suggestion Chips */}
                            <div>
                                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Quick Note Templates</span>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {NOTE_TEMPLATES.map((tmpl, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, notes: tmpl }))}
                                            className="px-2.5 py-1 text-[9px] font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-teal-500/50 hover:text-teal-600 transition-all"
                                        >
                                            {tmpl.slice(0, 32)}...
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
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="inline-flex h-8 items-center justify-center px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                                >
                                    Log Activity
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Timeline List */}
                    <div className="relative space-y-4 before:absolute before:bottom-2 before:start-3.5 before:top-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800 max-h-96 overflow-y-auto pr-1">
                        {isLoading ? (
                            <div className="py-12 text-center text-xs font-bold text-slate-400 animate-pulse">Loading logs...</div>
                        ) : activities.length === 0 ? (
                            <div className="py-12 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20 dark:bg-slate-900/10">
                                No follow-up activities logged yet for this patient.
                            </div>
                        ) : (
                            activities.map((act) => {
                                const isPending = act.status === 'Pending';
                                return (
                                    <div key={act.activity_id} className="relative flex gap-4 ps-8">
                                        <div className={`absolute start-0 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg border shadow-xs ring-4 ring-white dark:ring-[#0b1426] ${
                                            isPending 
                                                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' 
                                                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                        }`}>
                                            {getTypeIcon(act.activity_type)}
                                        </div>

                                        <div className={`flex-1 rounded-2xl border p-4 transition ${
                                            isPending 
                                                ? 'border-blue-100 bg-blue-50/20 dark:border-blue-900/30 dark:bg-blue-950/5' 
                                                : 'border-slate-100 bg-slate-50/30 dark:border-slate-800/80 dark:bg-slate-900/10'
                                        }`}>
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{act.activity_type}</span>
                                                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
                                                        isPending 
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/30' 
                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/30'
                                                    }`}>
                                                        {isPending ? 'Pending' : 'Completed'}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {act.due_date ? `Due: ${formatDate(act.due_date, true)}` : formatDate(act.created_at)}
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
                                                    Logged by: {act.assignee_name || 'System'}
                                                </span>

                                                <div className="flex items-center gap-1.5">
                                                    {act.activity_type === 'WhatsApp' && patient.phone && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleWhatsAppTemplate(act)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10 text-[9px] font-black text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/50 transition-all"
                                                        >
                                                            <ExternalLink size={10} />
                                                            Send WhatsApp
                                                        </button>
                                                    )}
                                                    {isPending && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleComplete(act.activity_id)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-600 text-[9px] font-black text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-xs"
                                                        >
                                                            <CheckCircle size={10} />
                                                            Mark Done
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
