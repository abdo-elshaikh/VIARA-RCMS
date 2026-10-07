import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { setAccessToken, logOut } from './authSlice';

const getCsrfToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

const baseQuery = fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || '/api',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
        const token = getState().auth.token;
        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }
        return headers;
    },
});

let csrfBootstrapPromise = null;

const ensureCsrfToken = async (api, extraOptions) => {
    const existingToken = getCsrfToken();
    if (existingToken) return existingToken;

    if (!csrfBootstrapPromise) {
        csrfBootstrapPromise = baseQuery({
            url: '/settings/public/home',
            method: 'GET',
        }, api, extraOptions).finally(() => {
            csrfBootstrapPromise = null;
        });
    }

    await csrfBootstrapPromise;
    return getCsrfToken();
};

const baseQueryWithCsrf = async (args, api, extraOptions) => {
    const requestArgs = typeof args === 'string' ? { url: args } : { ...args };
    const method = String(requestArgs.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = await ensureCsrfToken(api, extraOptions);
        if (csrfToken) {
            requestArgs.headers = {
                ...(requestArgs.headers || {}),
                'x-csrf-token': csrfToken,
            };
        }
    }

    return baseQuery(requestArgs, api, extraOptions);
};

let refreshPromise = null;

const refreshAccessToken = (api, extraOptions) => {
    if (!refreshPromise) {
        refreshPromise = baseQueryWithCsrf({
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

export const baseQueryWithReauth = async (args, api, extraOptions) => {
    let result = await baseQueryWithCsrf(args, api, extraOptions);
    if (result.error && result.error.status === 401 && ![
        '/auth/login',
        '/auth/refresh',
        '/auth/passkeys/authenticate/options',
        '/auth/passkeys/authenticate/verify'
    ].includes(args.url)) {
        const token = await refreshAccessToken(api, extraOptions);
        if (token) {
            result = await baseQueryWithCsrf(args, api, extraOptions);
        }
    }
    return result;
};

export const api = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithReauth,
    tagTypes: [
        'User', 'Profile', 'Sessions', 'Passkeys', 'Tokens', 'Patients', 'Appointments', 'ScheduleAvailability', 'WaitingList', 'PortalReviewRequests', 'ReferringDoctors', 'Machines', 'ExamTypes', 'Rooms', 'Dashboard', 'Staff', 'StaffProfiles', 'Shifts', 'Attendance', 'LeaveRequests', 'Payroll', 'PayrollRuns', 'PayrollCompensation', 'PayrollRules', 'PayrollDeductions', 'PayrollPenalties', 'Inventory', 'PatientHistory', 'PatientDuplicates', 'OrderTimeline', 'Queue', 'CaseReports', 'Invoices', 'Refunds', 'PartialPaymentExceptions', 'Cashier', 'Insurance', 'Claims', 'ReportTemplates', 'ResultDelivery', 'AiReportDrafts', 'Notifications', 'NotificationTemplates', 'NotificationJobs', 'Audit', 'RBAC', 'Privacy', 'Analytics', 'Documents', 'Integrations', 'Settings', 'PublicSettings', 'PublicLanding', 'AdminTelemetry', 'Governance', 'Backups', 'ClinicalSafety', 'Closures', 'Pacs', 'PacsQuarantine', 'PacsAudit', 'PacsAiAnalysis', 'FinancialReports', 'Commissions', 'ExpenseCategories', 'Expenses', 'Segments', 'Campaigns', 'Feedback', 'ChatMessages', 'StaffUsers', 'PatientConversations', 'DoctorConversations', 'ChatUnread', 'ChatChannels',
        'LoyaltyHistory', 'ClinicalRecalls', 'DoctorInteractions', 'DisplayBoard', 'SupervisorAssignments', 'SupervisorTasks', 'StaffSupervision', 'SupervisorInbox', 'SupervisorRecommendations',
        'License', 'SystemUpdates'
    ],
    endpoints: () => ({}),
});
