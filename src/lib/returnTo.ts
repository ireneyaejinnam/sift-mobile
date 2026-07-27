/**
 * Post-auth return routing. Only internal app routes (paths starting with "/")
 * are honored — anything else falls back to null so callers default to a safe
 * screen. Guards against a malformed/external `returnTo` param.
 */
export function sanitizeReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Must be an internal absolute path, and not a protocol-relative "//host".
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
