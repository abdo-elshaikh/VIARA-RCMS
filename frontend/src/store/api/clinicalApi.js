import { api } from '../baseApi';

export const clinicalApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getExamTypes: builder.query({
            query: (arg) => {
                if (arg && typeof arg === 'object') return { url: '/exam-types', params: arg };
                return arg ? `/exam-types?modalityId=${arg}` : '/exam-types';
            },
            providesTags: ['ExamTypes'],
        }),
        createExamType: builder.mutation({
            query: (data) => ({ url: '/exam-types', method: 'POST', body: data }),
            invalidatesTags: ['ExamTypes', 'ScheduleAvailability'],
        }),
        updateExamType: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/exam-types/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['ExamTypes', 'ScheduleAvailability'],
        }),
        deleteExamType: builder.mutation({
            query: (id) => ({ url: `/exam-types/${id}`, method: 'DELETE' }),
            invalidatesTags: ['ExamTypes', 'ScheduleAvailability'],
        }),
        getWorklist: builder.query({
            query: (params) => ({
                url: '/exams/worklist',
                params,
            }),
            providesTags: ['Queue'],
        }),
        getCaseReports: builder.query({
            query: (params) => ({
                url: '/case-reports',
                params,
            }),
            providesTags: ['CaseReports'],
        }),
        lookupCaseReport: builder.query({
            query: (code) => ({
                url: '/case-reports/lookup',
                params: { code },
            }),
            providesTags: ['CaseReports'],
        }),
        getExam: builder.query({
            query: (id) => `/exams/${id}`,
            providesTags: (result, error, id) => [{ type: 'Queue', id }],
        }),
        updateReport: builder.mutation({
            query: (data) => ({
                url: '/exams/report',
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Appointments', 'Dashboard', 'OrderTimeline', 'Queue'],
        }),
        improveReportFormat: builder.mutation({
            query: (data) => ({
                url: '/exams/report/improve-format',
                method: 'POST',
                body: data,
            }),
        }),
        generatePreliminaryReportDraft: builder.mutation({
            query: ({ examId, ...body }) => ({
                url: `/exams/${examId}/ai-preliminary-draft`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (result, error, { examId }) => [{ type: 'AiReportDrafts', id: examId }],
        }),
        getAiReportDrafts: builder.query({
            query: (examId) => `/exams/${examId}/ai-drafts`,
            providesTags: (result, error, examId) => [{ type: 'AiReportDrafts', id: examId }],
        }),
        markAiReportDraftApplied: builder.mutation({
            query: ({ examId, draftId, mode }) => ({
                url: `/exams/${examId}/ai-drafts/${draftId}/applied`,
                method: 'POST',
                body: { mode },
            }),
            invalidatesTags: (result, error, { examId }) => [{ type: 'AiReportDrafts', id: examId }],
        }),
        getReportTemplates: builder.query({
            query: (params) => ({
                url: '/report-templates',
                params,
            }),
            providesTags: ['ReportTemplates'],
        }),
        createReportTemplate: builder.mutation({
            query: (data) => ({
                url: '/report-templates',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['ReportTemplates'],
        }),
        updateReportTemplate: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/report-templates/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['ReportTemplates'],
        }),
        deleteReportTemplate: builder.mutation({
            query: (id) => ({
                url: `/report-templates/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['ReportTemplates'],
        }),
        amendReport: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/exams/${id}/report/amend`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Appointments', 'Dashboard', 'OrderTimeline', 'Queue'],
        }),
        deliverResult: builder.mutation({
            query: ({ examId, ...data }) => ({
                url: `/results/${examId}/deliver`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['ResultDelivery', 'Queue', 'CaseReports', 'Appointments', 'PatientHistory'],
        }),
        getResultDeliveryHistory: builder.query({
            query: (examId) => `/results/${examId}/delivery-history`,
            providesTags: (result, error, examId) => [{ type: 'ResultDelivery', id: examId }],
        }),
        getQueue: builder.query({
            query: (params) => ({
                url: '/queue',
                params,
            }),
            providesTags: ['Queue'],
        }),
        transitionQueue: builder.mutation({
            query: ({ examId, ...body }) => ({
                url: `/queue/${examId}/transition`,
                method: 'POST',
                body,
            }),
            invalidatesTags: ['Queue', 'Appointments', 'Dashboard', 'OrderTimeline'],
        }),
        claimQueueTask: builder.mutation({
            query: (examId) => ({ url: `/queue/${examId}/claim`, method: 'POST' }),
            invalidatesTags: ['Queue'],
        }),
        releaseQueueTaskAssignment: builder.mutation({
            query: (examId) => ({ url: `/queue/${examId}/release`, method: 'POST' }),
            invalidatesTags: ['Queue'],
        }),
        acknowledgeCriticalResult: builder.mutation({
            query: (id) => ({ url: `/notifications/critical/${id}/ack`, method: 'POST' }),
            invalidatesTags: ['Notifications'],
        }),
        getSafetyTemplates: builder.query({
            query: (modalityId) => `/clinical/templates/${modalityId}`,
            providesTags: ['ClinicalSafety'],
        }),
        submitSafetyResponse: builder.mutation({
            query: ({ examId, data }) => ({ url: `/clinical/exams/${examId}/responses`, method: 'POST', body: data }),
            invalidatesTags: ['ClinicalSafety'],
        }),
        getExamSafetyResponses: builder.query({
            query: (examId) => `/clinical/exams/${examId}/responses`,
            providesTags: ['ClinicalSafety'],
        }),
    }),
    overrideExisting: false,
});
