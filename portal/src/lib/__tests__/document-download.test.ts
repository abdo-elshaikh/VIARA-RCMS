import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("portal document download", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "/api");
    sessionStorage.setItem("token", "synthetic-portal-token");
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it("resolves a relative document against the portal origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ file_url: "/documents/example.pdf" }),
      })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["PDF"]) });
    vi.stubGlobal("fetch", fetchMock);
    const { downloadPatientDocument } = await import("../api");
    expect(await downloadPatientDocument("doc-1")).toBeInstanceOf(Blob);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/portal/documents/doc-1/download");
    expect(fetchMock.mock.calls[1][0]).toBe(`${window.location.origin}/documents/example.pdf`);
  });

  it.each([
    "https://external.invalid/file.pdf",
    "//external.invalid/file.pdf",
    "javascript:alert(1)",
  ])("does not forward credentials to %s", async (fileUrl) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ file_url: fileUrl }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { downloadPatientDocument } = await import("../api");
    expect(await downloadPatientDocument("doc-1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
