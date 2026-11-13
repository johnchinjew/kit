import { Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextOccurrenceDate, occurrenceDates, type RepeatingTask } from "../src/repeatingTask";
import { decodeTaskDate as date } from "../src/taskDate";

function createRepeatingTask(anchorDate: string, intervalUnit: RepeatingTask["schedule"]["intervalUnit"], interval = 1): RepeatingTask {
  return {
    title: "",
    details: "",
    schedule: {
      nextDate: date(anchorDate),
      interval,
      intervalUnit,
      anchorDate: date(anchorDate),
    },
    scheduleEditedAt: Timestamp.fromMillis(0),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("repeating task dates", () => {
  it("preserves a monthly anchorDate after short months", () => {
    expect(occurrenceDates(createRepeatingTask("2026-01-31", "Months").schedule, date("2026-05-31")))
      .toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("returns to leap day", () => {
    expect(occurrenceDates(createRepeatingTask("2024-02-29", "Years").schedule, date("2028-02-29")))
      .toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
  it("supports multiple-month intervals", () => {
    expect(nextOccurrenceDate(createRepeatingTask("2026-12-31", "Months", 2).schedule)).toBe("2027-02-28");
  });
  it("advances calendar dates across daylight-saving and year boundaries", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(nextOccurrenceDate(createRepeatingTask("2026-03-07", "Days", 2).schedule)).toBe("2026-03-09");
    expect(nextOccurrenceDate(createRepeatingTask("2026-10-31", "Weeks", 2).schedule)).toBe("2026-11-14");
    expect(nextOccurrenceDate(createRepeatingTask("2026-12-31", "Days").schedule)).toBe("2027-01-01");
  });
  it("uses an inclusive projection horizon", () => {
    expect(occurrenceDates(createRepeatingTask("2026-10-01", "Weeks").schedule, date("2026-10-08")))
      .toEqual(["2026-10-01", "2026-10-08"]);
    expect(occurrenceDates(createRepeatingTask("2026-10-01", "Weeks").schedule, date("2026-09-30"))).toEqual([]);
  });
});
