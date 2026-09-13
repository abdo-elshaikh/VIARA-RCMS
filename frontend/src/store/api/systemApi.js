import { api } from '../baseApi';

export const systemApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getDashboardStats: builder.query({
            query: () => '/dashboard/stats',
            providesTags: ['Dashboard'],
            keepUnusedDataFor: 30,
        }),
        getVolumeAnalytics: builder.query({
            query: (params) => ({ url: '/analytics/volume', params }),
            providesTags: ['Analytics'],
        }),
        getRevenueAnalytics: builder.query({
            query: (params) => ({ url: '/analytics/revenue', params }),
            providesTags: ['Analytics'],
        }),
        getPerformanceAnalytics: builder.query({
            query: (params) => ({ url: '/analytics/performance', params }),
            providesTags: ['Analytics'],
        }),
        getReferralAnalytics: builder.query({
            query: (params) => ({
                url: '/analytics/referrals',
                params,
            }),
            providesTags: ['Analytics'],
        }),
        getPeakHoursAnalytics: builder.query({
            query: (params) => ({ url: '/analytics/peak-hours', params }),
            providesTags: ['Analytics'],
        }),
        getTopProceduresAnalytics: builder.query({
            query: (params) => ({ url: '/analytics/top-procedures', params }),
            providesTags: ['Analytics'],
        }),
        getIntegrations: builder.query({
            query: () => '/integrations',
            providesTags: ['Integrations'],
        }),
        updateIntegration: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/integrations/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Integrations'],
        }),
        testIntegration: builder.mutation({
            query: (id) => ({ url: `/integrations/${id}/test`, method: 'POST' }),
            invalidatesTags: ['Integrations'],
        }),
        getIntegrationLogs: builder.query({
            query: () => '/integrations/logs',
            providesTags: ['Integrations'],
        }),
        retryIntegrationEvent: builder.mutation({
            query: (logId) => ({ url: `/integrations/logs/${logId}/retry`, method: 'POST' }),
            invalidatesTags: ['Integrations'],
        }),
        retryDeadLetterEvent: builder.mutation({
            query: (logId) => ({ url: `/integrations/logs/${logId}/retry-dead-letter`, method: 'POST' }),
            invalidatesTags: ['Integrations'],
        }),
        getDeadLetterEvents: builder.query({
            query: () => '/integrations/logs/dead-letter',
            providesTags: ['Integrations'],
        }),
        seedIntegrations: builder.mutation({
            query: () => ({ url: '/v1/integrations/seed', method: 'POST' }),
            invalidatesTags: ['Integrations'],
        }),
        getCenterSettings: builder.query({
            query: () => '/settings/center',
            providesTags: ['Settings'],
        }),
        getPublicCenterSettings: builder.query({
            query: () => '/settings/public/home',
            providesTags: ['PublicSettings'],
        }),
        getPublicLandingOverview: builder.query({
            query: () => '/public/landing-overview',
            providesTags: ['PublicLanding'],
            keepUnusedDataFor: 60,
        }),
        updateCenterSettings: builder.mutation({
            query: (data) => ({ url: '/settings/center', method: 'PUT', body: data }),
            invalidatesTags: ['Settings', 'PublicSettings'],
        }),
        getDatabaseSettings: builder.query({
            query: () => '/settings/database',
            providesTags: ['Settings'],
        }),
        updateDatabaseSettings: builder.mutation({
            query: (data) => ({ url: '/settings/database', method: 'PUT', body: data }),
            invalidatesTags: ['Settings'],
        }),
        testDatabaseSettings: builder.mutation({
            query: (data) => ({ url: '/settings/database/test', method: 'POST', body: data }),
        }),
        vacuumDatabase: builder.mutation({
            query: () => ({ url: '/settings/admin/maintenance/vacuum', method: 'POST' }),
            invalidatesTags: ['Settings', 'AdminTelemetry'],
        }),
        flushServerCache: builder.mutation({
            query: () => ({ url: '/settings/admin/maintenance/clear-cache', method: 'POST' }),
            invalidatesTags: ['Settings', 'PublicSettings', 'AdminTelemetry'],
        }),
        getAdminTelemetry: builder.query({
            query: () => '/settings/admin/telemetry',
            providesTags: ['AdminTelemetry'],
        }),
        getGovernancePolicies: builder.query({
            query: () => '/settings/admin/governance',
            providesTags: ['Governance'],
        }),
        updateGovernancePolicies: builder.mutation({
            query: (body) => ({ url: '/settings/admin/governance', method: 'PUT', body }),
            invalidatesTags: ['Governance', 'Settings'],
        }),
        getAiSettings: builder.query({
            query: () => '/settings/ai',
            providesTags: ['Settings'],
        }),
        getAiSettingsStatus: builder.query({
            query: () => '/settings/ai/status',
            providesTags: ['Settings'],
        }),
        updateAiSettings: builder.mutation({
            query: (data) => ({ url: '/settings/ai', method: 'PUT', body: data }),
            invalidatesTags: ['Settings'],
        }),
        testAiSettings: builder.mutation({
            query: (data) => ({ url: '/settings/ai/test', method: 'POST', body: data }),
        }),
        getAiProfiles: builder.query({
            query: () => '/settings/ai/profiles',
            providesTags: ['Settings'],
        }),
        createAiProfile: builder.mutation({
            query: (data) => ({ url: '/settings/ai/profiles', method: 'POST', body: data }),
            invalidatesTags: ['Settings'],
        }),
        updateAiProfile: builder.mutation({
            query: ({ id, ...body }) => ({ url: `/settings/ai/profiles/${id}`, method: 'PUT', body }),
            invalidatesTags: ['Settings'],
        }),
        activateAiProfile: builder.mutation({
            query: (id) => ({ url: `/settings/ai/profiles/${id}/activate`, method: 'POST' }),
            invalidatesTags: ['Settings'],
        }),
        deleteAiProfile: builder.mutation({
            query: (id) => ({ url: `/settings/ai/profiles/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Settings'],
        }),
        getBackups: builder.query({
            query: () => '/backups',
            providesTags: ['Backups'],
        }),
        generateBackup: builder.mutation({
            query: () => ({ url: '/backups/generate', method: 'POST' }),
            invalidatesTags: ['Backups'],
        }),
        restoreBackup: builder.mutation({
            query: (body) => ({ url: '/backups/restore', method: 'POST', body }),
            invalidatesTags: ['Backups', 'Patients'],
        }),
        getExamImagingStatus: builder.query({
            query: (examId) => `/pacs/exams/${examId}/imaging`,
            providesTags: (result, error, examId) => [{ type: 'Pacs', id: examId }],
        }),
        getPacsAiAnalysisJobs: builder.query({
            query: (examId) => `/pacs/exams/${examId}/ai-analysis`,
            providesTags: (result, error, examId) => [{ type: 'PacsAiAnalysis', id: examId }],
        }),
        getPacsAiAnalysisQueue: builder.query({
            query: (params = {}) => ({ url: '/pacs/ai-analysis', params }),
            providesTags: ['PacsAiAnalysis'],
        }),
        requestPacsAiAnalysis: builder.mutation({
            query: ({ examId, analysisType = 'preliminary_image_review' }) => ({
                url: `/pacs/exams/${examId}/ai-analysis`,
                method: 'POST',
                body: { analysisType },
            }),
            invalidatesTags: (result, error, { examId }) => [
                { type: 'PacsAiAnalysis', id: examId },
                'PacsAudit'
            ],
        }),
        processPacsAiAnalysisQueue: builder.mutation({
            query: (limit = 2) => ({
                url: '/pacs/ai-analysis/process',
                method: 'POST',
                body: { limit },
            }),
            invalidatesTags: ['PacsAiAnalysis', 'PacsAudit'],
        }),
        retryPacsAiJob: builder.mutation({
            query: (jobId) => ({ url: `/pacs/ai-analysis/jobs/${jobId}/retry`, method: 'POST' }),
            invalidatesTags: ['PacsAiAnalysis', 'PacsAudit'],
        }),
        cancelPacsAiJob: builder.mutation({
            query: (jobId) => ({ url: `/pacs/ai-analysis/jobs/${jobId}/cancel`, method: 'POST' }),
            invalidatesTags: ['PacsAiAnalysis', 'PacsAudit'],
        }),
        deletePacsAiJob: builder.mutation({
            query: (jobId) => ({ url: `/pacs/ai-analysis/jobs/${jobId}`, method: 'DELETE' }),
            invalidatesTags: ['PacsAiAnalysis', 'PacsAudit'],
        }),
        retryAllPacsAiJobs: builder.mutation({
            query: () => ({ url: '/pacs/ai-analysis/queue/retry-all', method: 'POST' }),
            invalidatesTags: ['PacsAiAnalysis', 'PacsAudit'],
        }),
        cancelAllPacsAiJobs: builder.mutation({
            query: () => ({ url: '/pacs/ai-analysis/queue/cancel-all', method: 'POST' }),
            invalidatesTags: ['PacsAiAnalysis', 'PacsAudit'],
        }),
        getPacsQuarantine: builder.query({
            query: (status = 'Pending') => ({ url: '/pacs/quarantine', params: { status } }),
            providesTags: ['PacsQuarantine'],
        }),
        searchScheduledExams: builder.query({
            query: (q) => ({ url: '/pacs/scheduled-exams', params: { q } }),
        }),
        reconcileQuarantineStudy: builder.mutation({
            query: ({ id, examId }) => ({ url: `/pacs/quarantine/${id}/reconcile`, method: 'POST', body: { examId } }),
            invalidatesTags: ['PacsQuarantine', 'Pacs', 'Queue'],
        }),
        discardQuarantineStudy: builder.mutation({
            query: (id) => ({ url: `/pacs/quarantine/${id}/discard`, method: 'POST' }),
            invalidatesTags: ['PacsQuarantine'],
        }),
        uploadExamImages: builder.mutation({
            query: ({ examId, formData }) => ({
                url: `/pacs/exams/${examId}/images`,
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: (result, error, { examId }) => [{ type: 'Pacs', id: examId }, 'Queue'],
        }),
        syncModalityDicom: builder.mutation({
            query: ({ id, ...body }) => ({ url: `/pacs/settings/modalities/${id}`, method: 'PUT', body }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability'],
        }),
        getOrthancSystem: builder.query({
            query: () => '/pacs/settings/system',
        }),
        getPacsConfig: builder.query({
            query: () => '/pacs/settings/config',
            providesTags: ['SystemSettings']
        }),
        getPacsDiagnostics: builder.query({
            query: () => '/pacs/settings/diagnostics',
            providesTags: ['Pacs'],
        }),
        updatePacsConfig: builder.mutation({
            query: (body) => ({ url: '/pacs/settings/config', method: 'PUT', body }),
            invalidatesTags: ['SystemSettings', 'PacsAudit']
        }),
        pingModalityDicom: builder.mutation({
            query: (id) => ({ url: `/pacs/settings/modalities/${id}/echo`, method: 'POST' }),
            invalidatesTags: ['PacsAudit']
        }),
        getPacsAudit: builder.query({
            query: (params = {}) => ({ url: '/pacs/audit', params }),
            providesTags: ['PacsAudit'],
        }),
        getPacsRequests: builder.query({
            query: (params = {}) => ({ url: '/pacs/requests', params }),
            providesTags: ['PacsAudit', 'PacsQuarantine'],
        }),
        getPacsWorklistPreview: builder.query({
            query: (params = {}) => ({ url: '/pacs/worklist/preview', params }),
            providesTags: ['Pacs'],
        }),
        refreshPacsWorklist: builder.mutation({
            query: () => ({ url: '/pacs/worklist/refresh', method: 'POST' }),
            invalidatesTags: ['Pacs', 'PacsAudit'],
        }),
        getPacsStorageSummary: builder.query({
            query: () => '/pacs/storage',
            providesTags: ['Pacs'],
        }),
        runPacsTiering: builder.mutation({
            query: () => ({ url: '/pacs/storage/tier', method: 'POST' }),
            invalidatesTags: ['Pacs', 'PacsAudit'],
        }),
        getAuditLogs: builder.query({
            query: (params = {}) => ({ url: '/v1/audit', params }),
            providesTags: ['Audit'],
        }),
        getAuditAlerts: builder.query({
            query: (params = {}) => ({ url: '/v1/audit/alerts', params }),
            providesTags: ['Audit'],
        }),
        reviewAuditAlert: builder.mutation({
            query: ({ alertId, ...body }) => ({ url: `/v1/audit/alerts/${alertId}/review`, method: 'PATCH', body }),
            invalidatesTags: ['Audit'],
        }),
        runAuditDetections: builder.mutation({
            query: (body = {}) => ({ url: '/v1/audit/alerts/detect', method: 'POST', body }),
            invalidatesTags: ['Audit'],
        }),
        verifyAuditChain: builder.query({
            query: () => ({ url: '/v1/audit/verify' }),
        }),
        getMyPermissions: builder.query({
            query: () => '/rbac/my-permissions',
            providesTags: ['RBAC'],
        }),
        getAllPermissions: builder.query({
            query: () => '/rbac/permissions',
            providesTags: ['RBAC'],
        }),
        getRolePermissions: builder.query({
            query: () => '/rbac/roles',
            providesTags: ['RBAC'],
        }),
        updateRolePermissions: builder.mutation({
            query: ({ role, permissionIds }) => ({
                url: `/rbac/roles/${role}/permissions`,
                method: 'PUT',
                body: { permissionIds },
            }),
            invalidatesTags: ['RBAC'],
        }),
        resetRolePermissions: builder.mutation({
            query: (role) => ({
                url: `/rbac/roles/${role}/reset`,
                method: 'POST',
            }),
            invalidatesTags: ['RBAC'],
        }),
        cloneRolePermissions: builder.mutation({
            query: ({ role, sourceRole }) => ({
                url: `/rbac/roles/${role}/clone`,
                method: 'POST',
                body: { sourceRole },
            }),
            invalidatesTags: ['RBAC'],
        }),
        getRbacAuditLogs: builder.query({
            query: (params = {}) => ({
                url: '/rbac/audit-logs',
                params,
            }),
            providesTags: ['RBAC'],
        }),
        getBreakGlassStatus: builder.query({
            query: () => '/rbac/break-glass/status',
            providesTags: ['RBAC'],
        }),
        getActiveBreakGlassGrants: builder.query({
            query: () => '/rbac/break-glass/active',
            providesTags: ['RBAC'],
        }),
        requestBreakGlass: builder.mutation({
            query: (body) => ({
                url: '/rbac/break-glass',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['RBAC'],
        }),
        revokeBreakGlass: builder.mutation({
            query: (body) => ({
                url: '/rbac/break-glass/revoke',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['RBAC'],
        }),
        adminRevokeBreakGlass: builder.mutation({
            query: ({ grantId, reason }) => ({
                url: `/rbac/break-glass/${grantId}/revoke`,
                method: 'POST',
                body: { reason },
            }),
            invalidatesTags: ['RBAC'],
        }),
    }),
    overrideExisting: false,
});
