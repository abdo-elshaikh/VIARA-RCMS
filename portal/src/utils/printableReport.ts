/**
 * Safe opening of server-rendered report HTML.
 *
 * Report HTML is opened through a same-origin Blob URL. Blob URLs inherit the
 * origin of the creating document, so any <script> tag embedded in the report
 * (for example from unescaped clinical/patient text) would otherwise execute
 * with full access to the portal session (including the token in sessionStorage).
 *
 * Before opening, the HTML is parsed in an inert document and every executable
 * or embeddable node/attribute is removed.
 *
 * Printing is triggered from the parent window (never with an inline script)
 * so it still works under a strict `script-src 'self'` CSP, which blob
 * documents inherit from their creator.
 */

const DANGEROUS_SELECTOR = [
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "form",
  "template",
  "meta[http-equiv]",
].join(", ");

const isDangerousUrl = (value: string): boolean => {
  // Browsers strip ASCII whitespace/control characters (tabs, newlines, NUL)
  // when parsing URLs, so `java\nscript:` is treated as `javascript:`. Normalize
  // the same way here, otherwise the blocklist below is trivially bypassed.
  // eslint-disable-next-line no-control-regex -- intentional: strips the ASCII control chars browsers ignore in URLs
  const normalized = value.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
  return (
    /^(javascript|vbscript|data:text\/html)/.test(normalized) ||
    (/^data:/.test(normalized) && !/^data:image\//.test(normalized))
  );
};

const sanitizeDom = (document: Document): void => {
  document.querySelectorAll(DANGEROUS_SELECTOR).forEach((element) => element.remove());

  document.querySelectorAll("link").forEach((element) => {
    const relation = (element.getAttribute("rel") || "").toLowerCase();
    if (relation !== "stylesheet" && relation !== "canonical") element.remove();
  });

  document.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (["href", "src", "xlink:href", "action", "formaction", "srcdoc"].includes(name)) {
        if (isDangerousUrl(attribute.value)) element.removeAttribute(attribute.name);
      }
    });
  });
};

export const sanitizePrintableHtml = (html: string): string => {
  if (!html) return html;
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    sanitizeDom(parsed);
    const serialized = parsed.documentElement?.outerHTML || html;
    return /^\s*<!doctype/i.test(html) ? `<!DOCTYPE html>\n${serialized}` : serialized;
  } catch {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }
};

const printWhenReady = (popup: Window): void => {
  let attempts = 0;
  const stop = () => window.clearInterval(timer);
  const timer = window.setInterval(() => {
    attempts += 1;
    try {
      if (popup.closed) {
        stop();
        return;
      }
      if (popup.document.readyState === "complete") {
        popup.focus();
        popup.print();
        stop();
      }
    } catch {
      if (attempts >= 40) stop();
    }
    if (attempts >= 40) stop();
  }, 200);
};

export { printWhenReady };

export interface OpenPrintableReportOptions {
  printImmediately?: boolean;
  fallbackFileName?: string;
}

export const openPrintableReport = (
  html: string,
  { printImmediately = false, fallbackFileName }: OpenPrintableReportOptions = {},
): void => {
  const printable = sanitizePrintableHtml(html);
  const url = URL.createObjectURL(new Blob([printable], { type: "text/html;charset=utf-8" }));
  const popup = window.open(url, "_blank");
  if (popup) {
    // Keep a handle for print() while severing the opener reference.
    popup.opener = null;
    if (printImmediately) printWhenReady(popup);
  } else {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (fallbackFileName) anchor.download = fallbackFileName;
    anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

