import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    MessageCircle,
    X,
    Send,
    ArrowLeft,
    Hash,
    Users,
    MessageSquare,
    Stethoscope,
    Maximize2,
    Check,
    CheckCheck,
    Paperclip,
    SmilePlus,
    Sticker,
    Circle,
    Loader2,
    Plus,
    Lock,
    Megaphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import {
    useGetChatUnreadSummaryQuery,
    useGetChatUsersQuery,
    useGetChatMessagesQuery,
    useSendChatMessageMutation,
    useGetChatChannelsQuery,
    useGetPatientConversationsQuery,
    useGetPatientMessageHistoryQuery,
    useSendPatientReplyMutation,
    useGetDoctorConversationsQuery,
    useGetDoctorMessageHistoryQuery,
    useSendDoctorReplyMutation
} from '../../store/api';
import {
    ChatMessageContent,
    EMOJI_OPTIONS,
    PendingAttachmentPreview,
    STICKER_OPTIONS,
    createChatFormData
} from './chatRichContent';
import {
    getLocalizedChannelDescription,
    getLocalizedChannelName,
    getLocalizedSeedMessage,
    getLocalizedStaffRole
} from './chatLocalization';
import { getLocalizedDemoUserName } from '../../utils/localizedDemoData';

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

const playBubbleChime = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch (_) {
        // Audio is optional and can be blocked by browser autoplay policies.
    }
};

export default function ChatBubble() {
    const { t, i18n } = useTranslation(['system', 'common']);
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = useSelector(selectCurrentUser);
    const currentUserId = currentUser?.user_id || currentUser?.userId || currentUser?.id;
    const canAccessExternalInbox = ['Admin', 'Receptionist', 'Marketing', 'Developer'].includes(currentUser?.role);
    const hideBubble = location.pathname === '/communications';

    const [open, setOpen] = useState(false);

    const [section, setSection] = useState('staff'); // 'staff' | 'patient' | 'doctor'
    const [selectedChat, setSelectedChat] = useState(null); // { type, id }
    const [messageText, setMessageText] = useState('');
    const [pendingFiles, setPendingFiles] = useState([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const messageEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Badge count polls regardless of panel open state
    const { data: unread } = useGetChatUnreadSummaryQuery(undefined, { skip: hideBubble, pollingInterval: 15000 });
    const totalUnread = unread?.total || 0;

    // Conversation & channels lists load only while the panel is open
    const { data: dbChannels = [] } = useGetChatChannelsQuery(undefined, { skip: hideBubble || !open, pollingInterval: 15000 });
    const { data: staffUsers = [], refetch: refetchStaff } = useGetChatUsersQuery(undefined, { skip: hideBubble || !open, pollingInterval: 12000 });
    const { data: patientConversations = [], refetch: refetchPatients } = useGetPatientConversationsQuery(undefined, { skip: hideBubble || !open || !canAccessExternalInbox, pollingInterval: 10000 });
    const { data: doctorConversations = [], refetch: refetchDoctors } = useGetDoctorConversationsQuery(undefined, { skip: hideBubble || !open || !canAccessExternalInbox, pollingInterval: 10000 });

    const channels = dbChannels;

    const isChannel = selectedChat?.type === 'channel';
    const isDM = selectedChat?.type === 'dm';
    const isPatient = selectedChat?.type === 'patient';
    const isDoctor = selectedChat?.type === 'doctor';

    const { data: chatMessages = [], refetch: refetchChatMsgs } = useGetChatMessagesQuery(
        isChannel ? { channelName: selectedChat.id } : isDM ? { recipientId: selectedChat.id } : null,
        { skip: hideBubble || !open || (!isChannel && !isDM), pollingInterval: 4000 }
    );
    const { data: patientMessages = [], refetch: refetchPatientMsgs } = useGetPatientMessageHistoryQuery(
        selectedChat?.id,
        { skip: hideBubble || !open || !canAccessExternalInbox || !isPatient, pollingInterval: 4000 }
    );
    const { data: doctorMessages = [], refetch: refetchDoctorMsgs } = useGetDoctorMessageHistoryQuery(
        selectedChat?.id,
        { skip: hideBubble || !open || !canAccessExternalInbox || !isDoctor, pollingInterval: 4000 }
    );

    const [sendChatMessage, { isLoading: isSendingChat }] = useSendChatMessageMutation();
    const [sendPatientReply, { isLoading: isSendingPatient }] = useSendPatientReplyMutation();
    const [sendDoctorReply, { isLoading: isSendingDoctor }] = useSendDoctorReplyMutation();
    const isSending = isSendingChat || isSendingPatient || isSendingDoctor;

    const activeMessages = useMemo(() => {
        let messages = [];
        if (isChannel || isDM) messages = chatMessages;
        else if (isPatient) messages = patientMessages;
        else if (isDoctor) messages = doctorMessages;
        return [...messages].sort((a, b) => getTimeValue(a.created_at) - getTimeValue(b.created_at));
    }, [isChannel, isDM, isPatient, isDoctor, chatMessages, patientMessages, doctorMessages]);

    const sortedStaffUsers = useMemo(() => [...staffUsers].sort((a, b) => {
        const recent = compareNewest(a.last_message_at, b.last_message_at);
        if (recent !== 0) return recent;
        if (b.unread_count !== a.unread_count) return (b.unread_count || 0) - (a.unread_count || 0);
        if (b.isOnline !== a.isOnline) return (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0);
        return a.full_name?.localeCompare(b.full_name);
    }), [staffUsers]);

    const sortedPatientConversations = useMemo(
        () => [...patientConversations].sort((a, b) => compareNewest(a.last_message_at, b.last_message_at)),
        [patientConversations]
    );

    const sortedDoctorConversations = useMemo(
        () => [...doctorConversations].sort((a, b) => compareNewest(a.last_message_at, b.last_message_at)),
        [doctorConversations]
    );

    useEffect(() => {
        if (open) messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeMessages.length, open]);

    useEffect(() => {
        setPendingFiles([]);
        setMessageText('');
        setShowEmojiPicker(false);
        setShowStickerPicker(false);
    }, [selectedChat?.type, selectedChat?.id]);

    // Keep lists/thread in sync with the global SSE relay
    useEffect(() => {
        const handler = (event) => {
            const sseEvent = event?.detail?.event;
            // Presence updates (user connected/disconnected) refresh the
            // staff list silently — no chime, no message-thread refetch.
            if (sseEvent === 'USER_PRESENCE') {
                refetchStaff();
                return;
            }
            if (!open) return;
            playBubbleChime();
            refetchStaff();
            if (canAccessExternalInbox) {
                refetchPatients();
                refetchDoctors();
            }
            if (isChannel || isDM) refetchChatMsgs();
            if (isPatient) refetchPatientMsgs();
            if (isDoctor) refetchDoctorMsgs();
        };
        window.addEventListener('SSE_REALTIME_MESSAGE', handler);
        return () => window.removeEventListener('SSE_REALTIME_MESSAGE', handler);
    }, [open, isChannel, isDM, isPatient, isDoctor, canAccessExternalInbox, refetchStaff, refetchPatients, refetchDoctors, refetchChatMsgs, refetchPatientMsgs, refetchDoctorMsgs]);

    // Refresh presence as soon as the panel opens instead of waiting for the
    // first 12s poll tick.
    useEffect(() => {
        if (open) refetchStaff();
    }, [open, refetchStaff]);

    const dateLocale = i18n.language === 'ar' ? 'ar-EG' : undefined;
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

    const insertEmoji = (emoji) => {
        setMessageText(current => `${current}${emoji}`);
        setShowEmojiPicker(false);
    };

    const handleFilesSelected = (event) => {
        const files = Array.from(event.target.files || []);
        const validFiles = files.filter(file => file.size <= 10 * 1024 * 1024);
        if (validFiles.length !== files.length) {
            toast.error(t('chat.fileTooLarge', 'Each chat file must be 10 MB or smaller.'));
        }
        setPendingFiles(current => [...current, ...validFiles].slice(0, 5));
        event.target.value = '';
    };

    const removePendingFile = (index) => {
        setPendingFiles(current => current.filter((_, itemIndex) => itemIndex !== index));
    };

    const buildStaffPayload = (text, messageKind, attachments) => {
        const common = isChannel
            ? { channelName: selectedChat.id, channel_name: selectedChat.id }
            : { recipientId: selectedChat.id, recipient_id: selectedChat.id };
        if (attachments.length > 0) return createChatFormData({ ...common, body: text, messageKind, attachments });
        return { ...common, body: text, messageKind };
    };

    const handleSend = async (e, customText = null, options = {}) => {
        if (e) e.preventDefault();
        const text = (customText !== null ? customText : messageText).trim();
        const attachments = customText ? [] : pendingFiles;
        const messageKind = options.messageKind || (attachments.length > 0 ? 'attachment' : 'text');
        if ((!text && attachments.length === 0) || !selectedChat) return;

        try {
            if (isChannel || isDM) {
                await sendChatMessage(buildStaffPayload(text, messageKind, attachments)).unwrap();
            } else if (isPatient) {
                const payload = attachments.length > 0
                    ? createChatFormData({ body: text, messageKind, attachments })
                    : { body: text, messageKind };
                await sendPatientReply({
                    patientId: selectedChat.id,
                    data: attachments.length > 0 ? payload : undefined,
                    body: text
                }).unwrap();
            } else if (isDoctor) {
                const payload = attachments.length > 0
                    ? createChatFormData({ body: text, messageKind, attachments })
                    : { body: text, messageKind };
                await sendDoctorReply({
                    doctorId: selectedChat.id,
                    data: attachments.length > 0 ? payload : undefined,
                    body: text
                }).unwrap();
            }
            if (!customText) {
                setMessageText('');
                setPendingFiles([]);
            }
            setShowEmojiPicker(false);
            setShowStickerPicker(false);
        } catch (error) {
            toast.error(error?.data?.error || error?.data?.message || t('chat.sendFailed', 'Failed to send message'));
        }
    };

    const sendSticker = (sticker) => {
        handleSend(null, sticker.value, { messageKind: 'sticker' });
    };

    const activeMeta = useMemo(() => {
        if (isChannel) {
            const found = channels.find(c => (c.channel_id || c.id) === selectedChat.id);
            return found ? {
                name: getLocalizedChannelName(found, t),
                slug: found.name || found.channel_id,
                description: getLocalizedChannelDescription(found, t),
                is_private: found.is_private,
                post_permission: found.post_permission,
                can_post: found.can_post !== undefined ? found.can_post : true
            } : { name: selectedChat.id, slug: selectedChat.id, can_post: true };
        }
        if (isDM) return sortedStaffUsers.find(u => u.user_id === selectedChat.id);
        if (isPatient) return sortedPatientConversations.find(p => p.patient_id === selectedChat.id);
        if (isDoctor) return sortedDoctorConversations.find(d => d.doctor_id === selectedChat.id);
        return null;
    }, [selectedChat, isChannel, isDM, isPatient, isDoctor, channels, sortedStaffUsers, sortedPatientConversations, sortedDoctorConversations, t]);

    const threadTitle = isChannel ? `# ${activeMeta?.name || ''}`
        : isDM ? getLocalizedDemoUserName(activeMeta?.full_name, t)
            : isPatient ? activeMeta?.patient_name
                : isDoctor ? activeMeta?.doctor_name
                    : '';

    const threadSubtitle = isChannel
        ? `${activeMeta?.is_private ? '🔒 ' : ''}${activeMeta?.post_permission === 'admins_only' ? '📢 ' : ''}${activeMeta?.description || t('chat.channelSubtitle', 'Team channel')}`
        : isDM
            ? `${getLocalizedStaffRole(activeMeta?.role, t) || t('chat.staff', 'Staff')} · ${activeMeta?.isOnline ? t('chat.online', 'Online') : t('chat.offline', 'Offline')}`
            : isPatient
                ? `${t('chat.mrn', 'MRN')}: ${activeMeta?.patient_mrn || '—'}`
                : isDoctor
                    ? activeMeta?.doctor_clinic || t('chat.referringDoctor', 'Referring Doctor')
                    : '';

    const renderMessageStatus = (msg, isMe) => {
        if (isChannel) return null;
        if (!isMe) {
            return (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-slate-500">
                    <Check size={10} />
                    {t('chat.receivedLabel', 'Received')}
                </span>
            );
        }
        if (msg._optimistic) {
            return (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-teal-100/80">
                    <Loader2 size={10} className="animate-spin" />
                    {t('chat.sendingLabel', 'Sending')}
                </span>
            );
        }
        if (msg.is_read) {
            return (
                <span className="inline-flex items-center gap-1 text-[9px] font-black text-cyan-100">
                    <CheckCheck size={12} />
                    {t('chat.seenLabel', 'Seen')}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-teal-100/80">
                <Check size={11} />
                {t('chat.sentLabel', 'Sent')}
            </span>
        );
    };

    const sectionTabs = [
        { key: 'staff', icon: Users, label: t('chat.tabStaff', 'Team'), count: staffUsers.reduce((s, u) => s + (u.unread_count || 0), 0) },
        ...(canAccessExternalInbox ? [
            { key: 'patient', icon: MessageSquare, label: t('chat.tabPatients', 'Patients'), count: patientConversations.reduce((s, p) => s + (p.unread_count || 0), 0) },
            { key: 'doctor', icon: Stethoscope, label: t('chat.tabDoctors', 'Doctors'), count: doctorConversations.reduce((s, d) => s + (d.unread_count || 0), 0) }
        ] : [])
    ];

    const renderList = () => {
        if (section === 'staff') {
            return (
                <div className="space-y-1">
                    <div className="flex items-center justify-between px-2 pb-1 pt-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('chat.staffMessages', 'Team & Channels')}</p>
                        <button
                            type="button"
                            onClick={() => { setOpen(false); navigate('/communications'); }}
                            className="text-[9px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
                        >
                            + {t('chat.manageChannels', 'Manage')}
                        </button>
                    </div>
                    {channels.map(ch => {
                        const chId = ch.channel_id || ch.id;
                        return (
                            <button
                                key={chId}
                                type="button"
                                onClick={() => setSelectedChat({ type: 'channel', id: chId })}
                                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition hover:bg-slate-100 dark:hover:bg-white/5"
                            >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ch.icon_color || ch.iconColor || 'from-teal-500 to-cyan-600'} text-white shadow-2xs`}>
                                    {ch.is_private ? <Lock size={14} /> : <Hash size={15} />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                        <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-200">{getLocalizedChannelName(ch, t)}</span>
                                        {ch.is_private && <Lock size={10} className="text-amber-500 shrink-0" />}
                                        {ch.post_permission === 'admins_only' && <Megaphone size={10} className="text-purple-500 shrink-0" />}
                                    </div>
                                    {getLocalizedChannelDescription(ch, t) && <span className="block truncate text-[10px] text-slate-400">{getLocalizedChannelDescription(ch, t)}</span>}
                                </div>
                            </button>
                        );
                    })}
                    <p className="px-2 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('chat.directMessages', 'Direct Messages')} - {t('chat.newestFirst', 'Newest first')}</p>
                    {sortedStaffUsers.length === 0 ? (
                        <p className="px-2 py-2 text-center text-[11px] text-slate-400">{t('chat.noStaff', 'No team members found')}</p>
                    ) : sortedStaffUsers.map(u => (
                        <button
                            key={u.user_id}
                            type="button"
                            onClick={() => setSelectedChat({ type: 'dm', id: u.user_id })}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition hover:bg-slate-100 dark:hover:bg-white/5"
                        >
                            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-[11px] font-black text-white shadow-2xs">
                                {initials(getLocalizedDemoUserName(u.full_name, t))}
                                {u.isOnline && <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#0b1426]" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{getLocalizedDemoUserName(u.full_name, t)}</span>
                                <span className="block truncate text-[10px] text-slate-400">{u.last_message_body || getLocalizedStaffRole(u.role, t)}</span>
                            </span>
                            {u.last_message_at && <span className="shrink-0 text-[9px] font-semibold text-slate-400">{formatTime(u.last_message_at)}</span>}
                            {u.unread_count > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow-2xs">{u.unread_count}</span>}
                        </button>
                    ))}
                </div>
            );
        }
        const list = section === 'patient' ? sortedPatientConversations : sortedDoctorConversations;
        const emptyText = section === 'patient' ? t('chat.noPatientChats', 'No active patient chats') : t('chat.noDoctorChats', 'No active doctor chats');
        if (list.length === 0) return <p className="px-2 py-6 text-center text-[11px] text-slate-400">{emptyText}</p>;
        return (
            <div className="space-y-1 pt-1">
                {list.map(item => {
                    const id = section === 'patient' ? item.patient_id : item.doctor_id;
                    const name = section === 'patient' ? item.patient_name : item.doctor_name;
                    const sub = section === 'patient' ? `${t('chat.mrn', 'MRN')}: ${item.patient_mrn || '—'}` : item.doctor_clinic;
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedChat({ type: section, id })}
                            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition hover:bg-slate-100 dark:hover:bg-white/5"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-[11px] font-black text-white shadow-2xs">{initials(name)}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{name}</span>
                                <span className="block truncate text-[10px] text-slate-400">{item.last_message_body || sub}</span>
                            </span>
                            {item.unread_count > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white shadow-2xs">{item.unread_count}</span>}
                        </button>
                    );
                })}
            </div>
        );
    };

    // Keep hook ordering stable while the route changes to/from the full hub.
    if (hideBubble) return null;

    return (
        <>
            {/* Floating trigger */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    title={t('chat.bubbleOpen', 'Open live chat')}
                    className="fixed bottom-5 end-4 z-[70] flex h-13 w-13 sm:h-14 sm:w-14 sm:bottom-6 sm:end-6 items-center justify-center rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-xl shadow-teal-900/30 transition hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-teal-500/20"
                >
                    <MessageCircle size={22} />
                    {totalUnread > 0 && (
                        <span className="absolute -end-1 -top-1 flex h-5 min-w-5 sm:h-6 sm:min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] sm:text-[11px] font-black text-white shadow-md dark:border-[#080f1c]">
                            {totalUnread > 99 ? '99+' : totalUnread}
                        </span>
                    )}
                </button>
            )}

            {/* Mobile backdrop overlay */}
            {open && (
                <div
                    className="fixed inset-0 z-[69] bg-slate-900/40 backdrop-blur-sm sm:hidden"
                    onClick={() => setOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Panel */}
            {open && (
                <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:end-6 z-[70] flex flex-col overflow-hidden sm:h-[38rem] sm:max-h-[calc(100vh-3rem)] sm:w-[min(28rem,calc(100vw-3rem))] sm:rounded-3xl sm:border border-slate-200/90 bg-white/98 shadow-2xl shadow-slate-900/25 backdrop-blur-2xl dark:border-slate-800 dark:bg-[#07101d]">
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-slate-950 via-teal-900 to-cyan-900 px-4 py-3 text-white">
                        <div className="flex min-w-0 items-center gap-3">
                            {selectedChat ? (
                                <button type="button" onClick={() => setSelectedChat(null)} title={t('chat.back', 'Back')} className="shrink-0 rounded-xl p-1.5 transition hover:bg-white/15">
                                    <ArrowLeft size={16} className="rtl:rotate-180" />
                                </button>
                            ) : (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
                                    <MessageCircle size={18} />
                                </span>
                            )}
                            {selectedChat && (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
                                    {isChannel ? <Hash size={17} /> : isDoctor ? <Stethoscope size={17} /> : <MessageSquare size={17} />}
                                </span>
                            )}
                            <div className="min-w-0">
                                <span className="block truncate text-sm font-black">{selectedChat ? threadTitle : t('chat.bubbleTitle', 'Live Chat')}</span>
                                <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] font-bold text-cyan-100/80">
                                    {isDM && <Circle size={7} className={activeMeta?.isOnline ? 'fill-emerald-300 text-emerald-300' : 'fill-slate-400 text-slate-400'} />}
                                    <span className="truncate">{selectedChat ? threadSubtitle : t('chat.newMessages', 'New messages')}</span>
                                </span>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button type="button" onClick={() => { setOpen(false); navigate('/communications'); }} title={t('chat.openFullCenter', 'Open full communication center')} className="rounded-xl p-2 transition hover:bg-white/15">
                                <Maximize2 size={15} />
                            </button>
                            <button type="button" onClick={() => setOpen(false)} title={t('chat.bubbleClose', 'Close chat')} className="rounded-xl p-2 transition hover:bg-white/15">
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {!selectedChat ? (
                        <>
                            {/* Section tabs */}
                            <div className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-[#091322]">
                                {sectionTabs.map(tab => {
                                    const Icon = tab.icon;
                                    const active = section === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => setSection(tab.key)}
                                            className={`relative flex flex-col items-center gap-1 rounded-2xl py-2 text-[10.5px] font-black uppercase tracking-wider transition ${
                                                active
                                                    ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-xs'
                                                    : 'text-slate-500 hover:bg-white/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'
                                            }`}
                                        >
                                            <Icon size={16} />
                                            <span>{tab.label}</span>
                                            {tab.count > 0 && <span className="absolute end-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white ring-2 ring-white dark:ring-[#091322]">{tab.count}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">{renderList()}</div>
                        </>
                    ) : (
                        <>
                            {/* Thread */}
                            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/70 via-slate-100/40 to-slate-50/70 p-3 dark:from-[#07101d] dark:via-[#081324] dark:to-[#07101d] scrollbar-thin">
                                {activeMessages.length === 0 ? (
                                    <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                                        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-sm ring-1 ring-slate-200 dark:bg-white/5 dark:text-teal-300 dark:ring-white/10">
                                            <MessageCircle size={26} />
                                        </span>
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">{t('chat.emptyThread', 'No messages yet. Say hello!')}</p>
                                        <p className="mt-1 text-[10px] font-semibold text-slate-400">{t('chat.composePlaceholder', 'Type a message...')}</p>
                                    </div>
                                ) : activeMessages.map((msg, i) => {
                                    const isMe = (isChannel || isDM) ? String(msg.sender_id) === String(currentUserId) : msg.sender_role === 'Staff';
                                    const prev = activeMessages[i - 1];
                                    const prevIsMe = prev && ((isChannel || isDM) ? String(prev.sender_id) === String(currentUserId) : prev.sender_role === 'Staff');
                                    const showDayDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(msg.created_at).toDateString();
                                    const groupStart = showDayDivider || prevIsMe !== isMe || prev?.sender_id !== msg.sender_id || prev?.sender_role !== msg.sender_role;
                                    const senderName = isMe
                                        ? t('chat.you', 'You')
                                        : getLocalizedDemoUserName(msg.sender_name || msg.staff_name, t) || (isPatient ? t('chat.patient', 'Patient') : isDoctor ? t('chat.doctor', 'Doctor') : t('chat.staff', 'Staff'));
                                    const avatarTone = isDoctor
                                        ? 'bg-gradient-to-br from-purple-500 to-violet-600 text-white'
                                        : isPatient
                                            ? 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white'
                                            : 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white';
                                    return (
                                        <React.Fragment key={msg.message_id || i}>
                                            {showDayDivider && (
                                                <div className="flex items-center justify-center py-2.5">
                                                    <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-0.5 text-[9px] font-bold text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                                                        {formatDay(msg.created_at)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex w-full items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} ${groupStart ? 'mt-3' : 'mt-1'}`}>
                                                {!isMe && (
                                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-2xl text-[9px] font-black uppercase shadow-2xs ${groupStart ? avatarTone : 'opacity-0'}`}>
                                                        {initials(senderName)}
                                                    </span>
                                                )}
                                                <div className={`flex max-w-[84%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    {groupStart && !isMe && (
                                                        <span className="mb-1 px-1 text-[10px] font-black text-slate-600 dark:text-slate-300">
                                                            {senderName}
                                                        </span>
                                                    )}
                                                    <div className={`px-3 py-2 text-xs font-semibold leading-relaxed shadow-xs rounded-2xl ${
                                                        isMe
                                                            ? 'bg-gradient-to-br from-teal-600 to-cyan-600 text-white shadow-teal-900/10 border border-teal-500/20'
                                                            : 'bg-white text-slate-800 border border-slate-200 dark:bg-[#111d31] dark:text-slate-100 dark:border-slate-800'
                                                    }`}>
                                                        <div dir="auto" className="text-start">
                                                            <ChatMessageContent message={msg} displayBody={getLocalizedSeedMessage(msg.body, t)} isMe={isMe} compact t={t} />
                                                        </div>
                                                        <div className={`mt-1 flex items-center gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <span className={`text-[9px] font-bold ${isMe ? 'text-teal-100/90' : 'text-slate-400'}`}>{formatTime(msg.created_at)}</span>
                                                            {renderMessageStatus(msg, isMe)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                                <div ref={messageEndRef} />
                            </div>
                            {/* Composer or Permission lock */}
                            {isChannel && activeMeta?.can_post === false ? (
                                <div className="flex items-center justify-center gap-1.5 border-t border-purple-200 bg-purple-50/80 p-3 text-center text-[10.5px] font-bold text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300">
                                    <Lock size={13} className="shrink-0" />
                                    <span>{t('chat.postingRestrictedShort', 'Posting in this channel is restricted to channel admins')}</span>
                                </div>
                            ) : (
                                <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#07101d]">
                                    <PendingAttachmentPreview files={pendingFiles} onRemove={removePendingFile} t={t} />
                                    {showEmojiPicker && (
                                        <div className="mb-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-2xs dark:border-slate-800 dark:bg-[#0a1220]">
                                            {EMOJI_OPTIONS.map(emoji => (
                                                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition hover:bg-white dark:hover:bg-white/10" aria-label={t('chat.insertEmoji', 'Insert emoji')}>
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {showStickerPicker && (
                                        <div className="mb-2 grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-2xs dark:border-slate-800 dark:bg-[#0a1220]">
                                            {STICKER_OPTIONS.map(sticker => (
                                                <button key={sticker.label} type="button" onClick={() => sendSticker(sticker)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-[9px] font-extrabold transition hover:scale-105 ${sticker.tone}`}>
                                                    <span className="text-2xl leading-none">{sticker.value}</span>
                                                    <span className="truncate">{sticker.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-[#0a1220]">
                                        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx" onChange={handleFilesSelected} className="hidden" />
                                        <button type="button" onClick={() => fileInputRef.current?.click()} title={t('chat.attachFile', 'Attach file')} className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-white hover:text-teal-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-teal-300">
                                            <Paperclip size={14} />
                                        </button>
                                        <button type="button" onClick={() => { setShowEmojiPicker(value => !value); setShowStickerPicker(false); }} title={t('chat.emoji', 'Emoji')} className={`inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl transition ${showEmojiPicker ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:bg-white hover:text-teal-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-teal-300'}`}>
                                            <SmilePlus size={14} />
                                        </button>
                                        <button type="button" onClick={() => { setShowStickerPicker(value => !value); setShowEmojiPicker(false); }} title={t('chat.stickers', 'Stickers')} className={`inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl transition ${showStickerPicker ? 'bg-teal-600 text-white shadow-2xs' : 'text-slate-500 hover:bg-white hover:text-teal-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-teal-300'}`}>
                                            <Sticker size={14} />
                                        </button>
                                        <input
                                            value={messageText}
                                            onChange={(e) => setMessageText(e.target.value)}
                                            dir="auto"
                                            placeholder={t('chat.composePlaceholder', 'Type a message...')}
                                            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                                        />
                                        <button type="submit" disabled={isSending || (!messageText.trim() && pendingFiles.length === 0)} className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-2xs transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                                            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="rtl:-scale-x-100" />}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </div>
            )}
        </>
    );
}
