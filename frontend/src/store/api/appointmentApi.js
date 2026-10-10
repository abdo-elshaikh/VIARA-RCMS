import { api } from '../baseApi';

export const appointmentApi = api.injectEndpoints({
    endpoints: (builder) => ({
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
            query: ({ idempotencyKey, ...data }) => ({
                url: '/appointments',
                method: 'POST',
                body: data,
                headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
            }),
            invalidatesTags: ['Appointments', 'Queue', 'WaitingList'],
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
            query: (input) => ({
                url: `/appointments/${typeof input === 'object' ? input.id : input}`,
                method: 'DELETE',
                body: typeof input === 'object' && input.reason ? { reason: input.reason } : undefined,
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
        getDoctorInteractions: builder.query({
            query: (doctorId) => `/referring-doctors/${doctorId}/interactions`,
            providesTags: (result, error, id) => [{ type: 'DoctorInteractions', id }],
        }),
        createDoctorInteraction: builder.mutation({
            query: ({ doctorId, ...data }) => ({
                url: `/referring-doctors/${doctorId}/interactions`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: (result, error, { doctorId }) => [{ type: 'DoctorInteractions', id: doctorId }, 'ReferringDoctors'],
        }),
        setDoctorPortalPassword: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/referring-doctors/${id}/set-portal-password`,
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['ReferringDoctors'],
        }),
        getRooms: builder.query({
            query: (params) => ({ url: '/rooms', params }),
            providesTags: ['Rooms', 'Machines', 'ExamTypes'],
        }),
        getRoomById: builder.query({
            query: (id) => `/rooms/${id}`,
            providesTags: (result, error, id) => [{ type: 'Rooms', id }],
        }),
        createRoom: builder.mutation({
            query: (data) => ({ url: '/rooms', method: 'POST', body: data }),
            invalidatesTags: ['Rooms'],
        }),
        updateRoom: builder.mutation({
            query: ({ id, ...data }) => ({ url: `/rooms/${id}`, method: 'PUT', body: data }),
            invalidatesTags: ['Rooms'],
        }),
        deleteRoom: builder.mutation({
            query: (id) => ({ url: `/rooms/${id}`, method: 'DELETE' }),
            invalidatesTags: ['Rooms'],
        }),
        getClinicalHierarchyMatrix: builder.query({
            query: () => '/rooms/matrix',
            providesTags: ['Rooms'],
        }),
    }),
    overrideExisting: false,
});
