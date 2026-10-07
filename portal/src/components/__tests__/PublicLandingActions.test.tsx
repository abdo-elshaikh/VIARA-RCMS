import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickBookingCard } from "../portal/landing/QuickBookingCard";
import { CaseLookupWidget } from "../portal/landing/CaseLookupWidget";

const mocks = vi.hoisted(() => ({
  createRequest: vi.fn(),
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  refreshStatus: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

vi.mock("../../hooks/use-landing-content", () => ({
  useLandingContent: () => ({ activeModalityNames: ["MRI"], isLoading: false }),
}));

vi.mock("../../store/api", () => ({
  ensureCsrfToken: vi.fn().mockResolvedValue("csrf-token"),
  useCreatePublicAppointmentRequestMutation: () => [mocks.createRequest, { isLoading: false }],
  useLookupPublicCaseStatusMutation: () => [mocks.requestCode, { isLoading: false }],
  useVerifyPublicCaseStatusMutation: () => [mocks.verifyCode, { isLoading: false }],
  useRefreshPublicCaseStatusMutation: () => [mocks.refreshStatus, { isLoading: false }],
}));

describe("public landing actions", () => {
  it("submits an encrypted-server booking workflow and shows its tracking number", async () => {
    mocks.createRequest.mockReturnValue({
      unwrap: () => Promise.resolve({ requestNumber: "WEB-20260908-ABC12345" }),
    });
    render(<QuickBookingCard initialService="MRI" />);

    fireEvent.change(screen.getByLabelText("Patient name"), { target: { value: "Test Patient" } });
    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "+20 100 000 0000" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send appointment request" }));

    await screen.findByText("WEB-20260908-ABC12345");
    expect(mocks.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test Patient",
        phone: "+20 100 000 0000",
        service: "MRI",
        consent: true,
      }),
    );
  });

  it("does not expose a case until the six-digit verification code succeeds", async () => {
    mocks.requestCode.mockReturnValue({
      unwrap: () => Promise.resolve({ challengeId: "challenge-id" }),
    });
    mocks.verifyCode.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          found: true,
          completed: false,
          case: {
            examType: "Brain MRI",
            status: { code: "reporting", progress: 72 },
            workflow: [
              { code: "scheduled", state: "completed" },
              { code: "preparation", state: "completed" },
              { code: "imaging", state: "completed" },
              { code: "reporting", state: "current" },
              { code: "completed", state: "pending" },
            ],
          },
          report: { available: false },
        }),
    });
    render(<CaseLookupWidget />);

    fireEvent.change(screen.getByLabelText("Medical record or order number"), {
      target: { value: "PAT-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    await screen.findByLabelText("Verification code");
    expect(screen.queryByText("Brain MRI")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and show status" }));

    await waitFor(() => expect(screen.getByText("Brain MRI")).toBeInTheDocument());
    expect(mocks.verifyCode).toHaveBeenCalledWith({ challengeId: "challenge-id", code: "123456" });
  });
});
