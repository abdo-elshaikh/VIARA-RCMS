import { api } from '../baseApi';

export const authApi = api.injectEndpoints({
    endpoints: (builder) => ({
        login: builder.mutation({
            query: (credentials) => ({
                url: '/auth/login',
                method: 'POST',
                body: credentials,
            }),
        }),
        passkeyAuthenticationOptions: builder.mutation({
            query: (data) => ({ url: '/auth/passkeys/authenticate/options', method: 'POST', body: data }),
        }),
        passkeyAuthenticationVerify: builder.mutation({
            query: (data) => ({ url: '/auth/passkeys/authenticate/verify', method: 'POST', body: data }),
        }),
        getPasskeys: builder.query({
            query: () => '/auth/passkeys', providesTags: ['Passkeys'],
        }),
        passkeyRegistrationOptions: builder.mutation({
            query: (data) => ({ url: '/auth/passkeys/register/options', method: 'POST', body: data }),
        }),
        passkeyRegistrationVerify: builder.mutation({
            query: (data) => ({ url: '/auth/passkeys/register/verify', method: 'POST', body: data }),
            invalidatesTags: ['Passkeys'],
        }),
        renamePasskey: builder.mutation({
            query: ({ id, label }) => ({ url: `/auth/passkeys/${id}`, method: 'PATCH', body: { label } }),
            invalidatesTags: ['Passkeys'],
        }),
        revokePasskey: builder.mutation({
            query: ({ id, currentPassword }) => ({ url: `/auth/passkeys/${id}`, method: 'DELETE', body: currentPassword ? { currentPassword } : {} }),
            invalidatesTags: ['Passkeys'],
        }),

        refreshSession: builder.mutation({
            query: () => ({ url: '/auth/refresh', method: 'POST' }),
        }),

        logout: builder.mutation({
            query: () => ({ url: '/auth/logout', method: 'POST' }),
        }),

        // Current user profile
        getProfile: builder.query({
            query: () => '/profile',
            providesTags: ['Profile'],
        }),
        updateProfile: builder.mutation({
            query: (data) => ({
                url: '/profile',
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Profile'],
        }),
        changePassword: builder.mutation({
            query: (data) => ({
                url: '/profile/password',
                method: 'PUT',
                body: data,
            }),
        }),
        getPreferences: builder.query({
            query: () => '/profile/preferences',
            providesTags: ['Profile'],
        }),
        updatePreferences: builder.mutation({
            query: (data) => ({
                url: '/profile/preferences',
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Profile'],
        }),
        exportPersonalData: builder.mutation({
            query: () => ({ url: '/profile/export', method: 'GET' }),
        }),
        getMyAuditLogs: builder.query({
            query: (params = {}) => ({ url: '/profile/audit', params }),
            providesTags: ['Audit'],
        }),
        getProfileSessions: builder.query({
            query: () => '/auth/sessions',
            providesTags: ['Sessions'],
        }),
        revokeProfileSession: builder.mutation({
            query: (id) => ({ url: `/auth/sessions/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Sessions'],
        }),
        getApiTokens: builder.query({
            query: () => '/profile/tokens',
            providesTags: ['Tokens'],
        }),
        createApiToken: builder.mutation({
            query: (data) => ({
                url: '/profile/tokens',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Tokens'],
        }),
        revokeApiToken: builder.mutation({
            query: (id) => ({
                url: `/profile/tokens/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Tokens'],
        }),
        setup2FA: builder.mutation({
            query: () => ({ url: '/auth/setup-2fa', method: 'POST' }),
        }),
        enable2FA: builder.mutation({
            query: (data) => ({ url: '/auth/enable-2fa', method: 'POST', body: data }),
        }),
        verify2FA: builder.mutation({
            query: (data) => ({ url: '/auth/verify-2fa', method: 'POST', body: data }),
        }),
    }),
    overrideExisting: false,
});
