import { describe, it, expect } from "vitest";
import { computePresetRange } from "./datePresets";

// Fixed reference week (all in July/Aug 2026):
//   Fri 2026-07-24 (dow 5), Sat 2026-07-25 (dow 6), Sun 2026-07-26 (dow 0)

describe("computePresetRange — tonight", () => {
  it("is always today→today", () => {
    expect(computePresetRange("tonight", "2026-07-24", 5)).toEqual({
      dateFrom: "2026-07-24",
      dateTo: "2026-07-24",
    });
  });
});

describe("computePresetRange — this_weekend", () => {
  it("Friday → the coming Sat–Sun", () => {
    expect(computePresetRange("this_weekend", "2026-07-24", 5)).toEqual({
      dateFrom: "2026-07-25",
      dateTo: "2026-07-26",
    });
  });

  it("Saturday → today (Sat) + tomorrow (Sun)", () => {
    expect(computePresetRange("this_weekend", "2026-07-25", 6)).toEqual({
      dateFrom: "2026-07-25",
      dateTo: "2026-07-26",
    });
  });

  it("Sunday → collapses to today (Sat already passed)", () => {
    expect(computePresetRange("this_weekend", "2026-07-26", 0)).toEqual({
      dateFrom: "2026-07-26",
      dateTo: "2026-07-26",
    });
  });

  it("Wednesday → the coming Sat–Sun", () => {
    expect(computePresetRange("this_weekend", "2026-07-22", 3)).toEqual({
      dateFrom: "2026-07-25",
      dateTo: "2026-07-26",
    });
  });
});

describe("computePresetRange — next_weekend", () => {
  it("Friday → the following weekend (crosses month boundary)", () => {
    expect(computePresetRange("next_weekend", "2026-07-24", 5)).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-02",
    });
  });

  it("Saturday → the following weekend", () => {
    expect(computePresetRange("next_weekend", "2026-07-25", 6)).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-02",
    });
  });

  it("Sunday → the coming weekend (this one is ending)", () => {
    expect(computePresetRange("next_weekend", "2026-07-26", 0)).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-02",
    });
  });
});
