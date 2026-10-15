import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalNotificationsView from "../PortalNotificationsView";

const refetch = vi.fn();
const markRead = vi.fn();
const markAllRead = vi.fn();
const loadPage = vi.fn();
const acknowledgeCritical = vi.fn();

const queryState: any = {
  data: undefined,
  error: undefined,
  isError: false,
  isFetching: false,
  isLoading: false,
  refetch,
};

vi.mock("../../store/api", () => ({
  useGetMyPortalNotificationsQuery: () => queryState,
  useGetDoctorNotificationsQuery: () => ({ ...queryState, data: undefined }),
  useLazyGetMyPortalNotificationsQuery: () => [loadPage],
  useLazyGetDoctorNotificationsQuery: () => [loadPage],
  useMarkMyPortalNotificationReadMutation: () => [markRead],
  useMarkDoctorNotificationReadMutation: () => [markRead],
  useMarkAllMyPortalNotificationsReadMutation: () => [markAllRead, { isLoading: false }],
  useMarkAllDoctorNotificationsReadMutation: () => [markAllRead, { isLoading: false }],
  useAcknowledgeDoctorCriticalResultMutation: () => [acknowledgeCritical],
}));

const notification = {
  notification_id: "notification-1",
  channel: "InApp",
  event_type: "ReportReady",
  entity_id: "exam-1",
  subject: "Report ready",
  content: "Your report can now be viewed.",
  status: "Sent",
  priority: "Action",
  category: "Clinical",
  is_read: false,
  read_at: null,
  created_at: "2026-08-28T12:00:00Z",
  action: {
    type: "portal_deep_link",
    target: "records",
    label: "View records",
    url: "/patient/dashboard?tab=records",
    entityId: "exam-1",
  },
  action_url: "/patient/dashboard?tab=records",
};

describe("PortalNotificationsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.data = {
      items: [notification],
      unreadCount: 1,
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false, nextOffset: null },
    };
    queryState.error = undefined;
    queryState.isError = false;
    queryState.isLoading = false;
    markRead.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    markAllRead.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    loadPage.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          items: [],
          unreadCount: 1,
          pagination: { limit: 20, offset: 1, total: 1, hasMore: false, nextOffset: null },
        }),
    });
  });

  it("keeps a read notification card keyboard-focusable", async () => {
    render(<PortalNotificationsView portalType="patient" />);

    const card = screen.getByRole("listitem");
    expect(card).toHaveAttribute("tabindex", "0");
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("notification-1"));
    expect(card).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("opens only the persona-safe action target", async () => {
    const onNavigate = vi.fn();
    render(<PortalNotificationsView portalType="patient" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: /View records/ }));

    expect(onNavigate).toHaveBeenCalledWith("records", "exam-1");
    await waitFor(() => expect(markRead).toHaveBeenCalledWith("notification-1"));
  });

  it("shows a retry control for an initial request failure", () => {
    queryState.data = undefined;
    queryState.isError = true;
    queryState.error = { data: { message: "Network unavailable" } };
    render(<PortalNotificationsView portalType="patient" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("loads and appends the next page", async () => {
    queryState.data.pagination = {
      limit: 20,
      offset: 0,
      total: 2,
      hasMore: true,
      nextOffset: 1,
    };
    loadPage.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          items: [
            {
              ...notification,
              notification_id: "notification-2",
              subject: "Appointment confirmed",
              event_type: "AppointmentCreated",
              action: null,
              action_url: null,
              is_read: true,
            },
          ],
          unreadCount: 1,
          pagination: { limit: 20, offset: 1, total: 2, hasMore: false, nextOffset: null },
        }),
    });
    render(<PortalNotificationsView portalType="patient" />);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Appointment confirmed")).toBeInTheDocument();
    expect(loadPage).toHaveBeenCalledWith({ limit: 20, offset: 1 }, false);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders an explicit empty inbox state", () => {
    queryState.data = {
      items: [],
      unreadCount: 0,
      pagination: { limit: 20, offset: 0, total: 0, hasMore: false, nextOffset: null },
    };

    render(<PortalNotificationsView portalType="patient" />);

    expect(screen.getByText("No notifications")).toBeInTheDocument();
  });
});
