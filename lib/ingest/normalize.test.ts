import { describe, it, expect } from "vitest";
import { isNYCAddress } from "./normalize";

describe("isNYCAddress", () => {
  it("accepts clear NYC addresses", () => {
    expect(isNYCAddress("123 Main St, Brooklyn, NY 11201")).toBe(true);
    expect(isNYCAddress("30 Rockefeller Plaza, New York, NY 10112")).toBe(true);
    expect(isNYCAddress("Some Venue, Queens")).toBe(true);
    expect(isNYCAddress("456 5th Ave, Manhattan")).toBe(true);
  });

  it("rejects non-NYC cities (the Baltimore leak)", () => {
    expect(isNYCAddress("1200 Charles St, Baltimore, MD 21201")).toBe(false);
    expect(isNYCAddress("Baltimore Convention Center")).toBe(false);
    expect(isNYCAddress("Some Club, Newark, NJ")).toBe(false);
  });

  it("rejects any non-NY state code, even without a ZIP", () => {
    expect(isNYCAddress("500 Somewhere Ave, Baltimore, MD")).toBe(false);
    expect(isNYCAddress("1 Venue Rd, Stamford, CT")).toBe(false);
    expect(isNYCAddress("742 Evergreen Terrace, Springfield, IL")).toBe(false);
  });

  it("does not reject New York addresses on the state check", () => {
    expect(isNYCAddress("100 Broadway, New York, NY")).toBe(true);
  });

  it("passes unknown/empty addresses (backstopped by the borough guard)", () => {
    expect(isNYCAddress(undefined)).toBe(true);
    expect(isNYCAddress("The Basement")).toBe(true);
  });
});
