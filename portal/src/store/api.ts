import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { setAccessToken, logOut } from "./authSlice";
import { refreshSessionToken } from "../lib/api";
import { portalPreviewToken } from "../lib/portal-preview";

export interface PortalNotificationAction {
  type: "portal_deep_link";
  target: string;
  label: string;
  url: string;
  entityId: string | null;
}

export interface PortalNotification {
  notification_id: string;
  channel: string;
  event_type: string | null;
  entity_id: string | null;
  subject: string | null;
  content: string | null;
  status: string | null;
  priority: "Normal" | "Action" | "Warning" | "Critical";
  category: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  acknowledgement_status: "Pending" | "Acknowledged" | "Superseded" | null;
  acknowledgement_due_at: string | null;
  escalated_at: string | null;
  action: PortalNotificationAction | null;
  action_url: string | null;
}

export interface PortalNotificationEnvelope {
  items: PortalNotification[];
  unreadCount: number;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export interface PortalNotificationPageParams {
  limit?: number;
  offset?: number;
}

// Same-origin by default (behind the portal nginx proxy /api/ -> backend).
// A missing env var must never silently point the patient portal at localhost.
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const getCsrfToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

let csrfBootstrapPromise: Promise<string | null> | null = null;

export const ensureCsrfToken = async (): Promise<string | null> => {
  const existing = getCsrfToken();
  if (existing) return existing;
  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetch(`${API_BASE_URL}/csrf-token`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(() => getCsrfToken())
      .catch(() => null)
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }
  return csrfBootstrapPromise;
};

const baseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: "include",
  prepareHeaders: (headers, { getState }: { getState: () => any }) => {
    const state = getState();
    headers.set("x-portal-client", "true");
    const token =
      state?.auth?.token ||
      (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("token") : null);
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithCsrf = async (args: any, apiInstance: any, extraOptions: any) => {
  const requestArgs = typeof args === "string" ? { url: args } : { ...args };
  const method = String(requestArgs.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      requestArgs.headers = {
        ...(requestArgs.headers || {}),
        "x-csrf-token": csrfToken,
      };
    }
  }

  return baseQuery(requestArgs, apiInstance, extraOptions) as Promise<any>;
};

const AUTH_ONLY_ENDPOINTS = new Set([
  "/auth/login",
  "/auth/logout",
  "/auth/refresh",
  "/portal/auth/refresh",
  "/portal/auth/logout",
  "/auth/change-password",
  "/portal/login",
  "/doctor-portal/login",
  "/public/case-status",
  "/public/case-status/verify",
  "/public/appointment-requests",
  "/public/final-report",
]);

/**
 * Uses the single-flight refresh from lib/api (shared with raw fetches so a
 * report download and an RTK query can never rotate the refresh cookie twice),
 * then reconciles the Redux auth state with the outcome.
 */
const refreshAccessToken = async (apiInstance: any): Promise<string | null> => {
  const token = await refreshSessionToken();
  if (token) {
    apiInstance.dispatch(setAccessToken(token));
  } else {
    // Session is gone — clear the persisted session AND the RTK cache so
    // mounted polling subscriptions stop retrying with a dead token.
    apiInstance.dispatch(logOut());
    apiInstance.dispatch(api.util.resetApiState());
  }
  return token;
};

const baseQueryWithReauth = async (args: any, apiInstance: any, extraOptions: any) => {
  const url = typeof args === "string" ? args : args?.url;
  let result = await baseQueryWithCsrf(args, apiInstance, extraOptions);
  if (result.error && result.error.status === 401 && !AUTH_ONLY_ENDPOINTS.has(url)) {
    const token = await refreshAccessToken(apiInstance);
    if (token) {
      result = await baseQueryWithCsrf(args, apiInstance, extraOptions);
    }
  }
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Profile",
    "MyRecords",
    "PortalInvoices",
    "PortalDocuments",
    "PortalRequests",
    "DoctorCases",
    "DoctorMessages",
    "Settings",
    "PublicSettings",
    "PatientMessages",
    "PortalNotifications",
    "DoctorNotifications",
    "PublicLandingOverview",
  ],
  endpoints: (builder) => ({
    logout: builder.mutation<any, undefined>({
      query: () => ({ url: "/portal/auth/logout", method: "POST" }),
    }),

    changePassword: builder.mutation<any, { currentPassword: string; newPassword: string }>({
      query: (body) => ({
        url: "/auth/change-password",
        method: "POST",
        body,
      }),
    }),

    // ─── Patient Portal ─────────────────────────────────────────────
    patientLogin: builder.mutation<any, any>({
      query: (credentials) => ({
        url: "/portal/login",
        method: "POST",
        body: credentials,
      }),
    }),
    getMyRecords: builder.query<any, void>({
      query: () => "/portal/records",
      providesTags: ["MyRecords"],
    }),
    getMyPortalProfile: builder.query<any, void>({
      query: () => "/portal/profile",
      providesTags: ["Profile"],
    }),
    getMyPortalInvoices: builder.query<any, void>({
      query: () => "/portal/invoices",
      providesTags: ["PortalInvoices"],
    }),
    getMyPortalDocuments: builder.query<any, void>({
      query: () => "/portal/documents",
      providesTags: ["PortalDocuments"],
    }),
    downloadPortalDocument: builder.query<any, string>({
      query: (documentId) => ({
        url: `/portal/documents/${encodeURIComponent(documentId)}/download`,
        responseHandler: (response: Response) => response.blob(),
      }),
    }),
    getMyAppointmentRequests: builder.query<any, void>({
      query: () => "/portal/appointment-requests",
      providesTags: ["PortalRequests"],
    }),
    createPortalAppointmentRequest: builder.mutation<any, any>({
      query: (data) => ({
        url: "/portal/appointment-requests",
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["PortalRequests"],
    }),
    createPortalProfileUpdateRequest: builder.mutation<any, any>({
      query: (data) => ({
        url: "/portal/profile-update-requests",
        method: "POST",
        body: data,
      }),
    }),
    getMyMessages: builder.query<any, undefined>({
      query: () => "/portal/messages",
      providesTags: ["PatientMessages"],
    }),
    sendPortalMessage: builder.mutation<any, any>({
      query: (data) => ({
        url: "/portal/messages",
        method: "POST",
        body: data,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const optimistic = {
          message_id: `temp-${Date.now()}`,
          body: arg.body,
          sender_role: "Patient",
          created_at: new Date().toISOString(),
          _optimistic: true,
        };
        const patch = dispatch(
          api.util.updateQueryData("getMyMessages" as any, undefined, (draft: any) => {
            draft.push(optimistic);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["PatientMessages"],
    }),

    // ─── Patient Portal Notifications ───────────────────────────────
    getMyPortalNotifications: builder.query<
      PortalNotificationEnvelope,
      PortalNotificationPageParams
    >({
      query: (params) => ({ url: "/portal/notifications", params }),
      providesTags: ["PortalNotifications"],
    }),
    getMyPortalNotificationUnreadCount: builder.query<any, void>({
      query: () => "/portal/notifications/unread-count",
      providesTags: ["PortalNotifications"],
    }),
    markMyPortalNotificationRead: builder.mutation<any, string>({
      query: (id) => ({
        url: `/portal/notifications/${id}/read`,
        method: "PUT",
      }),
      invalidatesTags: ["PortalNotifications"],
    }),
    markAllMyPortalNotificationsRead: builder.mutation<any, undefined>({
      query: () => ({
        url: "/portal/notifications/mark-all-read",
        method: "PUT",
      }),
      invalidatesTags: ["PortalNotifications"],
    }),

    // ─── Doctor Portal ──────────────────────────────────────────────
    doctorLogin: builder.mutation<any, any>({
      query: (credentials) => ({
        url: "/doctor-portal/login",
        method: "POST",
        body: credentials,
      }),
    }),
    getDoctorCases: builder.query<any, any>({
      query: (params) => ({
        url: "/doctor-portal/cases",
        params,
      }),
      providesTags: ["DoctorCases"],
    }),
    getDoctorReport: builder.query<any, string>({
      query: (examId) => `/doctor-portal/reports/${examId}`,
      providesTags: (_result, _error, examId) => [{ type: "DoctorCases", id: examId }],
    }),
    getDoctorMessages: builder.query<any, void>({
      query: () => "/doctor-portal/messages",
      providesTags: ["DoctorMessages"],
    }),
    getDoctorUnreadCount: builder.query<any, void>({
      query: () => "/doctor-portal/messages/unread-count",
      providesTags: ["DoctorMessages"],
    }),
    sendDoctorMessage: builder.mutation<any, any>({
      query: (data) => ({
        url: "/doctor-portal/messages",
        method: "POST",
        body: data,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const optimistic = {
          message_id: `temp-${Date.now()}`,
          body: arg.body,
          sender_role: "Doctor",
          created_at: new Date().toISOString(),
          _optimistic: true,
        };
        const patch = dispatch(
          api.util.updateQueryData("getDoctorMessages" as any, undefined, (draft: any) => {
            draft.push(optimistic);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["DoctorMessages"],
    }),
    getDoctorNotifications: builder.query<PortalNotificationEnvelope, PortalNotificationPageParams>(
      {
        query: (params) => ({ url: "/doctor-portal/notifications", params }),
        providesTags: ["DoctorNotifications"],
      },
    ),
    getDoctorNotificationUnreadCount: builder.query<any, void>({
      query: () => "/doctor-portal/notifications/unread-count",
      providesTags: ["DoctorNotifications"],
    }),
    markDoctorNotificationRead: builder.mutation<any, string>({
      query: (notificationId) => ({
        url: `/doctor-portal/notifications/${notificationId}/read`,
        method: "PUT",
      }),
      invalidatesTags: ["DoctorNotifications"],
    }),
    markAllDoctorNotificationsRead: builder.mutation<any, undefined>({
      query: () => ({
        url: "/doctor-portal/notifications/mark-all-read",
        method: "PUT",
      }),
      invalidatesTags: ["DoctorNotifications"],
    }),
    acknowledgeDoctorCriticalResult: builder.mutation<any, { id: string; notes?: string }>({
      query: ({ id, notes }) => ({
        url: `/doctor-portal/notifications/${id}/critical-result/acknowledge`,
        method: "POST",
        body: { notes },
      }),
      invalidatesTags: ["DoctorNotifications"],
    }),
    createDoctorOrder: builder.mutation<any, any>({
      query: (data) => ({
        url: "/doctor-portal/orders",
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["DoctorCases"],
    }),

    // ─── Center Settings (read-only, used by portals) ───────────────
    getCenterSettings: builder.query<any, void>({
      query: () => "/settings/center",
      providesTags: ["Settings"],
    }),
    getPublicCenterSettings: builder.query<any, void>({
      query: () => {
        const token = portalPreviewToken;
        return {
          url: "/settings/public/home",
          headers: token ? { "X-Portal-Preview": token } : undefined,
        };
      },
      providesTags: ["PublicSettings"],
    }),
    getPublicLandingOverview: builder.query<any, void>({
      query: () => "/public/landing-overview",
      providesTags: ["PublicLandingOverview"],
    }),
    lookupPublicCaseStatus: builder.mutation<
      any,
      { mrn: string; language?: "ar" | "en"; resend?: boolean }
    >({
      query: (body) => ({
        url: "/public/case-status",
        method: "POST",
        body,
      }),
    }),
    verifyPublicCaseStatus: builder.mutation<any, { challengeId: string; code: string }>({
      query: (body) => ({
        url: "/public/case-status/verify",
        method: "POST",
        body,
      }),
    }),
    refreshPublicCaseStatus: builder.mutation<any, { statusToken: string }>({
      query: (body) => ({
        url: "/public/case-status/status",
        method: "POST",
        body,
      }),
    }),
    createPublicAppointmentRequest: builder.mutation<
      any,
      {
        name: string;
        phone: string;
        mode: "center" | "home" | "consult";
        service: string;
        preferredDate?: string | null;
        consent: true;
        website?: string;
      }
    >({
      query: (body) => ({
        url: "/public/appointment-requests",
        method: "POST",
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
  useGetPublicLandingOverviewQuery,
  useLookupPublicCaseStatusMutation,
  useVerifyPublicCaseStatusMutation,
  useRefreshPublicCaseStatusMutation,
  useCreatePublicAppointmentRequestMutation,
  useLogoutMutation,
  useGetMyMessagesQuery,
  useSendPortalMessageMutation,
  useGetMyPortalNotificationsQuery,
  useLazyGetMyPortalNotificationsQuery,
  useGetMyPortalNotificationUnreadCountQuery,
  useMarkMyPortalNotificationReadMutation,
  useMarkAllMyPortalNotificationsReadMutation,
  useGetDoctorNotificationsQuery,
  useLazyGetDoctorNotificationsQuery,
  useGetDoctorNotificationUnreadCountQuery,
  useMarkDoctorNotificationReadMutation,
  useMarkAllDoctorNotificationsReadMutation,
  useAcknowledgeDoctorCriticalResultMutation,
} = api;
