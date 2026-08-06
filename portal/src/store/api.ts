import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setAccessToken, logOut } from './authSlice';

const getCsrfToken = (): string | null => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

const baseQuery = fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    credentials: 'include',
    prepareHeaders: (headers, { getState }: { getState: () => any }) => {
        const state = getState();
        const token = state?.auth?.token || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('token') : null);
        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }
        return headers;
    },
});

const baseQueryWithCsrf = async (args: any, apiInstance: any, extraOptions: any) => {
    const requestArgs = typeof args === 'string' ? { url: args } : { ...args };
    const method = String(requestArgs.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
            requestArgs.headers = {
                ...(requestArgs.headers || {}),
                'x-csrf-token': csrfToken,
            };
        }
    }

    return baseQuery(requestArgs, apiInstance, extraOptions) as Promise<any>;
};

let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = (apiInstance: any, extraOptions: any): Promise<string | null> => {
    if (!refreshPromise) {
        refreshPromise = (baseQueryWithCsrf({
            url: '/auth/refresh',
            method: 'POST'
        }, apiInstance, extraOptions) as Promise<any>)
            .then((refreshResult) => {
                const token = refreshResult.data?.token;
                if (token) {
                    apiInstance.dispatch(setAccessToken(token));
                    return token;
                }

                apiInstance.dispatch(logOut());
                return null;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
};

const baseQueryWithReauth = async (args: any, apiInstance: any, extraOptions: any) => {
    let result = await baseQueryWithCsrf(args, apiInstance, extraOptions);
    if (result.error && result.error.status === 401 && args.url !== '/auth/login' && args.url !== '/portal/login' && args.url !== '/doctor-portal/login') {
        const token = await refreshAccessToken(apiInstance, extraOptions);
        if (token) {
            result = await baseQueryWithCsrf(args, apiInstance, extraOptions);
        }
    }
    return result;
};

export const api = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithReauth,
    tagTypes: [
        'Profile', 'MyRecords', 'PortalInvoices', 'PortalDocuments', 'PortalRequests',
        'DoctorCases', 'DoctorMessages', 'Settings', 'PublicSettings', 'PatientMessages',
        'PortalNotifications', 'DoctorNotifications'
    ],
    endpoints: (builder) => ({
        logout: builder.mutation<any, undefined>({
            query: () => ({ url: '/auth/logout', method: 'POST' }),
        }),

        changePassword: builder.mutation<any, { currentPassword: string; newPassword: string }>({
            query: (body) => ({
                url: '/auth/change-password',
                method: 'POST',
                body,
            }),
        }),

        // ─── Patient Portal ─────────────────────────────────────────────
        patientLogin: builder.mutation<any, any>({
            query: (credentials) => ({
                url: '/portal/login',
                method: 'POST',
                body: credentials,
            }),
        }),
        getMyRecords: builder.query<any, void>({
            query: () => '/portal/records',
            providesTags: ['MyRecords'],
        }),
        getMyPortalProfile: builder.query<any, void>({
            query: () => '/portal/profile',
            providesTags: ['Profile'],
        }),
        getMyPortalInvoices: builder.query<any, void>({
            query: () => '/portal/invoices',
            providesTags: ['PortalInvoices'],
        }),
        getMyPortalDocuments: builder.query<any, void>({
            query: () => '/portal/documents',
            providesTags: ['PortalDocuments'],
        }),
        downloadPortalDocument: builder.query<any, string>({
            query: (documentId) => `/portal/documents/${documentId}/download`,
        }),
        getMyAppointmentRequests: builder.query<any, void>({
            query: () => '/portal/appointment-requests',
            providesTags: ['PortalRequests'],
        }),
        createPortalAppointmentRequest: builder.mutation<any, any>({
            query: (data) => ({
                url: '/portal/appointment-requests',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['PortalRequests'],
        }),
        createPortalProfileUpdateRequest: builder.mutation<any, any>({
            query: (data) => ({
                url: '/portal/profile-update-requests',
                method: 'POST',
                body: data,
            }),
        }),
        getMyMessages: builder.query<any, undefined>({
            query: () => '/portal/messages',
            providesTags: ['PatientMessages'],
        }),
        sendPortalMessage: builder.mutation<any, any>({
            query: (data) => ({
                url: '/portal/messages',
                method: 'POST',
                body: data,
            }),
            async onQueryStarted(arg, { dispatch, queryFulfilled }) {
                const optimistic = {
                    message_id: `temp-${Date.now()}`,
                    body: arg.body,
                    sender_role: 'Patient',
                    created_at: new Date().toISOString(),
                    _optimistic: true,
                };
                const patch = dispatch(
                    api.util.updateQueryData('getMyMessages' as any, undefined, (draft: any) => {
                        draft.push(optimistic);
                    })
                );
                try {
                    await queryFulfilled;
                } catch {
                    patch.undo();
                }
            },
            invalidatesTags: ['PatientMessages'],
        }),

        // ─── Patient Portal Notifications ───────────────────────────────
        getMyPortalNotifications: builder.query<any, void>({
            query: () => '/portal/notifications',
            providesTags: ['PortalNotifications'],
        }),
        getMyPortalNotificationUnreadCount: builder.query<any, void>({
            query: () => '/portal/notifications/unread-count',
            providesTags: ['PortalNotifications'],
        }),
        markMyPortalNotificationRead: builder.mutation<any, string>({
            query: (id) => ({
                url: `/portal/notifications/${id}/read`,
                method: 'PUT',
            }),
            invalidatesTags: ['PortalNotifications'],
        }),
        markAllMyPortalNotificationsRead: builder.mutation<any, undefined>({
            query: () => ({
                url: '/portal/notifications/mark-all-read',
                method: 'PUT',
            }),
            invalidatesTags: ['PortalNotifications'],
        }),

        // ─── Doctor Portal ──────────────────────────────────────────────
        doctorLogin: builder.mutation<any, any>({
            query: (credentials) => ({
                url: '/doctor-portal/login',
                method: 'POST',
                body: credentials,
            }),
        }),
        getDoctorCases: builder.query<any, any>({
            query: (params) => ({
                url: '/doctor-portal/cases',
                params,
            }),
            providesTags: ['DoctorCases'],
        }),
        getDoctorReport: builder.query<any, string>({
            query: (examId) => `/doctor-portal/reports/${examId}`,
            providesTags: (_result, _error, examId) => [{ type: 'DoctorCases', id: examId }],
        }),
        getDoctorMessages: builder.query<any, void>({
            query: () => '/doctor-portal/messages',
            providesTags: ['DoctorMessages'],
        }),
        getDoctorUnreadCount: builder.query<any, void>({
            query: () => '/doctor-portal/messages/unread-count',
            providesTags: ['DoctorMessages'],
        }),
        sendDoctorMessage: builder.mutation<any, any>({
            query: (data) => ({
                url: '/doctor-portal/messages',
                method: 'POST',
                body: data,
            }),
            async onQueryStarted(arg, { dispatch, queryFulfilled }) {
                const optimistic = {
                    message_id: `temp-${Date.now()}`,
                    body: arg.body,
                    sender_role: 'Doctor',
                    created_at: new Date().toISOString(),
                    _optimistic: true,
                };
                const patch = dispatch(
                    api.util.updateQueryData('getDoctorMessages' as any, undefined, (draft: any) => {
                        draft.push(optimistic);
                    })
                );
                try {
                    await queryFulfilled;
                } catch {
                    patch.undo();
                }
            },
            invalidatesTags: ['DoctorMessages'],
        }),
        getDoctorNotifications: builder.query<any, void>({
            query: () => '/doctor-portal/notifications',
            providesTags: ['DoctorNotifications'],
        }),
        getDoctorNotificationUnreadCount: builder.query<any, void>({
            query: () => '/doctor-portal/notifications/unread-count',
            providesTags: ['DoctorNotifications'],
        }),
        markDoctorNotificationRead: builder.mutation<any, string>({
            query: (notificationId) => ({
                url: `/doctor-portal/notifications/${notificationId}/read`,
                method: 'PUT',
            }),
            invalidatesTags: ['DoctorNotifications'],
        }),
        markAllDoctorNotificationsRead: builder.mutation<any, undefined>({
            query: () => ({
                url: '/doctor-portal/notifications/mark-all-read',
                method: 'PUT',
            }),
            invalidatesTags: ['DoctorNotifications'],
        }),
        createDoctorOrder: builder.mutation<any, any>({
            query: (data) => ({
                url: '/doctor-portal/orders',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['DoctorCases'],
        }),

        // ─── Center Settings (read-only, used by portals) ───────────────
        getCenterSettings: builder.query<any, void>({
            query: () => '/settings/center',
            providesTags: ['Settings'],
        }),
        getPublicCenterSettings: builder.query<any, void>({
            query: () => '/settings/public/home',
            providesTags: ['PublicSettings'],
        }),
        lookupPublicCaseStatus: builder.mutation<any, { mrn: string }>({
            query: (body) => ({
                url: '/public/case-status',
                method: 'POST',
                body,
            }),
        }),
    }),
});

export const {
    usePatientLoginMutation,
    useChangePasswordMutation,
    useGetMyRecordsQuery,
    useGetMyPortalProfileQuery,
    useGetMyPortalInvoicesQuery,
    useGetMyPortalDocumentsQuery,
    useLazyDownloadPortalDocumentQuery,
    useGetMyAppointmentRequestsQuery,
    useCreatePortalAppointmentRequestMutation,
    useCreatePortalProfileUpdateRequestMutation,
    useDoctorLoginMutation,
    useGetDoctorCasesQuery,
    useGetDoctorReportQuery,
    useGetDoctorMessagesQuery,
    useGetDoctorUnreadCountQuery,
    useSendDoctorMessageMutation,
    useCreateDoctorOrderMutation,
    useGetCenterSettingsQuery,
    useGetPublicCenterSettingsQuery,
    useLookupPublicCaseStatusMutation,
    useLogoutMutation,
    useGetMyMessagesQuery,
    useSendPortalMessageMutation,
    useGetMyPortalNotificationsQuery,
    useGetMyPortalNotificationUnreadCountQuery,
    useMarkMyPortalNotificationReadMutation,
    useMarkAllMyPortalNotificationsReadMutation,
    useGetDoctorNotificationsQuery,
    useGetDoctorNotificationUnreadCountQuery,
    useMarkDoctorNotificationReadMutation,
    useMarkAllDoctorNotificationsReadMutation,
} = api;
