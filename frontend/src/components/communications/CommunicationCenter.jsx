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
    BellDot
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
    { id: 'general', name: 'general', descKey: 'chat.channelGeneralDesc', descFallback: 'Center-wide announcements & discussion' },
    { id: 'radiology', name: 'radiology', descKey: 'chat.channelRadiologyDesc', descFallback: 'Radiologist and technician channel' },
    { id: 'reception', name: 'reception', descKey: 'chat.channelReceptionDesc', descFallback: 'Receptionist desk coordination' }
];

const QUICK_REPLIES = [
    { key: 'chat.quickGreeting', fallback: 'Hello! How can we assist you today?' },
    { key: 'chat.quickReportReady', fallback: 'Your report has been finalized and is now available in your portal.' },
    { key: 'chat.quickReferral', fallback: 'Please bring your original physician referral form with you on your visit.' },
    { key: 'chat.quickStatusUpdated', fallback: 'We have updated your appointment status. Please check your dashboard.' },
    { key: 'chat.quickBillingSettled', fallback: 'The billing invoice is settled. Thank you for your payment.' }
];

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

const MiniMetric = ({ icon: Icon, label, value, tone = 'teal' }) => {
    const tones = {
        teal: 'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900/60',
        rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
        slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
        violet: 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900/60'
    };

    return (
        <div className={`rounded-xl px-3 py-2 ring-1 ${tones[tone] || tones.teal}`}>
            <div className="flex items-center gap-2">
                <Icon size={14} className="shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wide">{label}</span>
            </div>
            <p className="mt-1 text-sm font-black">{value}</p>
        </div>
    );
};

const EmptyListState = ({ icon: Icon = Inbox, title, description, actionLabel, onAction }) => (
    <div className="m-2 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Icon size={21} />
        </div>
        <p className="mt-3 text-xs font-black text-slate-700 dark:text-slate-200">{title}</p>
        {description && <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-400">{description}</p>}
        {actionLabel && (
            <button
                type="button"
                onClick={onAction}
                className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
                {actionLabel}
            </button>
        )}
    </div>
);

export default function CommunicationCenter() {
    const { t, i18n } = useTranslation(['system', 'common']);

    const formatRelativeActivity = (timestamp) => {
        if (!timestamp) return t('chat.noActivity', 'No activity');
        const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
        if (diffMinutes < 1) return t('chat.justNow', 'Just now');
        if (diffMinutes < 60) return t('chat.minutesAgo', '{{count}}m ago', { count: diffMinutes });
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) return t('chat.hoursAgo', '{{count}}h ago', { count: diffHours });
        const diffDays = Math.round(diffHours / 24);
        return t('chat.daysAgo', '{{count}}d ago', { count: diffDays });
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
    const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
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
        toast.success(t('chat.refreshed', 'Communications refreshed'));
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
        if (unreadOnlyFilter) {
            list = list.filter(u => (u.unread_count || 0) > 0);
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
    }, [staffUsers, searchQuery, unreadOnlyFilter]);

    const filteredPatients = useMemo(() => {
        let list = [...patientConversations];
        if (unreadOnlyFilter) {
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
    }, [patientConversations, searchQuery, unreadOnlyFilter]);

    const filteredDoctors = useMemo(() => {
        let list = [...doctorConversations];
        if (unreadOnlyFilter) {
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
    }, [doctorConversations, searchQuery, unreadOnlyFilter]);

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

    const insertEmoji = (emoji) => {
        setMessageText(current => `${current}${emoji}`);
        setShowEmojiPicker(false);
    };

    const handleFilesSelected = (filesList) => {
        const files = Array.from(filesList || []);
        if (!files.length) return;
        const validFiles = files.filter(file => file.size <= 10 * 1024 * 1024);
        if (validFiles.length !== files.length) {
            toast.error(t('chat.fileTooLarge', 'Each chat file must be 10 MB or smaller.'));
        }
        setPendingFiles(current => [...current, ...validFiles].slice(0, 5));
    };

    const removePendingFile = (index) => {
        setPendingFiles(current => current.filter((_, itemIndex) => itemIndex !== index));
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesSelected(e.dataTransfer.files);
        }
    };

    const copyToClipboard = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(t('chat.copied', 'Copied to clipboard'));
    };

    const buildMessagePayload = (text, messageKind, attachments) => {
        const common = isChannel
            ? { channelName: selectedChat.id }
            : isDM
                ? { recipientId: selectedChat.id }
                : {};

        if (attachments.length > 0) {
            return createChatFormData({ ...common, body: text, messageKind, attachments });
        }

        return { ...common, body: text, messageKind };
    };

    const handleSendMessage = async (e, customText = null, options = {}) => {
        if (e) e.preventDefault();
        const text = customText || messageText;
        const attachments = customText ? [] : pendingFiles;
        const messageKind = options.messageKind || (attachments.length > 0 ? 'attachment' : 'text');
        if (!text.trim() && attachments.length === 0) return;

        try {
            if (isChannel) {
                await sendChatMessage(buildMessagePayload(text, messageKind, attachments)).unwrap();
            } else if (isDM) {
                await sendChatMessage(buildMessagePayload(text, messageKind, attachments)).unwrap();
            } else if (isPatient) {
                const payload = attachments.length > 0
                    ? createChatFormData({ body: text, messageKind, attachments })
                    : { body: text, messageKind };
                await sendPatientReply(attachments.length > 0
                    ? { patientId: selectedChat.id, data: payload }
                    : { patientId: selectedChat.id, ...payload }).unwrap();
            } else if (isDoctor) {
                const payload = attachments.length > 0
                    ? createChatFormData({ body: text, messageKind, attachments })
                    : { body: text, messageKind };
                await sendDoctorReply(attachments.length > 0
                    ? { doctorId: selectedChat.id, data: payload }
                    : { doctorId: selectedChat.id, ...payload }).unwrap();
            }
            if (!customText) {
                setMessageText('');
                setPendingFiles([]);
            }
            setShowEmojiPicker(false);
            setShowStickerPicker(false);
        } catch (error) {
            toast.error(error.data?.error || t('chat.sendFailed', 'Failed to send message'));
        }
    };

    const sendSticker = (sticker) => {
        handleSendMessage(null, sticker.value, { messageKind: 'sticker' });
    };

    const dateLocale = isRtl ? 'ar-EG' : undefined;
    const formatTime = (d) => new Date(d).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
    const formatDay = (d) => {
        const date = new Date(d);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (date.toDateString() === today.toDateString()) return t('chat.today', 'Today');
        if (date.toDateString() === yesterday.toDateString()) return t('chat.yesterday', 'Yesterday');
        return date.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' });
    };

    const sectionTitle =
        activeSection === 'staff' ? t('chat.staffMessages', 'Team & Channels')
            : activeSection === 'patient' ? t('chat.patientMessages', 'Patient Messages')
                : t('chat.doctorMessages', 'Doctor Inquiries');

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
            count: staffUsers.length + CHANNELS.length,
            unread: staffUnreadSum,
            latest: getLatestTimestamp(staffUsers)
        };
    }, [activeSection, staffUsers, patientConversations, doctorConversations, staffUnreadSum, patientUnreadSum, doctorUnreadSum]);

    const headerTitle = isChannel ? `# ${activeChatMeta?.name || ''}`
        : isDM ? activeChatMeta?.full_name
            : isPatient ? activeChatMeta?.patient_name
                : isDoctor ? activeChatMeta?.doctor_name
                    : t('chat.selectConversation', 'Select a conversation');

    const headerSubtitle = isChannel ? t(activeChatMeta?.descKey, activeChatMeta?.descFallback)
        : isDM ? `${activeChatMeta?.role || ''} • ${activeChatMeta?.isOnline ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}`
            : isPatient ? `${t('chat.mrn', 'MRN')}: ${activeChatMeta?.patient_mrn || '—'}`
                : isDoctor ? `${t('chat.referringDoctor', 'Referring Doctor')} • ${activeChatMeta?.doctor_clinic || ''}`
                    : '';

    return (
        <div className="space-y-4">
            {/* Top Workspace Header */}
            <PageHeader
                icon={MessageSquare}
                eyebrow={t('chat.eyebrow', 'Real-time Communication')}
                eyebrowIcon={Activity}
                title={t('chat.inbox', 'Inbox & Communication Center')}
                description={t('chat.workspaceDescription', 'Coordinate with team channels, respond to patient portal queries, and manage referring physician inquiries.')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                            <BellDot size={15} className="text-rose-600 dark:text-rose-400" />
                            <span>{totalUnreadSum} {t('chat.unreadTotal', 'Unread')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                            <Clock size={15} className="text-teal-600 dark:text-teal-400" />
                            <span>{formatRelativeActivity(latestActivityAt)}</span>
                        </div>
                        <button
                            type="button"
                            onClick={refreshAll}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3 text-xs font-black text-slate-700 shadow-xs transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-teal-950/30"
                        >
                            <RefreshCw size={14} />
                            {t('chat.refresh', 'Refresh')}
                        </button>
                    </div>
                }
            />

            {/* Main Chat Container */}
            <div className="flex h-[calc(100dvh-12rem)] min-h-[620px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#070e1a] select-none">

                {/* ─── LEFT PANEL: Nav lists ────────────────────────────────────────── */}
                <div className={`${mobileShowChat ? 'hidden' : 'flex'} lg:flex w-full lg:w-[21rem] xl:w-[23rem] shrink-0 flex-col border-e border-slate-200/80 bg-slate-50/70 dark:border-slate-800/80 dark:bg-[#08101e]`}>
                    {/* Title + Search Header */}
                    <div className="p-3.5 pb-2.5">
                        <div className="mb-2.5 flex items-center justify-between">
                            <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
                                    <MessageSquare size={16} />
                                </div>
                                {t('chat.conversations', 'Conversations')}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setUnreadOnlyFilter(!unreadOnlyFilter)}
                                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-extrabold transition ${
                                    unreadOnlyFilter
                                        ? 'bg-rose-500 text-white shadow-xs'
                                        : 'bg-slate-200/70 text-slate-600 hover:bg-slate-300/70 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                }`}
                                title={t('chat.toggleUnread', 'Filter unread chats')}
                            >
                                <Filter size={12} />
                                {t('chat.unread', 'Unread')}
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder={t('chat.searchPlaceholder', 'Search chats, users, MRNs...')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-8 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-200"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tab Controls (Team / Patients / Doctors) */}
                    <div className="grid grid-cols-3 gap-1 border-b border-slate-200/80 px-3 pb-2 dark:border-slate-800/80">
                        {[
                            { key: 'staff', icon: Users, label: t('chat.tabStaff', 'Team'), count: staffUnreadSum },
                            { key: 'patient', icon: MessageSquare, label: t('chat.tabPatients', 'Patients'), count: patientUnreadSum },
                            { key: 'doctor', icon: Stethoscope, label: t('chat.tabDoctors', 'Doctors'), count: doctorUnreadSum }
                        ].map(({ key, icon: Icon, label, count }) => (
                            <button
                                key={key}
                                onClick={() => setActiveSection(key)}
                                className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                                    activeSection === key
                                        ? 'bg-gradient-to-r from-teal-500/15 via-cyan-500/15 to-teal-500/10 text-teal-800 dark:from-teal-500/25 dark:to-cyan-500/20 dark:text-teal-300 shadow-xs'
                                        : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                                }`}
                            >
                                <div className="relative">
                                    <Icon size={16} />
                                    {count > 0 && (
                                        <span className="absolute -top-1.5 -end-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white ring-2 ring-slate-50 dark:ring-[#08101e]">
                                            {count}
                                        </span>
                                    )}
                                </div>
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-b border-slate-200/80 px-3 py-3 dark:border-slate-800/80">
                        <MiniMetric icon={Inbox} label={t('chat.threads', 'Threads')} value={activeSectionStats.count} tone="slate" />
                        <MiniMetric icon={BellDot} label={t('chat.unread', 'Unread')} value={activeSectionStats.unread} tone={activeSectionStats.unread ? 'rose' : 'teal'} />
                        <MiniMetric icon={Clock} label={t('chat.latest', 'Latest')} value={formatRelativeActivity(activeSectionStats.latest)} tone="violet" />
                    </div>

                    {/* Chat Lists */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        <div className="px-2.5 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            {sectionTitle}
                        </div>

                        {/* STAFF VIEW */}
                        {activeSection === 'staff' && (
                            <>
                                {CHANNELS.map(ch => {
                                    const active = selectedChat.type === 'channel' && selectedChat.id === ch.id;
                                    return (
                                        <button
                                            key={ch.id}
                                            onClick={() => openChat({ type: 'channel', id: ch.id })}
                                            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                                active
                                                    ? 'bg-teal-500/15 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200 shadow-xs'
                                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                            }`}
                                        >
                                            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-teal-500 text-white' : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                <Hash size={14} />
                                            </div>
                                            <span className="truncate">{ch.name}</span>
                                        </button>
                                    );
                                })}

                                <div className="mt-3 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                    {t('chat.directMessages', 'Direct Messages')}
                                </div>
                                {filteredStaff.length === 0 ? (
                                    <EmptyListState
                                        icon={Users}
                                        title={t('chat.noStaff', 'No team members found')}
                                        description={t('chat.adjustFilters', 'Try clearing search or unread filters.')}
                                        actionLabel={t('chat.clearFilters', 'Clear filters')}
                                        onAction={() => { setSearchQuery(''); setUnreadOnlyFilter(false); }}
                                    />
                                ) : filteredStaff.map(user => {
                                    const active = selectedChat.type === 'dm' && selectedChat.id === user.user_id;
                                    return (
                                        <button
                                            key={user.user_id}
                                            onClick={() => openChat({ type: 'dm', id: user.user_id })}
                                            className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                                active
                                                    ? 'bg-teal-500/15 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200 shadow-xs'
                                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                            }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="relative shrink-0">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[10px] font-extrabold uppercase text-white shadow-xs dark:bg-cyan-400/20 dark:text-cyan-200">
                                                        {initials(user.full_name)}
                                                    </div>
                                                    <span className={`absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#08101e] ${
                                                        user.isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                                    }`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-slate-900 dark:text-white">{user.full_name}</div>
                                                    <div className="truncate text-[10px] font-semibold text-slate-400">{user.role}</div>
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
                                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white">
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
                                    title={t('chat.noPatientChats', 'No active patient chats')}
                                    description={t('chat.patientEmptyHelp', 'Patient portal conversations will appear here as soon as patients message the center.')}
                                    actionLabel={t('chat.clearFilters', 'Clear filters')}
                                    onAction={() => { setSearchQuery(''); setUnreadOnlyFilter(false); }}
                                />
                            ) : filteredPatients.map(chat => {
                                const active = selectedChat.type === 'patient' && selectedChat.id === chat.patient_id;
                                return (
                                    <button
                                        key={chat.patient_id}
                                        onClick={() => openChat({ type: 'patient', id: chat.patient_id })}
                                        className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-teal-500/15 text-teal-900 dark:bg-teal-500/20 dark:text-teal-200 shadow-xs'
                                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-extrabold uppercase text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                                {initials(chat.patient_name)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-slate-900 dark:text-white">{chat.patient_name}</div>
                                                <div className="truncate text-[10px] font-semibold text-teal-600 dark:text-teal-400">{t('chat.mrn', 'MRN')}: {chat.patient_mrn}</div>
                                                <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                    {chat.last_message_body}
                                                </div>
                                            </div>
                                        </div>
                                        {chat.unread_count > 0 && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white">
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
                                    title={t('chat.noDoctorChats', 'No active doctor chats')}
                                    description={t('chat.doctorEmptyHelp', 'Referring doctor inquiries will appear here after portal messages arrive.')}
                                    actionLabel={t('chat.clearFilters', 'Clear filters')}
                                    onAction={() => { setSearchQuery(''); setUnreadOnlyFilter(false); }}
                                />
                            ) : filteredDoctors.map(chat => {
                                const active = selectedChat.type === 'doctor' && selectedChat.id === chat.doctor_id;
                                return (
                                    <button
                                        key={chat.doctor_id}
                                        onClick={() => openChat({ type: 'doctor', id: chat.doctor_id })}
                                        className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-start text-xs font-bold transition-all ${
                                            active
                                                ? 'bg-purple-500/15 text-purple-900 dark:bg-purple-500/20 dark:text-purple-200 shadow-xs'
                                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                                <Stethoscope size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-slate-900 dark:text-white">{chat.doctor_name}</div>
                                                <div className="truncate text-[10px] font-semibold text-purple-600 dark:text-purple-400">{chat.doctor_clinic}</div>
                                                <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                    {chat.last_message_body}
                                                </div>
                                            </div>
                                        </div>
                                        {chat.unread_count > 0 && (
                                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[9px] font-black text-white">
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
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-teal-900/80 backdrop-blur-md p-6 text-white animate-in fade-in duration-200">
                            <UploadCloud size={48} className="animate-bounce text-teal-300" />
                            <h3 className="mt-3 text-lg font-black">{t('chat.dropFilesHere', 'Drop files to attach to message')}</h3>
                            <p className="mt-1 text-xs text-teal-100">{t('chat.dropSubtitle', 'Images, documents, and PDFs supported (up to 10MB)')}</p>
                        </div>
                    )}

                    {/* Chat Header */}
                    <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#070e1a] lg:px-6">
                        <div
                            onClick={() => {
                                if (isPatient) handleNavigateProfile('patient', selectedChat.id);
                                else if (isDoctor) handleNavigateProfile('doctor', selectedChat.id);
                                else if (isDM) handleNavigateProfile('staff', selectedChat.id);
                            }}
                            className={`flex min-w-0 items-center gap-3 ${!isChannel ? 'cursor-pointer group' : ''}`}
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); setMobileShowChat(false); }}
                                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
                                title={t('chat.back', 'Back')}
                            >
                                <ArrowLeft size={18} className={isRtl ? 'rotate-180' : ''} />
                            </button>
                            {isChannel ? (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/20">
                                    <Hash size={18} />
                                </div>
                            ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 font-bold text-white shadow-xs transition group-hover:scale-105 dark:from-slate-700 dark:to-slate-900">
                                    {isDoctor ? <Stethoscope size={18} /> : <User size={18} />}
                                </div>
                            )}
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-extrabold text-slate-900 transition group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">{headerTitle}</h3>
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
                                onClick={() => setShowContextPanel(!showContextPanel)}
                                className="shrink-0 rounded-xl border border-slate-200/80 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                                title={t('chat.toggleInfo', 'Toggle info panel')}
                            >
                                {showContextPanel ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
                            </button>
                        )}
                    </div>

                    {/* Messages List Viewport with Ambient Wallpaper */}
                    <div className="relative flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100/60 via-slate-50/40 to-teal-50/20 p-4 dark:from-[#050b14] dark:via-[#070e19] dark:to-[#081326] lg:p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        {activeMessages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 text-teal-600 dark:text-teal-400 shadow-inner">
                                    <MessageSquare size={30} />
                                </div>
                                <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{t('chat.emptyThread', 'No messages yet. Say hello!')}</p>
                                <p className="mt-1 text-[11px] font-semibold text-slate-400">{t('chat.composePlaceholder', 'Type a message... (Press Enter to send)')}</p>
                            </div>
                        ) : activeMessages.map((msg, i) => {
                            const isMe = (isChannel || isDM)
                                ? String(msg.sender_id) === String(currentUserId)
                                : msg.sender_role === 'Staff';
                            const prev = activeMessages[i - 1];
                            const prevIsMe = prev && ((isChannel || isDM) ? String(prev.sender_id) === String(currentUserId) : prev.sender_role === 'Staff');
                            const showDayDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                            const groupStart = showDayDivider || prevIsMe !== isMe || prev?.sender_id !== msg.sender_id;
                            const senderName = isMe ? t('chat.you', 'You') : msg.sender_name || (isPatient ? t('chat.patient', 'Patient') : isDoctor ? t('chat.doctor', 'Doctor') : t('chat.staff', 'Staff'));

                            const roleBadgeColor = isDoctor
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                : isPatient
                                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

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
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black uppercase shadow-xs ring-2 ring-white/60 dark:ring-slate-800 ${roleBadgeColor}`}>
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
                                                    <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">{senderName}</span>
                                                    {msg.sender_role && (
                                                        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                            {msg.sender_role}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Distinct Sent vs Received Speech Bubbles */}
                                            <div className={`relative px-4 py-2.5 text-xs font-semibold leading-relaxed transition-all ${
                                                isMe
                                                    ? `bg-gradient-to-br from-teal-600 via-teal-600 to-cyan-600 text-white shadow-md shadow-teal-500/20 dark:shadow-teal-900/40 border border-teal-400/20 ${
                                                        isRtl
                                                            ? groupStart ? 'rounded-2xl rounded-tl-xs' : 'rounded-2xl'
                                                            : groupStart ? 'rounded-2xl rounded-tr-xs' : 'rounded-2xl'
                                                      }`
                                                    : `bg-gradient-to-br from-slate-100 to-slate-200/70 text-slate-900 border border-slate-200/90 shadow-xs dark:from-[#121f35] dark:to-[#172740] dark:border-slate-700/70 dark:text-slate-100 ${
                                                        isRtl
                                                            ? groupStart ? 'rounded-2xl rounded-tr-xs' : 'rounded-2xl'
                                                            : groupStart ? 'rounded-2xl rounded-tl-xs' : 'rounded-2xl'
                                                      }`
                                            }`}>
                                                <ChatMessageContent message={msg} isMe={isMe} t={t} />

                                                {/* Copy Button on Hover */}
                                                {msg.body && (
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(msg.body)}
                                                        className="absolute top-2 end-2 opacity-0 group-hover/msg:opacity-100 rounded-md bg-black/20 p-1 text-white transition hover:bg-black/40"
                                                        title="Copy text"
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
                                                            title={msg.is_read ? t('chat.seen', 'Seen / Read') : t('chat.delivered', 'Delivered')}
                                                        >
                                                            {msg.is_read ? (
                                                                <>
                                                                    <CheckCheck size={14} className="text-cyan-200" />
                                                                    <span className="text-[8.5px] font-black text-cyan-200/90 opacity-90">{t('chat.seenLabel', 'Seen')}</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Check size={13} className="text-teal-200/80" />
                                                                    <span className="text-[8.5px] font-bold text-teal-200/70">{t('chat.sentLabel', 'Sent')}</span>
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

                    {/* Quick Replies Bar with Animated Hover Badges */}
                    {(isPatient || isDoctor) && (
                        <div className="flex select-none items-center gap-2 overflow-x-auto border-t border-slate-200/80 bg-slate-50/80 px-4 py-2 dark:border-slate-800/80 dark:bg-[#08101e] lg:px-6 scrollbar-none">
                            <Sparkles size={14} className="shrink-0 text-teal-600 dark:text-teal-400 animate-pulse" />
                            <span className="me-1 shrink-0 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{t('chat.quickReplies', 'Quick replies')}:</span>
                            {QUICK_REPLIES.map((reply, idx) => {
                                const label = t(reply.key, reply.fallback);
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={(e) => handleSendMessage(e, label)}
                                        className="shrink-0 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[10px] font-bold text-slate-700 shadow-2xs transition-all duration-200 hover:scale-105 hover:border-transparent hover:bg-gradient-to-r hover:from-teal-600 hover:to-cyan-600 hover:text-white hover:shadow-md dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 dark:hover:text-white"
                                    >
                                        {label.length > 36 ? `${label.slice(0, 36)}…` : label}
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
                                    <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-white dark:hover:bg-slate-800" aria-label={t('chat.insertEmoji', 'Insert emoji')}>
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
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-teal-950/30"
                                title={t('chat.attachFile', 'Attach file')}
                            >
                                <Paperclip size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowEmojiPicker(value => !value); setShowStickerPicker(false); }}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-teal-950/30"
                                title={t('chat.emoji', 'Emoji')}
                            >
                                <SmilePlus size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowStickerPicker(value => !value); setShowEmojiPicker(false); }}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-teal-950/30"
                                title={t('chat.stickers', 'Stickers')}
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
                                placeholder={t('chat.composePlaceholder', 'Type a message... (Press Enter to send)')}
                                rows={1}
                                className="max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-100 dark:focus:bg-[#070e1a] placeholder:text-slate-400"
                            />
                            <button
                                type="submit"
                                disabled={(!messageText.trim() && pendingFiles.length === 0) || isSending}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-600/20 transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div className="fixed end-0 top-0 z-40 h-full w-80 max-w-[85vw] shrink-0 overflow-y-auto border-s border-slate-200/80 bg-white p-6 shadow-2xl animate-in slide-in-from-end duration-200 dark:border-slate-800 dark:bg-[#070e1a] xl:static xl:z-auto xl:h-auto xl:max-w-none xl:animate-none xl:bg-slate-50/70 xl:shadow-none dark:xl:bg-[#08101e]">
                            <button
                                onClick={() => setShowContextPanel(false)}
                                className="absolute end-4 top-4 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 xl:hidden"
                            >
                                <X size={16} />
                            </button>

                            {isPatient && patientDetails ? (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-xl font-black uppercase text-teal-800 shadow-md dark:bg-teal-950/60 dark:text-teal-300">
                                            {initials(patientDetails.full_name)}
                                        </div>
                                        <h4 className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">{patientDetails.full_name}</h4>
                                        <span className="mt-1 inline-flex rounded-full bg-teal-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                            {t('chat.patient', 'Patient')}
                                        </span>
                                        <div className="mt-3 grid gap-2">
                                            <button
                                                onClick={() => navigate(`/patients/${patientDetails.patient_id}`)}
                                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-teal-700"
                                            >
                                                <ExternalLink size={14} />
                                                <span>{t('chat.viewFullProfile', 'View Full Patient Profile')}</span>
                                            </button>
                                            <button
                                                onClick={() => navigate(`/appointments?patientId=${patientDetails.patient_id}`)}
                                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                            >
                                                <Calendar size={14} />
                                                <span>{t('chat.bookAppointment', 'Appointments')}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-t border-slate-200/80 pt-4 dark:border-slate-800">
                                        <h5 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">{t('chat.contactInfo', 'Contact Info')}</h5>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Phone size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span className="truncate">{patientDetails.phone || t('chat.noPhone', 'No phone')}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Mail size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span className="truncate">{patientDetails.email || t('chat.noEmail', 'No email')}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <MapPin size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span className="truncate">{patientDetails.address || t('chat.noAddress', 'No address')}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 border-t border-slate-200/80 pt-4 dark:border-slate-800">
                                        <h5 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">{t('chat.summary', 'Summary')}</h5>
                                        <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-[#0b1426]">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={15} className="text-teal-600 dark:text-teal-400" />
                                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('chat.gender', 'Gender')}</span>
                                            </div>
                                            <span className="text-xs font-extrabold text-slate-900 dark:text-white">{patientDetails.gender || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-[#0b1426]">
                                            <div className="flex items-center gap-2">
                                                <Receipt size={15} className="text-teal-600 dark:text-teal-400" />
                                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('chat.carePoints', 'Care Points')}</span>
                                            </div>
                                            <span className="text-xs font-black text-teal-700 dark:text-teal-400">{patientDetails.loyalty_points || 0} {t('chat.pts', 'pts')}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : isDoctor && doctorDetails ? (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-purple-700 shadow-md dark:bg-purple-950/60 dark:text-purple-300">
                                            <Stethoscope size={28} />
                                        </div>
                                        <h4 className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">{doctorDetails.full_name}</h4>
                                        <span className="mt-1 inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                            {doctorDetails.specialty || t('chat.referringDoctor', 'Referring Doctor')}
                                        </span>
                                        <button
                                            onClick={() => navigate(`/referring-doctors/${doctorDetails.doctor_id}`)}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-3 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-purple-700"
                                        >
                                            <ExternalLink size={14} />
                                            <span>{t('chat.viewFullDoctorDetails', 'View Doctor Details')}</span>
                                        </button>
                                    </div>

                                    <div className="space-y-3 border-t border-slate-200/80 pt-4 dark:border-slate-800">
                                        <h5 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">{t('chat.clinicInfo', 'Clinic Info')}</h5>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Activity size={14} className="shrink-0 text-purple-600 dark:text-purple-400" />
                                            <span className="truncate">{doctorDetails.clinic_name || t('chat.noClinic', 'No clinic')}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Phone size={14} className="shrink-0 text-purple-600 dark:text-purple-400" />
                                            <span className="truncate">{doctorDetails.phone || t('chat.noPhone', 'No phone')}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Mail size={14} className="shrink-0 text-purple-600 dark:text-purple-400" />
                                            <span className="truncate">{doctorDetails.email || t('chat.noEmail', 'No email')}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : isDM && activeChatMeta ? (
                                <div className="space-y-6">
                                    <div className="text-center">
                                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-xl font-black uppercase text-white shadow-md dark:bg-cyan-400/20 dark:text-cyan-200">
                                            {initials(activeChatMeta.full_name)}
                                        </div>
                                        <h4 className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">{activeChatMeta.full_name}</h4>
                                        <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {activeChatMeta.role}
                                        </span>
                                        <button
                                            onClick={() => navigate(`/users/${activeChatMeta.user_id}`)}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-extrabold text-white shadow-xs transition hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
                                        >
                                            <ExternalLink size={14} />
                                            <span>{t('chat.viewUserAccount', 'View User Profile & Movements')}</span>
                                        </button>
                                    </div>

                                    <div className="space-y-3 border-t border-slate-200/80 pt-4 dark:border-slate-800">
                                        <h5 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">{t('chat.staffInfo', 'Staff Info')}</h5>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Mail size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span className="truncate">{activeChatMeta.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Circle size={9} className={activeChatMeta.isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300 dark:fill-slate-600 dark:text-slate-600'} />
                                            <span>{activeChatMeta.isOnline ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Shield size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                            <span>{t('chat.accountActive', 'Account status: Active')}</span>
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
