import { api } from '../baseApi';

export const communicationApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getNotifications: builder.query({
            query: (params) => ({ url: '/notifications', params }),
            providesTags: ['Notifications'],
        }),
        getNotificationUnreadCount: builder.query({
            query: () => '/notifications/unread-count',
            providesTags: ['Notifications'],
            pollingInterval: 60000,
        }),
        markAllNotificationsRead: builder.mutation({
            query: () => ({ url: '/notifications/mark-all-read', method: 'PUT' }),
            invalidatesTags: ['Notifications'],
        }),
        markNotificationRead: builder.mutation({
            query: (id) => ({ url: `/notifications/${id}/read`, method: 'PUT' }),
            invalidatesTags: ['Notifications'],
        }),
        sendManualNotification: builder.mutation({
            query: (data) => ({ url: '/notifications/send-manual', method: 'POST', body: data }),
            invalidatesTags: ['Notifications'],
        }),
        sendReminder: builder.mutation({
            query: (data) => ({
                url: '/notifications/remind',
                method: 'POST',
                body: data,
            }),
        }),
        getNotificationTemplates: builder.query({
            query: (params) => ({ url: '/notification-templates', params }),
            providesTags: ['NotificationTemplates'],
        }),
        createNotificationTemplate: builder.mutation({
            query: (data) => ({ url: '/notification-templates', method: 'POST', body: data }),
            invalidatesTags: ['NotificationTemplates'],
        }),
        updateNotificationTemplate: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/notification-templates/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['NotificationTemplates'],
        }),
        deleteNotificationTemplate: builder.mutation({
            query: (id) => ({ url: `/notification-templates/${id}`, method: 'DELETE' }),
            invalidatesTags: ['NotificationTemplates'],
        }),
        getNotificationJobs: builder.query({
            query: (params) => ({ url: '/notification-jobs', params }),
            providesTags: ['NotificationJobs'],
        }),
        retryNotificationJob: builder.mutation({
            query: (id) => ({ url: `/notification-jobs/${id}/retry`, method: 'POST' }),
            invalidatesTags: ['NotificationJobs'],
        }),
        processNotificationJobs: builder.mutation({
            query: () => ({ url: '/notification-jobs/process', method: 'POST' }),
            invalidatesTags: ['NotificationJobs', 'Notifications'],
        }),
        getNotificationPreferences: builder.query({
            query: (params) => ({ url: '/notification-preferences', params }),
            providesTags: ['Notifications'],
        }),
        updateNotificationPreferences: builder.mutation({
            query: ({ patientId, doctorId, ...data }) => ({
                url: `/notification-preferences${patientId ? `?patientId=${patientId}` : `?doctorId=${doctorId}`}`,
                method: 'PUT', body: data,
            }),
            invalidatesTags: ['Notifications'],
        }),
        getMyNotifications: builder.query({
            query: (params) => ({ url: '/notifications/my-notifications', params }),
            providesTags: ['Notifications'],
        }),
        markMyNotificationRead: builder.mutation({
            query: (id) => ({ url: `/notifications/my-notifications/${id}/read`, method: 'PUT' }),
            invalidatesTags: ['Notifications'],
        }),
        markAllMyNotificationsRead: builder.mutation({
            query: () => ({ url: '/notifications/my-notifications/mark-all-read', method: 'PUT' }),
            invalidatesTags: ['Notifications'],
        }),
        getStaffPreferences: builder.query({
            query: () => '/notifications/my-preferences',
            providesTags: ['Notifications'],
        }),
        updateStaffPreferences: builder.mutation({
            query: (data) => ({
                url: '/notifications/my-preferences',
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Notifications'],
        }),
        getNotificationAnalytics: builder.query({
            query: (params) => ({ url: '/notifications/analytics', params }),
            providesTags: ['Notifications'],
        }),
        getChatUsers: builder.query({
            query: () => '/chat/users',
            providesTags: ['StaffUsers'],
        }),
        getChatMessages: builder.query({
            query: (params) => ({ url: '/chat/messages', params }),
            providesTags: ['ChatMessages'],
        }),
        sendChatMessage: builder.mutation({
            query: (data) => ({ url: '/chat/messages', method: 'POST', body: data }),
            async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
                const isFormData = typeof FormData !== 'undefined' && arg instanceof FormData;
                const channelName = isFormData ? arg.get('channelName') : arg.channelName;
                const recipientId = isFormData ? arg.get('recipientId') : arg.recipientId;
                const body = isFormData ? arg.get('body') : arg.body;
                const messageKind = isFormData ? arg.get('messageKind') : arg.messageKind;
                const cacheArg = channelName
                    ? { channelName }
                    : recipientId
                        ? { recipientId }
                        : null;
                if (!cacheArg) {
                    try { await queryFulfilled; } catch { /* no-op */ }
                    return;
                }
                const optimistic = {
                    message_id: `temp-${Date.now()}`,
                    body,
                    message_kind: messageKind || 'text',
                    sender_id: getState().auth?.user?.user_id || getState().auth?.user?.userId || getState().auth?.user?.id,
                    sender_role: 'Staff',
                    is_read: false,
                    created_at: new Date().toISOString(),
                    _optimistic: true,
                };
                const patch = dispatch(
                    api.util.updateQueryData('getChatMessages', cacheArg, (draft) => {
                        draft.push(optimistic);
                    })
                );
                try {
                    await queryFulfilled;
                } catch {
                    patch.undo();
                }
            },
            invalidatesTags: ['ChatMessages', 'StaffUsers', 'ChatUnread'],
        }),
        getChatUnreadSummary: builder.query({
            query: () => '/chat/unread-summary',
            providesTags: ['ChatUnread'],
        }),
        getChatChannels: builder.query({
            query: () => '/chat/channels',
            providesTags: ['ChatChannels'],
        }),
        createChatChannel: builder.mutation({
            query: (data) => ({ url: '/chat/channels', method: 'POST', body: data }),
            invalidatesTags: ['ChatChannels'],
        }),
        updateChatChannel: builder.mutation({
            query: ({ channelId, ...data }) => ({ url: `/chat/channels/${channelId}`, method: 'PUT', body: data }),
            invalidatesTags: ['ChatChannels'],
        }),
        deleteChatChannel: builder.mutation({
            query: (channelId) => ({ url: `/chat/channels/${channelId}`, method: 'DELETE' }),
            invalidatesTags: ['ChatChannels'],
        }),
        getChannelMembers: builder.query({
            query: (channelId) => `/chat/channels/${channelId}/members`,
            providesTags: (result, error, channelId) => [{ type: 'ChatChannels', id: channelId }],
        }),
        addChannelMembers: builder.mutation({
            query: ({ channelId, ...data }) => ({ url: `/chat/channels/${channelId}/members`, method: 'POST', body: data }),
            invalidatesTags: (result, error, { channelId }) => ['ChatChannels', { type: 'ChatChannels', id: channelId }],
        }),
        removeChannelMember: builder.mutation({
            query: ({ channelId, userId }) => ({ url: `/chat/channels/${channelId}/members/${userId}`, method: 'DELETE' }),
            invalidatesTags: (result, error, { channelId }) => ['ChatChannels', { type: 'ChatChannels', id: channelId }],
        }),
        updateChannelMemberRole: builder.mutation({
            query: ({ channelId, userId, ...data }) => ({ url: `/chat/channels/${channelId}/members/${userId}`, method: 'PUT', body: data }),
            invalidatesTags: (result, error, { channelId }) => ['ChatChannels', { type: 'ChatChannels', id: channelId }],
        }),
        getPatientConversations: builder.query({
            query: () => '/messages/patients',
            providesTags: ['PatientConversations'],
        }),
        getPatientMessageHistory: builder.query({
            query: (arg) => {
                const { patientId, before } = typeof arg === 'string' ? { patientId: arg } : arg;
                return { url: `/messages/patients/${patientId}`, params: before ? { before } : undefined };
            },
            providesTags: ['PatientConversations'],
        }),
        sendPatientReply: builder.mutation({
            query: ({ patientId, data, ...rest }) => ({
                url: `/messages/patients/${patientId}`,
                method: 'POST',
                body: data || rest,
            }),
            invalidatesTags: ['PatientConversations'],
        }),
        getDoctorConversations: builder.query({
            query: () => '/messages/doctors',
            providesTags: ['DoctorConversations'],
        }),
        getDoctorMessageHistory: builder.query({
            query: (arg) => {
                const { doctorId, before } = typeof arg === 'string' ? { doctorId: arg } : arg;
                return { url: `/messages/doctors/${doctorId}`, params: before ? { before } : undefined };
            },
            providesTags: ['DoctorConversations'],
        }),
        sendDoctorReply: builder.mutation({
            query: ({ doctorId, data, ...rest }) => ({
                url: `/messages/doctors/${doctorId}`,
                method: 'POST',
                body: data || rest,
            }),
            invalidatesTags: ['DoctorConversations'],
        }),
        broadcastPatientCall: builder.mutation({
            query: (data) => ({ url: '/display/broadcast-call', method: 'POST', body: data }),
        }),
        getDisplayBoard: builder.query({
            query: (params) => ({ url: '/display/board', params }),
            providesTags: ['DisplayBoard'],
        }),
        getDisplayConfig: builder.query({
            query: () => '/display/config',
            providesTags: ['DisplayBoard'],
        }),
        updateDisplayConfig: builder.mutation({
            query: (data) => ({ url: '/display/config', method: 'PUT', body: data }),
            invalidatesTags: ['DisplayBoard'],
            async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(api.util.updateQueryData('getDisplayConfig', undefined, (draft) => {
                        draft.config = { ...draft.config, ...data.config };
                    }));
                } catch {
                    // Keep the cached values unchanged when the save fails.
                }
            },
        }),
        createDisplayAnnouncement: builder.mutation({
            query: (data) => ({ url: '/display/announcements', method: 'POST', body: data }),
            invalidatesTags: ['DisplayBoard'],
        }),
        updateDisplayAnnouncement: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/display/announcements/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['DisplayBoard'],
        }),
        deleteDisplayAnnouncement: builder.mutation({
            query: (id) => ({ url: `/display/announcements/${id}`, method: 'DELETE' }),
            invalidatesTags: ['DisplayBoard'],
        }),
        getCrmActivities: builder.query({
            query: (params) => ({ url: '/crm/activities', params }),
            providesTags: ['CrmActivities'],
        }),
        createCrmActivity: builder.mutation({
            query: (data) => ({ url: '/crm/activities', method: 'POST', body: data }),
            invalidatesTags: ['CrmActivities'],
        }),
        updateCrmActivity: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/crm/activities/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['CrmActivities'],
        }),
        getSegments: builder.query({
            query: () => '/crm/segments',
            providesTags: ['Segments'],
        }),
        createSegment: builder.mutation({
            query: (data) => ({ url: '/crm/segments', method: 'POST', body: data }),
            invalidatesTags: ['Segments'],
        }),
        addSegmentMember: builder.mutation({
            query: ({ segmentId, patientId }) => ({ url: `/crm/segments/${segmentId}/members`, method: 'POST', body: { patientId } }),
            invalidatesTags: ['Segments'],
        }),
        getCampaigns: builder.query({
            query: () => '/crm/campaigns',
            providesTags: ['Campaigns'],
        }),
        createCampaign: builder.mutation({
            query: (data) => ({ url: '/crm/campaigns', method: 'POST', body: data }),
            invalidatesTags: ['Campaigns'],
        }),
        updateCampaignStatus: builder.mutation({
            query: ({ id, status }) => ({ url: `/crm/campaigns/${id}/status`, method: 'PUT', body: { status } }),
            invalidatesTags: ['Campaigns', 'NotificationJobs', 'Notifications'],
        }),
        getFeedback: builder.query({
            query: () => '/crm/feedback',
            providesTags: ['Feedback'],
        }),
        submitFeedback: builder.mutation({
            query: (data) => ({ url: '/crm/feedback', method: 'POST', body: data }),
            invalidatesTags: ['Feedback'],
        }),
        getLoyaltyHistory: builder.query({
            query: (patientId) => `/crm/loyalty/${patientId}/history`,
            providesTags: ['LoyaltyHistory'],
        }),
        getDueRecalls: builder.query({
            query: (params) => ({ url: '/crm/recalls/due', params }),
            providesTags: ['ClinicalRecalls'],
        }),
        createRecallTask: builder.mutation({
            query: (data) => ({ url: '/crm/recalls/create-task', method: 'POST', body: data }),
            invalidatesTags: ['ClinicalRecalls', 'CrmActivities'],
        }),
    }),
    overrideExisting: false,
});
