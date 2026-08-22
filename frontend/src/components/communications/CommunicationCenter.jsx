import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    MessageSquare,
    Users,
    Stethoscope,
    Send,
    User,
    Hash,
    Activity,
    Check,
    CheckCheck,
    PanelRightClose,
    PanelRight,
    MapPin,
    Calendar,
    Receipt,
    Shield,
    Phone,
    Mail,
    ArrowLeft,
    Sparkles,
    X,
    Circle,
    ExternalLink,
    Paperclip,
    SmilePlus,
    Sticker,
    Filter,
    Copy,
    UploadCloud,
    Clock,
    RefreshCw,
    Inbox,
    BellDot,
    Award,
    Building2,
    Zap,
    HeartPulse,
    Radio
} from 'lucide-react';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import {
    useGetChatUsersQuery,
    useGetChatMessagesQuery,
    useSendChatMessageMutation,
    useGetPatientConversationsQuery,
    useGetPatientMessageHistoryQuery,
    useSendPatientReplyMutation,
    useGetDoctorConversationsQuery,
    useGetDoctorMessageHistoryQuery,
    useSendDoctorReplyMutation,
    useGetPatientsQuery,
    useGetReferringDoctorsQuery
} from '../../store/api';
import {
    ChatMessageContent,
    EMOJI_OPTIONS,
    PendingAttachmentPreview,
    STICKER_OPTIONS,
    createChatFormData
} from './chatRichContent';
import PageHeader from '../ui/PageHeader';

const CHANNELS = [
    { 
        id: 'general', 
        name: 'general', 
        descKey: 'chat.channelGeneralDesc', 
        descFallback: 'Center-wide announcements & discussion',
        iconColor: 'from-blue-500 to-indigo-600',
        activeBg: 'bg-blue-50/80 dark:bg-blue-950/25 ring-blue-200 dark:ring-blue-800 text-blue-900 dark:text-blue-200'
    },
    { 
        id: 'radiology', 
        name: 'radiology', 
        descKey: 'chat.channelRadiologyDesc', 
        descFallback: 'Radiologist and technician channel',
        iconColor: 'from-purple-500 to-fuchsia-600',
        activeBg: 'bg-purple-50/80 dark:bg-purple-950/25 ring-purple-200 dark:ring-purple-800 text-purple-900 dark:text-purple-200'
    },
    { 
        id: 'reception', 
        name: 'reception', 
        descKey: 'chat.channelReceptionDesc', 
        descFallback: 'Receptionist desk coordination',
        iconColor: 'from-emerald-500 to-teal-600',
        activeBg: 'bg-emerald-50/80 dark:bg-emerald-950/25 ring-emerald-200 dark:ring-emerald-800 text-emerald-900 dark:text-emerald-200'
    }
];

const QUICK_REPLIES = [
    { key: 'chat.quickGreeting', fallback: 'Hello! How can we assist you today?', tone: 'border-teal-200/80 bg-teal-50/70 text-teal-800 hover:bg-teal-600 hover:text-white dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300' },
    { key: 'chat.quickReportReady', fallback: 'Your report has been finalized and is now available in your portal.', tone: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-600 hover:text-white dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300' },
    { key: 'chat.quickReferral', fallback: 'Please bring your original physician referral form with you on your visit.', tone: 'border-purple-200/80 bg-purple-50/70 text-purple-800 hover:bg-purple-600 hover:text-white dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300' },
    { key: 'chat.quickStatusUpdated', fallback: 'We have updated your appointment status. Please check your dashboard.', tone: 'border-sky-200/80 bg-sky-50/70 text-sky-800 hover:bg-sky-600 hover:text-white dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300' },
    { key: 'chat.quickBillingSettled', fallback: 'The billing invoice is settled. Thank you for your payment.', tone: 'border-amber-200/80 bg-amber-50/70 text-amber-800 hover:bg-amber-600 hover:text-white dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300' }
];

const getRoleTheme = (role) => {
    const r = (role || '').toLowerCase();
    if (r.includes('doctor') || r.includes('radiologist')) {
        return {
            gradient: 'from-violet-600 to-purple-600',
            badge: 'bg-purple-100 text-purple-800 ring-purple-300/60 dark:bg-purple-950/60 dark:text-purple-300 dark:ring-purple-800/50',
            accent: 'text-purple-600 dark:text-purple-400',
            ring: 'ring-purple-400/40',
            activeCard: 'bg-purple-50/90 text-purple-950 dark:bg-purple-950/30 dark:text-purple-200 ring-1 ring-purple-300/80 dark:ring-purple-800/60'
        };
    }
    if (r.includes('tech') || r.includes('nurse')) {
        return {
            gradient: 'from-sky-500 to-cyan-600',
            badge: 'bg-sky-100 text-sky-800 ring-sky-300/60 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800/50',
            accent: 'text-sky-600 dark:text-sky-400',
            ring: 'ring-sky-400/40',
            activeCard: 'bg-sky-50/90 text-sky-950 dark:bg-sky-950/30 dark:text-sky-200 ring-1 ring-sky-300/80 dark:ring-sky-800/60'
        };
    }
    if (r.includes('admin') || r.includes('super')) {
        return {
            gradient: 'from-amber-500 to-orange-600',
            badge: 'bg-amber-100 text-amber-800 ring-amber-300/60 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/50',
            accent: 'text-amber-600 dark:text-amber-400',
            ring: 'ring-amber-400/40',
            activeCard: 'bg-amber-50/90 text-amber-950 dark:bg-amber-950/30 dark:text-amber-200 ring-1 ring-amber-300/80 dark:ring-amber-800/60'
        };
    }
    return {
        gradient: 'from-teal-600 to-emerald-600',
        badge: 'bg-teal-100 text-teal-800 ring-teal-300/60 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800/50',
        accent: 'text-teal-600 dark:text-teal-400',
        ring: 'ring-teal-400/40',
        activeCard: 'bg-teal-50/90 text-teal-950 dark:bg-teal-500/20 dark:text-teal-200 ring-1 ring-teal-300/80 dark:ring-teal-500/40'
    };
};

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

const getTimeValue = (val) => {
    if (!val) return 0;
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
};
const compareNewest = (a, b) => getTimeValue(b) - getTimeValue(a);

const getLatestTimestamp = (items) => Math.max(
    0,
    ...items.map(item => getTimeValue(item.last_message_at || item.created_at || item.updated_at))
);

const MetricCard = ({ icon: Icon, label, value, tone = 'teal' }) => {
    const tones = {
        teal: 'from-teal-500/10 via-teal-500/5 to-cyan-500/10 border-teal-200/80 text-teal-800 dark:border-teal-800/60 dark:text-teal-300',
        rose: 'from-rose-500/10 via-rose-500/5 to-pink-500/10 border-rose-200/80 text-rose-800 dark:border-rose-800/60 dark:text-rose-300',
        purple: 'from-purple-500/10 via-purple-500/5 to-violet-500/10 border-purple-200/80 text-purple-800 dark:border-purple-800/60 dark:text-purple-300',
        amber: 'from-amber-500/10 via-amber-500/5 to-orange-500/10 border-amber-200/80 text-amber-800 dark:border-amber-800/60 dark:text-amber-300'
    };

    return (
        <div className={`flex items-center gap-2.5 rounded-xl border bg-gradient-to-br px-3.5 py-2 shadow-xs backdrop-blur-md transition-all ${tones[tone] || tones.teal}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-2xs dark:bg-slate-800/80">
                <Icon size={14} />
            </span>
            <div className="min-w-0">
                <p className="text-[9.5px] font-black uppercase tracking-wider opacity-75">{label}</p>
                <p className="font-mono text-xs font-black tabular-nums">{value}</p>
            </div>
        </div>
    );
};

const EmptyListState = ({ icon: Icon = Inbox, title, description, actionLabel, onAction }) => (
    <div className="m-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/30">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-cyan-500/15 text-teal-600 shadow-sm ring-1 ring-teal-500/20 dark:text-teal-400">
            <Icon size={22} />
        </div>
        <p className="mt-3 text-xs font-black text-slate-800 dark:text-slate-200">{title}</p>
        {description && <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-400">{description}</p>}
        {actionLabel && (
            <button
                type="button"
                onClick={onAction}
                className="mt-3.5 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-3.5 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:brightness-110 active:scale-95"
            >
                {actionLabel}
            </button>
        )}
    </div>
);

export default function CommunicationCenter() {
    const { t, i18n } = useTranslation(['system', 'common']);

    const formatRelativeActivity = (timestamp) => {
        if (!timestamp) return t('chat.noActivity', { defaultValue: 'No activity' });
        const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
        if (diffMinutes < 1) return t('chat.justNow', { defaultValue: 'Just now' });
        if (diffMinutes < 60) return t('chat.minutesAgo', { count: diffMinutes, defaultValue: `${diffMinutes}m ago` });
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return t('chat.hoursAgo', { count: diffHours, defaultValue: `${diffHours}h ago` });
        const diffDays = Math.round(diffHours / 24);
        return t('chat.daysAgo', { count: diffDays, defaultValue: `${diffDays}d ago` });
    };

    const formatDay = (timestamp) => {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return t('chat.today', { defaultValue: 'Today' });
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return t('chat.yesterday', { defaultValue: 'Yesterday' });
        return d.toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const isRtl = i18n.dir() === 'rtl';
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const currentUserId = currentUser?.id || currentUser?.user_id || currentUser?.userId;

    const handleNavigateProfile = (type, id, e) => {
        if (e) e.stopPropagation();
        if (!id) return;
        if (type === 'patient') {
            navigate(`/patients/${id}`);
        } else if (type === 'doctor') {
            navigate(`/referring-doctors/${id}`);
        } else if (type === 'staff' || type === 'user' || type === 'dm') {
            navigate(`/users/${id}`);
        }
    };

    const [activeSection, setActiveSection] = useState('staff'); // 'staff' | 'patient' | 'doctor'
    const [selectedChat, setSelectedChat] = useState({ type: 'channel', id: 'general' });
    const [messageText, setMessageText] = useState('');
    const [pendingFiles, setPendingFiles] = useState([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'online'
    const [showContextPanel, setShowContextPanel] = useState(true);
    const [mobileShowChat, setMobileShowChat] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const messageEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Queries
    const { data: staffUsers = [], refetch: refetchStaff } = useGetChatUsersQuery(undefined, { pollingInterval: 10000 });
    const { data: patientConversations = [], refetch: refetchPatients } = useGetPatientConversationsQuery(undefined, { pollingInterval: 10000 });
    const { data: doctorConversations = [], refetch: refetchDoctors } = useGetDoctorConversationsQuery(undefined, { pollingInterval: 10000 });

    // Category-wise Unread Totals
    const staffUnreadSum = useMemo(() => staffUsers.reduce((sum, u) => sum + (u.unread_count || 0), 0), [staffUsers]);
    const patientUnreadSum = useMemo(() => patientConversations.reduce((sum, p) => sum + (p.unread_count || 0), 0), [patientConversations]);
    const doctorUnreadSum = useMemo(() => doctorConversations.reduce((sum, d) => sum + (d.unread_count || 0), 0), [doctorConversations]);
    const totalUnreadSum = staffUnreadSum + patientUnreadSum + doctorUnreadSum;
    const totalThreadCount = CHANNELS.length + staffUsers.length + patientConversations.length + doctorConversations.length;
    const latestActivityAt = useMemo(() => getLatestTimestamp([
        ...staffUsers,
        ...patientConversations,
        ...doctorConversations
    ]), [staffUsers, patientConversations, doctorConversations]);

    // Conditional Queries for Messages
    const isChannel = selectedChat.type === 'channel';
    const isDM = selectedChat.type === 'dm';
    const isPatient = selectedChat.type === 'patient';
    const isDoctor = selectedChat.type === 'doctor';

    const { data: chatMessages = [], refetch: refetchChatMsgs } = useGetChatMessagesQuery(
        isChannel ? { channelName: selectedChat.id } : isDM ? { recipientId: selectedChat.id } : null,
        { skip: !isChannel && !isDM, pollingInterval: 4000 }
    );

    const { data: patientMessages = [], refetch: refetchPatientMsgs } = useGetPatientMessageHistoryQuery(
        selectedChat.id,
        { skip: !isPatient, pollingInterval: 4000 }
    );

    const { data: doctorMessages = [], refetch: refetchDoctorMsgs } = useGetDoctorMessageHistoryQuery(
        selectedChat.id,
        { skip: !isDoctor, pollingInterval: 4000 }
    );

    const refreshAll = () => {
        refetchStaff();
        refetchPatients();
        refetchDoctors();
        if (isChannel || isDM) refetchChatMsgs();
        if (isPatient) refetchPatientMsgs();
        if (isDoctor) refetchDoctorMsgs();
        toast.success(t('chat.refreshed', { defaultValue: 'Communications refreshed' }));
    };

    // Mutations
    const [sendChatMessage, { isLoading: isSendingChat }] = useSendChatMessageMutation();
    const [sendPatientReply, { isLoading: isSendingPatient }] = useSendPatientReplyMutation();
    const [sendDoctorReply, { isLoading: isSendingDoctor }] = useSendDoctorReplyMutation();
    const isSending = isSendingChat || isSendingPatient || isSendingDoctor;

    // Details for Context Panel
    const { data: patientsData } = useGetPatientsQuery({ limit: 100 }, { skip: !isPatient });
    const { data: doctorsData } = useGetReferringDoctorsQuery(undefined, { skip: !isDoctor });

    // Filtered lists
    const filteredStaff = useMemo(() => {
        let list = [...staffUsers];
        if (activeFilter === 'unread') {
            list = list.filter(u => (u.unread_count || 0) > 0);
        } else if (activeFilter === 'online') {
            list = list.filter(u => u.isOnline);
        }
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            list = list.filter(u =>
                u.full_name?.toLowerCase().includes(q) ||
                u.role?.toLowerCase().includes(q) ||
                u.last_message_body?.toLowerCase().includes(q)
            );
        }
        return list.sort((a, b) => {
            const recent = compareNewest(a.last_message_at, b.last_message_at);
            if (recent !== 0) return recent;
            if (b.unread_count !== a.unread_count) return (b.unread_count || 0) - (a.unread_count || 0);
            if (b.isOnline !== a.isOnline) return (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0);
            return a.full_name?.localeCompare(b.full_name);
        });
    }, [staffUsers, searchQuery, activeFilter]);

    const filteredPatients = useMemo(() => {
        let list = [...patientConversations];
        if (activeFilter === 'unread') {
            list = list.filter(p => (p.unread_count || 0) > 0);
        }
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            list = list.filter(p =>
                p.patient_name?.toLowerCase().includes(q) ||
                p.patient_mrn?.toLowerCase().includes(q) ||
                p.last_message_body?.toLowerCase().includes(q)
            );
        }
        return list.sort((a, b) => compareNewest(a.last_message_at, b.last_message_at));
    }, [patientConversations, searchQuery, activeFilter]);

    const filteredDoctors = useMemo(() => {
        let list = [...doctorConversations];
        if (activeFilter === 'unread') {
            list = list.filter(d => (d.unread_count || 0) > 0);
        }
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            list = list.filter(d =>
                d.doctor_name?.toLowerCase().includes(q) ||
                d.doctor_clinic?.toLowerCase().includes(q) ||
                d.last_message_body?.toLowerCase().includes(q)
            );
        }
        return list.sort((a, b) => compareNewest(a.last_message_at, b.last_message_at));
    }, [doctorConversations, searchQuery, activeFilter]);

    // Active Chat metadata
    const activeChatMeta = useMemo(() => {
        if (isChannel) return CHANNELS.find(c => c.id === selectedChat.id);
        if (isDM) return staffUsers.find(u => u.user_id === selectedChat.id);
        if (isPatient) return patientConversations.find(p => p.patient_id === selectedChat.id);
        if (isDoctor) return doctorConversations.find(d => d.doctor_id === selectedChat.id);
        return null;
    }, [selectedChat, isChannel, isDM, isPatient, isDoctor, staffUsers, patientConversations, doctorConversations]);

    // Selected Client Details for Right Panel
    const patientDetails = useMemo(() => {
        if (!isPatient || !patientsData) return null;
        const items = Array.isArray(patientsData) ? patientsData : patientsData.items || [];
        return items.find(p => p.patient_id === selectedChat.id);
    }, [isPatient, selectedChat.id, patientsData]);

    const doctorDetails = useMemo(() => {
        if (!isDoctor || !doctorsData) return null;
        const items = Array.isArray(doctorsData) ? doctorsData : doctorsData.items || [];
        return items.find(d => d.doctor_id === selectedChat.id);
    }, [isDoctor, selectedChat.id, doctorsData]);

    // Active Messages List
    const activeMessages = useMemo(() => {
        let msgs = [];
        if (isChannel || isDM) msgs = [...chatMessages];
        else if (isPatient) msgs = [...patientMessages];
        else if (isDoctor) msgs = [...doctorMessages];
        
        return msgs.sort((a, b) => getTimeValue(a.created_at) - getTimeValue(b.created_at));
    }, [isChannel, isDM, isPatient, isDoctor, chatMessages, patientMessages, doctorMessages]);

    const hasContext = (isPatient && patientDetails) || (isDoctor && doctorDetails) || (isDM && activeChatMeta);

    // Auto scroll to bottom on new message
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeMessages]);

    // SSE Realtime event sync
    useEffect(() => {
        const handleMsgAlert = () => {
            refetchStaff();
            refetchPatients();
            refetchDoctors();
            if (isChannel || isDM) refetchChatMsgs();
            if (isPatient) refetchPatientMsgs();
            if (isDoctor) refetchDoctorMsgs();
        };

        window.addEventListener('SSE_REALTIME_MESSAGE', handleMsgAlert);
        return () => window.removeEventListener('SSE_REALTIME_MESSAGE', handleMsgAlert);
    }, [selectedChat, isChannel, isDM, isPatient, isDoctor, refetchStaff, refetchPatients, refetchDoctors, refetchChatMsgs, refetchPatientMsgs, refetchDoctorMsgs]);

    const openChat = (chat) => {
        setSelectedChat(chat);
        setMobileShowChat(true);
    };

    const handleFilesSelected = (files) => {
        const selected = Array.from(files || []);
        const valid = [];
        for (const file of selected) {
            if (file.size > 10 * 1024 * 1024) {
                toast.error(t('chat.fileTooLarge', { defaultValue: 'Each chat file must be 10 MB or smaller.' }));
                continue;
            }
            valid.push(file);
        }
        setPendingFiles(prev => [...prev, ...valid]);
    };

    const removePendingFile = (idx) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const insertEmoji = (emoji) => {
        setMessageText(prev => prev + emoji);
        setShowEmojiPicker(false);
    };

    const handleSendMessage = async (e, directText = null) => {
        if (e?.preventDefault) e.preventDefault();
        const textToSend = (directText !== null ? directText : messageText).trim();
        if (!textToSend && pendingFiles.length === 0) return;

        try {
            if (isChannel) {
                const formData = createChatFormData({
                    body: textToSend,
                    channel_name: selectedChat.id,
                    attachments: pendingFiles
                });
                await sendChatMessage(formData).unwrap();
            } else if (isDM) {
                const formData = createChatFormData({
                    body: textToSend,
                    recipient_id: selectedChat.id,
                    attachments: pendingFiles
                });
                await sendChatMessage(formData).unwrap();
            } else if (isPatient) {
                const formData = createChatFormData({
                    patientId: selectedChat.id,
                    body: textToSend,
                    attachments: pendingFiles
                });
                await sendPatientReply(formData).unwrap();
            } else if (isDoctor) {
                const formData = createChatFormData({
                    doctorId: selectedChat.id,
                    body: textToSend,
                    attachments: pendingFiles
                });
                await sendDoctorReply(formData).unwrap();
            }

            setMessageText('');
            setPendingFiles([]);
            setShowEmojiPicker(false);
            setShowStickerPicker(false);
        } catch (error) {
            toast.error(error?.data?.message || t('chat.sendFailed', { defaultValue: 'Failed to send message' }));
        }
    };

    const sendSticker = (sticker) => {
        handleSendMessage(null, sticker.value);
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success(t('chat.copied', { defaultValue: 'Copied to clipboard' }));
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files?.length) {
            handleFilesSelected(e.dataTransfer.files);
        }
    };

    const sectionTitle = useMemo(() => {
        switch (activeSection) {
            case 'staff': return t('chat.staffMessages', { defaultValue: 'Team & Channels' });
            case 'patient': return t('chat.patientMessages', { defaultValue: 'Patient Inquiries' });
            case 'doctor': return t('chat.doctorMessages', { defaultValue: 'Doctor Messages' });
            default: return '';
        }
    }, [activeSection, t]);

    const activeSectionStats = useMemo(() => {
        if (activeSection === 'patient') {
            return {
                count: patientConversations.length,
                unread: patientUnreadSum,
                latest: getLatestTimestamp(patientConversations)
            };
        }
        if (activeSection === 'doctor') {
            return {
                count: doctorConversations.length,
                unread: doctorUnreadSum,
                latest: getLatestTimestamp(doctorConversations)
            };
        }
        return {
            count: CHANNELS.length + staffUsers.length,
            unread: staffUnreadSum,
            latest: getLatestTimestamp(staffUsers)
        };
    }, [activeSection, staffUsers, patientConversations, doctorConversations, staffUnreadSum, patientUnreadSum, doctorUnreadSum]);

    const headerTitle = isChannel ? `# ${activeChatMeta?.name || ''}`
        : isDM ? activeChatMeta?.full_name
            : isPatient ? activeChatMeta?.patient_name
                : isDoctor ? activeChatMeta?.doctor_name
                    : t('chat.selectConversation', { defaultValue: 'Select a conversation' });

    const headerSubtitle = isChannel ? t(activeChatMeta?.descKey, { defaultValue: activeChatMeta?.descFallback })
        : isDM ? `${activeChatMeta?.role || ''} · ${activeChatMeta?.isOnline ? t('chat.online', { defaultValue: 'Online' }) : t('chat.offline', { defaultValue: 'Offline' })}`
            : isPatient ? `${t('chat.mrn', { defaultValue: 'MRN' })}: ${activeChatMeta?.patient_mrn || '-'}`
                : isDoctor ? `${t('chat.referringDoctor', { defaultValue: 'Referring Doctor' })} · ${activeChatMeta?.doctor_clinic || ''}`
                    : '';

    const activeRoleTheme = useMemo(() => {
        if (isDM && activeChatMeta) return getRoleTheme(activeChatMeta.role);
        if (isDoctor) return getRoleTheme('doctor');
        if (isPatient) return getRoleTheme('patient');
        return getRoleTheme('staff');
    }, [isDM, activeChatMeta, isDoctor, isPatient]);

    return (
        <div className="space-y-4 text-slate-950 dark:text-slate-100" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Header with Colorful KPI Highlights */}
            <PageHeader
                icon={MessageSquare}
                eyebrow={t('chat.eyebrow', { defaultValue: 'Real-time Communication' })}
                eyebrowIcon={Activity}
                title={t('chat.inbox', { defaultValue: 'Inbox & Communication Center' })}
                description={t('chat.workspaceDescription', { defaultValue: 'Coordinate with team channels, respond to patient portal queries, and manage referring physician inquiries.' })}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <MetricCard
                            icon={Inbox}
                            label={t('chat.threads', { defaultValue: 'Threads' })}
                            value={totalThreadCount}
                            tone="teal"
                        />
                        <MetricCard
                            icon={BellDot}
                            label={t('chat.unreadTotal', { defaultValue: 'Unread' })}
                            value={totalUnreadSum}
                            tone={totalUnreadSum > 0 ? 'rose' : 'purple'}
                        />
                        <MetricCard
                            icon={Clock}
                            label={t('chat.latest', { defaultValue: 'Latest' })}
                            value={formatRelativeActivity(latestActivityAt)}
                            tone="amber"
                        />
                        <button
                            type="button"
                            onClick={refreshAll}
                            aria-label={t('chat.refresh', { defaultValue: 'Refresh' })}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-teal-200/70 bg-gradient-to-r from-teal-50 via-cyan-50 to-teal-50 px-3.5 text-xs font-black text-teal-800 shadow-xs transition hover:scale-105 active:scale-95 dark:border-teal-800/60 dark:from-teal-950/40 dark:to-cyan-950/40 dark:text-teal-300"
                        >
                            <RefreshCw size={13} className="text-teal-600 dark:text-teal-400" />
                            <span>{t('chat.refresh', { defaultValue: 'Refresh' })}</span>
                        </button>
                    </div>
                }
            />

            {/* Main Chat Hub Container with Luminous Ambient Border */}
            <div className="flex h-[calc(100dvh-13.5rem)] min-h-[580px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5 ring-1 ring-slate-100 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-[#070e1a] dark:ring-slate-900" aria-label={t('chat.inbox', { defaultValue: 'Inbox & Communication Center' })}>

                {/* ─── LEFT PANEL: Nav lists ────────────────────────────────────────── */}
                <div className={`${mobileShowChat ? 'hidden' : 'flex'} lg:flex w-full lg:w-[21.5rem] xl:w-[23.5rem] shrink-0 flex-col border-e border-slate-200/80 bg-gradient-to-b from-slate-50/90 via-slate-50/50 to-white/90 dark:border-slate-800/80 dark:from-[#091222] dark:via-[#08101e] dark:to-[#070e1a]`}>
                    {/* Title + Filter Chips */}
                    <div className="p-3.5 pb-2.5">
                        <div className="mb-2.5 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-xs">
                                    <MessageSquare size={14} />
                                </span>
                                {t('chat.conversations', { defaultValue: 'Conversations' })}
                            </h2>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter(activeFilter === 'unread' ? 'all' : 'unread')}
                                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                                        activeFilter === 'unread'
                                            ? 'bg-rose-500 text-white shadow-xs shadow-rose-500/30'
                                            : 'bg-slate-200/60 text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
                                    }`}
                                    title={t('chat.toggleUnread', { defaultValue: 'Filter unread chats' })}
                                    aria-label={t('chat.toggleUnread', { defaultValue: 'Filter unread chats' })}
                                >
                                    <Filter size={11} />
                                    <span>{t('chat.unread', { defaultValue: 'Unread' })}</span>
                                </button>
                                {activeSection === 'staff' && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveFilter(activeFilter === 'online' ? 'all' : 'online')}
                                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                                            activeFilter === 'online'
                                                ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/30'
                                                : 'bg-slate-200/60 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300'
                                        }`}
                                        title={t('chat.filterOnline', { defaultValue: 'Online' })}
                                        aria-label={t('chat.filterOnline', { defaultValue: 'Online' })}
                                    >
                                        <Circle size={6} className="fill-current" />
                                        <span>{t('chat.filterOnline', { defaultValue: 'Online' })}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                placeholder={t('chat.searchPlaceholder', { defaultValue: 'Search chats, users, MRNs...' })}
                                aria-label={t('chat.searchPlaceholder', { defaultValue: 'Search chats, users, MRNs...' })}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-8 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-200"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    aria-label={t('chat.clearFilters', { defaultValue: 'Clear filters' })}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Rich Category Switcher Tabs */}
                    <div className="grid grid-cols-3 gap-1.5 border-b border-slate-200/80 px-3 pb-2.5 dark:border-slate-800/80">
                        {[
                            { 
                                key: 'staff', 
                                icon: Users, 
                                label: t('chat.tabStaff', { defaultValue: 'Team' }), 
                                count: staffUnreadSum,
                                activeGrad: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs shadow-indigo-600/30'
                            },
                            { 
                                key: 'patient', 
                                icon: MessageSquare, 
                                label: t('chat.tabPatients', { defaultValue: 'Patients' }), 
                                count: patientUnreadSum,
                                activeGrad: 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs shadow-teal-600/30'
                            },
                            { 
                                key: 'doctor', 
                                icon: Stethoscope, 
                                label: t('chat.tabDoctors', { defaultValue: 'Doctors' }), 
                                count: doctorUnreadSum,
                                activeGrad: 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-xs shadow-purple-600/30'
                            }
                        ].map(({ key, icon: Icon, label, count, activeGrad }) => (
                            <button
                                type="button"
                                key={key}
                                onClick={() => { setActiveSection(key); setActiveFilter('all'); }}
                                className={`relative flex flex-col items-center gap-1 rounded-xl p-2 text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                                    activeSection === key
                                        ? activeGrad
                                        : 'bg-white/80 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                                }`}
                            >
                                <div className="relative">
                                    <Icon size={16} />
                                    {count > 0 && (
                                        <span className={`absolute -top-1.5 -end-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-black ${
                                            activeSection === key ? 'bg-amber-300 text-amber-950 ring-2 ring-indigo-900/30' : 'bg-rose-500 text-white ring-2 ring-slate-50 dark:ring-[#08101e]'
                                        }`}>
                                            {count}
                                        </span>
                                    )}
                                </div>
                                <span className="truncate">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Section Summary Mini-Bar */}
                    <div className="grid grid-cols-3 gap-1.5 border-b border-slate-200/80 px-3 py-2 dark:border-slate-800/80 bg-white/40 dark:bg-slate-950/20">
                        <div className="rounded-lg bg-slate-100/80 px-2 py-1.5 dark:bg-slate-800/50">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{t('chat.threads', { defaultValue: 'Threads' })}</span>
                            <p className="font-mono text-xs font-black text-slate-700 dark:text-slate-200">{activeSectionStats.count}</p>
                        </div>
                        <div className={`rounded-lg px-2 py-1.5 ${activeSectionStats.unread ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-slate-100/80 dark:bg-slate-800/50'}`}>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{t('chat.unread', { defaultValue: 'Unread' })}</span>
                            <p className={`font-mono text-xs font-black ${activeSectionStats.unread ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>{activeSectionStats.unread}</p>
                        </div>
                        <div className="rounded-lg bg-slate-100/80 px-2 py-1.5 dark:bg-slate-800/50">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{t('chat.latest', { defaultValue: 'Latest' })}</span>
                            <p className="truncate text-xs font-bold text-teal-700 dark:text-teal-300">{formatRelativeActivity(activeSectionStats.latest)}</p>
                        </div>
                    </div>

                    {/* Chat Lists */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        <div className="px-2.5 pb-1 pt-2 text-[9.5px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {sectionTitle}
                        </div>

                        {/* STAFF VIEW */}
                        {activeSection === 'staff' && (
                            <>
                                {activeFilter === 'all' && CHANNELS.map(ch => {
                                    const active = selectedChat.type === 'channel' && selectedChat.id === ch.id;
                                    return (
                                        <button
                                            type="button"
                                            key={ch.id}
                                            onClick={() => openChat({ type: 'channel', id: ch.id })}
                                            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                                active
                                                    ? ch.activeBg
                                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                            }`}
                                        >
                                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${ch.iconColor} text-white shadow-2xs`}>
                                                <Hash size={13} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-black">{ch.name}</p>
                                                <p className="truncate text-[10px] font-normal text-slate-400">{t(ch.descKey, { defaultValue: ch.descFallback })}</p>
                                            </div>
                                        </button>
                                    );
                                })}

                                <div className="mt-2.5 px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    {t('chat.directMessages', { defaultValue: 'Direct Messages' })}
                                </div>
                                {filteredStaff.length === 0 ? (
                                    <EmptyListState
                                        icon={Users}
                                        title={t('chat.noStaff', { defaultValue: 'No team members found' })}
                                        description={t('chat.adjustFilters', { defaultValue: 'Try clearing search or filters.' })}
                                        actionLabel={t('chat.clearFilters', { defaultValue: 'Clear filters' })}
                                        onAction={() => { setSearchQuery(''); setActiveFilter('all'); }}
                                    />
                                ) : filteredStaff.map(user => {
                                    const active = selectedChat.type === 'dm' && selectedChat.id === user.user_id;
                                    const theme = getRoleTheme(user.role);
                                    return (
                                        <button
                                            type="button"
                                            key={user.user_id}
                                            onClick={() => openChat({ type: 'dm', id: user.user_id })}
                                            className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                                active
                                                    ? theme.activeCard
                                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="relative shrink-0">
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${theme.gradient} text-[10px] font-black uppercase text-white shadow-xs`}>
                                                        {initials(user.full_name)}
                                                    </div>
                                                    <span className={`absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#08101e] ${
                                                        user.isOnline ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-slate-300 dark:bg-slate-600'
                                                    }`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate font-black text-slate-900 dark:text-white text-xs">{user.full_name}</div>
                                                    <span className={`inline-block truncate rounded-md px-1.5 py-0.2 text-[9px] font-bold ${theme.badge}`}>
                                                        {user.role}
                                                    </span>
                                                    {user.last_message_body && (
                                                        <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                            {user.last_message_body}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                {user.last_message_at && (
                                                    <span className="text-[9px] font-bold text-slate-400">
                                                        {formatTime(user.last_message_at)}
                                                    </span>
                                                )}
                                                {user.unread_count > 0 && (
                                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white shadow-xs shadow-rose-500/40">
                                                        {user.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </>
                        )}

                        {/* PATIENT VIEW */}
                        {activeSection === 'patient' && (
                            filteredPatients.length === 0 ? (
                                <EmptyListState
                                    icon={MessageSquare}
                                    title={t('chat.noPatientChats', { defaultValue: 'No active patient chats' })}
                                    description={t('chat.patientEmptyHelp', { defaultValue: 'Patient portal conversations will appear here as soon as patients message the center.' })}
                                    actionLabel={t('chat.clearFilters', { defaultValue: 'Clear filters' })}
                                    onAction={() => { setSearchQuery(''); setActiveFilter('all'); }}
                                />
                            ) : filteredPatients.map(chat => {
                                const active = selectedChat.type === 'patient' && selectedChat.id === chat.patient_id;
                                return (
                                    <button
                                        type="button"
                                        key={chat.patient_id}
                                        onClick={() => openChat({ type: 'patient', id: chat.patient_id })}
                                        className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-teal-50/90 text-teal-950 dark:bg-teal-950/30 dark:text-teal-200 ring-1 ring-teal-300 dark:ring-teal-700/60 shadow-xs'
                                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-black uppercase text-white shadow-xs">
                                                {initials(chat.patient_name)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-black text-slate-900 dark:text-white text-xs">{chat.patient_name}</div>
                                                <div className="truncate text-[10px] font-bold text-teal-700 dark:text-teal-400">{t('chat.mrn', { defaultValue: 'MRN' })}: {chat.patient_mrn}</div>
                                                <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                    {chat.last_message_body}
                                                </div>
                                            </div>
                                        </div>
                                        {chat.unread_count > 0 && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white shadow-xs shadow-rose-500/40">
                                                {chat.unread_count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}

                        {/* DOCTOR VIEW */}
                        {activeSection === 'doctor' && (
                            filteredDoctors.length === 0 ? (
                                <EmptyListState
                                    icon={Stethoscope}
                                    title={t('chat.noDoctorChats', { defaultValue: 'No active doctor chats' })}
                                    description={t('chat.doctorEmptyHelp', { defaultValue: 'Referring doctor inquiries will appear here after portal messages arrive.' })}
                                    actionLabel={t('chat.clearFilters', { defaultValue: 'Clear filters' })}
                                    onAction={() => { setSearchQuery(''); setActiveFilter('all'); }}
                                />
                            ) : filteredDoctors.map(chat => {
                                const active = selectedChat.type === 'doctor' && selectedChat.id === chat.doctor_id;
                                return (
                                    <button
                                        type="button"
                                        key={chat.doctor_id}
                                        onClick={() => openChat({ type: 'doctor', id: chat.doctor_id })}
                                        className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-purple-50/90 text-purple-950 dark:bg-purple-950/30 dark:text-purple-200 ring-1 ring-purple-300 dark:ring-purple-700/60 shadow-xs'
                                                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-xs">
                                                <Stethoscope size={15} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-black text-slate-900 dark:text-white text-xs">{chat.doctor_name}</div>
                                                <div className="truncate text-[10px] font-bold text-purple-700 dark:text-purple-300">{chat.doctor_clinic}</div>
                                                <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                    {chat.last_message_body}
                                                </div>
                                            </div>
                                        </div>
                                        {chat.unread_count > 0 && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white shadow-xs shadow-rose-500/40">
                                                {chat.unread_count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ─── MIDDLE PANEL: Active Chat Thread ─────────────────────────────── */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`${mobileShowChat ? 'flex' : 'hidden lg:flex'} relative min-w-0 flex-1 flex-col bg-white dark:bg-[#070e1a]`}
                >
                    {/* Drag & Drop File Overlay */}
                    {isDraggingOver && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-teal-900/90 to-cyan-900/90 backdrop-blur-md p-6 text-white animate-in fade-in duration-200">
                            <UploadCloud size={48} className="animate-bounce text-cyan-300" />
                            <h3 className="mt-3 text-lg font-black">{t('chat.dropFilesHere', { defaultValue: 'Drop files to attach to message' })}</h3>
                            <p className="mt-1 text-xs text-cyan-100">{t('chat.dropSubtitle', { defaultValue: 'Images, documents, and PDFs supported (up to 10MB)' })}</p>
                        </div>
                    )}

                    {/* Chat Header */}
                    <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#070e1a]/90 lg:px-6">
                        <div
                            onClick={() => {
                                if (isPatient) handleNavigateProfile('patient', selectedChat.id);
                                else if (isDoctor) handleNavigateProfile('doctor', selectedChat.id);
                                else if (isDM) handleNavigateProfile('staff', selectedChat.id);
                            }}
                            className={`flex min-w-0 items-center gap-3 ${!isChannel ? 'cursor-pointer group' : ''}`}
                        >
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setMobileShowChat(false); }}
                                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
                                title={t('chat.back', { defaultValue: 'Back' })}
                                aria-label={t('chat.back', { defaultValue: 'Back' })}
                            >
                                <ArrowLeft size={18} className={isRtl ? 'rotate-180' : ''} />
                            </button>
                            {isChannel ? (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/30">
                                    <Hash size={18} />
                                </div>
                            ) : (
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${activeRoleTheme.gradient} font-bold text-white shadow-xs transition group-hover:scale-105`}>
                                    {isDoctor ? <Stethoscope size={18} /> : <User size={18} />}
                                </div>
                            )}
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-black text-slate-900 transition group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">{headerTitle}</h3>
                                <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-400">
                                    {isDM && (
                                        <Circle size={7} className={activeChatMeta?.isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300 dark:fill-slate-600 dark:text-slate-600'} />
                                    )}
                                    <span className="truncate">{headerSubtitle}</span>
                                </p>
                            </div>
                        </div>

                        {hasContext && (
                            <button
                                type="button"
                                onClick={() => setShowContextPanel(!showContextPanel)}
                                className={`shrink-0 rounded-xl border p-2 transition active:scale-95 ${
                                    showContextPanel
                                        ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-300'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                                }`}
                                title={t('chat.toggleInfo', { defaultValue: 'Toggle info panel' })}
                                aria-label={t('chat.toggleInfo', { defaultValue: 'Toggle info panel' })}
                            >
                                {showContextPanel ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
                            </button>
                        )}
                    </div>

                    {/* Messages List Viewport with Radiant Gradient Wallpaper */}
                    <div className="relative flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-500/5 via-slate-50/60 to-cyan-500/5 p-4 dark:from-[#050b14] dark:via-[#070e19] dark:to-[#081326] lg:p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        {activeMessages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 text-teal-600 dark:text-teal-400 shadow-inner ring-1 ring-teal-500/30">
                                    <MessageSquare size={30} />
                                </div>
                                <p className="text-xs font-black text-slate-800 dark:text-slate-200">{t('chat.emptyThread', { defaultValue: 'No messages yet. Say hello!' })}</p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-400">{t('chat.composePlaceholder', { defaultValue: 'Type a message... (Press Enter to send)' })}</p>
                            </div>
                        ) : activeMessages.map((msg, i) => {
                            const isMe = (isChannel || isDM)
                                ? String(msg.sender_id) === String(currentUserId)
                                : msg.sender_role === 'Staff';
                            const prev = activeMessages[i - 1];
                            const prevIsMe = prev && ((isChannel || isDM) ? String(prev.sender_id) === String(currentUserId) : prev.sender_role === 'Staff');
                            const showDayDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                            const groupStart = showDayDivider || prevIsMe !== isMe || prev?.sender_id !== msg.sender_id;
                            const senderName = isMe ? t('chat.you', { defaultValue: 'You' }) : msg.sender_name || (isPatient ? t('chat.patient', { defaultValue: 'Patient' }) : isDoctor ? t('chat.doctor', { defaultValue: 'Doctor' }) : t('chat.staff', { defaultValue: 'Staff' }));

                            const senderTheme = getRoleTheme(msg.sender_role || (isPatient ? 'patient' : isDoctor ? 'doctor' : 'staff'));

                            return (
                                <React.Fragment key={msg.message_id || i}>
                                    {showDayDivider && (
                                        <div className="flex items-center justify-center py-4">
                                            <span className="rounded-full border border-slate-200/90 bg-white/90 px-3.5 py-1 text-[10px] font-black tracking-wide text-slate-600 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                                                {formatDay(msg.created_at)}
                                            </span>
                                        </div>
                                    )}

                                    <div className={`group/msg flex w-full gap-2.5 ${isMe ? 'justify-end' : 'justify-start'} ${groupStart ? 'mt-4' : 'mt-1.5'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
                                        {/* Avatar for received messages */}
                                        {!isMe && (
                                            <div className="shrink-0 pb-0.5">
                                                {groupStart ? (
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-black uppercase text-white shadow-xs ring-2 ring-white/60 dark:ring-slate-800 bg-gradient-to-br ${senderTheme.gradient}`}>
                                                        {initials(senderName)}
                                                    </div>
                                                ) : (
                                                    <div className="w-8" />
                                                )}
                                            </div>
                                        )}

                                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>
                                            {groupStart && !isMe && (
                                                <div className="mb-1 flex items-center gap-1.5 px-1.5">
                                                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">{senderName}</span>
                                                    {msg.sender_role && (
                                                        <span className={`rounded-md px-1.5 py-0.2 text-[8.5px] font-black uppercase tracking-wider ${senderTheme.badge}`}>
                                                            {msg.sender_role}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Distinct Sent vs Received Speech Bubbles */}
                                            <div className={`relative px-4 py-2.5 text-xs font-semibold leading-relaxed transition-all ${
                                                isMe
                                                    ? `bg-gradient-to-r from-teal-600 via-teal-700 to-cyan-700 text-white shadow-md shadow-teal-900/20 border border-teal-500/30 ${
                                                        isRtl
                                                            ? groupStart ? 'rounded-2xl rounded-tl-xs' : 'rounded-2xl'
                                                            : groupStart ? 'rounded-2xl rounded-tr-xs' : 'rounded-2xl'
                                                      }`
                                                    : `bg-white text-slate-900 border border-slate-200/90 shadow-xs dark:bg-slate-800/95 dark:border-slate-700/60 dark:text-slate-100 ${
                                                        isRtl
                                                            ? groupStart ? 'rounded-2xl rounded-tr-xs border-r-4 border-r-teal-500' : 'rounded-2xl'
                                                            : groupStart ? 'rounded-2xl rounded-tl-xs border-l-4 border-l-teal-500' : 'rounded-2xl'
                                                      }`
                                            }`}>
                                                <ChatMessageContent message={msg} isMe={isMe} t={t} />

                                                {/* Copy Button on Hover */}
                                                {msg.body && (
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(msg.body)}
                                                        className="absolute top-2 end-2 opacity-0 group-hover/msg:opacity-100 rounded-md bg-black/20 p-1 text-white transition hover:bg-black/40"
                                                        title={t('chat.copyText', { defaultValue: 'Copy text' })}
                                                        aria-label={t('chat.copyText', { defaultValue: 'Copy text' })}
                                                    >
                                                        <Copy size={11} />
                                                    </button>
                                                )}

                                                {/* Time & Read / Seen Status Indicator */}
                                                <div className="mt-1.5 flex items-center justify-end gap-1.5 select-none">
                                                    <span className={`text-[9.5px] font-bold tracking-tight ${isMe ? 'text-teal-100/90' : 'text-slate-400 dark:text-slate-500'}`}>
                                                        {formatTime(msg.created_at)}
                                                    </span>
                                                    {isMe && !isChannel && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 text-[9px] font-extrabold"
                                                            title={msg.is_read ? t('chat.seen', { defaultValue: 'Seen / Read' }) : t('chat.delivered', { defaultValue: 'Delivered' })}
                                                        >
                                                            {msg.is_read ? (
                                                                <>
                                                                    <CheckCheck size={14} className="text-cyan-200" />
                                                                    <span className="text-[8.5px] font-black text-cyan-200/90 opacity-90">{t('chat.seenLabel', { defaultValue: 'Seen' })}</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Check size={13} className="text-teal-200/80" />
                                                                    <span className="text-[8.5px] font-bold text-teal-200/70">{t('chat.sentLabel', { defaultValue: 'Sent' })}</span>
                                                                </>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        <div ref={messageEndRef} />
                    </div>

                    {/* Quick Replies Bar with Multi-Colored Badges */}
                    {(isPatient || isDoctor) && (
                        <div className="flex select-none items-center gap-2 overflow-x-auto border-t border-slate-200/80 bg-slate-50/80 px-4 py-2 dark:border-slate-800/80 dark:bg-[#08101e] lg:px-6 scrollbar-none">
                            <Sparkles size={14} className="shrink-0 text-amber-500 animate-pulse" />
                            <span className="me-1 shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-400">{t('chat.quickReplies', { defaultValue: 'Quick replies' })}:</span>
                            {QUICK_REPLIES.map((reply, idx) => {
                                const label = t(reply.key, { defaultValue: reply.fallback });
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={(e) => handleSendMessage(e, label)}
                                        className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold shadow-2xs transition-all duration-200 hover:scale-105 ${reply.tone}`}
                                    >
                                        {label.length > 36 ? `${label.slice(0, 36)}...` : label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Compose Input Area */}
                    <form onSubmit={(e) => handleSendMessage(e)} className="border-t border-slate-200/80 bg-white p-3 dark:border-slate-800/80 dark:bg-[#070e1a] lg:p-4">
                        <PendingAttachmentPreview files={pendingFiles} onRemove={removePendingFile} t={t} />
                        {showEmojiPicker && (
                            <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-[#091222]">
                                {EMOJI_OPTIONS.map(emoji => (
                                    <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-white dark:hover:bg-slate-800" aria-label={t('chat.insertEmoji', { defaultValue: 'Insert emoji' })}>
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                        {showStickerPicker && (
                            <div className="mb-2 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-[#091222] sm:grid-cols-6">
                                {STICKER_OPTIONS.map(sticker => (
                                    <button key={sticker.label} type="button" onClick={() => sendSticker(sticker)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-extrabold transition hover:scale-105 ${sticker.tone}`}>
                                        <span className="text-2xl leading-none">{sticker.value}</span>
                                        <span>{sticker.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="flex items-end gap-2.5">
                            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFilesSelected(e.target.files)} className="hidden" />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-teal-950/30"
                                title={t('chat.attachFile', { defaultValue: 'Attach file' })}
                                aria-label={t('chat.attachFile', { defaultValue: 'Attach file' })}
                            >
                                <Paperclip size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowEmojiPicker(value => !value); setShowStickerPicker(false); }}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-amber-950/30"
                                title={t('chat.emoji', { defaultValue: 'Emoji' })}
                                aria-label={t('chat.emoji', { defaultValue: 'Emoji' })}
                            >
                                <SmilePlus size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowStickerPicker(value => !value); setShowEmojiPicker(false); }}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-purple-950/30"
                                title={t('chat.stickers', { defaultValue: 'Stickers' })}
                                aria-label={t('chat.stickers', { defaultValue: 'Stickers' })}
                            >
                                <Sticker size={16} />
                            </button>
                            <textarea
                                value={messageText}
                                onChange={(e) => setMessageText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage(e);
                                    }
                                }}
                                placeholder={t('chat.composePlaceholder', { defaultValue: 'Type a message... (Press Enter to send)' })}
                                rows={1}
                                className="max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-100 dark:focus:bg-[#070e1a] placeholder:text-slate-400"
                            />
                            <button
                                type="submit"
                                disabled={(!messageText.trim() && pendingFiles.length === 0) || isSending}
                                aria-label={t('chat.sendMessage', { defaultValue: 'Send message' })}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/30 transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Send size={16} className={isRtl ? 'rotate-180' : ''} />
                            </button>
                        </div>
                    </form>
                </div>

                {/* ─── RIGHT PANEL: Details & Context Drawer ────────────────────────── */}
                {showContextPanel && hasContext && (
                    <>
                        <div
                            className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-xs xl:hidden"
                            onClick={() => setShowContextPanel(false)}
                        />
                        <div className="fixed end-0 top-0 z-40 h-full w-80 max-w-[85vw] shrink-0 overflow-y-auto border-s border-slate-200/80 bg-white p-5 shadow-2xl animate-in slide-in-from-end duration-200 dark:border-slate-800 dark:bg-[#070e1a] xl:static xl:z-auto xl:h-auto xl:max-w-none xl:animate-none xl:bg-gradient-to-b xl:from-slate-50/80 xl:to-white/90 xl:shadow-none dark:xl:from-[#091222] dark:xl:to-[#070e1a]">
                            <button
                                type="button"
                                onClick={() => setShowContextPanel(false)}
                                className="absolute end-4 top-4 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 xl:hidden"
                                aria-label={t('chat.toggleInfo', { defaultValue: 'Toggle info panel' })}
                            >
                                <X size={16} />
                            </button>

                            {isPatient && patientDetails ? (
                                <div className="space-y-5">
                                    {/* Patient Hero Card */}
                                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500/15 via-cyan-500/10 to-teal-500/5 p-4 text-center ring-1 ring-teal-500/20">
                                        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl font-black uppercase text-white shadow-md shadow-teal-600/30 ring-2 ring-white dark:ring-slate-800">
                                            {initials(patientDetails.full_name)}
                                        </div>
                                        <h4 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{patientDetails.full_name}</h4>
                                        <span className="mt-1 inline-flex rounded-full bg-teal-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                            {t('chat.patient', { defaultValue: 'Patient' })}
                                        </span>
                                        <div className="mt-3 grid gap-2">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/patients/${patientDetails.patient_id}`)}
                                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-3 py-2 text-xs font-black text-white shadow-xs transition hover:brightness-110 active:scale-95"
                                            >
                                                <ExternalLink size={13} />
                                                <span>{t('chat.viewFullProfile', { defaultValue: 'View Full Patient Profile' })}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/appointments?patientId=${patientDetails.patient_id}`)}
                                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-900 shadow-xs transition hover:bg-teal-50 active:scale-95 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                                            >
                                                <Calendar size={13} />
                                                <span>{t('chat.bookAppointment', { defaultValue: 'Appointments' })}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Contact Section */}
                                    <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('chat.contactInfo', { defaultValue: 'Contact Info' })}</h5>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
                                                <Phone size={13} />
                                            </span>
                                            <span className="truncate">{patientDetails.phone || t('chat.noPhone', { defaultValue: 'No phone' })}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400">
                                                <Mail size={13} />
                                            </span>
                                            <span className="truncate">{patientDetails.email || t('chat.noEmail', { defaultValue: 'No email' })}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                                                <MapPin size={13} />
                                            </span>
                                            <span className="truncate">{patientDetails.address || t('chat.noAddress', { defaultValue: 'No address' })}</span>
                                        </div>
                                    </div>

                                    {/* Patient Stats Summary */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{t('chat.gender', { defaultValue: 'Gender' })}</p>
                                            <p className="mt-1 text-xs font-black text-slate-900 dark:text-white">{patientDetails.gender || '-'}</p>
                                        </div>
                                        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-amber-100/40 p-3 shadow-2xs dark:border-amber-800/60 dark:from-amber-950/30 dark:to-amber-900/10">
                                            <div className="flex items-center gap-1">
                                                <Award size={13} className="text-amber-600 dark:text-amber-400" />
                                                <p className="text-[9px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">{t('chat.carePoints', { defaultValue: 'Care Points' })}</p>
                                            </div>
                                            <p className="mt-1 font-mono text-sm font-black text-amber-900 dark:text-amber-200 tabular-nums">{patientDetails.loyalty_points || 0}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : isDoctor && doctorDetails ? (
                                <div className="space-y-5">
                                    {/* Doctor Hero Card */}
                                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/15 via-violet-500/10 to-purple-500/5 p-4 text-center ring-1 ring-purple-500/20">
                                        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-md shadow-purple-600/30 ring-2 ring-white dark:ring-slate-800">
                                            <Stethoscope size={28} />
                                        </div>
                                        <h4 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{doctorDetails.full_name}</h4>
                                        <span className="mt-1 inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                            {doctorDetails.specialty || t('chat.referringDoctor', { defaultValue: 'Referring Doctor' })}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/referring-doctors/${doctorDetails.doctor_id}`)}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-3 py-2 text-xs font-black text-white shadow-xs transition hover:brightness-110 active:scale-95"
                                        >
                                            <ExternalLink size={13} />
                                            <span>{t('chat.viewFullDoctorDetails', { defaultValue: 'View Doctor Details' })}</span>
                                        </button>
                                    </div>

                                    {/* Clinic Info */}
                                    <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('chat.clinicInfo', { defaultValue: 'Clinic Info' })}</h5>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
                                                <Building2 size={13} />
                                            </span>
                                            <span className="truncate">{doctorDetails.clinic_name || t('chat.noClinic', { defaultValue: 'No clinic' })}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                                                <Phone size={13} />
                                            </span>
                                            <span className="truncate">{doctorDetails.phone || t('chat.noPhone', { defaultValue: 'No phone' })}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-400">
                                                <Mail size={13} />
                                            </span>
                                            <span className="truncate">{doctorDetails.email || t('chat.noEmail', { defaultValue: 'No email' })}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : isDM && activeChatMeta ? (
                                <div className="space-y-5">
                                    {/* Staff Hero Card */}
                                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-indigo-500/5 p-4 text-center ring-1 ring-indigo-500/20">
                                        <div className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${activeRoleTheme.gradient} text-xl font-black uppercase text-white shadow-md ring-2 ring-white dark:ring-slate-800`}>
                                            {initials(activeChatMeta.full_name)}
                                        </div>
                                        <h4 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{activeChatMeta.full_name}</h4>
                                        <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${activeRoleTheme.badge}`}>
                                            {activeChatMeta.role}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/users/${activeChatMeta.user_id}`)}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 px-3 py-2 text-xs font-black text-white shadow-xs transition hover:brightness-110 active:scale-95 dark:from-slate-800 dark:to-indigo-900"
                                        >
                                            <ExternalLink size={13} />
                                            <span>{t('chat.viewUserAccount', { defaultValue: 'View User Profile' })}</span>
                                        </button>
                                    </div>

                                    {/* Staff Info */}
                                    <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('chat.staffInfo', { defaultValue: 'Staff Info' })}</h5>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
                                                <Mail size={13} />
                                            </span>
                                            <span className="truncate">{activeChatMeta.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <Circle size={8} className={activeChatMeta.isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300 dark:fill-slate-600 dark:text-slate-600'} />
                                            <span>{activeChatMeta.isOnline ? t('chat.online', { defaultValue: 'Online' }) : t('chat.offline', { defaultValue: 'Offline' })}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <Shield size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            <span>{t('chat.accountActive', { defaultValue: 'Account status: Active' })}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
