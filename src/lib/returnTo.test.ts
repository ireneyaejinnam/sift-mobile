import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo", () => {
  it("accepts internal absolute paths", () => {
    expect(sanitizeReturnTo("/event/abc123")).toBe("/event/abc123");
    expect(sanitizeReturnTo("/(tabs)/discover")).toBe("/(tabs)/discover");
  });

  it("rejects protocol-relative paths", () => {
    expect(sanitizeReturnTo("//evil.com")).toBeNull();
  });

  it("rejects external URLs and non-path strings", () => {
    expect(sanitizeReturnTo("https://evil.com")).toBeNull();
    expect(sanitizeReturnTo("evil.com")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(sanitizeReturnTo(undefined)).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(42)).toBeNull();
    expect(sanitizeReturnTo(["/event/x"])).toBeNull();
  });
});
