import { describe, expect, it } from "vitest";
import { sanitizePrintableHtml } from "../printableReport";
import { todayLocalISO, isPastDate } from "../date";

describe("sanitizePrintableHtml", () => {
  it("removes <script> blocks", () => {
    const html = "<html><body><h1>Report</h1><script>alert('xss')</script></body></html>";
    const output = sanitizePrintableHtml(html);
    expect(output).not.toContain("<script");
    expect(output).toContain("Report");
  });

  it("strips event-handler attributes such as onerror", () => {
    const html = `<img src="x.png" onerror="alert(1)" onload="steal()" alt="scan">`;
    const output = sanitizePrintableHtml(html);
    expect(output).not.toContain("onerror");
    expect(output).not.toContain("onload");
    expect(output).toContain('alt="scan"');
  });

  it("removes javascript: and dangerous data: URLs", () => {
    const html = `<a href="javascript:document.body.innerHTML=''">click</a><iframe src="data:text/html;base64,PHNjcmlwdD4="></iframe>`;
    const output = sanitizePrintableHtml(html);
    expect(output).not.toContain("javascript:");
    expect(output).not.toContain("iframe");
  });

  it("neutralizes control-character obfuscated javascript: schemes", () => {
    const html =
      '<a href="java&#x0A;script:alert(1)">x</a><a href="java&#x09;script:alert(2)">y</a>' +
      '<a href="jav&#x0D;ascript:alert(3)">z</a><img src="java&#x0A;script:steal()" alt="img">';
    const output = sanitizePrintableHtml(html);
    expect(output).not.toContain("href=");
    expect(output).not.toContain("src=");
    expect(output).not.toContain("alert(");
    expect(output).not.toContain("steal()");
  });

  it("strips embedded objects/forms but keeps layout-affecting markup", () => {
    const html = `
      <link rel="stylesheet" href="/report.css">
      <style>body { font-family: serif; }</style>
      <form action="/api/delete"><button>Go</button></form>
      <object data="x.swf"></object>
      <p style="color:red">Findings</p>
    `;
    const output = sanitizePrintableHtml(html);
    expect(output).not.toContain("<form");
    expect(output).not.toContain("<object");
    expect(output).toContain("/report.css");
    expect(output).toContain("<style>");
    expect(output).toContain("color:red");
    expect(output).toContain("Findings");
  });

  it("allows data:image sources needed by inline report images", () => {
    const html = `<img src="data:image/png;base64,AAAA" alt="inline">`;
    const output = sanitizePrintableHtml(html);
    expect(output).toContain("data:image/png");
  });

  it("handles non-HTML input without throwing", () => {
    expect(sanitizePrintableHtml("")).toBe("");
    expect(sanitizePrintableHtml("plain text")).toContain("plain text");
  });
});

describe("todayLocalISO / isPastDate", () => {
  it("returns today's date in the local timezone as YYYY-MM-DD", () => {
    const value = todayLocalISO();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const expected = new Date(now.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
    expect(value).toBe(expected);
  });

  it("flags dates strictly before today (local) as past", () => {
    expect(isPastDate("2000-01-01")).toBe(true);
    expect(isPastDate(todayLocalISO())).toBe(false);
    expect(isPastDate("2999-12-31")).toBe(false);
    expect(isPastDate(undefined)).toBe(false);
    expect(isPastDate("")).toBe(false);
  });
});
