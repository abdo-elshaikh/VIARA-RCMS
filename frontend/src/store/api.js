import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setAccessToken, logOut } from './authSlice';

const baseQuery = fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
        const token = getState().auth.token || sessionStorage.getItem('token');
        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }
        return headers;
    },
});

let refreshPromise = null;

const refreshAccessToken = (api, extraOptions) => {
    if (!refreshPromise) {
        refreshPromise = baseQuery({
            url: '/auth/refresh',
            method: 'POST'
        }, api, extraOptions)
            .then((refreshResult) => {
                const token = refreshResult.data?.token;
                if (token) {
                    api.dispatch(setAccessToken(token));
                    return token;
                }

                api.dispatch(logOut());
                return null;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
};

const baseQueryWithReauth = async (args, api, extraOptions) => {
    let result = await baseQuery(args, api, extraOptions);
    if (result.error && result.error.status === 401 && args.url !== '/auth/login') {
        const token = await refreshAccessToken(api, extraOptions);
        if (token) {
            result = await baseQuery(args, api, extraOptions);
        }
    }
    return result;
};

export const api = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithReauth,
    tagTypes: [
        'User', 'Profile', 'Sessions', 'Tokens', 'Patients', 'Appointments', 'ScheduleAvailability', 'WaitingList', 'PortalReviewRequests', 'ReferringDoctors', 'Machines', 'ExamTypes', 'Dashboard', 'Staff', 'StaffProfiles', 'Shifts', 'Attendance', 'LeaveRequests', 'Payroll', 'PayrollRuns', 'PayrollCompensation', 'PayrollRules', 'PayrollDeductions', 'PayrollPenalties', 'Inventory', 'PatientHistory', 'PatientDuplicates', 'OrderTimeline', 'Queue', 'CaseReports', 'Invoices', 'Refunds', 'PartialPaymentExceptions', 'Cashier', 'Insurance', 'Claims', 'ReportTemplates', 'ResultDelivery', 'AiReportDrafts', 'Notifications', 'NotificationTemplates', 'NotificationJobs', 'Audit', 'RBAC', 'Privacy', 'Analytics', 'Documents', 'Integrations', 'Settings', 'PublicSettings', 'PublicLanding', 'Backups', 'ClinicalSafety', 'Closures', 'Pacs', 'PacsQuarantine', 'PacsAudit', 'PacsAiAnalysis', 'FinancialReports', 'Commissions', 'ExpenseCategories', 'Expenses', 'Segments', 'Campaigns', 'Feedback', 'ChatMessages', 'StaffUsers', 'PatientConversations', 'DoctorConversations', 'ChatUnread'
    ],
    endpoints: (builder) => ({
        login: builder.mutation({
            query: (credentials) => ({
                url: '/auth/login',
                method: 'POST',
                body: credentials,
            }),
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
            query: () => '/profile/audit',
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
        getOrganizationStaff: builder.query({
            query: () => '/staff',
            providesTags: ['Staff'],
        }),
        createOrganizationStaff: builder.mutation({
            query: (data) => ({
                url: '/staff',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Staff'],
        }),

        // Appointments
        getAppointments: builder.query({
            query: (params) => ({
                url: '/appointments',
                params,
            }),
            providesTags: ['Appointments'],
        }),
        getAppointmentById: builder.query({
            query: (id) => `/appointments/${id}`,
            providesTags: (result, error, id) => [{ type: 'Appointments', id }],
        }),
        createAppointment: builder.mutation({
            query: (data) => ({
                url: '/appointments',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Appointments', 'Queue'],
        }),
        updateAppointment: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/appointments/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Appointments', 'Dashboard', 'OrderTimeline', 'Queue'],
        }),
        deleteAppointment: builder.mutation({
            query: (id) => ({
                url: `/appointments/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Appointments', 'Dashboard', 'Queue'],
        }),
        markAppointmentNoShow: builder.mutation({
            query: ({ id, reason }) => ({
                url: `/appointments/${id}/no-show`,
                method: 'POST',
                body: { reason },
            }),
            invalidatesTags: ['Appointments', 'ScheduleAvailability', 'Dashboard', 'OrderTimeline', 'Queue'],
        }),
        rescheduleAppointment: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/appointments/${id}/reschedule`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Appointments', 'ScheduleAvailability', 'Dashboard', 'OrderTimeline', 'Queue'],
        }),
        getOrderTimeline: builder.query({
            query: (id) => `/orders/${id}/timeline`,
            providesTags: (result, error, id) => [{ type: 'OrderTimeline', id }],
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
        getScheduleAvailability: builder.query({
            query: (params) => ({
                url: '/schedule/availability',
                params,
            }),
            providesTags: ['ScheduleAvailability'],
        }),
        getWaitingList: builder.query({
            query: (params) => ({
                url: '/waiting-list',
                params,
            }),
            providesTags: ['WaitingList'],
        }),
        createWaitingListEntry: builder.mutation({
            query: (data) => ({
                url: '/waiting-list',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['WaitingList'],
        }),
        updateWaitingListEntry: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/waiting-list/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['WaitingList'],
        }),

        // Patients
        createPatient: builder.mutation({
            query: (data) => ({
                url: '/patients',
                method: 'POST',
                body: data,
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
        getPatients: builder.query({
            query: (params) => ({
                url: '/patients',
                params,
            }),
            providesTags: ['Patients'],
        }),

        // Referring Doctors
        getReferringDoctors: builder.query({
            query: (params) => ({
                url: '/referring-doctors',
                params,
            }),
            providesTags: ['ReferringDoctors'],
        }),
        createReferringDoctor: builder.mutation({
            query: (data) => ({
                url: '/referring-doctors',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['ReferringDoctors'],
        }),
        updateReferringDoctor: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/referring-doctors/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['ReferringDoctors'],
        }),
        deleteReferringDoctor: builder.mutation({
            query: (id) => ({
                url: `/referring-doctors/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['ReferringDoctors'],
        }),
        getReferringDoctorStats: builder.query({
            query: (id) => `/referring-doctors/${id}/stats`,
            providesTags: (result, error, id) => [{ type: 'ReferringDoctors', id }],
        }),

        // Machines
        getMachines: builder.query({
            query: () => '/machines',
            providesTags: ['Machines'],
        }),
        createMachine: builder.mutation({
            query: (data) => ({ url: '/machines', method: 'POST', body: data }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability', 'PacsAudit'],
        }),

        // Reports
        getRevenueReport: builder.query({
            query: (params) => ({
                url: '/reports/revenue',
                params, // { startDate, endDate }
            }),
            providesTags: ['FinancialReports'],
        }),
        getOutstandingClaims: builder.query({
            query: (params) => ({ url: '/reports/claims', params }),
            providesTags: ['FinancialReports'],
        }),
        getDoctorCommissions: builder.query({
            query: (params) => ({ url: '/reports/commissions', params }),
            providesTags: ['Commissions'],
        }),
        getReceivablesAging: builder.query({
            query: (params) => ({ url: '/reports/receivables-aging', params }),
            providesTags: ['FinancialReports'],
        }),
        getTaxSummary: builder.query({
            query: (params) => ({ url: '/reports/tax-summary', params }),
            providesTags: ['FinancialReports'],
        }),
        getProfitAndLoss: builder.query({
            query: (params) => ({ url: '/reports/profit-and-loss', params }),
            providesTags: ['FinancialReports'],
        }),
        getProfitAndLossSeries: builder.query({
            query: (params) => ({ url: '/reports/profit-and-loss-series', params }),
            providesTags: ['FinancialReports'],
        }),
        getCashFlowSeries: builder.query({
            query: (params) => ({ url: '/reports/cash-flow-series', params }),
            providesTags: ['FinancialReports'],
        }),
        getDiscountReport: builder.query({
            query: (params) => ({ url: '/reports/discounts', params }),
            providesTags: ['FinancialReports'],
        }),
        getTrialBalance: builder.query({
            query: (params) => ({ url: '/reports/trial-balance', params }),
            providesTags: ['FinancialReports'],
        }),
        getJournalLedger: builder.query({
            query: (params) => ({ url: '/reports/journal-ledger', params }),
            providesTags: ['FinancialReports'],
        }),

        // Phase 15: Finance & Expenses
        getExpenseCategories: builder.query({
            query: () => '/finance/categories',
            providesTags: ['ExpenseCategories'],
        }),
        createExpenseCategory: builder.mutation({
            query: (data) => ({ url: '/finance/categories', method: 'POST', body: data }),
            invalidatesTags: ['ExpenseCategories'],
        }),
        updateExpenseCategory: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/finance/categories/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['ExpenseCategories'],
        }),
        getExpenses: builder.query({
            query: (params) => ({ url: '/finance/expenses', params }),
            providesTags: ['Expenses'],
        }),
        createExpense: builder.mutation({
            query: (data) => ({ url: '/finance/expenses', method: 'POST', body: data }),
            invalidatesTags: ['Expenses', 'FinancialReports'],
        }),
        updateExpense: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/finance/expenses/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Expenses', 'FinancialReports'],
        }),
        deleteExpense: builder.mutation({
            query: ({ id, reason }) => ({ url: `/finance/expenses/${id}`, method: 'DELETE', body: { reason } }),
            invalidatesTags: ['Expenses', 'FinancialReports'],
        }),
        getCommissionPayables: builder.query({
            query: () => '/finance/payables',
            providesTags: ['Commissions'],
        }),
        payCommission: builder.mutation({
            query: (data) => ({ url: '/finance/payables/pay', method: 'POST', body: data }),
            invalidatesTags: ['Commissions', 'FinancialReports'],
        }),

        // Financial Closures
        getFinancialClosures: builder.query({
            query: (params) => ({ url: '/finance/closures', params }),
            providesTags: ['Closures'],
        }),
        createFinancialClosure: builder.mutation({
            query: (data) => ({ url: '/finance/closures', method: 'POST', body: data }),
            invalidatesTags: ['Closures', 'FinancialReports'],
        }),
        finalizeFinancialClosure: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/finance/closures/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Closures', 'FinancialReports'],
        }),

        // Billing & Cashier
        getInvoices: builder.query({
            query: (params) => ({
                url: '/invoices',
                params,
            }),
            providesTags: ['Invoices'],
        }),
        getInvoice: builder.query({
            query: (id) => `/invoices/${id}`,
            providesTags: (result, error, id) => [{ type: 'Invoices', id }],
        }),
        createInvoice: builder.mutation({
            query: ({ idempotencyKey = crypto.randomUUID(), ...data }) => ({
                url: '/invoices',
                method: 'POST',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Invoices', 'Dashboard', 'FinancialReports'],
        }),
        updateInvoice: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/invoices/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Invoices', 'Dashboard', 'FinancialReports'],
        }),
        collectInvoicePayment: builder.mutation({
            query: ({ id, idempotencyKey, ...data }) => ({
                url: `/invoices/${id}/payment`,
                method: 'POST',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Invoices', 'Cashier', 'Dashboard', 'FinancialReports'],
        }),
        refundInvoice: builder.mutation({
            query: ({ id, idempotencyKey, ...data }) => ({
                url: `/invoices/${id}/refund`,
                method: 'POST',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Invoices', 'Refunds', 'Cashier', 'Dashboard', 'FinancialReports'],
        }),
        getRefunds: builder.query({
            query: (params) => ({ url: '/refunds', params }),
            providesTags: ['Refunds'],
        }),
        reviewRefund: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/refunds/${id}/status`,
                method: 'PATCH',
                body: data,
            }),
            invalidatesTags: ['Refunds', 'Invoices', 'Cashier', 'Dashboard', 'FinancialReports'],
        }),
        getPartialPaymentExceptions: builder.query({
            query: (params) => ({ url: '/partial-payment-exceptions', params }),
            providesTags: ['PartialPaymentExceptions'],
        }),
        requestPartialPaymentException: builder.mutation({
            query: ({ invoiceId, ...data }) => ({
                url: `/invoices/${invoiceId}/partial-payment-exceptions`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['PartialPaymentExceptions', 'Invoices', 'Queue'],
        }),
        reviewPartialPaymentException: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/partial-payment-exceptions/${id}/status`,
                method: 'PATCH',
                body: data,
            }),
            invalidatesTags: ['PartialPaymentExceptions', 'Invoices', 'Queue'],
        }),
        getInvoicePdf: builder.query({
            query: ({ id, lang }) => ({
                url: `/invoices/${id}/pdf${lang ? `?lang=${lang}` : ''}`,
                responseHandler: (response) => response.text(),
            }),
        }),
        openCashierShift: builder.mutation({
            query: (data) => ({
                url: '/cashier/shifts/open',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Cashier'],
        }),
        closeCashierShift: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/cashier/shifts/${id}/close`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Cashier'],
        }),
        getCashierReconciliation: builder.query({
            query: (params) => ({
                url: '/cashier/reconciliation',
                params,
            }),
            providesTags: ['Cashier'],
        }),
        reviewCashierClosure: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/cashier/closures/${id}/review`, method: 'PATCH', body: data }),
            invalidatesTags: ['Cashier'],
        }),

        // Insurance & Claims
        getInsuranceProviders: builder.query({
            query: () => '/insurance/providers',
            providesTags: ['Insurance'],
        }),
        createInsuranceProvider: builder.mutation({
            query: (data) => ({
                url: '/insurance/providers',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        getInsuranceContracts: builder.query({
            query: () => '/insurance/contracts',
            providesTags: ['Insurance'],
        }),
        createInsuranceContract: builder.mutation({
            query: (data) => ({
                url: '/insurance/contracts',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        getInsurancePolicies: builder.query({
            query: (params) => ({
                url: '/insurance/policies',
                params,
            }),
            providesTags: ['Insurance'],
        }),
        createInsurancePolicy: builder.mutation({
            query: (data) => ({
                url: '/insurance/policies',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        getCoverageRules: builder.query({
            query: () => '/insurance/coverage-rules',
            providesTags: ['Insurance'],
        }),
        createCoverageRule: builder.mutation({
            query: (data) => ({
                url: '/insurance/coverage-rules',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        previewCoverage: builder.query({
            query: (params) => ({
                url: '/insurance/coverage-preview',
                params,
            }),
        }),
        getInsuranceApprovals: builder.query({
            query: () => '/insurance/approvals',
            providesTags: ['Insurance'],
        }),
        createInsuranceApproval: builder.mutation({
            query: (data) => ({
                url: '/insurance/approvals',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Insurance'],
        }),
        updateInsuranceApprovalStatus: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/insurance/approvals/${id}/status`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['Insurance'],
        }),
        getClaims: builder.query({
            query: (params) => ({
                url: '/claims',
                params,
            }),
            providesTags: ['Claims'],
        }),
        createClaim: builder.mutation({
            query: (data) => ({
                url: '/claims',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Claims', 'FinancialReports'],
        }),
        updateClaimStatus: builder.mutation({
            query: ({ id, idempotencyKey = crypto.randomUUID(), ...data }) => ({
                url: `/claims/${id}/status`,
                method: 'PUT',
                body: data,
                headers: { 'Idempotency-Key': idempotencyKey },
            }),
            invalidatesTags: ['Claims', 'FinancialReports'],
        }),

        // Staff (HR)
        getStaff: builder.query({
            query: () => '/staff',
            providesTags: ['Staff'],
        }),
        createStaff: builder.mutation({
            query: (data) => ({
                url: '/staff',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Staff'],
        }),
        updateStaff: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/staff/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Staff'],
        }),
        deleteStaff: builder.mutation({
            query: (id) => ({
                url: `/staff/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Staff'],
        }),

        // Phase 16: Extended HR
        getEmployeeProfiles: builder.query({
            query: () => '/hr/profiles',
            providesTags: ['StaffProfiles'],
        }),
        updateEmployeeProfile: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/hr/profiles/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['StaffProfiles'],
        }),
        getShifts: builder.query({
            query: (params) => ({ url: '/hr/shifts', params }),
            providesTags: ['Shifts'],
        }),
        createShift: builder.mutation({
            query: (data) => ({ url: '/hr/shifts', method: 'POST', body: data }),
            invalidatesTags: ['Shifts'],
        }),
        deleteShift: builder.mutation({
            query: (id) => ({ url: `/hr/shifts/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Shifts'],
        }),
        getAttendance: builder.query({
            query: (params) => ({ url: '/hr/attendance', params }),
            providesTags: ['Attendance'],
        }),
        clockIn: builder.mutation({
            query: (data) => ({ url: '/hr/attendance/clock-in', method: 'POST', body: data }),
            invalidatesTags: ['Attendance'],
        }),
        clockOut: builder.mutation({
            query: (data) => ({ url: '/hr/attendance/clock-out', method: 'POST', body: data }),
            invalidatesTags: ['Attendance'],
        }),
        getLeaveRequests: builder.query({
            query: (params) => ({ url: '/hr/leave', params }),
            providesTags: ['LeaveRequests'],
        }),
        createLeaveRequest: builder.mutation({
            query: (data) => ({ url: '/hr/leave', method: 'POST', body: data }),
            invalidatesTags: ['LeaveRequests'],
        }),
        updateLeaveStatus: builder.mutation({
            query: ({ id, status }) => ({ url: `/hr/leave/${id}/status`, method: 'PUT', body: { status } }),
            invalidatesTags: ['LeaveRequests'],
        }),
        getProductivityReport: builder.query({
            query: (params) => ({ url: '/hr/productivity', params }),
        }),

        // Payroll
        getPayrollOverview: builder.query({
            query: () => '/payroll/overview',
            providesTags: ['Payroll'],
        }),
        getPayrollPeriods: builder.query({
            query: (params) => ({ url: '/payroll/periods', params }),
            providesTags: ['Payroll'],
        }),
        createPayrollPeriod: builder.mutation({
            query: (data) => ({ url: '/payroll/periods', method: 'POST', body: data }),
            invalidatesTags: ['Payroll'],
        }),
        getPayrollRun: builder.query({
            query: (periodId) => `/payroll/periods/${periodId}/run`,
            providesTags: ['PayrollRuns'],
        }),
        calculatePayrollRun: builder.mutation({
            query: (periodId) => ({ url: '/payroll/runs/calculate', method: 'POST', body: { periodId } }),
            invalidatesTags: ['Payroll', 'PayrollRuns', 'PayrollPenalties'],
        }),
        updatePayrollRunStatus: builder.mutation({
            query: ({ runId, ...body }) => ({
                url: `/payroll/runs/${runId}/status`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['Payroll', 'PayrollRuns', 'PayrollPenalties'],
        }),
        getPayrollCompensation: builder.query({
            query: (params) => ({ url: '/payroll/compensation', params }),
            providesTags: ['PayrollCompensation'],
        }),
        createPayrollCompensation: builder.mutation({
            query: (data) => ({ url: '/payroll/compensation', method: 'POST', body: data }),
            invalidatesTags: ['PayrollCompensation', 'Payroll'],
        }),
        getPayrollRules: builder.query({
            query: (params) => ({ url: '/payroll/rules', params }),
            providesTags: ['PayrollRules'],
        }),
        createPayrollRule: builder.mutation({
            query: (data) => ({ url: '/payroll/rules', method: 'POST', body: data }),
            invalidatesTags: ['PayrollRules'],
        }),
        updatePayrollRuleStatus: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/payroll/rules/${id}/status`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PayrollRules', 'Payroll'],
        }),
        getPayrollDeductions: builder.query({
            query: (params) => ({ url: '/payroll/deductions', params }),
            providesTags: ['PayrollDeductions'],
        }),
        createPayrollDeduction: builder.mutation({
            query: (data) => ({ url: '/payroll/deductions', method: 'POST', body: data }),
            invalidatesTags: ['PayrollDeductions', 'Payroll'],
        }),
        updatePayrollDeductionStatus: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/payroll/deductions/${id}/status`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PayrollDeductions', 'Payroll'],
        }),
        getPayrollPenalties: builder.query({
            query: (params) => ({ url: '/payroll/penalties', params }),
            providesTags: ['PayrollPenalties'],
        }),
        createPayrollPenalty: builder.mutation({
            query: (data) => ({ url: '/payroll/penalties', method: 'POST', body: data }),
            invalidatesTags: ['PayrollPenalties', 'Payroll'],
        }),
        updatePayrollPenaltyStatus: builder.mutation({
            query: ({ id, ...body }) => ({
                url: `/payroll/penalties/${id}/status`,
                method: 'PUT',
                body,
            }),
            invalidatesTags: ['PayrollPenalties', 'Payroll'],
        }),

        // Phase 17: CRM & Marketing
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
        updateLoyaltyPoints: builder.mutation({
            query: ({ patientId, points }) => ({ url: `/crm/loyalty/${patientId}`, method: 'PUT', body: { points } }),
            invalidatesTags: ['Patients', 'PatientHistory'],
        }),

        // Notifications
        sendReminder: builder.mutation({
            query: (data) => ({
                url: '/notifications/remind',
                method: 'POST',
                body: data,
            }),
        }),

        // Inventory
        getInventory: builder.query({
            query: () => '/inventory',
            providesTags: ['Inventory'],
        }),
        addItem: builder.mutation({
            query: (data) => ({
                url: '/inventory',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Inventory'],
        }),
        updateStock: builder.mutation({
            query: ({ itemId, quantity }) => ({
                url: `/inventory/${itemId}`,
                method: 'PUT',
                body: { quantity },
            }),
            invalidatesTags: ['Inventory'],
        }),

        // Clinical - Doctor
        getModalities: builder.query({
            query: () => '/machines',
        }),
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

        // Dashboard Statistics
        getDashboardStats: builder.query({
            query: () => '/dashboard/stats',
            providesTags: ['Dashboard'],
            // Auto-refresh based on env or default to 60s
            pollingInterval: import.meta.env.VITE_DASHBOARD_POLL_INTERVAL ? parseInt(import.meta.env.VITE_DASHBOARD_POLL_INTERVAL, 10) : 60000,
        }),

        // ─── Doctor Portal ───────────────────────────────────────────────
        setDoctorPortalPassword: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/referring-doctors/${id}/set-portal-password`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['ReferringDoctors'],
        }),

        // ─── Notifications ───────────────────────────────────────────────
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
        // Templates
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
        // Jobs
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
        // Preferences
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

        // ─── Audit Logs ──────────────────────────────────────────────────
        getLegacyAuditLogs: builder.query({
            query: (params) => ({ url: '/audit-logs', params }),
            providesTags: ['Audit'],
        }),

        // ─── Realtime Chat & Messaging ───────────────────────────────────
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
                // Reconstruct the exact getChatMessages cache key used by the thread view
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
        getPatientConversations: builder.query({
            query: () => '/messages/patients',
            providesTags: ['PatientConversations'],
        }),
        getPatientMessageHistory: builder.query({
            query: (patientId) => `/messages/patients/${patientId}`,
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
            query: (doctorId) => `/messages/doctors/${doctorId}`,
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

        // ─── RBAC (Role-Based Access Control) ────────────────────────────
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
                body: { permissionIds }
            }),
            invalidatesTags: ['RBAC'],
        }),
        requestBreakGlass: builder.mutation({
            query: (data) => ({
                url: '/rbac/break-glass',
                method: 'POST',
                body: data
            }),
        }),
        resetRolePermissions: builder.mutation({
            query: (role) => ({
                url: `/rbac/roles/${role}/reset`,
                method: 'POST',
            }),
            invalidatesTags: ['RBAC'],
        }),
        cloneRolePermissions: builder.mutation({
            query: ({ targetRole, sourceRole }) => ({
                url: `/rbac/roles/${targetRole}/clone`,
                method: 'POST',
                body: { sourceRole }
            }),
            invalidatesTags: ['RBAC'],
        }),
        getRbacAuditLogs: builder.query({
            query: () => '/rbac/audit-logs',
            providesTags: ['RBAC'],
        }),

        // ─── Privacy & 2FA ──────────────────────────────────────────────────
        setup2FA: builder.mutation({
            query: () => ({ url: '/auth/setup-2fa', method: 'POST' }),
        }),
        enable2FA: builder.mutation({
            query: (data) => ({ url: '/auth/enable-2fa', method: 'POST', body: data }),
        }),
        verify2FA: builder.mutation({
            query: (data) => ({ url: '/auth/verify-2fa', method: 'POST', body: data }),
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

        // ─── Analytics ──────────────────────────────────────────────────
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

        // ─── Phase 22: Document Management ──────────────────────────────────
        getPatientDocuments: builder.query({
            query: (patientId) => `/documents/patient/${patientId}`,
            providesTags: ['Documents'],
        }),
        uploadDocument: builder.mutation({
            query: (formData) => ({
                url: '/documents',
                method: 'POST',
                body: formData,
                // Note: when passing FormData, RTK Query automatically sets Content-Type to multipart/form-data with the correct boundary
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

        // ─── Phase 23: Integrations ─────────────────────────────────────────
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

        // ─── Phase 24: Administration Settings ─────────────────────────────
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

        // ─── Phase 26: Clinical Safety & Imports ───────────────────────────
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
        getReferralAnalytics: builder.query({
            query: (params) => ({
                url: '/analytics/referrals',
                params,
            }),
            providesTags: ['Analytics'],
        }),
        importPatients: builder.mutation({
            query: (formData) => ({
                url: '/import/patients',
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: ['Patients'],
        }),

        // ─── Phase 13: Advanced Inventory & Consumables ──────────────────
        // Suppliers
        getSuppliers: builder.query({
            query: (params) => ({ url: '/suppliers', params }),
            providesTags: ['Suppliers'],
        }),
        getSupplierById: builder.query({
            query: (id) => `/suppliers/${id}`,
            providesTags: (result, error, id) => [{ type: 'Suppliers', id }],
        }),
        createSupplier: builder.mutation({
            query: (data) => ({ url: '/suppliers', method: 'POST', body: data }),
            invalidatesTags: ['Suppliers'],
        }),
        updateSupplier: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/suppliers/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Suppliers'],
        }),

        // Purchase Orders
        getPurchaseOrders: builder.query({
            query: (params) => ({ url: '/purchase-orders', params }),
            providesTags: ['PurchaseOrders'],
        }),
        getPurchaseOrderById: builder.query({
            query: (id) => `/purchase-orders/${id}`,
            providesTags: (result, error, id) => [{ type: 'PurchaseOrders', id }],
        }),
        createPurchaseOrder: builder.mutation({
            query: (data) => ({ url: '/purchase-orders', method: 'POST', body: data }),
            invalidatesTags: ['PurchaseOrders'],
        }),
        updatePurchaseOrderStatus: builder.mutation({
            query: ({ id, status }) => ({ url: `/purchase-orders/${id}/status`, method: 'PUT', body: { status } }),
            invalidatesTags: ['PurchaseOrders'],
        }),
        receiveStock: builder.mutation({
            query: ({ id, items }) => ({ url: `/purchase-orders/${id}/receive`, method: 'POST', body: { items } }),
            invalidatesTags: ['PurchaseOrders', 'Inventory', 'StockMovements'],
        }),

        // Advanced Inventory
        consumeStock: builder.mutation({
            query: (data) => ({ url: '/inventory/consume', method: 'POST', body: data }),
            invalidatesTags: ['Inventory', 'StockMovements', 'Invoices'],
        }),
        adjustStock: builder.mutation({
            query: (data) => ({ url: '/inventory/adjust', method: 'POST', body: data }),
            invalidatesTags: ['Inventory', 'StockMovements'],
        }),
        getStockMovements: builder.query({
            query: (params) => ({ url: '/inventory/movements', params }),
            providesTags: ['StockMovements'],
        }),
        getExpiryAlerts: builder.query({
            query: () => '/inventory/expiry-alerts',
            providesTags: ['Inventory'],
        }),

        // Phase 14: Equipment & Room Management
        getMachineById: builder.query({
            query: (id) => `/machines/${id}`,
            providesTags: (result, error, id) => [{ type: 'Machines', id }],
        }),
        updateMachine: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/machines/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability'],
        }),
        deleteMachine: builder.mutation({
            query: (id) => ({ url: `/machines/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Machines', 'ExamTypes', 'ScheduleAvailability'],
        }),
        getUtilizationReport: builder.query({
            query: (params) => ({ url: '/machines/utilization', params }),
            providesTags: ['Machines', 'EquipmentDowntime'],
        }),
        
        // Service Contracts
        getServiceContracts: builder.query({
            query: (params) => ({ url: '/equipment/contracts', params }),
            providesTags: ['ServiceContracts'],
        }),
        createServiceContract: builder.mutation({
            query: (data) => ({ url: '/equipment/contracts', method: 'POST', body: data }),
            invalidatesTags: ['ServiceContracts'],
        }),
        updateServiceContract: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/equipment/contracts/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['ServiceContracts'],
        }),

        // Equipment Maintenance
        getEquipmentMaintenance: builder.query({
            query: (params) => ({ url: '/equipment/maintenance', params }),
            providesTags: ['EquipmentMaintenance'],
        }),
        createEquipmentMaintenance: builder.mutation({
            query: (data) => ({ url: '/equipment/maintenance', method: 'POST', body: data }),
            invalidatesTags: ['EquipmentMaintenance'],
        }),
        updateEquipmentMaintenance: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/equipment/maintenance/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['EquipmentMaintenance'],
        }),

        // Equipment Downtime
        getEquipmentDowntime: builder.query({
            query: (params) => ({ url: '/equipment/downtime', params }),
            providesTags: ['EquipmentDowntime'],
        }),
        createEquipmentDowntime: builder.mutation({
            query: (data) => ({ url: '/equipment/downtime', method: 'POST', body: data }),
            invalidatesTags: ['EquipmentDowntime', 'Machines'],
        }),
        updateEquipmentDowntime: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/equipment/downtime/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['EquipmentDowntime', 'Machines'],
        }),

        // PACS / Imaging
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
            // formData is a FormData with one or more "files" entries. RTK Query
            // passes it through as the body; the browser sets the multipart
            // boundary, so we do NOT set Content-Type here.
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
    }),
});


export const {
    useLoginMutation,
    useLogoutMutation,
    useGetProfileQuery,
    useUpdateProfileMutation,
    useChangePasswordMutation,
    useGetPreferencesQuery,
    useUpdatePreferencesMutation,
    useExportPersonalDataMutation,
    useGetMyAuditLogsQuery,
    useGetProfileSessionsQuery,
    useRevokeProfileSessionMutation,
    useGetOrganizationStaffQuery,
    useCreateOrganizationStaffMutation,
    useGetApiTokensQuery,
    useCreateApiTokenMutation,
    useRevokeApiTokenMutation,
    useGetAppointmentsQuery,
    useGetAppointmentByIdQuery,
    useCreateAppointmentMutation,
    useUpdateAppointmentMutation,
    useDeleteAppointmentMutation,
    useMarkAppointmentNoShowMutation,
    useRescheduleAppointmentMutation,
    useGetOrderTimelineQuery,
    useGetQueueQuery,
    useTransitionQueueMutation,
    useGetScheduleAvailabilityQuery,
    useGetWaitingListQuery,
    useCreateWaitingListEntryMutation,
    useUpdateWaitingListEntryMutation,
    useGetPatientsQuery,
    useGetPatientHistoryQuery,
    useGetPatientDuplicatesQuery,
    useCreatePatientMutation,
    useGeneratePortalPasswordMutation,
    useGetPortalReviewRequestsQuery,
    useReviewPortalAppointmentRequestMutation,
    useReviewPortalProfileUpdateRequestMutation,
    useUpdatePatientMutation,
    useDeletePatientMutation,
    useMergePatientsMutation,
    useGetReferringDoctorsQuery,
    useCreateReferringDoctorMutation,
    useUpdateReferringDoctorMutation,
    useDeleteReferringDoctorMutation,
    useGetReferringDoctorStatsQuery,
    useGetMachinesQuery,
    useCreateMachineMutation,
    useGetRevenueReportQuery,
    useGetOutstandingClaimsQuery,
    useGetDoctorCommissionsQuery,
    useGetInvoicesQuery,
    useGetInvoiceQuery,
    useCreateInvoiceMutation,
    useUpdateInvoiceMutation,
    useCollectInvoicePaymentMutation,
    useRefundInvoiceMutation,
    useGetRefundsQuery,
    useReviewRefundMutation,
    useGetPartialPaymentExceptionsQuery,
    useRequestPartialPaymentExceptionMutation,
    useReviewPartialPaymentExceptionMutation,
    useLazyGetInvoicePdfQuery,
    useOpenCashierShiftMutation,
    useCloseCashierShiftMutation,
    useGetCashierReconciliationQuery,
    useReviewCashierClosureMutation,
    useGetInsuranceProvidersQuery,
    useCreateInsuranceProviderMutation,
    useGetInsuranceContractsQuery,
    useCreateInsuranceContractMutation,
    useGetInsurancePoliciesQuery,
    useCreateInsurancePolicyMutation,
    useGetCoverageRulesQuery,
    useCreateCoverageRuleMutation,
    usePreviewCoverageQuery,
    useGetInsuranceApprovalsQuery,
    useCreateInsuranceApprovalMutation,
    useUpdateInsuranceApprovalStatusMutation,
    useGetClaimsQuery,
    useCreateClaimMutation,
    useUpdateClaimStatusMutation,
    useGetWorklistQuery,
    useGetCaseReportsQuery,
    useLazyLookupCaseReportQuery,
    useGetExamQuery,
    useUpdateReportMutation,
    useImproveReportFormatMutation,
    useGeneratePreliminaryReportDraftMutation,
    useGetAiReportDraftsQuery,
    useMarkAiReportDraftAppliedMutation,
    useGetReportTemplatesQuery,
    useCreateReportTemplateMutation,
    useUpdateReportTemplateMutation,
    useDeleteReportTemplateMutation,
    useAmendReportMutation,
    useDeliverResultMutation,
    useGetResultDeliveryHistoryQuery,
    useGetStaffQuery,
    useCreateStaffMutation,
    useUpdateStaffMutation,
    useDeleteStaffMutation,
    useSendReminderMutation,
    useGetInventoryQuery,
    useAddItemMutation,
    useUpdateStockMutation,
    useGetExamTypesQuery,
    useCreateExamTypeMutation,
    useUpdateExamTypeMutation,
    useDeleteExamTypeMutation,
    useGetModalitiesQuery,
    useGetDashboardStatsQuery,
    useSetDoctorPortalPasswordMutation,
    useGetNotificationsQuery,
    useGetNotificationUnreadCountQuery,
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
    useSendManualNotificationMutation,
    useGetNotificationTemplatesQuery,
    useCreateNotificationTemplateMutation,
    useUpdateNotificationTemplateMutation,
    useDeleteNotificationTemplateMutation,
    useGetNotificationJobsQuery,
    useRetryNotificationJobMutation,
    useProcessNotificationJobsMutation,
    useGetNotificationPreferencesQuery,
    useUpdateNotificationPreferencesMutation,
    useSyncModalityDicomMutation,
    useGetOrthancSystemQuery,
    useGetPacsConfigQuery,
    useGetPacsDiagnosticsQuery,
    useUpdatePacsConfigMutation,
    usePingModalityDicomMutation,
    useGetPacsAuditQuery,
    useGetPacsRequestsQuery,
    useGetPacsWorklistPreviewQuery,
    useRefreshPacsWorklistMutation,
    useGetPacsStorageSummaryQuery,
    useRunPacsTieringMutation,
    useGetAuditLogsQuery,
    useGetAuditAlertsQuery,
    useReviewAuditAlertMutation,
    useRunAuditDetectionsMutation,
    useLazyVerifyAuditChainQuery,

    // Phase 13 Exports
    useGetSuppliersQuery,
    useGetSupplierByIdQuery,
    useCreateSupplierMutation,
    useUpdateSupplierMutation,
    useGetPurchaseOrdersQuery,
    useGetPurchaseOrderByIdQuery,
    useCreatePurchaseOrderMutation,
    useUpdatePurchaseOrderStatusMutation,
    useReceiveStockMutation,
    useConsumeStockMutation,
    useAdjustStockMutation,
    useGetStockMovementsQuery,
    useGetExpiryAlertsQuery,

    // Phase 14 Exports
    useGetMachineByIdQuery,
    useUpdateMachineMutation,
    useDeleteMachineMutation,
    useGetUtilizationReportQuery,
    useGetServiceContractsQuery,
    useCreateServiceContractMutation,
    useUpdateServiceContractMutation,
    useGetEquipmentMaintenanceQuery,
    useCreateEquipmentMaintenanceMutation,
    useUpdateEquipmentMaintenanceMutation,
    useGetEquipmentDowntimeQuery,
    useCreateEquipmentDowntimeMutation,
    useUpdateEquipmentDowntimeMutation,

    // Phase 15 Exports
    useGetReceivablesAgingQuery,
    useGetTaxSummaryQuery,
    useGetProfitAndLossQuery,
    useGetProfitAndLossSeriesQuery,
    useGetCashFlowSeriesQuery,
    useGetDiscountReportQuery,
    useGetTrialBalanceQuery,
    useGetJournalLedgerQuery,
    useGetExpenseCategoriesQuery,
    useCreateExpenseCategoryMutation,
    useUpdateExpenseCategoryMutation,
    useGetExpensesQuery,
    useCreateExpenseMutation,
    useUpdateExpenseMutation,
    useDeleteExpenseMutation,
    useGetCommissionPayablesQuery,
    usePayCommissionMutation,
    useGetFinancialClosuresQuery,
    useCreateFinancialClosureMutation,
    useFinalizeFinancialClosureMutation,

    // Phase 16 Exports
    useGetEmployeeProfilesQuery,
    useUpdateEmployeeProfileMutation,
    useGetShiftsQuery,
    useCreateShiftMutation,
    useDeleteShiftMutation,
    useGetAttendanceQuery,
    useClockInMutation,
    useClockOutMutation,
    useGetLeaveRequestsQuery,
    useCreateLeaveRequestMutation,
    useUpdateLeaveStatusMutation,
    useGetProductivityReportQuery,
    useGetPayrollOverviewQuery,
    useGetPayrollPeriodsQuery,
    useCreatePayrollPeriodMutation,
    useGetPayrollRunQuery,
    useCalculatePayrollRunMutation,
    useUpdatePayrollRunStatusMutation,
    useGetPayrollCompensationQuery,
    useCreatePayrollCompensationMutation,
    useGetPayrollRulesQuery,
    useCreatePayrollRuleMutation,
    useUpdatePayrollRuleStatusMutation,
    useGetPayrollDeductionsQuery,
    useCreatePayrollDeductionMutation,
    useUpdatePayrollDeductionStatusMutation,
    useGetPayrollPenaltiesQuery,
    useCreatePayrollPenaltyMutation,
    useUpdatePayrollPenaltyStatusMutation,

    // Phase 17 Exports
    useGetCrmActivitiesQuery,
    useCreateCrmActivityMutation,
    useUpdateCrmActivityMutation,
    useGetSegmentsQuery,
    useCreateSegmentMutation,
    useAddSegmentMemberMutation,
    useGetCampaignsQuery,
    useCreateCampaignMutation,
    useUpdateCampaignStatusMutation,
    useGetFeedbackQuery,
    useSubmitFeedbackMutation,
    useUpdateLoyaltyPointsMutation,

    // RBAC Exports
    useGetAllPermissionsQuery,
    useGetRolePermissionsQuery,
    useUpdateRolePermissionsMutation,
    useRequestBreakGlassMutation,
    useResetRolePermissionsMutation,
    useCloneRolePermissionsMutation,
    useGetRbacAuditLogsQuery,

    // Privacy & 2FA Exports
    useSetup2FAMutation,
    useEnable2FAMutation,
    useVerify2FAMutation,
    useGetPrivacyRequestsQuery,
    useCreatePrivacyRequestMutation,
    useResolvePrivacyRequestMutation,
    useGetPatientConsentsQuery,
    useGetCurrentPatientConsentsQuery,
    useAddPatientConsentMutation,
    useRevokePatientConsentMutation,

    // Analytics Exports
    useGetVolumeAnalyticsQuery,
    useGetRevenueAnalyticsQuery,
    useGetPerformanceAnalyticsQuery,
    useGetReferralAnalyticsQuery,

    // Document Management
    useGetPatientDocumentsQuery,
    useUploadDocumentMutation,
    useUpdateDocumentMutation,
    useDeleteDocumentMutation,

    // Integrations
    useGetIntegrationsQuery,
    useUpdateIntegrationMutation,
    useTestIntegrationMutation,
    useGetIntegrationLogsQuery,
    useRetryIntegrationEventMutation,

    // Settings & Backups
    useGetCenterSettingsQuery,
    useGetPublicCenterSettingsQuery,
    useGetPublicLandingOverviewQuery,
    useUpdateCenterSettingsMutation,
    useGetDatabaseSettingsQuery,
    useUpdateDatabaseSettingsMutation,
    useTestDatabaseSettingsMutation,
    useGetAiSettingsQuery,
    useGetAiSettingsStatusQuery,
    useUpdateAiSettingsMutation,
    useTestAiSettingsMutation,
    useGetAiProfilesQuery,
    useCreateAiProfileMutation,
    useUpdateAiProfileMutation,
    useActivateAiProfileMutation,
    useDeleteAiProfileMutation,
    useGetBackupsQuery,
    useGenerateBackupMutation,
    useRestoreBackupMutation,

    // Clinical Safety & Imports
    useGetSafetyTemplatesQuery,
    useSubmitSafetyResponseMutation,
    useGetExamSafetyResponsesQuery,
    useImportPatientsMutation,

    // PACS / Imaging
    useGetExamImagingStatusQuery,
    useGetPacsAiAnalysisJobsQuery,
    useGetPacsAiAnalysisQueueQuery,
    useRequestPacsAiAnalysisMutation,
    useProcessPacsAiAnalysisQueueMutation,
    useGetPacsQuarantineQuery,
    useLazySearchScheduledExamsQuery,
    useReconcileQuarantineStudyMutation,
    useDiscardQuarantineStudyMutation,
    useUploadExamImagesMutation,
    useRetryPacsAiJobMutation,
    useCancelPacsAiJobMutation,
    useDeletePacsAiJobMutation,
    useRetryAllPacsAiJobsMutation,
    useCancelAllPacsAiJobsMutation,

    // Realtime Chat & Messaging Hooks
    useGetChatUsersQuery,
    useGetChatMessagesQuery,
    useSendChatMessageMutation,
    useGetChatUnreadSummaryQuery,
    useGetPatientConversationsQuery,
    useGetPatientMessageHistoryQuery,
    useSendPatientReplyMutation,
    useGetDoctorConversationsQuery,
    useGetDoctorMessageHistoryQuery,
    useSendDoctorReplyMutation
} = api;
