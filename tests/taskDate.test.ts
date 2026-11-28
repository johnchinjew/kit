import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import {
  decodeTaskDate,
  formatTaskDate,
  taskDateFromDate,
  taskDateFromUtcDate,
  taskDateOneYearAfter,
  taskDateToday,
  utcDateFromTaskDate,
  type TaskDate,
} from "../src/taskDate";
import type { Task } from "../src/task";
import { setTaskDate } from "../src/userData";
import type { RepeatingTask } from "../src/repeatingTask";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("converts task dates using UTC regardless of the local time zone", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  const date = decodeTaskDate("2024-02-29");
  expect(utcDateFromTaskDate(date).toISOString()).toBe("2024-02-29T00:00:00.000Z");
  expect(taskDateFromUtcDate(new Date("2024-02-29T01:00:00Z"))).toBe(date);
});

it("converts an instant to its local calendar day", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  expect(taskDateFromDate(new Date("2026-11-05T07:30:00Z"))).toBe("2026-11-04");
});

it.each([
  ["en-US", "Oct 5"],
  ["en-GB", "5 Oct"],
  ["de-DE", "5. Okt."],
])("formats dates for %s without shifting the calendar day", (locale, expected) => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  const DateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (_locales, options) {
    return new DateTimeFormat(locale, options);
  });
  expect(formatTaskDate(decodeTaskDate("2026-10-05"), decodeTaskDate("2026-10-01"))).toBe(expected);
});

it("uses the local calendar date near a UTC day boundary", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T01:00:00Z"));
  expect(taskDateToday()).toBe("2026-10-04");
});

it.each([
  ["2026-10-04", "2027-10-04"],
  ["2024-02-29", "2025-02-28"],
  ["2023-02-28", "2024-02-28"],
  ["2026-12-31", "2027-12-31"],
])("calculates the one-year limit from %s", (date, expected) => {
  expect(taskDateOneYearAfter(decodeTaskDate(date))).toBe(expected);
});

it.each(["2024-02-29", "2000-02-29", "2026-12-31"])("accepts calendar date %s", (date) => {
  expect(decodeTaskDate(date)).toBe(date);
});

it.each(["2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "", null, 42])(
  "rejects invalid calendar date %j", (date) => {
    expect(() => decodeTaskDate(date)).toThrow("Invalid task date");
  },
);

it("requires validated dates in the task model and date writes", () => {
  expectTypeOf<string>().not.toExtend<TaskDate>();
  expectTypeOf<Task["date"]>().toEqualTypeOf<TaskDate>();
  expectTypeOf<RepeatingTask["schedule"]["nextDate"]>().toEqualTypeOf<TaskDate>();
  expectTypeOf<Parameters<typeof setTaskDate>[2]>().toEqualTypeOf<TaskDate>();
  expectTypeOf<ReturnType<typeof taskDateToday>>().toEqualTypeOf<TaskDate>();
  expectTypeOf<ReturnType<typeof decodeTaskDate>>().toEqualTypeOf<TaskDate>();
});

it.each([
  ["2026-03-08", "2026-03-09", "Yesterday"],
  ["2026-03-09", "2026-03-09", "Today"],
  ["2026-11-02", "2026-11-01", "Tomorrow"],
  ["2025-12-31", "2026-01-01", "Yesterday"],
  ["2027-01-01", "2026-12-31", "Tomorrow"],
  ["2024-02-29", "2024-03-01", "Yesterday"],
])("formats %s relative to %s as %s", (date, today, expected) => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  expect(formatTaskDate(decodeTaskDate(date), decodeTaskDate(today))).toBe(expected);
});

it("includes the year for nonadjacent dates in another year", () => {
  const DateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (_locales, options) {
    return new DateTimeFormat("en-US", options);
  });
  expect(formatTaskDate(decodeTaskDate("2027-03-15"), decodeTaskDate("2026-11-17"))).toBe("Mar 15, 2027");
  expect(formatTaskDate(decodeTaskDate("2025-03-15"), decodeTaskDate("2026-11-17"))).toBe("Mar 15, 2025");
});

it("formats relative labels using the supplied local calendar date", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T01:00:00Z"));
  const today = taskDateToday();
  expect(formatTaskDate(decodeTaskDate("2026-10-04"), today)).toBe("Today");
  expect(formatTaskDate(decodeTaskDate("2026-10-05"), today)).toBe("Tomorrow");
});
