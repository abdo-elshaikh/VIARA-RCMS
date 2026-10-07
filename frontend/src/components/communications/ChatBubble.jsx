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
    Lock,
    Megaphone,
    Search
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
import { playHospitalChime } from '../../utils/audioChime';

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
    const [searchQuery, setSearchQuery] = useState('');
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

    // Filtered lists for real-time search
    const filteredChannels = useMemo(() => {
        if (!searchQuery.trim()) return channels;
        const q = searchQuery.toLowerCase().trim();
        return channels.filter(ch => {
            const name = getLocalizedChannelName(ch, t).toLowerCase();
            const desc = (getLocalizedChannelDescription(ch, t) || '').toLowerCase();
            return name.includes(q) || desc.includes(q) || (ch.name || '').toLowerCase().includes(q);
        });
    }, [channels, searchQuery, t]);

    const filteredStaffUsers = useMemo(() => {
        if (!searchQuery.trim()) return sortedStaffUsers;
        const q = searchQuery.toLowerCase().trim();
        return sortedStaffUsers.filter(u => {
            const name = getLocalizedDemoUserName(u.full_name, t).toLowerCase();
            const role = (getLocalizedStaffRole(u.role, t) || '').toLowerCase();
            return name.includes(q) || role.includes(q);
        });
    }, [sortedStaffUsers, searchQuery, t]);

    const filteredPatients = useMemo(() => {
        if (!searchQuery.trim()) return sortedPatientConversations;
        const q = searchQuery.toLowerCase().trim();
        return sortedPatientConversations.filter(p => {
            const name = (p.patient_name || '').toLowerCase();
            const mrn = (p.patient_mrn || '').toLowerCase();
            return name.includes(q) || mrn.includes(q);
        });
    }, [sortedPatientConversations, searchQuery]);

    const filteredDoctors = useMemo(() => {
        if (!searchQuery.trim()) return sortedDoctorConversations;
        const q = searchQuery.toLowerCase().trim();
        return sortedDoctorConversations.filter(d => {
            const name = (d.doctor_name || '').toLowerCase();
            const clinic = (d.doctor_clinic || '').toLowerCase();
            return name.includes(q) || clinic.includes(q);
        });
    }, [sortedDoctorConversations, searchQuery]);

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
            if (sseEvent === 'USER_PRESENCE') {
                refetchStaff();
                return;
            }
            if (!open) return;
            playHospitalChime('call');
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
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-teal-100/90">
                    <Loader2 size={10} className="animate-spin" />
                    {t('chat.sendingLabel', 'Sending')}
                </span>
            );
        }
        if (msg.is_read) {
            return (
                <span className="inline-flex items-center gap-1 text-[9px] font-black text-cyan-200">
                    <CheckCheck size={12} />
                    {t('chat.seenLabel', 'Seen')}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-teal-100/90">
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
                <div className="space-y-3 p-1">
                    {/* Channels Section */}
                    <div>
                        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('chat.channels', 'General Channels')}
                            </span>
                            <button
                                type="button"
                                onClick={() => { setOpen(false); navigate('/communications'); }}
                                className="text-[10px] font-black text-teal-600 transition-colors hover:text-teal-700 hover:underline dark:text-teal-400 dark:hover:text-teal-300"
                            >
                                + {t('chat.manageChannels', 'Manage Channels')}
                            </button>
                        </div>
                        <div className="space-y-1">
                            {filteredChannels.map(ch => {
                                const chId = ch.channel_id || ch.id;
                                return (
                                    <button
                                        key={chId}
                                        type="button"
                                        onClick={() => setSelectedChat({ type: 'channel', id: chId })}
                                        className="group flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-all duration-200 hover:bg-slate-100/90 dark:hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0"
                                    >
                                        <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${ch.icon_color || ch.iconColor || 'from-teal-600 to-cyan-600'} text-white shadow-xs transition-transform duration-200 group-hover:scale-105`}>
                                            {ch.is_private ? <Lock size={15} /> : <Hash size={16} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="block truncate text-xs font-black text-slate-900 dark:text-white">
                                                    {getLocalizedChannelName(ch, t)}
                                                </span>
                                                {ch.is_private && <Lock size={11} className="shrink-0 text-amber-500" />}
                                                {ch.post_permission === 'admins_only' && <Megaphone size={11} className="shrink-0 text-purple-500" />}
                                            </div>
                                            {getLocalizedChannelDescription(ch, t) && (
                                                <span className="block truncate text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                                                    {getLocalizedChannelDescription(ch, t)}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Direct Messages Section */}
                    <div>
                        <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('chat.directMessages', 'Direct Messages')}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">
                                {t('chat.newestFirst', 'Newest first')}
                            </span>
                        </div>
                        <div className="space-y-1">
                            {filteredStaffUsers.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs font-semibold text-slate-400">
                                    {t('chat.noStaff', 'No team members found')}
                                </p>
                            ) : filteredStaffUsers.map(u => (
                                <button
                                    key={u.user_id}
                                    type="button"
                                    onClick={() => setSelectedChat({ type: 'dm', id: u.user_id })}
                                    className="group flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-all duration-200 hover:bg-slate-100/90 dark:hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0"
                                >
                                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-700 text-xs font-black text-white shadow-xs transition-transform duration-200 group-hover:scale-105">
                                        {initials(getLocalizedDemoUserName(u.full_name, t))}
                                        {u.isOnline && (
                                            <span className="absolute -bottom-0.5 -end-0.5 flex h-3 w-3">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
                                                <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-[#07101d]" />
                                            </span>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-black text-slate-900 dark:text-white">
                                            {getLocalizedDemoUserName(u.full_name, t)}
                                        </span>
                                        <span className="block truncate text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                                            {u.last_message_body || getLocalizedStaffRole(u.role, t)}
                                        </span>
                                    </span>
                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        {u.last_message_at && (
                                            <span className="text-[9.5px] font-bold text-slate-400" dir="ltr">
                                                {formatTime(u.last_message_at)}
                                            </span>
                                        )}
                                        {u.unread_count > 0 && (
                                            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-xs">
                                                {u.unread_count}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        const list = section === 'patient' ? filteredPatients : filteredDoctors;
        const emptyText = section === 'patient' ? t('chat.noPatientChats', 'No active patient chats') : t('chat.noDoctorChats', 'No active doctor chats');

        if (list.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-slate-400">
                    <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                        {section === 'patient' ? <MessageSquare size={22} /> : <Stethoscope size={22} />}
                    </span>
                    <p className="text-xs font-black text-slate-600 dark:text-slate-300">{emptyText}</p>
                </div>
            );
        }

        return (
            <div className="space-y-1 p-1">
                {list.map(item => {
                    const id = section === 'patient' ? item.patient_id : item.doctor_id;
                    const name = section === 'patient' ? item.patient_name : item.doctor_name;
                    const sub = section === 'patient' ? `${t('chat.mrn', 'MRN')}: ${item.patient_mrn || '—'}` : item.doctor_clinic;
                    const avatarGradient = section === 'patient'
                        ? 'from-teal-600 to-emerald-600'
                        : 'from-purple-600 to-violet-700';

                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedChat({ type: section, id })}
                            className="group flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-all duration-200 hover:bg-slate-100/90 dark:hover:bg-slate-800/60 hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0"
                        >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarGradient} text-xs font-black text-white shadow-xs transition-transform duration-200 group-hover:scale-105`}>
                                {initials(name)}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-black text-slate-900 dark:text-white">
                                    {name}
                                </span>
                                <span className="block truncate text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
                                    {item.last_message_body || sub}
                                </span>
                            </span>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                                {item.last_message_at && (
                                    <span className="text-[9.5px] font-bold text-slate-400" dir="ltr">
                                        {formatTime(item.last_message_at)}
                                    </span>
                                )}
                                {item.unread_count > 0 && (
                                    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white shadow-xs">
                                        {item.unread_count}
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    };

    if (hideBubble) return null;

    return (
        <>
            {/* Floating Trigger Button with Ambient Aura */}
            {!open && (
                <div className="fixed bottom-5 end-4 sm:bottom-6 sm:end-6 z-[70] group">
                    <span className="pointer-events-none absolute -inset-1.5 rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-400 opacity-60 blur-md transition duration-300 group-hover:opacity-100 group-hover:scale-110" />
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        title={t('chat.bubbleOpen', 'Open live chat')}
                        aria-label={t('chat.bubbleOpen', 'Open live chat')}
                        className="relative flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-gradient-to-tr from-teal-600 via-teal-500 to-cyan-600 text-white shadow-xl shadow-teal-950/30 transition-all duration-200 group-hover:scale-105 active:scale-95 focus:outline-hidden focus:ring-4 focus:ring-teal-500/30"
                    >
                        <MessageCircle size={24} className="transition-transform duration-200 group-hover:rotate-6" />
                        {totalUnread > 0 && (
                            <span className="absolute -end-1 -top-1 flex h-5 min-w-5 sm:h-6 sm:min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1.5 text-[10px] sm:text-[11px] font-black text-white shadow-md animate-bounce dark:border-[#07101d]">
                                {totalUnread > 99 ? '99+' : totalUnread}
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* Mobile Backdrop */}
            {open && (
                <div
                    className="fixed inset-0 z-[69] bg-slate-950/70 backdrop-blur-xs sm:hidden"
                    onClick={() => setOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Modern Glassmorphic Chat Panel */}
            {open && (
                <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:end-6 z-[70] flex flex-col overflow-hidden sm:h-[40rem] sm:max-h-[calc(100vh-3.5rem)] sm:w-[min(28rem,calc(100vw-2.5rem))] sm:rounded-3xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-950/30 backdrop-blur-2xl dark:border-slate-800/90 dark:bg-[#07101d]/95 animate-in fade-in-50 zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="relative shrink-0 overflow-hidden border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 px-4 py-3.5 text-white">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                {selectedChat ? (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedChat(null)}
                                        title={t('chat.back', 'Back')}
                                        className="shrink-0 rounded-xl p-1.5 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                    >
                                        <ArrowLeft size={18} className="rtl:rotate-180" />
                                    </button>
                                ) : (
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/40 shadow-xs">
                                        <MessageCircle size={18} />
                                    </span>
                                )}

                                {selectedChat && (
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 shadow-xs">
                                        {isChannel ? <Hash size={17} /> : isDoctor ? <Stethoscope size={17} /> : <MessageSquare size={17} />}
                                    </span>
                                )}

                                <div className="min-w-0">
                                    <span className="block truncate text-sm font-black leading-tight">
                                        {selectedChat ? threadTitle : t('chat.bubbleTitle', 'Live Chat')}
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] font-bold text-cyan-200/90">
                                        {isDM && (
                                            <Circle
                                                size={7}
                                                className={activeMeta?.isOnline ? 'fill-emerald-400 text-emerald-400' : 'fill-slate-400 text-slate-400'}
                                            />
                                        )}
                                        <span className="truncate">
                                            {selectedChat ? threadSubtitle : t('chat.newMessages', 'New messages')}
                                        </span>
                                    </span>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => { setOpen(false); navigate('/communications'); }}
                                    title={t('chat.openFullCenter', 'Open the full communication center')}
                                    className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                >
                                    <Maximize2 size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    title={t('chat.bubbleClose', 'Close chat')}
                                    className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {!selectedChat ? (
                        <>
                            {/* Segmented Category Tabs */}
                            <div className="p-2.5 pb-1">
                                <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-slate-800/80 dark:bg-slate-900/80">
                                    {sectionTabs.map(tab => {
                                        const Icon = tab.icon;
                                        const active = section === tab.key;
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={() => setSection(tab.key)}
                                                className={`relative flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-all duration-200 ${
                                                    active
                                                        ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-xs'
                                                        : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                                                }`}
                                            >
                                                <Icon size={14} />
                                                <span>{tab.label}</span>
                                                {tab.count > 0 && (
                                                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8.5px] font-black text-white shadow-xs">
                                                        {tab.count}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Search Filter Bar */}
                            <div className="px-2.5 pb-2">
                                <div className="relative flex items-center rounded-xl border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 text-xs text-slate-700 transition-colors focus-within:border-teal-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus-within:border-teal-400">
                                    <Search size={14} className="shrink-0 text-slate-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder={t('chat.searchPlaceholder', 'Search chats, users, MRNs...')}
                                        className="w-full bg-transparent px-2 font-medium outline-hidden placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Conversation List */}
                            <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
                                {renderList()}
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Message Thread */}
                            <div className="flex-1 overflow-y-auto bg-slate-50/70 p-3 dark:bg-[#07101d] scrollbar-thin">
                                {activeMessages.length === 0 ? (
                                    <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                                        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-teal-400 dark:ring-slate-800">
                                            <MessageCircle size={26} />
                                        </span>
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                                            {t('chat.emptyThread', 'No messages yet. Say hello!')}
                                        </p>
                                        <p className="mt-1 text-[10.5px] font-semibold text-slate-400">
                                            {t('chat.composePlaceholder', 'Type a message...')}
                                        </p>
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
                                        ? 'bg-gradient-to-br from-purple-600 to-violet-700 text-white'
                                        : isPatient
                                            ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white'
                                            : 'bg-gradient-to-br from-indigo-600 to-blue-700 text-white';

                                    return (
                                        <React.Fragment key={msg.message_id || i}>
                                            {showDayDivider && (
                                                <div className="flex items-center justify-center py-2.5">
                                                    <span className="rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-slate-500 shadow-2xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                                                        {formatDay(msg.created_at)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex w-full items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} ${groupStart ? 'mt-3' : 'mt-1'}`}>
                                                {!isMe && (
                                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[9px] font-black uppercase shadow-2xs ${groupStart ? avatarTone : 'opacity-0'}`}>
                                                        {initials(senderName)}
                                                    </span>
                                                )}
                                                <div className={`flex max-w-[85%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    {groupStart && !isMe && (
                                                        <span className="mb-1 px-1 text-[10px] font-black text-slate-600 dark:text-slate-300">
                                                            {senderName}
                                                        </span>
                                                    )}
                                                    <div className={`px-3 py-2 text-xs font-semibold leading-relaxed shadow-xs rounded-2xl ${
                                                        isMe
                                                            ? 'bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-700 text-white shadow-teal-950/20 border border-teal-500/30 rounded-ee-xs'
                                                            : 'bg-white text-slate-900 border border-slate-200/90 shadow-2xs dark:bg-[#0d1829] dark:text-slate-100 dark:border-slate-800/90 rounded-es-xs'
                                                    }`}>
                                                        <div dir="auto" className="text-start">
                                                            <ChatMessageContent message={msg} displayBody={getLocalizedSeedMessage(msg.body, t)} isMe={isMe} compact t={t} />
                                                        </div>
                                                        <div className={`mt-1 flex items-center gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                            <span className={`text-[9px] font-bold ${isMe ? 'text-teal-100/90' : 'text-slate-400'}`} dir="ltr">
                                                                {formatTime(msg.created_at)}
                                                            </span>
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

                            {/* Composer or Permission Lock */}
                            {isChannel && activeMeta?.can_post === false ? (
                                <div className="flex items-center justify-center gap-2 border-t border-purple-200 bg-purple-50/80 p-3 text-center text-xs font-bold text-purple-900 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300">
                                    <Lock size={14} className="shrink-0" />
                                    <span>{t('chat.postingRestrictedShort', 'Posting in this channel is restricted to channel admins')}</span>
                                </div>
                            ) : (
                                <form onSubmit={handleSend} className="border-t border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-[#07101d]">
                                    <PendingAttachmentPreview files={pendingFiles} onRemove={removePendingFile} t={t} />

                                    {showEmojiPicker && (
                                        <div className="mb-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2.5 shadow-md dark:border-slate-800 dark:bg-[#0a1220] animate-in fade-in-50 duration-150">
                                            {EMOJI_OPTIONS.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => insertEmoji(emoji)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition hover:bg-white hover:scale-110 active:scale-95 dark:hover:bg-white/10"
                                                    aria-label={t('chat.insertEmoji', 'Insert emoji')}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {showStickerPicker && (
                                        <div className="mb-2 grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2.5 shadow-md dark:border-slate-800 dark:bg-[#0a1220] animate-in fade-in-50 duration-150">
                                            {STICKER_OPTIONS.map(sticker => (
                                                <button
                                                    key={sticker.label}
                                                    type="button"
                                                    onClick={() => sendSticker(sticker)}
                                                    className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[9.5px] font-black transition-all hover:scale-105 active:scale-95 ${sticker.tone}`}
                                                >
                                                    <span className="text-2xl leading-none">{sticker.value}</span>
                                                    <span className="truncate">{sticker.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-1.5 rounded-2xl border border-slate-300/80 bg-slate-50/90 p-1.5 shadow-2xs transition-all focus-within:border-teal-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-slate-700/80 dark:bg-slate-900/90 dark:focus-within:border-teal-400 dark:focus-within:bg-slate-950">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            multiple
                                            accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
                                            onChange={handleFilesSelected}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            title={t('chat.attachFile', 'Attach file')}
                                            className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300"
                                        >
                                            <Paperclip size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowEmojiPicker(value => !value); setShowStickerPicker(false); }}
                                            title={t('chat.emoji', 'Emoji')}
                                            className={`inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl transition-all ${
                                                showEmojiPicker
                                                    ? 'bg-teal-600 text-white shadow-xs'
                                                    : 'text-slate-500 hover:bg-slate-200/60 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300'
                                            }`}
                                        >
                                            <SmilePlus size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowStickerPicker(value => !value); setShowEmojiPicker(false); }}
                                            title={t('chat.stickers', 'Stickers')}
                                            className={`inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl transition-all ${
                                                showStickerPicker
                                                    ? 'bg-teal-600 text-white shadow-xs'
                                                    : 'text-slate-500 hover:bg-slate-200/60 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300'
                                            }`}
                                        >
                                            <Sticker size={16} />
                                        </button>
                                        <input
                                            value={messageText}
                                            onChange={(e) => setMessageText(e.target.value)}
                                            dir="auto"
                                            placeholder={t('chat.composePlaceholder', 'Type a message...')}
                                            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-xs font-semibold text-slate-900 outline-none focus-visible:ring-1 focus-visible:ring-teal-500 focus-visible:ring-offset-1 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isSending || (!messageText.trim() && pendingFiles.length === 0)}
                                            className="inline-flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-xs transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                                        >
                                            {isSending ? (
                                                <Loader2 size={15} className="animate-spin" />
                                            ) : (
                                                <Send size={15} className="rtl:-scale-x-100" />
                                            )}
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
