import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeSchedule, nextOccurrenceDate, occurrenceDates, type Schedule } from "../src/schedule";
import { decodeTaskDate as date } from "../src/taskDate";

function createSchedule(anchorDate: string, unit: Schedule["unit"], every = 1): Schedule {
  return { nextDate: date(anchorDate), anchorDate: date(anchorDate), unit, every };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("schedule dates", () => {
  it("preserves a monthly anchorDate after short months", () => {
    expect(occurrenceDates(createSchedule("2026-01-31", "Months"), date("2026-05-31")))
      .toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("returns to leap day", () => {
    expect(occurrenceDates(createSchedule("2024-02-29", "Years"), date("2028-02-29")))
      .toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
  it("supports multiple-month intervals", () => {
    expect(nextOccurrenceDate(createSchedule("2026-12-31", "Months", 2))).toBe("2027-02-28");
  });
  it("advances calendar dates across daylight-saving and year boundaries", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(nextOccurrenceDate(createSchedule("2026-03-07", "Days", 2))).toBe("2026-03-09");
    expect(nextOccurrenceDate(createSchedule("2026-10-31", "Weeks", 2))).toBe("2026-11-14");
    expect(nextOccurrenceDate(createSchedule("2026-12-31", "Days"))).toBe("2027-01-01");
  });
  it("uses an inclusive projection horizon", () => {
    expect(occurrenceDates(createSchedule("2026-10-01", "Weeks"), date("2026-10-08")))
      .toEqual(["2026-10-01", "2026-10-08"]);
    expect(occurrenceDates(createSchedule("2026-10-01", "Weeks"), date("2026-09-30"))).toEqual([]);
  });
});

it.each([["Days", 366], ["Weeks", 53], ["Months", 13], ["Years", 2], ["Days", 0], ["Days", 1.5], ["Days", -1]])(
  "rejects an invalid interval %s %s", (unit, every) => {
    expect(() => decodeSchedule({ nextDate: "2026-01-01", unit, every, anchorDate: "2026-01-01" })).toThrow();
  },
);
it.each(["Days", "Weeks", "Months", "Years"])("decodes PascalCase units and rejects lowercase units: %s", (unit) => {
  const schedule = { nextDate: "2026-01-31", unit, every: 1, anchorDate: "2026-01-31" };
  expect(decodeSchedule(schedule)).toEqual(schedule);
  expect(() => decodeSchedule({ ...schedule, unit: unit.toLowerCase() })).toThrow("Invalid schedule: invalid unit");
});
it("rejects unknown units and invalid anchor dates", () => {
  expect(() => decodeSchedule({ nextDate: "2026-01-01", unit: "fortnights" })).toThrow("Invalid schedule: invalid unit");
  expect(() => decodeSchedule({ nextDate: "2026-01-01", unit: "Months", every: 1, anchorDate: "2026-02-29" })).toThrow();
});
