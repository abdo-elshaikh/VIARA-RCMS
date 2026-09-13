import { api } from '../baseApi';

export const patientApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getPatients: builder.query({
            query: (params) => ({
                url: '/patients',
                params,
            }),
            providesTags: ['Patients'],
        }),
        createPatient: builder.mutation({
            query: (data) => ({
                url: '/patients',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Patients'],
        }),
        updatePatient: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/patients/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: (result, error, { id }) => ['Patients', { type: 'PatientHistory', id }],
        }),
        deletePatient: builder.mutation({
            query: (id) => ({
                url: `/patients/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Patients'],
        }),
        generatePortalPassword: builder.mutation({
            query: (id) => ({
                url: `/patients/${id}/generate-password`,
                method: 'POST',
            }),
            invalidatesTags: ['Patients'],
        }),
        getPortalReviewRequests: builder.query({
            query: () => '/portal/review-requests',
            providesTags: ['PortalReviewRequests'],
        }),
        reviewPortalAppointmentRequest: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/portal/appointment-requests/${id}/review`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PortalReviewRequests'],
        }),
        reviewPortalProfileUpdateRequest: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/portal/profile-update-requests/${id}/review`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PortalReviewRequests'],
        }),
        getPatientById: builder.query({
            query: (id) => `/patients/${id}`,
            providesTags: (result, error, id) => [{ type: 'Patients', id }],
        }),
        getPatientHistory: builder.query({
            query: (id) => `/patients/${id}/history`,
            providesTags: (result, error, id) => [{ type: 'PatientHistory', id }],
        }),
        getPatientDuplicates: builder.query({
            query: (params) => ({
                url: '/patients/duplicates',
                params,
            }),
            providesTags: ['PatientDuplicates'],
        }),
        mergePatients: builder.mutation({
            query: ({ targetPatientId, sourcePatientId, reason }) => ({
                url: `/patients/${targetPatientId}/merge`,
                method: 'POST',
                body: { sourcePatientId, reason },
            }),
            invalidatesTags: ['Patients', 'PatientHistory', 'PatientDuplicates'],
        }),
        getPrivacyRequests: builder.query({
            query: () => '/privacy/requests',
            providesTags: ['Privacy'],
        }),
        createPrivacyRequest: builder.mutation({
            query: (data) => ({ url: '/privacy/requests', method: 'POST', body: data }),
            invalidatesTags: ['Privacy'],
        }),
        resolvePrivacyRequest: builder.mutation({
            query: ({ requestId, action, notes }) => ({ url: `/privacy/requests/${requestId}/resolve`, method: 'PUT', body: { action, notes } }),
            invalidatesTags: ['Privacy'],
        }),
        getPatientConsents: builder.query({
            query: (patientId) => `/privacy/consents/${patientId}`,
            providesTags: ['Privacy'],
        }),
        getCurrentPatientConsents: builder.query({
            query: (patientId) => `/privacy/consents/${patientId}/current`,
            providesTags: ['Privacy'],
        }),
        addPatientConsent: builder.mutation({
            query: ({ patientId, ...data }) => ({ url: `/privacy/consents/${patientId}`, method: 'POST', body: data }),
            invalidatesTags: ['Privacy'],
        }),
        revokePatientConsent: builder.mutation({
            query: ({ consentId, reason }) => ({ url: `/privacy/consents/${consentId}/revoke`, method: 'PUT', body: { reason } }),
            invalidatesTags: ['Privacy'],
        }),
        getPatientDocuments: builder.query({
            query: (patientId) => `/documents/patient/${patientId}`,
            providesTags: ['Documents'],
        }),
        uploadDocument: builder.mutation({
            query: (formData) => ({
                url: '/documents',
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: ['Documents'],
        }),
        updateDocument: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/documents/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Documents'],
        }),
        deleteDocument: builder.mutation({
            query: (id) => ({ url: `/documents/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Documents'],
        }),
        importPatients: builder.mutation({
            query: (formData) => ({
                url: '/import/patients',
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: ['Patients'],
        }),
        updateLoyaltyPoints: builder.mutation({
            query: ({ patientId, points }) => ({ url: `/crm/loyalty/${patientId}`, method: 'PUT', body: { points } }),
            invalidatesTags: ['Patients', 'PatientHistory'],
        }),
    }),
    overrideExisting: false,
});
