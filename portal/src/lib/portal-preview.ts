// Keep the bearer token in memory when in-page section links change the hash.
// It is never placed in the query string, local storage, or a Referer header.
export const portalPreviewToken =
  typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.hash.slice(1)).get("preview");
