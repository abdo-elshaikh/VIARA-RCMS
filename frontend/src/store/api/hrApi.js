import { api } from '../baseApi';

export const hrApi = api.injectEndpoints({
    endpoints: (builder) => ({
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
        updateAttendance: builder.mutation({
            query: ({ id, ...body }) => ({ url: `/hr/attendance/${id}`, method: 'PUT', body }),
            invalidatesTags: ['Attendance'],
        }),
        getAttendancePermissions: builder.query({
            query: (params) => ({ url: '/hr/attendance-permissions', params }),
            providesTags: ['Attendance'],
        }),
        createAttendancePermission: builder.mutation({
            query: (data) => ({ url: '/hr/attendance-permissions', method: 'POST', body: data }),
            invalidatesTags: ['Attendance'],
        }),
        updateAttendancePermissionStatus: builder.mutation({
            query: ({ id, ...body }) => ({ url: `/hr/attendance-permissions/${id}/status`, method: 'PUT', body }),
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
            query: ({ id, status, notes }) => ({ url: `/hr/leave/${id}/status`, method: 'PUT', body: { status, notes } }),
            invalidatesTags: ['LeaveRequests'],
        }),
        getProductivityReport: builder.query({
            query: (params) => ({ url: '/hr/productivity', params }),
        }),
        getPayrollOverview: builder.query({
            query: (params) => ({ url: '/payroll/overview', params }),
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
        cancelPayrollPeriod: builder.mutation({
            query: ({ id, ...body }) => ({ url: `/payroll/periods/${id}/status`, method: 'PUT', body }),
            invalidatesTags: ['Payroll', 'PayrollRuns'],
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
        getPayrollEmployees: builder.query({
            query: () => '/payroll/employees',
            providesTags: ['Payroll'],
        }),
        createPayrollCompensation: builder.mutation({
            query: (data) => ({ url: '/payroll/compensation', method: 'POST', body: data }),
            invalidatesTags: ['PayrollCompensation', 'Payroll'],
        }),
        updatePayrollCompensation: builder.mutation({
            query: ({ id, ...body }) => ({ url: `/payroll/compensation/${id}`, method: 'PUT', body }),
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
        getAttendanceAuditLedger: builder.query({
            query: (params) => ({ url: '/hr/attendance/audit-ledger', params }),
            providesTags: ['Attendance'],
        }),
        getAttendanceSettings: builder.query({
            query: () => '/hr/attendance/settings',
            providesTags: ['Attendance'],
        }),
        updateAttendanceSettings: builder.mutation({
            query: (data) => ({ url: '/hr/attendance/settings', method: 'PUT', body: data }),
            invalidatesTags: ['Attendance'],
        }),
        recordManualAttendance: builder.mutation({
            query: (data) => ({ url: '/hr/attendance/manual', method: 'POST', body: data }),
            invalidatesTags: ['Attendance'],
        }),
        getShiftRequests: builder.query({
            query: (params) => ({ url: '/hr/shifts/requests', params }),
            providesTags: ['Shifts'],
        }),
        createShiftRequest: builder.mutation({
            query: (data) => ({ url: '/hr/shifts/requests', method: 'POST', body: data }),
            invalidatesTags: ['Shifts'],
        }),
        updateShiftRequestStatus: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/hr/shifts/requests/${id}/status`, method: 'PUT', body: data }),
            invalidatesTags: ['Shifts'],
        }),
        updateShift: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/hr/shifts/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Shifts'],
        }),
        getStaffCredentials: builder.query({
            query: (staffId) => `/staff/${staffId}/credentials`,
            providesTags: ['Staff'],
        }),
        createStaffCredential: builder.mutation({
            query: ({ staffId, ...data }) => ({ url: `/staff/${staffId}/credentials`, method: 'POST', body: data }),
            invalidatesTags: ['Staff'],
        }),
        updateStaffCredential: builder.mutation({
            query: ({ staffId, id, ...data }) => ({ url: `/staff/${staffId}/credentials/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Staff'],
        }),
        deleteStaffCredential: builder.mutation({
            query: ({ staffId, id }) => ({ url: `/staff/${staffId}/credentials/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Staff'],
        }),
        getStaffEvaluations: builder.query({
            query: (staffId) => `/staff/${staffId}/evaluations`,
            providesTags: ['Staff'],
        }),
        createStaffEvaluation: builder.mutation({
            query: ({ staffId, ...data }) => ({ url: `/staff/${staffId}/evaluations`, method: 'POST', body: data }),
            invalidatesTags: ['Staff'],
        }),
        getLeaveBalances: builder.query({
            query: (params) => ({ url: '/hr/leaves/balances', params }),
            providesTags: ['LeaveRequests'],
        }),
        updateLeaveBalance: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/hr/leaves/balances/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['LeaveRequests'],
        }),
        cancelLeaveRequest: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/hr/leaves/${id}/cancel`, method: 'POST', body: data }),
            invalidatesTags: ['LeaveRequests'],
        }),
        getCurrentReceptionShift: builder.query({
            query: () => '/reception/shifts/current',
            providesTags: ['Shifts'],
        }),
        openReceptionShift: builder.mutation({
            query: (data) => ({ url: '/reception/shifts/open', method: 'POST', body: data }),
            invalidatesTags: ['Shifts'],
        }),
        closeReceptionShift: builder.mutation({
            query: ({ sessionId, ...data }) => ({ url: `/reception/shifts/${sessionId}/close`, method: 'POST', body: data }),
            invalidatesTags: ['Shifts'],
        }),
        claimReceptionTask: builder.mutation({
            query: ({ appointmentId }) => ({ url: `/reception/tasks/${appointmentId}/claim`, method: 'POST' }),
            invalidatesTags: ['Queue', 'Appointments'],
        }),
        releaseReceptionTask: builder.mutation({
            query: ({ appointmentId }) => ({ url: `/reception/tasks/${appointmentId}/release`, method: 'POST' }),
            invalidatesTags: ['Queue', 'Appointments'],
        }),
        heartbeatReceptionTasks: builder.mutation({
            query: (data) => ({ url: '/reception/tasks/heartbeat', method: 'POST', body: data }),
        }),
    }),
    overrideExisting: false,
});
