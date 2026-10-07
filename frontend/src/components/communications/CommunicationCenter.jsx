import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { selectPreferences } from '../../store/preferencesSlice';

const ACCENT_GRADIENTS = {
    emerald: 'from-emerald-500 to-teal-600',
    cyan: 'from-cyan-500 to-blue-600',
    indigo: 'from-indigo-500 to-violet-600',
    rose: 'from-rose-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
    slate: 'from-slate-600 to-slate-700',
    custom: 'from-teal-500 to-cyan-600'
};

const ACCENT_BADGES = {
    emerald: 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    cyan: 'bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
    indigo: 'bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    rose: 'bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    amber: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    slate: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    custom: 'bg-teal-100 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
};

const ACCENT_TEXT = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
    slate: 'text-slate-600 dark:text-slate-400',
    custom: 'text-teal-600 dark:text-teal-400'
};

const ACCENT_RING = {
    emerald: 'ring-emerald-500/15',
    cyan: 'ring-cyan-500/15',
    indigo: 'ring-indigo-500/15',
    rose: 'ring-rose-500/15',
    amber: 'ring-amber-500/15',
    slate: 'ring-slate-500/15',
    custom: 'ring-teal-500/15'
};

const getAccentGradient = (primaryColor) => ACCENT_GRADIENTS[primaryColor] || ACCENT_GRADIENTS.emerald;
const getAccentBadge = (primaryColor) => ACCENT_BADGES[primaryColor] || ACCENT_BADGES.emerald;
const getAccentText = (primaryColor) => ACCENT_TEXT[primaryColor] || ACCENT_TEXT.emerald;
const getAccentRing = (primaryColor) => ACCENT_RING[primaryColor] || ACCENT_RING.emerald;
import { useNavigate } from 'react-router-dom';
import {
    Search,
    MessageSquare,
    Users,
    Stethoscope,
    Send,
    User,
    Hash,
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
    RefreshCw,
    Inbox,
    Award,
    Building2,
    Volume2,
    VolumeX,
    Download,
    Printer,
    Radio,
    CornerDownLeft,
    Share2,
    CheckCircle2,
    Plus,
    Trash2,
    Layers,
    Palette,
    Edit3,
    Lock,
    Globe,
    UserPlus,
    UserMinus,
    ShieldAlert,
    Megaphone,
    UserCheck,
    Settings,
    LogOut,
    ShieldCheck,
    AlertTriangle,
    FileText,
    Flame
} from 'lucide-react';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../../store/authSlice';
import {
    useGetChatUsersQuery,
    useGetChatMessagesQuery,
    useLazyGetChatMessagesQuery,
    useSendChatMessageMutation,
    useGetChatChannelsQuery,
    useCreateChatChannelMutation,
    useUpdateChatChannelMutation,
    useDeleteChatChannelMutation,
    useGetChannelMembersQuery,
    useAddChannelMembersMutation,
    useRemoveChannelMemberMutation,
    useUpdateChannelMemberRoleMutation,
    useGetPatientConversationsQuery,
    useGetPatientMessageHistoryQuery,
    useLazyGetPatientMessageHistoryQuery,
    useSendPatientReplyMutation,
    useGetDoctorConversationsQuery,
    useGetDoctorMessageHistoryQuery,
    useLazyGetDoctorMessageHistoryQuery,
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
import ConfirmDialog from '../ui/ConfirmDialog';
import TextPromptDialog from '../ui/TextPromptDialog';

const MESSAGE_HISTORY_PAGE_SIZE = 150;
import {
    getLocalizedChannelDescription,
    getLocalizedChannelName,
    getLocalizedSeedMessage,
    getLocalizedStaffRole
} from './chatLocalization';
import { getLocalizedDemoUserName } from '../../utils/localizedDemoData';
import { playHospitalChime } from '../../utils/audioChime';

const COLOR_PRESETS = [
    { labelKey: 'chat.colorAccent', defaultLabel: 'Theme Accent', value: 'from-[var(--VIARA-accent)] to-[var(--VIARA-accent-dark)]', preview: 'bg-gradient-to-r from-teal-500 to-cyan-600' },
    { labelKey: 'chat.colorBlueIndigo', defaultLabel: 'Blue & Indigo', value: 'from-blue-500 to-indigo-600', preview: 'bg-gradient-to-r from-blue-500 to-indigo-600' },
    { labelKey: 'chat.colorPurpleViolet', defaultLabel: 'Purple & Violet', value: 'from-purple-500 to-violet-600', preview: 'bg-gradient-to-r from-purple-500 to-violet-600' },
    { labelKey: 'chat.colorEmeraldGreen', defaultLabel: 'Emerald & Green', value: 'from-emerald-500 to-green-600', preview: 'bg-gradient-to-r from-emerald-500 to-green-600' },
    { labelKey: 'chat.colorAmberOrange', defaultLabel: 'Amber & Orange', value: 'from-amber-500 to-orange-600', preview: 'bg-gradient-to-r from-amber-500 to-orange-600' },
    { labelKey: 'chat.colorRosePink', defaultLabel: 'Rose & Pink', value: 'from-rose-500 to-pink-600', preview: 'bg-gradient-to-r from-rose-500 to-pink-600' }
];

const ALL_STAFF_ROLES = [
    { key: 'Admin' },
    { key: 'Radiologist' },
    { key: 'Technician' },
    { key: 'Receptionist' },
    { key: 'Doctor' },
    { key: 'Nurse' },
    { key: 'Accountant' },
    { key: 'Marketing' }
];

const QUICK_REPLIES = [
    { key: 'chat.quickGreeting', fallback: 'Hello! How can we assist you today?', tone: 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-600 hover:text-white dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300' },
    { key: 'chat.quickReportReady', fallback: 'Your report has been finalized and is now available in your portal.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-600 hover:text-white dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
    { key: 'chat.quickReplyConfirm', fallback: 'Your appointment is confirmed. Please arrive 15 minutes early.', tone: 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-600 hover:text-white dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300' },
    { key: 'chat.quickReplyPrep', fallback: 'Please fast for 6 hours prior to your scan and hydrate well.', tone: 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-600 hover:text-white dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300' },
    { key: 'chat.quickReferral', fallback: 'Please bring your original physician referral form with you on your visit.', tone: 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-600 hover:text-white dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300' },
    { key: 'chat.quickBillingSettled', fallback: 'The billing invoice is settled. Thank you for your payment.', tone: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-600 hover:text-white dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300' }
];

const getRoleTheme = (role, primaryColor = 'emerald') => {
    const r = (role || '').toLowerCase();
    if (r.includes('doctor') || r.includes('radiologist')) {
        return {
            gradient: 'from-violet-600 to-purple-600',
            badge: 'bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
            accent: 'text-purple-600 dark:text-purple-400',
            activeCard: 'bg-purple-50/90 text-purple-950 border-purple-200 dark:bg-purple-950/40 dark:text-purple-100 dark:border-purple-800/80 ring-2 ring-purple-500/15'
        };
    }
    if (r.includes('tech') || r.includes('nurse')) {
        return {
            gradient: 'from-sky-500 to-cyan-600',
            badge: 'bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
            accent: 'text-sky-600 dark:text-sky-400',
            activeCard: 'bg-sky-50/90 text-sky-950 border-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-800/80 ring-2 ring-sky-500/15'
        };
    }
    if (r.includes('admin') || r.includes('super') || r.includes('director')) {
        return {
            gradient: 'from-amber-500 to-orange-600',
            badge: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
            accent: 'text-amber-600 dark:text-amber-400',
            activeCard: 'bg-amber-50/90 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800/80 ring-2 ring-amber-500/15'
        };
    }
    return {
        gradient: getAccentGradient(primaryColor),
        badge: getAccentBadge(primaryColor),
        accent: getAccentText(primaryColor),
        activeCard: `bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] border-[rgba(var(--VIARA-accent-rgb),.2)] dark:bg-[rgba(var(--VIARA-accent-rgb),.15)] dark:text-[var(--VIARA-accent-text)] dark:border-[rgba(var(--VIARA-accent-rgb),.3)] ring-2 ${getAccentRing(primaryColor)}`
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

// Play a pleasant synthesizer chime sound using Web Audio API
const playNotificationSound = () => {
    try {
        playHospitalChime('call');
    } catch (_) {
        // Audio is optional and can be blocked by browser autoplay policies.
    }
};

const EmptyListState = ({ icon: Icon = Inbox, title, description, actionLabel, onAction, accentGradient = 'from-teal-500/15 to-cyan-500/15', accentIconColor = 'text-teal-600 dark:text-teal-400' }) => (
    <div className="m-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/30">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accentGradient} shadow-sm ring-1 ring-inset ${accentIconColor}`}>
            <Icon size={22} />
        </div>
        <p className="mt-3 text-xs font-black text-slate-800 dark:text-slate-200">{title}</p>
        {description && <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-400">{description}</p>}
        {actionLabel && (
            <button
                type="button"
                onClick={onAction}
                className={`mt-3.5 inline-flex items-center justify-center rounded-xl bg-gradient-to-r ${accentGradient.replace('/15', '/600').replace('/15', '/600')} px-3.5 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:brightness-110 active:scale-95`}
            >
                {actionLabel}
            </button>
        )}
    </div>
);

export default function CommunicationCenter() {
    const { t, i18n } = useTranslation(['system', 'common']);
    const preferences = useSelector(selectPreferences);
    const primaryColor = preferences?.primaryColor || 'emerald';

    const accentGradient = getAccentGradient(primaryColor);
    const accentBadge = getAccentBadge(primaryColor);
    const accentText = getAccentText(primaryColor);
    const accentRing = getAccentRing(primaryColor);

    const formatDay = (timestamp) => {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return t('chat.today', { defaultValue: 'Today' });
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return t('chat.yesterday', { defaultValue: 'Yesterday' });
        return d.toLocaleDateString(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const isRtl = i18n.dir() === 'rtl';
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const currentUserId = currentUser?.id || currentUser?.user_id || currentUser?.userId;
    const canAccessExternalInbox = ['Admin', 'Receptionist', 'Developer'].includes(currentUser?.role);

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
    const [selectedChat, setSelectedChat] = useState({ type: 'channel', id: null });
    const [olderMessages, setOlderMessages] = useState([]);
    const [olderHistoryHasMore, setOlderHistoryHasMore] = useState(null);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [pendingFiles, setPendingFiles] = useState([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inChatSearch, setInChatSearch] = useState('');
    const [showInChatSearch, setShowInChatSearch] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        return localStorage.getItem('viara_chat_sound') !== 'false';
    });
    const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'online'
    const [showContextPanel, setShowContextPanel] = useState(true);
    const [mobileShowChat, setMobileShowChat] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isStatPriority, setIsStatPriority] = useState(false);

    const messageEndRef = useRef(null);
    const historyLoadSequenceRef = useRef(0);
    const fileInputRef = useRef(null);

    // Toggle Sound alert
    const toggleSound = () => {
        setSoundEnabled(prev => {
            const next = !prev;
            localStorage.setItem('viara_chat_sound', String(next));
            if (next) playNotificationSound();
            toast.success(next ? t('chat.soundEnabled', { defaultValue: 'Sound alerts enabled' }) : t('chat.soundDisabled', { defaultValue: 'Sound alerts muted' }));
            return next;
        });
    };

    // Queries
    const { data: dbChannels = [], refetch: refetchChannels, isFetching: isChannelsFetching } = useGetChatChannelsQuery(undefined, { pollingInterval: 12000 });
    const { data: staffUsers = [], refetch: refetchStaff, isFetching: isStaffFetching } = useGetChatUsersQuery(undefined, { pollingInterval: 10000 });
    const { data: patientConversations = [], refetch: refetchPatients, isFetching: isPatientsFetching } = useGetPatientConversationsQuery(undefined, { skip: !canAccessExternalInbox, pollingInterval: 30000 });
    const { data: doctorConversations = [], refetch: refetchDoctors, isFetching: isDoctorsFetching } = useGetDoctorConversationsQuery(undefined, { skip: !canAccessExternalInbox, pollingInterval: 30000 });

    const channels = dbChannels;
    const selectedChannel = channels.find(channel =>
        String(channel.channel_id || channel.id) === String(selectedChat.id)
    );

    useEffect(() => {
        if (isChannelsFetching || selectedChat.type !== 'channel' || selectedChannel) return;
        const firstChannel = channels.find(channel => channel.channel_id || channel.id);
        if (!firstChannel) return;

        const channelId = firstChannel.channel_id || firstChannel.id;
        setSelectedChat(current => {
            if (current.type !== 'channel' || channels.some(channel =>
                String(channel.channel_id || channel.id) === String(current.id)
            )) return current;
            return { type: 'channel', id: channelId };
        });
    }, [channels, isChannelsFetching, selectedChat.id, selectedChat.type, selectedChannel]);

    const isGlobalFetching = isChannelsFetching || isStaffFetching
        || (canAccessExternalInbox && (isPatientsFetching || isDoctorsFetching));

    // Channel Creation Modal State
    const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [newChannelDisplayName, setNewChannelDisplayName] = useState('');
    const [newChannelDesc, setNewChannelDesc] = useState('');
    const [newChannelColor, setNewChannelColor] = useState(COLOR_PRESETS[0].value);
    const [newChannelIsPrivate, setNewChannelIsPrivate] = useState(false);
    const [newChannelPostPermission, setNewChannelPostPermission] = useState('all_members');
    const [newChannelAllowedRoles, setNewChannelAllowedRoles] = useState([]);
    const [newChannelInitialMembers, setNewChannelInitialMembers] = useState([]);

    // Channel Edit Modal State
    const [showEditChannelModal, setShowEditChannelModal] = useState(false);
    const [editChannelId, setEditChannelId] = useState('');
    const [editDisplayName, setEditDisplayName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editColor, setEditColor] = useState(COLOR_PRESETS[0].value);
    const [editIsPrivate, setEditIsPrivate] = useState(false);
    const [editPostPermission, setEditPostPermission] = useState('all_members');
    const [editAllowedRoles, setEditAllowedRoles] = useState([]);

    // Channel Members Modal State
    const [showMembersModal, setShowMembersModal] = useState(false);
    const [managingChannelId, setManagingChannelId] = useState(null);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('member');
    const [removeMemberTarget, setRemoveMemberTarget] = useState(null);
    const [deleteChannelTarget, setDeleteChannelTarget] = useState(null);
    const [showCaseRefPrompt, setShowCaseRefPrompt] = useState(false);

    // Channel Mutations
    const [createChatChannel, { isLoading: isCreatingChannel }] = useCreateChatChannelMutation();
    const [updateChatChannel, { isLoading: isUpdatingChannel }] = useUpdateChatChannelMutation();
    const [deleteChatChannel, { isLoading: isDeletingChannel }] = useDeleteChatChannelMutation();
    const [addChannelMembers, { isLoading: isAddingMembers }] = useAddChannelMembersMutation();
    const [removeChannelMember, { isLoading: isRemovingMember }] = useRemoveChannelMemberMutation();
    const [updateChannelMemberRole, { isLoading: isUpdatingMemberRole }] = useUpdateChannelMemberRoleMutation();

    // Query members for the managing channel
    const { data: channelMembers = [] } = useGetChannelMembersQuery(
        managingChannelId,
        { skip: !showMembersModal || !managingChannelId }
    );

    const handleCreateChannel = async (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (!newChannelName.trim()) {
            toast.error(t('chat.channelNameRequired', { defaultValue: 'Channel name is required' }));
            return;
        }
        try {
            const created = await createChatChannel({
                name: newChannelName.trim(),
                displayName: newChannelDisplayName.trim() || newChannelName.trim(),
                description: newChannelDesc.trim(),
                iconColor: newChannelColor,
                isPrivate: newChannelIsPrivate,
                postPermission: newChannelPostPermission,
                allowedRoles: newChannelAllowedRoles,
                initialMemberIds: newChannelInitialMembers
            }).unwrap();
            toast.success(t('chat.channelCreated', { defaultValue: 'Channel created successfully' }));
            setShowCreateChannelModal(false);
            setNewChannelName('');
            setNewChannelDisplayName('');
            setNewChannelDesc('');
            setNewChannelIsPrivate(false);
            setNewChannelPostPermission('all_members');
            setNewChannelAllowedRoles([]);
            setNewChannelInitialMembers([]);
            openChat({ type: 'channel', id: created.channel_id });
        } catch (err) {
            toast.error(err?.data?.message || err?.data?.error || t('chat.channelCreateFailed', { defaultValue: 'Failed to create channel' }));
        }
    };

    const handleOpenEditChannel = (channel) => {
        setEditChannelId(channel.channel_id || channel.id);
        setEditDisplayName(channel.display_name || channel.name || '');
        setEditDesc(channel.description || '');
        setEditColor(channel.icon_color || channel.iconColor || COLOR_PRESETS[0].value);
        setEditIsPrivate(Boolean(channel.is_private));
        setEditPostPermission(channel.post_permission || 'all_members');
        setEditAllowedRoles(Array.isArray(channel.allowed_roles) ? channel.allowed_roles : []);
        setShowEditChannelModal(true);
    };

    const handleUpdateChannel = async (e) => {
        if (e?.preventDefault) e.preventDefault();
        try {
            await updateChatChannel({
                channelId: editChannelId,
                displayName: editDisplayName.trim(),
                description: editDesc.trim(),
                iconColor: editColor,
                isPrivate: editIsPrivate,
                postPermission: editPostPermission,
                allowedRoles: editAllowedRoles
            }).unwrap();
            toast.success(t('chat.channelUpdated', { defaultValue: 'Channel updated successfully' }));
            setShowEditChannelModal(false);
        } catch (err) {
            toast.error(err?.data?.message || t('chat.updateFailed', { defaultValue: 'Failed to update channel' }));
        }
    };

    const handleOpenMembersModal = (channelId) => {
        setManagingChannelId(channelId);
        setSelectedUserToAdd('');
        setSelectedRoleToAdd('member');
        setShowMembersModal(true);
    };

    const handleAddMember = async (e) => {
        if (e?.preventDefault) e.preventDefault();
        if (!selectedUserToAdd) return;
        try {
            await addChannelMembers({
                channelId: managingChannelId,
                userIds: [selectedUserToAdd],
                channelRole: selectedRoleToAdd
            }).unwrap();
            toast.success(t('chat.memberAdded', { defaultValue: 'Member added to channel' }));
            setSelectedUserToAdd('');
        } catch (err) {
            toast.error(err?.data?.message || t('chat.addMemberFailed', { defaultValue: 'Failed to add member' }));
        }
    };

    const handleRemoveMember = (userId, isSelf = false) => {
        setRemoveMemberTarget({ userId, isSelf });
    };

    const confirmRemoveMember = async () => {
        if (!removeMemberTarget) return;
        const { userId, isSelf } = removeMemberTarget;
        try {
            await removeChannelMember({ channelId: managingChannelId, userId }).unwrap();
            toast.success(isSelf ? t('chat.leftChannel', { defaultValue: 'You left the channel' }) : t('chat.memberRemoved', { defaultValue: 'Member removed' }));
            if (isSelf) {
                setShowMembersModal(false);
                if (selectedChat.id === managingChannelId) {
                    setSelectedChat({ type: 'channel', id: 'general' });
                }
            }
            setRemoveMemberTarget(null);
        } catch (err) {
            toast.error(err?.data?.message || t('chat.removeMemberFailed', { defaultValue: 'Failed to remove member' }));
        }
    };

    const handleUpdateMemberRole = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'member' : 'admin';
        try {
            await updateChannelMemberRole({
                channelId: managingChannelId,
                userId,
                channelRole: newRole
            }).unwrap();
            const localizedRole = newRole === 'admin'
                ? t('chat.roleAdmin', { defaultValue: 'Admin' })
                : t('chat.roleMember', { defaultValue: 'Member' });
            toast.success(t('chat.roleUpdated', {
                role: localizedRole,
                defaultValue: `Member role updated to ${localizedRole}`
            }));
        } catch (err) {
            toast.error(err?.data?.message || t('chat.updateRoleFailed', { defaultValue: 'Failed to update member role' }));
        }
    };

    const handleDeleteChannel = (channelId, e) => {
        if (e?.stopPropagation) e.stopPropagation();
        setDeleteChannelTarget(channelId);
    };

    const confirmDeleteChannel = async () => {
        if (!deleteChannelTarget) return;
        try {
            await deleteChatChannel(deleteChannelTarget).unwrap();
            toast.success(t('chat.channelDeleted', { defaultValue: 'Channel deleted' }));
            if (selectedChat.type === 'channel' && selectedChat.id === deleteChannelTarget) {
                setSelectedChat({ type: 'channel', id: 'general' });
            }
            setDeleteChannelTarget(null);
        } catch (err) {
            toast.error(err?.data?.message || t('chat.deleteFailed', { defaultValue: 'Failed to delete channel' }));
        }
    };

    // Category-wise Unread Totals
    const staffUnreadSum = useMemo(() => staffUsers.reduce((sum, u) => sum + (u.unread_count || 0), 0), [staffUsers]);
    const patientUnreadSum = useMemo(() => patientConversations.reduce((sum, p) => sum + (p.unread_count || 0), 0), [patientConversations]);
    const doctorUnreadSum = useMemo(() => doctorConversations.reduce((sum, d) => sum + (d.unread_count || 0), 0), [doctorConversations]);
    const totalUnreadSum = staffUnreadSum + patientUnreadSum + doctorUnreadSum;

    // Conditional Queries for Messages
    const isChannel = selectedChat.type === 'channel';
    const isDM = selectedChat.type === 'dm';
    const isPatient = selectedChat.type === 'patient';
    const isDoctor = selectedChat.type === 'doctor';

    const { data: chatMessages = [], refetch: refetchChatMsgs } = useGetChatMessagesQuery(
        isChannel ? { channelName: selectedChannel?.channel_id || selectedChannel?.id } : isDM ? { recipientId: selectedChat.id } : null,
        { skip: (!isChannel && !isDM) || (isChannel && !selectedChannel), pollingInterval: 4000 }
    );

    const { data: patientMessages = [], refetch: refetchPatientMsgs } = useGetPatientMessageHistoryQuery(
        selectedChat.id,
        { skip: !canAccessExternalInbox || !isPatient, pollingInterval: 30000 }
    );

    const { data: doctorMessages = [], refetch: refetchDoctorMsgs } = useGetDoctorMessageHistoryQuery(
        selectedChat.id,
        { skip: !canAccessExternalInbox || !isDoctor, pollingInterval: 30000 }
    );

    const [loadOlderChatMessages] = useLazyGetChatMessagesQuery();
    const [loadOlderPatientMessages] = useLazyGetPatientMessageHistoryQuery();
    const [loadOlderDoctorMessages] = useLazyGetDoctorMessageHistoryQuery();

    useEffect(() => {
        historyLoadSequenceRef.current += 1;
        setOlderMessages([]);
        setOlderHistoryHasMore(null);
        setIsLoadingOlder(false);
    }, [selectedChat.type, selectedChat.id]);

    const refreshAll = () => {
        refetchChannels();
        refetchStaff();
        if (canAccessExternalInbox) {
            refetchPatients();
            refetchDoctors();
        }
        if ((isChannel && selectedChannel) || isDM) refetchChatMsgs();
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
        if (isChannel) {
            const found = selectedChannel;
            if (found) {
                return {
                    channel_id: found.channel_id || found.id,
                    name: getLocalizedChannelName(found, t),
                    slug: found.name || found.channel_id,
                    description: getLocalizedChannelDescription(found, t),
                    iconColor: found.icon_color || found.iconColor || 'from-teal-500 to-cyan-600',
                    isSystem: found.is_system,
                    isPrivate: found.is_private,
                    postPermission: found.post_permission || 'all_members',
                    allowedRoles: found.allowed_roles || [],
                    memberCount: found.member_count || 0,
                    myRole: found.my_channel_role,
                    isMember: found.is_member,
                    canPost: found.can_post !== undefined ? found.can_post : true,
                    canEdit: found.can_edit,
                    canDelete: found.can_delete,
                    canManageMembers: found.can_manage_members
                };
            }
            return null;
        }
        if (isDM) return staffUsers.find(u => u.user_id === selectedChat.id);
        if (isPatient) return patientConversations.find(p => p.patient_id === selectedChat.id);
        if (isDoctor) return doctorConversations.find(d => d.doctor_id === selectedChat.id);
        return null;
    }, [selectedChat, selectedChannel, isChannel, isDM, isPatient, isDoctor, staffUsers, patientConversations, doctorConversations, t]);

    const isPostingAllowed = useMemo(() => {
        if (!isChannel) return true;
        if (!activeChatMeta) return false;
        return activeChatMeta.canPost !== false;
    }, [isChannel, activeChatMeta]);

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
    const latestActiveMessages = useMemo(() => {
        let msgs = [];
        if (isChannel || isDM) msgs = [...chatMessages];
        else if (isPatient) msgs = [...patientMessages];
        else if (isDoctor) msgs = [...doctorMessages];

        return msgs.sort((a, b) => getTimeValue(a.created_at) - getTimeValue(b.created_at));
    }, [isChannel, isDM, isPatient, isDoctor, chatMessages, patientMessages, doctorMessages]);

    const rawActiveMessages = useMemo(() => {
        const uniqueMessages = new Map();
        [...olderMessages, ...latestActiveMessages].forEach(message => {
            uniqueMessages.set(String(message.message_id), message);
        });
        return [...uniqueMessages.values()].sort((a, b) => getTimeValue(a.created_at) - getTimeValue(b.created_at));
    }, [olderMessages, latestActiveMessages]);
    const canLoadOlderMessages = olderHistoryHasMore ?? latestActiveMessages.length === MESSAGE_HISTORY_PAGE_SIZE;
    const newestMessageId = latestActiveMessages[latestActiveMessages.length - 1]?.message_id;

    const handleLoadOlderMessages = async () => {
        const before = rawActiveMessages[0]?.message_id;
        if (!before || isLoadingOlder) return;

        const requestSequence = historyLoadSequenceRef.current;
        setIsLoadingOlder(true);
        try {
            let olderPage;
            if (isPatient) {
                olderPage = await loadOlderPatientMessages({ patientId: selectedChat.id, before }).unwrap();
            } else if (isDoctor) {
                olderPage = await loadOlderDoctorMessages({ doctorId: selectedChat.id, before }).unwrap();
            } else {
                const conversation = isChannel
                    ? { channelName: selectedChat.id }
                    : { recipientId: selectedChat.id };
                olderPage = await loadOlderChatMessages({ ...conversation, before }).unwrap();
            }

            if (requestSequence !== historyLoadSequenceRef.current) return;
            const existingIds = new Set(rawActiveMessages.map(message => String(message.message_id)));
            const uniqueOlderMessages = olderPage.filter(message => !existingIds.has(String(message.message_id)));
            setOlderMessages(current => [...uniqueOlderMessages, ...current]);
            setOlderHistoryHasMore(olderPage.length === MESSAGE_HISTORY_PAGE_SIZE);
        } catch (error) {
            toast.error(error?.data?.message || t('chat.historyLoadFailed', { defaultValue: 'Could not load earlier messages' }));
        } finally {
            if (requestSequence === historyLoadSequenceRef.current) setIsLoadingOlder(false);
        }
    };

    // Filter messages inside thread if inChatSearch is typed
    const activeMessages = useMemo(() => {
        if (!inChatSearch.trim()) return rawActiveMessages;
        const query = inChatSearch.toLowerCase().trim();
        return rawActiveMessages.filter(msg =>
            msg.body?.toLowerCase().includes(query) ||
            msg.sender_name?.toLowerCase().includes(query) ||
            msg.staff_name?.toLowerCase().includes(query)
        );
    }, [rawActiveMessages, inChatSearch]);

    const hasContext = (isPatient && patientDetails) || (isDoctor && doctorDetails) || (isDM && activeChatMeta);

    // Auto scroll to bottom on new message
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [newestMessageId]);

    // SSE Realtime event sync
    useEffect(() => {
        const handleMsgAlert = () => {
            if (soundEnabled) playNotificationSound();
            refetchChannels();
            refetchStaff();
            if (canAccessExternalInbox) {
                refetchPatients();
                refetchDoctors();
            }
            if ((isChannel && selectedChannel) || isDM) refetchChatMsgs();
            if (isPatient) refetchPatientMsgs();
            if (isDoctor) refetchDoctorMsgs();
        };

        window.addEventListener('SSE_REALTIME_MESSAGE', handleMsgAlert);
        return () => window.removeEventListener('SSE_REALTIME_MESSAGE', handleMsgAlert);
    }, [selectedChat, selectedChannel, isChannel, isDM, isPatient, isDoctor, soundEnabled, canAccessExternalInbox, refetchChannels, refetchStaff, refetchPatients, refetchDoctors, refetchChatMsgs, refetchPatientMsgs, refetchDoctorMsgs]);

    const openChat = (chat) => {
        setSelectedChat(chat);
        setInChatSearch('');
        setShowInChatSearch(false);
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

    const handleInsertCaseReference = () => {
        if (isPatient && (patientDetails?.patient_mrn || activeChatMeta?.patient_mrn)) {
            const mrn = patientDetails?.patient_mrn || activeChatMeta?.patient_mrn;
            setMessageText(prev => `${prev ? `${prev} ` : ''}[MRN: ${mrn}] `);
            return;
        }
        setShowCaseRefPrompt(true);
    };

    const confirmInsertCaseReference = (caseInput) => {
        if (caseInput && caseInput.trim()) {
            setMessageText(prev => `${prev ? `${prev} ` : ''}[Case: ${caseInput.trim()}] `);
        }
        setShowCaseRefPrompt(false);
    };

    const handleSendMessage = async (e, directText = null) => {
        if (e?.preventDefault) e.preventDefault();
        const rawText = (directText !== null ? directText : messageText).trim();
        const textToSend = isStatPriority && rawText ? `🚨 [STAT] ${rawText}` : rawText;
        if (!textToSend && pendingFiles.length === 0) return;

        try {
            if (isChannel) {
                const formData = createChatFormData({
                    body: textToSend,
                    channelName: selectedChat.id,
                    channel_name: selectedChat.id,
                    attachments: pendingFiles
                });
                await sendChatMessage(formData).unwrap();
            } else if (isDM) {
                const formData = createChatFormData({
                    body: textToSend,
                    recipientId: selectedChat.id,
                    recipient_id: selectedChat.id,
                    attachments: pendingFiles
                });
                await sendChatMessage(formData).unwrap();
            } else if (isPatient) {
                const payload = pendingFiles.length > 0
                    ? createChatFormData({ body: textToSend, attachments: pendingFiles })
                    : { body: textToSend };
                await sendPatientReply({
                    patientId: selectedChat.id,
                    data: pendingFiles.length > 0 ? payload : undefined,
                    body: textToSend
                }).unwrap();
            } else if (isDoctor) {
                const payload = pendingFiles.length > 0
                    ? createChatFormData({ body: textToSend, attachments: pendingFiles })
                    : { body: textToSend };
                await sendDoctorReply({
                    doctorId: selectedChat.id,
                    data: pendingFiles.length > 0 ? payload : undefined,
                    body: textToSend
                }).unwrap();
            }

            setMessageText('');
            setPendingFiles([]);
            setIsStatPriority(false);
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

    // Export active chat thread as a readable transcript
    const exportTranscript = () => {
        if (rawActiveMessages.length === 0) {
            toast.error(t('chat.emptyThread', { defaultValue: 'No messages to export' }));
            return;
        }

        const lines = [
            `VIARA RADIOLOGY CENTER - COMMUNICATION TRANSCRIPT`,
            `==================================================`,
            `Thread: ${headerTitle}`,
            `Generated At: ${new Date().toLocaleString()}`,
            `Total Messages: ${rawActiveMessages.length}`,
            `==================================================\n`
        ];

        rawActiveMessages.forEach(msg => {
            const time = msg.created_at ? new Date(msg.created_at).toLocaleString() : '';
            const sender = msg.sender_name || msg.staff_name || (msg.sender_role === 'Staff' ? 'Staff' : 'User');
            lines.push(`[${time}] ${sender}:`);
            if (msg.body) lines.push(`  ${msg.body}`);
            if (msg.attachments && msg.attachments.length) {
                lines.push(`  [Attachments: ${msg.attachments.length} file(s)]`);
            }
            lines.push('');
        });

        const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-transcript-${selectedChat.id}-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(t('chat.exportTranscript', { defaultValue: 'Conversation transcript exported' }));
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

    const headerTitle = isChannel && activeChatMeta ? `# ${activeChatMeta.name}`
        : isDM ? getLocalizedDemoUserName(activeChatMeta?.full_name, t)
            : isPatient ? activeChatMeta?.patient_name
                : isDoctor ? activeChatMeta?.doctor_name
                    : t('chat.selectConversation', { defaultValue: 'Select a conversation' });

    const headerSubtitle = isChannel ? activeChatMeta?.description
        : isDM ? `${getLocalizedStaffRole(activeChatMeta?.role, t)} · ${activeChatMeta?.isOnline ? t('chat.online', { defaultValue: 'Online' }) : t('chat.offline', { defaultValue: 'Offline' })}`
            : isPatient ? `${t('chat.mrn', { defaultValue: 'MRN' })}: ${activeChatMeta?.patient_mrn || '-'}`
                : isDoctor ? `${t('chat.referringDoctor', { defaultValue: 'Referring Doctor' })} · ${activeChatMeta?.doctor_clinic || ''}`
                    : '';

    const activeRoleTheme = useMemo(() => {
        if (isDM && activeChatMeta) return getRoleTheme(activeChatMeta.role, primaryColor);
        if (isDoctor) return getRoleTheme('doctor', primaryColor);
        if (isPatient) return getRoleTheme('patient', primaryColor);
        return getRoleTheme('staff', primaryColor);
    }, [isDM, activeChatMeta, isDoctor, isPatient, primaryColor]);

    return (
        <div className="communication-center h-[calc(100dvh-4.6rem)] text-slate-950 dark:text-slate-100" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Main Chat Hub Container - Full Viewport Height */}
            <div className="communication-center__shell flex h-full w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-900/[0.04] ring-1 ring-white dark:border-slate-800 dark:bg-[#070e1a] dark:ring-slate-900 sm:rounded-3xl">

                {/* ─── LEFT/RIGHT SIDEBAR PANEL: Navigation & Chats List ────────────────────────── */}
                <div className={`communication-center__inbox ${mobileShowChat ? 'hidden' : 'flex'} lg:flex w-full lg:w-[21rem] xl:w-[23rem] shrink-0 flex-col border-e border-slate-200/80 bg-slate-50/90 dark:border-slate-800 dark:bg-[#091222]`}>

                    {/* Top Hub Brand Deck & Quick Controls */}
                    <div className="communication-center__inbox-header border-b border-slate-200/80 bg-white p-4 pb-3 dark:border-slate-800 dark:bg-[#08101e]">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="communication-center__brand-icon flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm shadow-teal-900/15 dark:bg-teal-500">
                                    <MessageSquare size={19} />
                                </div>
                                <div>
                                    <h1 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                                        {isRtl ? 'مركز التواصل والمحادثات' : 'Communication Hub'}
                                    </h1>
                                    <div className="mt-0.5 flex items-center gap-1.5">
                                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                            {isRtl ? 'مباشر ولحظي' : 'Live Sync'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Audio & Refresh Toolbar */}
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={toggleSound}
                                    className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${soundEnabled
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-2xs dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                        : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                                        }`}
                                    title={soundEnabled ? t('chat.soundEnabled', { defaultValue: 'Sound alerts enabled' }) : t('chat.soundDisabled', { defaultValue: 'Sound alerts muted' })}
                                >
                                    {soundEnabled ? <Volume2 size={14} className="text-emerald-600 dark:text-emerald-400" /> : <VolumeX size={14} />}
                                </button>

                                <button
                                    type="button"
                                    onClick={refreshAll}
                                    disabled={isGlobalFetching}
                                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                    title={t('chat.refresh', { defaultValue: 'Refresh' })}
                                >
                                    <RefreshCw size={13} className={isGlobalFetching ? 'animate-spin text-teal-600 dark:text-teal-400' : ''} />
                                </button>
                            </div>
                        </div>

                        {/* Search Input Field */}
                        <div className="relative">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                placeholder={t('chat.searchPlaceholder', { defaultValue: 'Search chats, users, MRNs...' })}
                                aria-label={t('chat.searchPlaceholder', { defaultValue: 'Search chats, users, MRNs...' })}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 ps-9 pe-8 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-200 dark:focus:bg-slate-950"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Filter Status Quick Chips */}
                        <div className="mt-2.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {t('chat.conversations', { defaultValue: 'Threads' })} ({totalUnreadSum > 0 ? `${totalUnreadSum} ${isRtl ? 'غير مقروء' : 'unread'}` : (isRtl ? 'الكل مقروء' : 'All read')})
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter(activeFilter === 'unread' ? 'all' : 'unread')}
                                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black transition ${activeFilter === 'unread'
                                        ? 'bg-rose-500 text-white shadow-2xs'
                                        : 'bg-slate-200/70 text-slate-600 hover:bg-rose-50 hover:text-rose-700 dark:bg-slate-800 dark:text-slate-400'
                                        }`}
                                >
                                    <Filter size={10} />
                                    <span>{t('chat.unread', { defaultValue: 'Unread' })}</span>
                                </button>
                                {activeSection === 'staff' && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveFilter(activeFilter === 'online' ? 'all' : 'online')}
                                        className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-black transition ${activeFilter === 'online'
                                            ? 'bg-emerald-600 text-white shadow-2xs'
                                            : 'bg-slate-200/70 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-400'
                                            }`}
                                    >
                                        <Circle size={6} className="fill-current" />
                                        <span>{t('chat.filterOnline', { defaultValue: 'Online' })}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Segmented Category Switcher Tabs */}
                    <div className={`communication-center__tabs grid ${canAccessExternalInbox ? 'grid-cols-3' : 'grid-cols-1'} gap-1 border-b border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-[#08101e]`} role="group" aria-label={t('chat.conversations', { defaultValue: 'Conversations' })}>
                        {[
                            {
                                key: 'staff',
                                icon: Users,
                                label: t('chat.tabStaff', { defaultValue: 'Team' }),
                                count: staffUnreadSum,
                            },
                            ...(canAccessExternalInbox ? [
                                {
                                    key: 'patient',
                                    icon: MessageSquare,
                                    label: t('chat.tabPatients', { defaultValue: 'Patients' }),
                                    count: patientUnreadSum,
                                },
                                {
                                    key: 'doctor',
                                    icon: Stethoscope,
                                    label: t('chat.tabDoctors', { defaultValue: 'Doctors' }),
                                    count: doctorUnreadSum,
                                }
                            ] : [])
                        ].map(({ key, icon: Icon, label, count }) => (
                            <button
                                type="button"
                                key={key}
                                onClick={() => { setActiveSection(key); setActiveFilter('all'); }}
                                aria-pressed={activeSection === key}
                                className={`communication-center__tab relative flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-[11px] font-bold transition-all duration-200 ${activeSection === key
                                    ? 'bg-teal-700 text-white shadow-sm shadow-teal-900/15 dark:bg-teal-600'
                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <div className="relative">
                                    <Icon size={16} />
                                    {count > 0 && (
                                        <span className={`absolute -top-2 -end-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-bold ${activeSection === key ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                            }`}>
                                            {count}
                                        </span>
                                    )}
                                </div>
                                <span className="truncate">{label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Chat Lists Viewport */}
                    <div className="communication-center__list flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        <div className="px-2.5 pb-1 pt-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {sectionTitle}
                        </div>

                        {/* STAFF VIEW */}
                        {activeSection === 'staff' && (
                            <>
                                {activeFilter === 'all' && (
                                    <>
                                        <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                {t('chat.channelsHeader', { defaultValue: 'Channels' })}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setShowCreateChannelModal(true)}
                                                className="flex items-center gap-1 rounded-xl px-2 py-0.5 text-[10px] font-black text-teal-700 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:text-teal-300 dark:hover:bg-teal-900/50 transition shadow-2xs"
                                                title={t('chat.createChannel', { defaultValue: 'Create Channel' })}
                                            >
                                                <Plus size={11} />
                                                <span>{t('chat.newChannel', { defaultValue: 'New Channel' })}</span>
                                            </button>
                                        </div>

                                        {channels.map(ch => {
                                            const chId = ch.channel_id || ch.id;
                                            const active = selectedChat.type === 'channel' && selectedChat.id === chId;
                                            const iconColor = ch.icon_color || ch.iconColor || 'from-teal-500 to-cyan-600';
                                            return (
                                                <div
                                                    key={chId}
                                                    className={`group/ch relative flex w-full items-center justify-between rounded-2xl transition-all ${active
                                                        ? 'bg-teal-50/90 text-teal-950 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-100 dark:border-teal-800/80 ring-2 ring-teal-500/15'
                                                        : 'bg-white/60 border border-slate-200/60 text-slate-700 hover:bg-white dark:bg-slate-900/40 dark:border-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-900'
                                                        }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => openChat({ type: 'channel', id: chId })}
                                                        className="flex flex-1 items-center gap-3 p-2.5 text-start text-xs font-bold min-w-0"
                                                    >
                                                        <div className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${iconColor} text-white shadow-2xs`}>
                                                            {ch.is_private ? <Lock size={15} /> : <Hash size={16} />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 truncate">
                                                                <p className="truncate font-black text-slate-900 dark:text-white">{getLocalizedChannelName(ch, t)}</p>
                                                                {ch.is_private && (
                                                                    <span className="shrink-0 text-amber-500" title={t('chat.privateChannel', { defaultValue: 'Private channel' })}>
                                                                        <Lock size={11} />
                                                                    </span>
                                                                )}
                                                                {ch.post_permission === 'admins_only' && (
                                                                    <span className="shrink-0 text-purple-500" title={t('chat.broadcastChannel', { defaultValue: 'Admins-only posting' })}>
                                                                        <Megaphone size={11} />
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">{getLocalizedChannelDescription(ch, t) || `#${ch.name}`}</p>
                                                        </div>
                                                    </button>

                                                    <div className="me-2 flex items-center gap-1 opacity-0 group-hover/ch:opacity-100 transition">
                                                        {ch.can_manage_members && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleOpenMembersModal(chId); }}
                                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                                                                title={t('chat.manageMembers', { defaultValue: 'Manage members' })}
                                                            >
                                                                <Users size={13} />
                                                            </button>
                                                        )}
                                                        {ch.can_edit && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleOpenEditChannel(ch); }}
                                                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
                                                                title={t('chat.editChannel', { defaultValue: 'Edit channel' })}
                                                            >
                                                                <Settings size={13} />
                                                            </button>
                                                        )}
                                                        {ch.can_delete && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleDeleteChannel(chId, e)}
                                                                className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition"
                                                                title={t('chat.deleteChannel', { defaultValue: 'Delete channel' })}
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                <div className="mt-3 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                                    const theme = getRoleTheme(user.role, primaryColor);
                                    return (
                                        <button
                                            type="button"
                                            key={user.user_id}
                                            onClick={() => openChat({ type: 'dm', id: user.user_id })}
                                            className={`flex w-full items-center justify-between gap-2.5 rounded-2xl p-2.5 text-start text-xs font-bold transition-all ${active
                                                ? theme.activeCard
                                                : 'bg-white/60 border border-slate-200/60 text-slate-700 hover:bg-white dark:bg-slate-900/40 dark:border-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-900'
                                                }`}
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <div className="relative shrink-0">
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.gradient} text-[11px] font-black uppercase text-white shadow-xs`}>
                                                        {initials(getLocalizedDemoUserName(user.full_name, t))}
                                                    </div>
                                                    <span className={`absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#08101e] ${user.isOnline ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-slate-300 dark:bg-slate-600'
                                                        }`} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate font-black text-slate-900 dark:text-white text-xs">{getLocalizedDemoUserName(user.full_name, t)}</div>
                                                    <span className={`inline-block truncate rounded-md px-1.5 py-0.2 text-[9px] font-bold ${theme.badge}`}>
                                                        {getLocalizedStaffRole(user.role, t)}
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
                                        className={`flex w-full items-center justify-between gap-2.5 rounded-2xl p-2.5 text-start text-xs font-bold transition-all ${active
                                            ? 'bg-teal-50/90 text-teal-950 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-100 dark:border-teal-800/80 ring-2 ring-teal-500/15'
                                            : 'bg-white/60 border border-slate-200/60 text-slate-700 hover:bg-white dark:bg-slate-900/40 dark:border-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-900'
                                            }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-black uppercase text-white shadow-xs">
                                                {initials(chat.patient_name)}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-black text-slate-900 dark:text-white text-xs">{chat.patient_name}</div>
                                                <div className="truncate text-[10px] font-bold text-teal-700 dark:text-teal-400">{t('chat.mrn', { defaultValue: 'MRN' })}: {chat.patient_mrn}</div>
                                                {chat.last_message_body && (
                                                    <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                        {chat.last_message_body}
                                                    </div>
                                                )}
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
                                        className={`flex w-full items-center justify-between gap-2.5 rounded-2xl p-2.5 text-start text-xs font-bold transition-all ${active
                                            ? 'bg-purple-50/90 text-purple-950 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-100 dark:border-purple-800/80 ring-2 ring-purple-500/15'
                                            : 'bg-white/60 border border-slate-200/60 text-slate-700 hover:bg-white dark:bg-slate-900/40 dark:border-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-900'
                                            }`}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-xs">
                                                <Stethoscope size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate font-black text-slate-900 dark:text-white text-xs">{chat.doctor_name}</div>
                                                <div className="truncate text-[10px] font-bold text-purple-700 dark:text-purple-300">{chat.doctor_clinic}</div>
                                                {chat.last_message_body && (
                                                    <div className="mt-0.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                        {chat.last_message_body}
                                                    </div>
                                                )}
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

                {/* ─── MIDDLE PANEL: Active Chat Thread (Redesigned & Polished) ─────────────────────────── */}
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`communication-center__thread ${mobileShowChat ? 'flex' : 'hidden lg:flex'} relative min-w-0 flex-1 flex-col bg-slate-50 dark:bg-[#070e1a]`}
                >
                    {/* Drag & Drop File Overlay */}
                    {isDraggingOver && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-teal-900/90 p-6 text-white animate-in fade-in duration-200">
                            <UploadCloud size={48} className="animate-bounce text-cyan-300" />
                            <h3 className="mt-3 text-lg font-black">{t('chat.dropFilesHere', { defaultValue: 'Drop files to attach to message' })}</h3>
                            <p className="mt-1 text-xs text-cyan-100">{t('chat.dropSubtitle', { defaultValue: 'Images, documents, and PDFs supported (up to 10MB)' })}</p>
                        </div>
                    )}

                    {/* Integrated Chat Conversation Header */}
                    <div className="communication-center__thread-header flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-3 py-2 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-[#070e1a] sm:gap-3 sm:px-4 lg:px-6">
                        <div
                            onClick={() => {
                                if (isPatient) handleNavigateProfile('patient', selectedChat.id);
                                else if (isDoctor) handleNavigateProfile('doctor', selectedChat.id);
                                else if (isDM) handleNavigateProfile('staff', selectedChat.id);
                            }}
                            className={`flex min-w-0 flex-1 items-center gap-2 sm:gap-3 ${!isChannel ? 'cursor-pointer group' : ''}`}
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
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/30">
                                    <Hash size={18} />
                                </div>
                            ) : (
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${activeRoleTheme.gradient} font-bold text-white shadow-xs transition group-hover:scale-105`}>
                                    {isDoctor ? <Stethoscope size={18} /> : <User size={18} />}
                                </div>
                            )}

                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h2 className="truncate text-sm font-black text-slate-900 transition group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">
                                        {headerTitle}
                                    </h2>
                                    {isChannel && activeChatMeta?.isPrivate && (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800">
                                            <Lock size={10} />
                                            <span>{isRtl ? 'خاصة' : 'Private'}</span>
                                        </span>
                                    )}
                                    {isChannel && activeChatMeta?.postPermission === 'admins_only' && (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-black text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-800">
                                            <Megaphone size={10} />
                                            <span>{isRtl ? 'إعلانات' : 'Broadcast'}</span>
                                        </span>
                                    )}
                                </div>
                                <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-400">
                                    {isDM && (
                                        <Circle size={7} className={activeChatMeta?.isOnline ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300 dark:fill-slate-600 dark:text-slate-600'} />
                                    )}
                                    <span className="truncate">{headerSubtitle}</span>
                                </p>
                            </div>
                        </div>

                        {/* In-Thread Action Controls */}
                        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                            {/* Channel Specific Action Controls */}
                            {isChannel && activeChatMeta && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenMembersModal(activeChatMeta.channel_id)}
                                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 transition"
                                        title={t('chat.channelMembers', { defaultValue: 'Channel members' })}
                                    >
                                        <Users size={13} className="text-teal-600 dark:text-teal-400" />
                                        <span>{activeChatMeta?.memberCount ?? 0}</span>
                                    </button>

                                    {activeChatMeta?.canEdit && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenEditChannel(channels.find(c => (c.channel_id || c.id) === selectedChat.id))}
                                            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 transition"
                                            title={t('chat.editChannel', { defaultValue: 'Edit Channel Settings' })}
                                        >
                                            <Settings size={15} />
                                        </button>
                                    )}

                                    {activeChatMeta?.canDelete && (
                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteChannel(selectedChat.id, e)}
                                            className="rounded-xl border border-rose-200 bg-rose-50/60 p-2 text-rose-600 shadow-2xs hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-400 transition"
                                            title={t('chat.deleteChannel', { defaultValue: 'Delete Channel' })}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                </>
                            )}
                            {/* In-Thread Search Toggle */}
                            <button
                                type="button"
                                onClick={() => setShowInChatSearch(prev => !prev)}
                                className={`rounded-xl border p-2 transition ${showInChatSearch
                                    ? 'border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                                    }`}
                                title={t('chat.searchInChat', { defaultValue: 'Search in active conversation...' })}
                                aria-label={t('chat.searchInChat', { defaultValue: 'Search in active conversation...' })}
                            >
                                <Search size={15} />
                            </button>

                            {/* Export Transcript */}
                            <button
                                type="button"
                                onClick={exportTranscript}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                                title={t('chat.exportTranscript', { defaultValue: 'Export conversation transcript' })}
                                aria-label={t('chat.exportTranscript', { defaultValue: 'Export conversation transcript' })}
                            >
                                <Download size={15} />
                            </button>

                            {/* Print Chat */}
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="hidden sm:inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                                title={t('chat.printTranscript', { defaultValue: 'Print conversation' })}
                            >
                                <Printer size={15} />
                            </button>

                            {hasContext && (
                                <button
                                    type="button"
                                    onClick={() => setShowContextPanel(!showContextPanel)}
                                    className={`shrink-0 rounded-xl border p-2 transition active:scale-95 ${showContextPanel
                                        ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-300'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                                        }`}
                                    title={t('chat.toggleInfo', { defaultValue: 'Toggle info panel' })}
                                >
                                    {showContextPanel ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* In-Thread Keyword Search Bar (Expandable) */}
                    {showInChatSearch && (
                        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-[#08101e] animate-in fade-in duration-150">
                            <Search size={14} className="text-teal-600 shrink-0" />
                            <input
                                type="text"
                                value={inChatSearch}
                                onChange={(e) => setInChatSearch(e.target.value)}
                                placeholder={t('chat.searchInChat', { defaultValue: 'Search messages in this thread...' })}
                                className="flex-1 bg-transparent text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-200"
                                autoFocus
                            />
                            {inChatSearch && (
                                <span className="font-mono text-[10px] text-slate-400">
                                    {activeMessages.length} {isRtl ? 'نتيجة' : 'results'}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => { setInChatSearch(''); setShowInChatSearch(false); }}
                                className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X size={13} />
                            </button>
                        </div>
                    )}

                    {/* Messages List Viewport - Ambient Radiology Theme */}
                    <div className="communication-center__messages relative flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100/80 via-slate-50 to-slate-50 p-3 dark:from-slate-900/60 dark:via-[#070e1a] dark:to-[#070e1a] sm:p-4 lg:p-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        {rawActiveMessages.length > 0 && canLoadOlderMessages && (
                            <div className="mb-3 flex justify-center">
                                <button
                                    type="button"
                                    onClick={handleLoadOlderMessages}
                                    disabled={isLoadingOlder}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-teal-400 hover:text-teal-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    {isLoadingOlder
                                        ? t('chat.loadingEarlier', { defaultValue: 'Loading earlier messages...' })
                                        : t('chat.loadEarlier', { defaultValue: 'Load earlier messages' })}
                                </button>
                            </div>
                        )}
                        {/* Official Broadcast Channel Notice */}
                        {isChannel && activeChatMeta?.postPermission === 'admins_only' && (
                            <div className="mx-auto mb-3 max-w-xl rounded-2xl border border-purple-200 bg-purple-50 p-2.5 text-center text-xs font-bold text-purple-900 shadow-2xs dark:border-purple-900/50 dark:bg-[#130d22] dark:text-purple-200 flex items-center justify-center gap-2">
                                <Megaphone size={15} className="text-purple-600 dark:text-purple-400 shrink-0" />
                                <span>{t('chat.broadcastChannelNotice', { defaultValue: 'Official Broadcast Channel: Visible to all medical staff; postings managed by admins.' })}</span>
                            </div>
                        )}

                        {activeMessages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-500/15 to-cyan-500/15 text-teal-600 dark:text-teal-400 shadow-inner ring-1 ring-teal-500/20">
                                    <MessageSquare size={28} />
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
                            const isStatMessage = msg.priority === 'stat' || msg.priority === 'urgent' || (msg.body && (msg.body.includes('[STAT]') || msg.body.includes('[URGENT]') || msg.body.startsWith('🚨')));
                            const senderName = isMe
                                ? t('chat.you', { defaultValue: 'You' })
                                : getLocalizedDemoUserName(msg.sender_name, t) || (isPatient
                                    ? t('chat.patient', { defaultValue: 'Patient' })
                                    : isDoctor
                                        ? t('chat.doctor', { defaultValue: 'Doctor' })
                                        : t('chat.staff', { defaultValue: 'Staff' }));

                            const senderTheme = getRoleTheme(msg.sender_role || (isPatient ? 'patient' : isDoctor ? 'doctor' : 'staff'), primaryColor);

                            return (
                                <React.Fragment key={msg.message_id || i}>
                                    {showDayDivider && (
                                        <div className="flex items-center justify-center py-2.5">
                                            <span className="rounded-full border border-slate-200 bg-white px-3.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600 shadow-2xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                                {formatDay(msg.created_at)}
                                            </span>
                                        </div>
                                    )}

                                    <div className={`group/msg flex w-full gap-2.5 ${isMe ? 'justify-end' : 'justify-start'} ${groupStart ? 'mt-2.5' : 'mt-1'} animate-in fade-in duration-150`}>
                                        {/* Avatar for received messages */}
                                        {!isMe && (
                                            <div className="shrink-0 pb-0.5">
                                                {groupStart ? (
                                                    <div className={`flex h-8.5 w-8.5 items-center justify-center rounded-2xl text-[10px] font-black uppercase text-white shadow-xs ring-2 ring-white/80 dark:ring-slate-800 bg-gradient-to-br ${senderTheme.gradient}`}>
                                                        {initials(senderName)}
                                                    </div>
                                                ) : (
                                                    <div className="w-8.5" />
                                                )}
                                            </div>
                                        )}

                                        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[72%]`}>
                                            {groupStart && !isMe && (
                                                <div className="mb-1 flex items-center gap-1.5 px-1.5">
                                                    <span className="text-xs font-black text-slate-900 dark:text-slate-100">{senderName}</span>
                                                    {msg.sender_role && (
                                                        <span className={`rounded-md px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${senderTheme.badge}`}>
                                                            {getLocalizedStaffRole(msg.sender_role, t)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Beautiful Speech Bubbles */}
                                            <div className={`relative px-3.5 py-2 text-xs font-semibold leading-relaxed transition-all rounded-2xl ${isStatMessage
                                                ? isMe
                                                    ? 'bg-gradient-to-br from-rose-700 to-red-800 text-white shadow-lg shadow-rose-950/20 border-2 border-rose-500 ring-2 ring-rose-500/30'
                                                    : 'bg-rose-50 text-slate-900 border-2 border-rose-400 shadow-md shadow-rose-900/10 dark:bg-[#1f0910] dark:border-rose-600 dark:text-rose-100 ring-2 ring-rose-500/20'
                                                : isMe
                                                    ? 'bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-900/15 border border-teal-500/30'
                                                    : 'bg-white text-slate-900 border border-slate-200/90 shadow-2xs dark:bg-slate-800/95 dark:border-slate-700/60 dark:text-slate-100'
                                                }`}>
                                                {isStatMessage && (
                                                    <div className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-rose-600 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-white shadow-xs">
                                                        <span className="flex h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                                                        <AlertTriangle size={11} className="text-white shrink-0" />
                                                        <span>{t('chat.statAlertBanner', { defaultValue: 'STAT / Critical Clinical Alert' })}</span>
                                                    </div>
                                                )}
                                                <div dir="auto" className="text-start">
                                                    <ChatMessageContent message={msg} displayBody={getLocalizedSeedMessage(msg.body, t)} isMe={isMe} t={t} />
                                                </div>

                                                {/* Copy Button on Hover */}
                                                {msg.body && (
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(msg.body)}
                                                        className="absolute top-2 end-2 opacity-0 group-hover/msg:opacity-100 rounded-md bg-black/20 p-1 text-white transition hover:bg-black/40"
                                                        title={t('chat.copyText', { defaultValue: 'Copy text' })}
                                                    >
                                                        <Copy size={11} />
                                                    </button>
                                                )}

                                                {/* Time & Read / Seen Status Indicator */}
                                                <div className="mt-1.5 flex items-center justify-end gap-1.5 select-none pt-0.5">
                                                    <span className={`text-[9.5px] font-bold tracking-tight ${isMe ? 'text-teal-100/90' : 'text-slate-400 dark:text-slate-500'}`}>
                                                        {formatTime(msg.created_at)}
                                                    </span>
                                                    {isMe && !isChannel && (
                                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold">
                                                            {msg.is_read ? (
                                                                <CheckCheck size={14} className="text-cyan-200" title={t('chat.seen', { defaultValue: 'Seen' })} />
                                                            ) : (
                                                                <Check size={13} className="text-teal-200/80" title={t('chat.delivered', { defaultValue: 'Delivered' })} />
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
                        <div className="flex select-none items-center gap-2 overflow-x-auto border-t border-slate-200/80 bg-slate-50/90 px-4 py-2 dark:border-slate-800/80 dark:bg-[#08101e] lg:px-6 scrollbar-none">
                            <Sparkles size={14} className="shrink-0 text-amber-500 animate-pulse" />
                            <span className="me-1 shrink-0 text-[9px] font-black uppercase tracking-wider text-slate-400">{t('chat.quickReplies', { defaultValue: 'Quick replies' })}:</span>
                            {QUICK_REPLIES.map((reply, idx) => {
                                const label = t(reply.key, { defaultValue: reply.fallback });
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={(e) => handleSendMessage(e, label)}
                                        className={`shrink-0 rounded-full border px-3 py-1 text-[10.5px] font-bold shadow-2xs transition-all duration-200 hover:scale-105 ${reply.tone}`}
                                    >
                                        {label.length > 36 ? `${label.slice(0, 36)}...` : label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Floating Compose Input Area or Locked Permission Guard */}
                    {!isPostingAllowed ? (
                        <div className="border-t border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800/80 dark:bg-[#070e1a]">
                            <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-purple-200 bg-purple-50/70 p-3 text-center text-xs font-bold text-purple-900 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-200">
                                {activeChatMeta
                                    ? <Lock size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                                    : <MessageSquare size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />}
                                <span>{activeChatMeta
                                    ? t('chat.postingRestrictedNotice', { defaultValue: 'Posting in this channel is restricted to channel administrators and staff admins.' })
                                    : isChannelsFetching
                                        ? t('chat.loadingChannels', { defaultValue: 'Loading communication channels…' })
                                        : t('chat.noChannelsAvailable', { defaultValue: 'No communication channels are currently available.' })}</span>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={(e) => handleSendMessage(e)} className="communication-center__composer border-t border-slate-200/80 bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.035)] dark:border-slate-800/80 dark:bg-[#070e1a] lg:p-3.5">
                            <PendingAttachmentPreview files={pendingFiles} onRemove={removePendingFile} t={t} />
                            {showEmojiPicker && (
                                <div className="mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-[#091222]">
                                    {EMOJI_OPTIONS.map(emoji => (
                                        <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition hover:bg-white dark:hover:bg-slate-800" aria-label={t('chat.insertEmoji', { defaultValue: 'Insert emoji' })}>
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {showStickerPicker && (
                                <div className="mb-2 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-[#091222] sm:grid-cols-6">
                                    {STICKER_OPTIONS.map(sticker => (
                                        <button key={sticker.label} type="button" onClick={() => sendSticker(sticker)} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-extrabold transition hover:scale-105 ${sticker.tone}`}>
                                            <span className="text-2xl leading-none">{sticker.value}</span>
                                            <span>{sticker.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx" onChange={(e) => handleFilesSelected(e.target.files)} className="hidden" />

                                <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-teal-950/30"
                                        title={t('chat.attachFile', { defaultValue: 'Attach file' })}
                                    >
                                        <Paperclip size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowEmojiPicker(value => !value); setShowStickerPicker(false); }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-amber-950/30"
                                        title={t('chat.emoji', { defaultValue: 'Emoji' })}
                                    >
                                        <SmilePlus size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowStickerPicker(value => !value); setShowEmojiPicker(false); }}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-purple-950/30"
                                        title={t('chat.stickers', { defaultValue: 'Stickers' })}
                                    >
                                        <Sticker size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleInsertCaseReference}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-cyan-950/30"
                                        title={t('chat.insertCaseRef', { defaultValue: 'Insert study or case accession reference' })}
                                    >
                                        <FileText size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsStatPriority(prev => !prev)}
                                        className={`inline-flex items-center gap-1 rounded-xl border px-2.5 h-9 text-xs font-black transition ${isStatPriority
                                            ? 'border-rose-500 bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-500/20'
                                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
                                            }`}
                                        title={t('chat.statPriority', { defaultValue: 'Mark message as STAT / Critical Alert' })}
                                    >
                                        <Flame size={14} className={isStatPriority ? 'animate-bounce text-white' : 'text-rose-500'} />
                                        <span className="text-[10px] uppercase tracking-wider">{t('chat.statPriorityLabel', { defaultValue: 'STAT' })}</span>
                                    </button>
                                </div>

                                <textarea
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage(e);
                                        }
                                    }}
                                    dir="auto"
                                    placeholder={isStatPriority ? t('chat.composeStatPlaceholder', { defaultValue: 'Urgent clinical alert message... (Press Enter to send)' }) : t('chat.composePlaceholder', { defaultValue: 'Type a message... (Press Enter to send)' })}
                                    rows={1}
                                    className={`order-2 max-h-32 min-w-0 flex-1 basis-[calc(100%_-_2.75rem)] resize-none rounded-xl border px-4 py-2.5 text-xs font-medium outline-none transition focus:ring-4 sm:order-none sm:basis-0 ${isStatPriority
                                        ? 'border-rose-400 bg-rose-50/60 text-rose-950 placeholder:text-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/20 dark:border-rose-600 dark:bg-rose-950/30 dark:text-rose-100'
                                        : 'border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-100 dark:focus:bg-[#070e1a]'
                                        }`}
                                />

                                <button
                                    type="submit"
                                    disabled={(!messageText.trim() && pendingFiles.length === 0) || isSending}
                                    aria-label={t('chat.sendMessage', { defaultValue: 'Send message' })}
                                    className={`order-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:order-none ${isStatPriority
                                        ? 'bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-600/30'
                                        : 'bg-gradient-to-r from-teal-600 to-cyan-600 shadow-teal-600/30'
                                        }`}
                                >
                                    <Send size={15} className={isRtl ? 'rotate-180' : ''} />
                                </button>
                            </div>

                            <div className="mt-2 flex items-center justify-between px-1 text-[10.5px]">
                                <span className="flex items-center gap-1 font-medium text-slate-400 dark:text-slate-500">
                                    <CornerDownLeft size={11} className="text-slate-400 shrink-0" />
                                    <span>{t('chat.keyboardHint', { defaultValue: 'Enter ↵ to send · Shift+Enter for new line' })}</span>
                                </span>
                                {isStatPriority && (
                                    <span className="flex items-center gap-1 font-black text-rose-600 dark:text-rose-400 animate-pulse">
                                        <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                                        <span>{t('chat.statActiveNotice', { defaultValue: 'STAT Alert mode active' })}</span>
                                    </span>
                                )}
                            </div>
                        </form>
                    )}
                </div>

                {/* ─── RIGHT PANEL: Patient / Doctor / Staff Context Drawer ────────────────────────── */}
                {showContextPanel && hasContext && (
                    <>
                        <div
                            className="fixed inset-0 z-30 bg-slate-950/60 xl:hidden"
                            onClick={() => setShowContextPanel(false)}
                        />
                        <div className="communication-center__context fixed end-0 top-0 z-40 h-full w-80 max-w-[85vw] shrink-0 overflow-y-auto border-s border-slate-200/80 bg-white p-5 shadow-2xl animate-in slide-in-from-end duration-200 dark:border-slate-800 dark:bg-[#070e1a] xl:static xl:z-auto xl:h-auto xl:max-w-none xl:animate-none xl:bg-slate-50 xl:shadow-none dark:xl:bg-[#091222]">
                            <button
                                type="button"
                                onClick={() => setShowContextPanel(false)}
                                className="absolute end-4 top-4 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 xl:hidden"
                            >
                                <X size={16} />
                            </button>

                            {isPatient && patientDetails ? (
                                <div className="space-y-5">
                                    {/* Patient Hero Card */}
                                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500/15 via-cyan-500/10 to-teal-500/5 p-4 text-center ring-1 ring-teal-500/20">
                                        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-xl font-black uppercase text-white shadow-md shadow-teal-600/30 ring-2 ring-white dark:ring-slate-800">
                                            {initials(patientDetails.full_name)}
                                        </div>
                                        <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{patientDetails.full_name}</h3>
                                        <span className="mt-1 inline-flex rounded-full bg-teal-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                            {t('chat.patient', { defaultValue: 'Patient' })}
                                        </span>
                                        <div className="mt-3 grid gap-2">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/patients/${patientDetails.patient_id}`)}
                                                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 px-3 py-2 text-xs font-black text-white shadow-xs transition hover:brightness-110 active:scale-95"
                                            >
                                                <ExternalLink size={13} />
                                                <span>{t('chat.viewFullProfile', { defaultValue: 'View Full Patient Profile' })}</span>
                                            </button>

                                            <div className="grid grid-cols-2 gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/worklist?patientId=${patientDetails.patient_id}`)}
                                                    className="flex items-center justify-center gap-1 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-2.5 py-1.5 text-[11px] font-bold text-cyan-900 transition hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200"
                                                >
                                                    <Stethoscope size={12} />
                                                    <span>{t('chat.viewWorklist', { defaultValue: 'Studies' })}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/reception?tab=cashier&patientId=${patientDetails.patient_id}`)}
                                                    className="flex items-center justify-center gap-1 rounded-2xl border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                                >
                                                    <Receipt size={12} />
                                                    <span>{t('chat.viewInvoices', { defaultValue: 'Invoices' })}</span>
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => navigate(`/appointments?patientId=${patientDetails.patient_id}`)}
                                                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-900 shadow-xs transition hover:bg-teal-50 active:scale-95 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                                            >
                                                <Calendar size={13} />
                                                <span>{t('chat.bookAppointment', { defaultValue: 'Appointments' })}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Contact Section */}
                                    <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('chat.contactInfo', { defaultValue: 'Contact Info' })}</h4>

                                        {patientDetails.phone ? (
                                            <a href={`tel:${patientDetails.phone}`} className="flex items-center justify-between gap-2.5 text-xs font-bold text-slate-700 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400 transition">
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
                                                        <Phone size={13} />
                                                    </span>
                                                    <span className="truncate">{patientDetails.phone}</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-teal-600">{t('chat.callPatient', { defaultValue: 'Call' })}</span>
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-2.5 text-xs text-slate-400">
                                                <Phone size={13} />
                                                <span>{t('chat.noPhone', { defaultValue: 'No phone' })}</span>
                                            </div>
                                        )}

                                        {patientDetails.email ? (
                                            <a href={`mailto:${patientDetails.email}`} className="flex items-center justify-between gap-2.5 text-xs font-bold text-slate-700 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400 transition">
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400">
                                                        <Mail size={13} />
                                                    </span>
                                                    <span className="truncate">{patientDetails.email}</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-cyan-600">{t('chat.emailPatient', { defaultValue: 'Email' })}</span>
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-2.5 text-xs text-slate-400">
                                                <Mail size={13} />
                                                <span>{t('chat.noEmail', { defaultValue: 'No email' })}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                                                <MapPin size={13} />
                                            </span>
                                            <span className="truncate">{patientDetails.address || t('chat.noAddress', { defaultValue: 'No address' })}</span>
                                        </div>
                                    </div>

                                    {/* Patient Stats Summary */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{t('chat.gender', { defaultValue: 'Gender' })}</p>
                                            <p className="mt-1 text-xs font-black text-slate-900 dark:text-white">{patientDetails.gender || '-'}</p>
                                        </div>
                                        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-amber-100/40 p-3 shadow-2xs dark:border-amber-800/60 dark:from-amber-950/30 dark:to-amber-900/10">
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
                                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500/15 via-violet-500/10 to-purple-500/5 p-4 text-center ring-1 ring-purple-500/20">
                                        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-md shadow-purple-600/30 ring-2 ring-white dark:ring-slate-800">
                                            <Stethoscope size={28} />
                                        </div>
                                        <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{doctorDetails.full_name}</h3>
                                        <span className="mt-1 inline-flex rounded-full bg-purple-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                            {doctorDetails.specialty || t('chat.referringDoctor', { defaultValue: 'Referring Doctor' })}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/referring-doctors/${doctorDetails.doctor_id}`)}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 px-3 py-2 text-xs font-black text-white shadow-xs transition hover:brightness-110 active:scale-95"
                                        >
                                            <ExternalLink size={13} />
                                            <span>{t('chat.viewFullDoctorDetails', { defaultValue: 'View Doctor Details' })}</span>
                                        </button>
                                    </div>

                                    {/* Clinic Info */}
                                    <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('chat.clinicInfo', { defaultValue: 'Clinic Info' })}</h4>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
                                                <Building2 size={13} />
                                            </span>
                                            <span className="truncate">{doctorDetails.clinic_name || doctorDetails.clinic_hospital || t('chat.noClinic', { defaultValue: 'No clinic' })}</span>
                                        </div>

                                        {doctorDetails.phone ? (
                                            <a href={`tel:${doctorDetails.phone}`} className="flex items-center justify-between gap-2.5 text-xs font-bold text-slate-700 hover:text-purple-600 dark:text-slate-300 dark:hover:text-purple-400 transition">
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
                                                        <Phone size={13} />
                                                    </span>
                                                    <span className="truncate">{doctorDetails.phone}</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-purple-600">{t('chat.callDoctor', { defaultValue: 'Call' })}</span>
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-2.5 text-xs text-slate-400">
                                                <Phone size={13} />
                                                <span>{t('chat.noPhone', { defaultValue: 'No phone' })}</span>
                                            </div>
                                        )}

                                        {doctorDetails.email ? (
                                            <a href={`mailto:${doctorDetails.email}`} className="flex items-center justify-between gap-2.5 text-xs font-bold text-slate-700 hover:text-fuchsia-600 dark:text-slate-300 dark:hover:text-fuchsia-400 transition">
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-400">
                                                        <Mail size={13} />
                                                    </span>
                                                    <span className="truncate">{doctorDetails.email}</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-fuchsia-600">{t('chat.emailDoctor', { defaultValue: 'Email' })}</span>
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-2.5 text-xs text-slate-400">
                                                <Mail size={13} />
                                                <span>{t('chat.noEmail', { defaultValue: 'No email' })}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : isDM && activeChatMeta ? (
                                <div className="space-y-5">
                                    {/* Staff Hero Card */}
                                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-indigo-500/5 p-4 text-center ring-1 ring-indigo-500/20">
                                        <div className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${activeRoleTheme.gradient} text-xl font-black uppercase text-white shadow-md ring-2 ring-white dark:ring-slate-800`}>
                                            {initials(getLocalizedDemoUserName(activeChatMeta.full_name, t))}
                                        </div>
                                        <h3 className="mt-3 text-sm font-black text-slate-900 dark:text-white">{getLocalizedDemoUserName(activeChatMeta.full_name, t)}</h3>
                                        <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${activeRoleTheme.badge}`}>
                                            {getLocalizedStaffRole(activeChatMeta.role, t)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/users/${activeChatMeta.user_id}`)}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 px-3 py-2 text-xs font-black text-white shadow-xs transition hover:brightness-110 active:scale-95 dark:from-slate-800 dark:to-indigo-900"
                                        >
                                            <ExternalLink size={13} />
                                            <span>{t('chat.viewUserAccount', { defaultValue: 'View User Profile' })}</span>
                                        </button>
                                    </div>

                                    {/* Staff Info */}
                                    <div className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-[#0b1426]">
                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('chat.staffInfo', { defaultValue: 'Staff Info' })}</h4>
                                        <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
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

                {/* ─── Create Channel Modal Dialog ────────────────────────── */}
                {showCreateChannelModal && createPortal((
                    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 bg-slate-950/70 animate-in fade-in duration-150">
                        <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#091222] animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto scrollbar-thin">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/20">
                                        <Plus size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">{t('chat.createNewChannel', { defaultValue: 'Create New Channel' })}</h3>
                                        <p className="text-[11px] font-semibold text-slate-400">{t('chat.channelModalSub', { defaultValue: 'Setup room name, privacy, role access, and posting permissions' })}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateChannelModal(false)}
                                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleCreateChannel} className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                            {t('chat.channelIdentifier', { defaultValue: 'Channel Slug / Identifier' })} *
                                        </label>
                                        <div className="relative" dir="ltr">
                                            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">#</span>
                                            <input
                                                type="text"
                                                required
                                                placeholder={t('chat.channelIdentifierPlaceholder', { defaultValue: 'e.g. mri-coordination' })}
                                                value={newChannelName}
                                                onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                                                className="h-10 w-full rounded-2xl border border-slate-200 ps-8 pe-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                            {t('chat.channelDisplayName', { defaultValue: 'Display Title' })}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={t('chat.channelDisplayNamePlaceholder', { defaultValue: 'e.g. MRI Coordination' })}
                                            value={newChannelDisplayName}
                                            onChange={(e) => setNewChannelDisplayName(e.target.value)}
                                            className="h-10 w-full rounded-2xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                        {t('chat.channelDescription', { defaultValue: 'Description / Purpose' })}
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder={t('chat.channelDescriptionPlaceholder', { defaultValue: 'e.g. Daily case coordination and MRI referrals' })}
                                        value={newChannelDesc}
                                        onChange={(e) => setNewChannelDesc(e.target.value)}
                                        className="w-full resize-none rounded-2xl border border-slate-200 p-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                    />
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#081120] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                                {newChannelIsPrivate ? <Lock size={13} className="text-amber-500" /> : <Globe size={13} className="text-emerald-500" />}
                                                <span>{newChannelIsPrivate ? t('chat.privateChannel', { defaultValue: 'Private Channel' }) : t('chat.publicChannel', { defaultValue: 'Public Channel' })}</span>
                                            </p>
                                            <p className="text-[10.5px] font-medium text-slate-400">
                                                {newChannelIsPrivate
                                                    ? t('chat.privateChannelDesc', { defaultValue: 'Only invited members & allowed roles can view and join.' })
                                                    : t('chat.publicChannelDesc', { defaultValue: 'Visible to all medical & administrative staff.' })}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setNewChannelIsPrivate(!newChannelIsPrivate)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${newChannelIsPrivate ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                                                }`}
                                        >
                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${newChannelIsPrivate ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                                                }`} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                            {t('chat.postingPermissions', { defaultValue: 'Who can post messages?' })}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setNewChannelPostPermission('all_members')}
                                                className={`flex items-center gap-2 rounded-xl p-2 text-start text-xs font-bold border transition ${newChannelPostPermission === 'all_members'
                                                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200'
                                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-400'
                                                    }`}
                                            >
                                                <Users size={14} className="shrink-0" />
                                                <span>{t('chat.allMembersPost', { defaultValue: 'All Members' })}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewChannelPostPermission('admins_only')}
                                                className={`flex items-center gap-2 rounded-xl p-2 text-start text-xs font-bold border transition ${newChannelPostPermission === 'admins_only'
                                                    ? 'border-purple-500 bg-purple-50 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200'
                                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-400'
                                                    }`}
                                            >
                                                <Megaphone size={14} className="shrink-0" />
                                                <span>{t('chat.adminsOnlyPost', { defaultValue: 'Admins Only' })}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                            {t('chat.restrictToRoles', { defaultValue: 'Role Restrictions (Leave empty for all staff)' })}
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ALL_STAFF_ROLES.map(role => {
                                                const selected = newChannelAllowedRoles.includes(role.key);
                                                return (
                                                    <button
                                                        key={role.key}
                                                        type="button"
                                                        onClick={() => {
                                                            setNewChannelAllowedRoles(prev =>
                                                                selected ? prev.filter(r => r !== role.key) : [...prev, role.key]
                                                            );
                                                        }}
                                                        className={`rounded-xl px-2.5 py-1 text-[10px] font-bold border transition ${selected
                                                            ? 'border-teal-500 bg-teal-600 text-white shadow-2xs'
                                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-400'
                                                            }`}
                                                    >
                                                        {getLocalizedStaffRole(role.key, t)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                        {t('chat.themeColor', { defaultValue: 'Theme Color' })}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {COLOR_PRESETS.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => setNewChannelColor(preset.value)}
                                                className={`h-7 w-7 rounded-xl ${preset.preview} transition transform hover:scale-110 ${newChannelColor === preset.value ? 'ring-2 ring-teal-500 ring-offset-2 scale-110' : 'opacity-70'
                                                    }`}
                                                title={t(preset.labelKey, { defaultValue: preset.defaultLabel })}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateChannelModal(false)}
                                        className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 transition"
                                    >
                                        {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreatingChannel || !newChannelName.trim()}
                                        className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-teal-600/30 hover:brightness-110 disabled:opacity-50 transition"
                                    >
                                        <Plus size={14} />
                                        <span>{t('chat.createChannelAction', { defaultValue: 'Create Channel' })}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ), document.body)}

                {/* ─── Edit Channel Modal Dialog ────────────────────────── */}
                {showEditChannelModal && createPortal((
                    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 bg-slate-950/70 animate-in fade-in duration-150">
                        <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#091222] animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto scrollbar-thin">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20">
                                        <Settings size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">{t('chat.editChannelSettings', { defaultValue: 'Edit Channel Settings' })}</h3>
                                        <p className="text-[11px] font-semibold text-slate-400">#{editChannelId}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowEditChannelModal(false)}
                                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateChannel} className="mt-4 space-y-4">
                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                        {t('chat.channelDisplayName', { defaultValue: 'Display Title' })}
                                    </label>
                                    <input
                                        type="text"
                                        value={editDisplayName}
                                        onChange={(e) => setEditDisplayName(e.target.value)}
                                        className="h-10 w-full rounded-2xl border border-slate-200 px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                        {t('chat.channelDescription', { defaultValue: 'Description / Purpose' })}
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={editDesc}
                                        onChange={(e) => setEditDesc(e.target.value)}
                                        className="w-full resize-none rounded-2xl border border-slate-200 p-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                    />
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#081120] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                                {editIsPrivate ? <Lock size={13} className="text-amber-500" /> : <Globe size={13} className="text-emerald-500" />}
                                                <span>{editIsPrivate ? t('chat.privateChannel', { defaultValue: 'Private Channel' }) : t('chat.publicChannel', { defaultValue: 'Public Channel' })}</span>
                                            </p>
                                            <p className="text-[10.5px] font-medium text-slate-400">
                                                {editIsPrivate
                                                    ? t('chat.privateChannelDesc', { defaultValue: 'Only invited members & allowed roles can view and join.' })
                                                    : t('chat.publicChannelDesc', { defaultValue: 'Visible to all medical & administrative staff.' })}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEditIsPrivate(!editIsPrivate)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${editIsPrivate ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                                                }`}
                                        >
                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${editIsPrivate ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                                                }`} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                            {t('chat.postingPermissions', { defaultValue: 'Who can post messages?' })}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditPostPermission('all_members')}
                                                className={`flex items-center gap-2 rounded-xl p-2 text-start text-xs font-bold border transition ${editPostPermission === 'all_members'
                                                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200'
                                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-400'
                                                    }`}
                                            >
                                                <Users size={14} className="shrink-0" />
                                                <span>{t('chat.allMembersPost', { defaultValue: 'All Members' })}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditPostPermission('admins_only')}
                                                className={`flex items-center gap-2 rounded-xl p-2 text-start text-xs font-bold border transition ${editPostPermission === 'admins_only'
                                                    ? 'border-purple-500 bg-purple-50 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200'
                                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-400'
                                                    }`}
                                            >
                                                <Megaphone size={14} className="shrink-0" />
                                                <span>{t('chat.adminsOnlyPost', { defaultValue: 'Admins Only' })}</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                            {t('chat.restrictToRoles', { defaultValue: 'Role Restrictions (Leave empty for all staff)' })}
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ALL_STAFF_ROLES.map(role => {
                                                const selected = editAllowedRoles.includes(role.key);
                                                return (
                                                    <button
                                                        key={role.key}
                                                        type="button"
                                                        onClick={() => {
                                                            setEditAllowedRoles(prev =>
                                                                selected ? prev.filter(r => r !== role.key) : [...prev, role.key]
                                                            );
                                                        }}
                                                        className={`rounded-xl px-2.5 py-1 text-[10px] font-bold border transition ${selected
                                                            ? 'border-teal-500 bg-teal-600 text-white shadow-2xs'
                                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-400'
                                                            }`}
                                                    >
                                                        {getLocalizedStaffRole(role.key, t)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                                        {t('chat.themeColor', { defaultValue: 'Theme Color' })}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {COLOR_PRESETS.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => setEditColor(preset.value)}
                                                className={`h-7 w-7 rounded-xl ${preset.preview} transition transform hover:scale-110 ${editColor === preset.value ? 'ring-2 ring-teal-500 ring-offset-2 scale-110' : 'opacity-70'
                                                    }`}
                                                title={t(preset.labelKey, { defaultValue: preset.defaultLabel })}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditChannelModal(false)}
                                        className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 transition"
                                    >
                                        {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isUpdatingChannel}
                                        className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2 text-xs font-black text-white shadow-md shadow-teal-600/30 hover:brightness-110 disabled:opacity-50 transition"
                                    >
                                        <Check size={14} />
                                        <span>{t('chat.saveChanges', { defaultValue: 'Save Changes' })}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ), document.body)}

                {/* ─── Channel Members Management Modal ────────────────────────── */}
                {showMembersModal && createPortal((
                    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 bg-slate-950/70 animate-in fade-in duration-150">
                        <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#091222] animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/20">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">{t('chat.channelMembersTitle', { defaultValue: 'Channel Members' })}</h3>
                                        <p className="text-[11px] font-semibold text-slate-400">#{managingChannelId} ({channelMembers.length} {t('chat.membersCount', { defaultValue: 'members' })})</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMembersModal(false)}
                                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Add New Member Section */}
                            <form onSubmit={handleAddMember} className="mt-4 p-3 rounded-2xl border border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-[#081120] shrink-0">
                                <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 mb-2">
                                    {t('chat.addMemberToChannel', { defaultValue: 'Add Member to Channel' })}
                                </p>
                                <div className="flex flex-col sm:flex-row items-center gap-2">
                                    <select
                                        value={selectedUserToAdd}
                                        onChange={(e) => setSelectedUserToAdd(e.target.value)}
                                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                    >
                                        <option value="">{t('chat.selectStaffMember', { defaultValue: 'Select a staff member...' })}</option>
                                        {staffUsers
                                            .filter(u => !channelMembers.some(m => m.user_id === u.user_id))
                                            .map(u => (
                                                <option key={u.user_id} value={u.user_id}>
                                                    {getLocalizedDemoUserName(u.full_name, t)} ({getLocalizedStaffRole(u.role, t)})
                                                </option>
                                            ))}
                                    </select>

                                    <select
                                        value={selectedRoleToAdd}
                                        onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                                        className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-[#070e1a] dark:text-slate-200 focus:border-teal-500 focus:outline-none"
                                    >
                                        <option value="member">{t('chat.roleMember', { defaultValue: 'Member' })}</option>
                                        <option value="admin">{t('chat.roleAdmin', { defaultValue: 'Admin' })}</option>
                                    </select>

                                    <button
                                        type="submit"
                                        disabled={!selectedUserToAdd || isAddingMembers}
                                        className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-3.5 text-xs font-black text-white shadow-2xs hover:brightness-110 disabled:opacity-50 transition"
                                    >
                                        <UserPlus size={14} />
                                        <span>{t('chat.add', { defaultValue: 'Add' })}</span>
                                    </button>
                                </div>
                            </form>

                            {/* Members List */}
                            <div className="mt-4 flex-1 overflow-y-auto space-y-2 pe-1 scrollbar-thin">
                                {channelMembers.map(member => {
                                    const isMe = String(member.user_id) === String(currentUserId);
                                    const isOwner = member.channel_role === 'owner';
                                    const isAdmin = member.channel_role === 'admin';
                                    const roleTheme = getRoleTheme(member.role, primaryColor);

                                    return (
                                        <div
                                            key={member.user_id}
                                            className="flex items-center justify-between gap-2.5 rounded-2xl border border-slate-200/70 bg-white p-3 dark:border-slate-800/80 dark:bg-[#070e1a]"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="relative shrink-0">
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br ${roleTheme.gradient} text-xs font-black text-white shadow-xs`}>
                                                        {initials(getLocalizedDemoUserName(member.full_name, t))}
                                                    </div>
                                                    {member.isOnline && (
                                                        <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#070e1a]" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <p className="truncate font-black text-xs text-slate-900 dark:text-white">{getLocalizedDemoUserName(member.full_name, t)}</p>
                                                        {isMe && <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 text-[8.5px] font-bold text-slate-500">{t('chat.you', { defaultValue: 'You' })}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5 truncate text-[10px] text-slate-400">
                                                        <span>{getLocalizedStaffRole(member.role, t)}</span>
                                                        <span>·</span>
                                                        <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 font-bold ${isOwner
                                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                            : isAdmin
                                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                            }`}>
                                                            {isOwner
                                                                ? `👑 ${t('chat.roleOwner', { defaultValue: 'Owner' })}`
                                                                : isAdmin
                                                                    ? `🛡️ ${t('chat.roleAdmin', { defaultValue: 'Admin' })}`
                                                                    : t('chat.roleMember', { defaultValue: 'Member' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                {!isOwner && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateMemberRole(member.user_id, member.channel_role)}
                                                            className={`rounded-xl px-2 py-1 text-[10px] font-bold border transition ${isAdmin
                                                                ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-950/40 dark:text-purple-300'
                                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#091222] dark:text-slate-400'
                                                                }`}
                                                            title={isAdmin
                                                                ? t('chat.demoteToMember', { defaultValue: 'Demote to Member' })
                                                                : t('chat.promoteToAdmin', { defaultValue: 'Promote to Admin' })}
                                                        >
                                                            {isAdmin
                                                                ? t('chat.demote', { defaultValue: 'Demote' })
                                                                : t('chat.makeAdmin', { defaultValue: 'Make Admin' })}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveMember(member.user_id, isMe)}
                                                            className="rounded-xl p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                                                            title={isMe ? t('chat.leaveChannel', { defaultValue: 'Leave Channel' }) : t('chat.removeMember', { defaultValue: 'Remove Member' })}
                                                        >
                                                            {isMe ? <LogOut size={14} /> : <UserMinus size={14} />}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ), document.body)}

            <ConfirmDialog
                isOpen={Boolean(removeMemberTarget)}
                title={removeMemberTarget?.isSelf ? t('chat.leaveChannel', { defaultValue: 'Leave Channel' }) : t('chat.removeMember', { defaultValue: 'Remove Member' })}
                message={removeMemberTarget?.isSelf ? t('chat.confirmLeaveChannel', { defaultValue: 'Are you sure you want to leave this channel?' }) : t('chat.confirmRemoveMember', { defaultValue: 'Remove this member from the channel?' })}
                confirmText={removeMemberTarget?.isSelf ? t('chat.leaveChannel', { defaultValue: 'Leave' }) : t('actions.remove', { defaultValue: 'Remove' })}
                cancelText={t('common:cancel', 'Cancel')}
                variant="danger"
                onConfirm={confirmRemoveMember}
                onCancel={() => setRemoveMemberTarget(null)}
            />

            <ConfirmDialog
                isOpen={Boolean(deleteChannelTarget)}
                title={t('chat.deleteChannel', { defaultValue: 'Delete Channel' })}
                message={t('chat.confirmDeleteChannel', { defaultValue: 'Are you sure you want to delete this channel?' })}
                confirmText={t('actions.delete', { defaultValue: 'Delete' })}
                cancelText={t('common:cancel', 'Cancel')}
                variant="danger"
                onConfirm={confirmDeleteChannel}
                onCancel={() => setDeleteChannelTarget(null)}
            />

            <TextPromptDialog
                isOpen={showCaseRefPrompt}
                title={t('chat.insertCaseRef', { defaultValue: 'Insert Case Reference' })}
                message={t('chat.caseRefPrompt', { defaultValue: 'Enter Study Accession Number or Case ID (e.g. ACC-10928):' })}
                label={t('chat.caseIdOrAcc', { defaultValue: 'Accession Number / Case ID' })}
                placeholder="ACC-10928"
                confirmLabel={t('actions.insert', { defaultValue: 'Insert' })}
                cancelLabel={t('common:cancel', 'Cancel')}
                onClose={() => setShowCaseRefPrompt(false)}
                onConfirm={confirmInsertCaseReference}
            />
            </div>
        </div>
    );
}
