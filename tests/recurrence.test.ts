import { describe, expect, it } from "vitest";
import { decodeRecurrence, nextOccurrence, occurrenceDates, type Recurrence } from "../src/recurrence";
import { decodeTaskDate as date } from "../src/taskDate";

function rule(anchor: string, unit: Recurrence["unit"], every = 1): Recurrence {
  return { type: "Interval", anchor: date(anchor), unit, every };
}

describe("recurrence dates", () => {
  it("preserves a monthly anchor after short months", () => {
    expect(occurrenceDates(rule("2026-01-31", "Months"), date("2026-01-31"), date("2026-05-31")))
      .toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("returns to leap day and supports multiple-month intervals", () => {
    expect(occurrenceDates(rule("2024-02-29", "Years"), date("2024-02-29"), date("2028-02-29")))
      .toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    expect(nextOccurrence(rule("2026-12-31", "Months", 2), date("2026-12-31"))).toBe("2027-02-28");
  });
  it("advances calendar dates across daylight-saving and year boundaries", () => {
    expect(nextOccurrence(rule("2026-03-07", "Days", 2), date("2026-03-07"))).toBe("2026-03-09");
    expect(nextOccurrence(rule("2026-10-31", "Weeks", 2), date("2026-10-31"))).toBe("2026-11-14");
    expect(nextOccurrence(rule("2026-12-31", "Days"), date("2026-12-31"))).toBe("2027-01-01");
  });
  it("uses an inclusive projection horizon", () => {
    expect(occurrenceDates(rule("2026-10-01", "Weeks"), date("2026-10-01"), date("2026-10-08")))
      .toEqual(["2026-10-01", "2026-10-08"]);
    expect(occurrenceDates(rule("2026-10-01", "Weeks"), date("2026-10-01"), date("2026-09-30"))).toEqual([]);
  });
});

it.each([["Days", 366], ["Weeks", 53], ["Months", 13], ["Years", 2], ["Days", 0], ["Days", 1.5], ["Days", -1]])(
  "rejects an invalid interval %s %s", (unit, every) => {
    expect(() => decodeRecurrence({ type: "Interval", unit, every, anchor: "2026-01-01" })).toThrow();
  },
);
it.each(["Days", "Weeks", "Months", "Years"])("decodes PascalCase units and rejects lowercase units: %s", (unit) => {
  const recurrence = { type: "Interval", unit, every: 1, anchor: "2026-01-31" };
  expect(decodeRecurrence(recurrence)).toEqual(recurrence);
  expect(() => decodeRecurrence({ ...recurrence, unit: unit.toLowerCase() })).toThrow("Invalid recurrence unit");
});
it("rejects unknown rule types, units, and invalid anchors", () => {
  expect(() => decodeRecurrence({ type: "interval", unit: "Days", every: 1, anchor: "2026-01-01" })).toThrow("Invalid recurrence type");
  expect(() => decodeRecurrence({ type: "weekdays", days: [1, 3] })).toThrow("Invalid recurrence type");
  expect(() => decodeRecurrence({ type: "Interval", unit: "fortnights" })).toThrow("Invalid recurrence unit");
  expect(() => decodeRecurrence({ type: "Interval", unit: "Months", every: 1, anchor: "2026-02-29" })).toThrow();
});
