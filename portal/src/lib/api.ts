/**
 * VIARA Backend API Client
 * Compatible with Node/Express & PostgreSQL backend running at http://localhost:3000/api
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;
  body?: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("token");
}

export function setAuthToken(token: string) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem("token", token);
    localStorage.removeItem("VIARA_token");
  }
}

export function clearAuthToken() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
  }
}

export type PortalIdentity = {
  name?: string;
  email?: string;
  role?: string;
  doctorId?: string;
  userId?: string;
};

/**
 * Fetch the current user's identity from the backend /api/profile endpoint.
 * Do NOT decode the JWT client-side — sensitive claims (permissions, email) are
 * only returned by the server and never exposed to arbitrary JS.
 */
export async function getAuthIdentity(): Promise<PortalIdentity | null> {
  try {
    const res = await request<{ id?: string; name?: string; email?: string; role?: string; mustChangePassword?: boolean }>('/profile');
    return res;
  } catch {
    return null;
  }
}

/** Which login page to send an unauthenticated visitor to, based on URL. */
function unauthedRedirectPath(): string {
  if (typeof window === "undefined") return "/patient/login";
  const p = window.location.pathname;
  if (p.startsWith("/doctor")) return "/doctor/login";
  return "/patient/login";
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (csrfMatch) {
      headers["x-csrf-token"] = decodeURIComponent(csrfMatch[1]);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
  } catch (e) {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }

  if (res.status === 401) {
    // Token invalid or expired — clear and bounce to login (except during login itself).
    if (!endpoint.endsWith("/login")) {
      clearAuthToken();
      if (typeof window !== "undefined") {
        const target = unauthedRedirectPath();
        if (window.location.pathname !== target) {
          window.location.replace(target);
          throw new ApiError("Unauthenticated.", 401, undefined);
        }
      }
    }
  }

  if (!res.ok) {
    let body: any = undefined;
    let errorMsg = `Request failed (${res.status})`;
    try {
      body = await res.json();
      if (body?.message) errorMsg = body.message;
      else if (body?.error) errorMsg = body.error;
    } catch { }
    throw new ApiError(errorMsg, res.status, body);
  }

  // Some endpoints (e.g. mark-all-read) may return 204.
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

async function downloadBlob(endpoint: string): Promise<Blob> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  return res.blob();
}

// ─── Patient Portal API ───────────────────────────────────────────────────

export async function loginPatient(mrn: string, password: string) {
  const data = await request<{ token: string; user?: any }>("/portal/login", {
    method: "POST",
    body: JSON.stringify({ mrn, password }),
  });
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function fetchPatientProfile() {
  return request<any>("/portal/profile");
}

export async function fetchPatientRecords() {
  return request<any[]>("/portal/records");
}

export async function fetchPatientInvoices() {
  return request<any[]>("/portal/invoices");
}

export async function fetchPatientAppointmentRequests() {
  return request<any[]>("/portal/appointment-requests");
}

export async function fetchPatientDocuments() {
  return request<any[]>("/portal/documents");
}

export async function fetchExamTypes() {
  return request<any[]>("/exam-types");
}

/**
 * Backwards-compatible name lookup, but callers should prefer passing an id
 * from a previously fetched exam-types list.
 */
export async function fetchProcedureApproachDetails(nameOrId: string) {
  try {
    const list = await fetchExamTypes();
    if (Array.isArray(list)) {
      const match = list.find(
        (et: any) =>
          et.type_id === nameOrId ||
          et.id === nameOrId ||
          et.name?.toLowerCase().includes(nameOrId.toLowerCase()),
      );
      if (match) return match;
    }
  } catch { }
  return null;
}

export async function submitProfileUpdateRequest(requestedChanges: Record<string, any>) {
  return request<any>("/portal/profile-update-requests", {
    method: "POST",
    body: JSON.stringify(requestedChanges),
  });
}

export interface AppointmentRequestPayload {
  preferredDate: string;
  preferredTimeWindow: string;
  modalityType?: string;
  examTypeId?: string;
  clinicalNotes?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export async function submitAppointmentRequest(payload: AppointmentRequestPayload) {
  return request<any>("/portal/appointment-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Patient Notifications & Chat API ─────────────────────────────────────

export async function fetchPatientNotifications() {
  return request<any[]>("/portal/notifications");
}

export async function fetchPatientNotificationUnreadCount() {
  try {
    const data = await request<{ unreadCount: number }>("/portal/notifications/unread-count");
    return data?.unreadCount ?? 0;
  } catch {
    return 0;
  }
}

export async function markAllPatientNotificationsRead() {
  return request<any>("/portal/notifications/mark-all-read", { method: "PUT" });
}

export async function markPatientNotificationRead(id: string) {
  return request<any>(`/portal/notifications/${encodeURIComponent(id)}/read`, { method: "PUT" });
}

export async function fetchPatientChatMessages() {
  return request<any[]>("/portal/messages");
}

export async function sendPatientChatMessage(body: string, appointmentId?: string) {
  return request<any>("/portal/messages", {
    method: "POST",
    body: JSON.stringify({ body, appointmentId }),
  });
}

// ─── Download API (Exam Reports, Invoices, Documents) ─────────────────────

export async function downloadReportPdf(examId: string): Promise<Blob | null> {
  try {
    return await downloadBlob(`/exams/${encodeURIComponent(examId)}/report/pdf?customize=false`);
  } catch {
    return null;
  }
}

export async function downloadInvoicePdf(invoiceId: string): Promise<Blob | null> {
  try {
    return await downloadBlob(`/invoices/${encodeURIComponent(invoiceId)}/pdf`);
  } catch {
    return null;
  }
}

export async function downloadPatientDocument(documentId: string): Promise<Blob | null> {
  try {
    const token = getAuthToken();
    const res = await fetch(
      `${API_BASE_URL}/portal/documents/${encodeURIComponent(documentId)}/download`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return await res.blob();

    const metadata = (await res.json()) as { file_url?: string };
    if (!metadata.file_url) return null;
    const backendOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
    const fileUrl = new URL(metadata.file_url, `${backendOrigin}/`).toString();
    const fileRes = await fetch(fileUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!fileRes.ok) throw new ApiError(`Download failed (${fileRes.status})`, fileRes.status);
    return await fileRes.blob();
  } catch {
    return null;
  }
}

// ─── Doctor Portal API ────────────────────────────────────────────────────

export async function loginDoctor(email: string, password: string) {
  const data = await request<{ token: string; doctor?: any }>("/doctor-portal/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function fetchDoctorCases(params?: { search?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.status && params.status !== "All") query.append("status", params.status);
  const qs = query.toString() ? `?${query.toString()}` : "";
  return request<any[]>(`/doctor-portal/cases${qs}`);
}

export async function fetchDoctorReport(examId: string) {
  return request<any>(`/doctor-portal/reports/${encodeURIComponent(examId)}`);
}

export async function submitDoctorOrder(orderData: {
  patientMrn: string;
  modalityType?: string;
  preferredDate?: string;
  preferredTimeWindow?: string;
  examTypeId?: string;
  clinicalNotes?: string;
}) {
  return request<any>("/doctor-portal/orders", {
    method: "POST",
    body: JSON.stringify(orderData),
  });
}

export async function fetchDoctorMessages() {
  return request<any[]>("/doctor-portal/messages");
}

export async function sendDoctorMessageApi(
  body: string,
  context?: { subject?: string; appointmentId?: string; examId?: string },
) {
  return request<any>("/doctor-portal/messages", {
    method: "POST",
    body: JSON.stringify({ body, ...context }),
  });
}

export async function downloadDoctorReportPdf(examId: string): Promise<Blob | null> {
  try {
    return await downloadBlob(`/doctor-portal/reports/${encodeURIComponent(examId)}/pdf`);
  } catch {
    return null;
  }
}

export async function fetchDoctorMessagesUnreadCount() {
  try {
    const data = await request<{ unreadCount: number }>("/doctor-portal/messages/unread-count");
    return data?.unreadCount ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchDoctorNotifications() {
  return request<any[]>("/doctor-portal/notifications");
}

export async function fetchDoctorNotificationUnreadCount() {
  try {
    const data = await request<{ unreadCount: number }>(
      "/doctor-portal/notifications/unread-count",
    );
    return data?.unreadCount ?? 0;
  } catch {
    return 0;
  }
}

export async function markAllDoctorNotificationsRead() {
  return request<any>("/doctor-portal/notifications/mark-all-read", { method: "PUT" });
}

export async function markDoctorNotificationRead(id: string) {
  return request<any>(`/doctor-portal/notifications/${encodeURIComponent(id)}/read`, {
    method: "PUT",
  });
}

// ─── Public Center Settings API ───────────────────────────────────────────

export async function fetchPublicCenterSettings() {
  try {
    return await request<unknown>("/settings/public/home");
  } catch {
    return null;
  }
}
