// Standard Error Reporting Utility
export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Runtime Error]", error, context);
  }
}
