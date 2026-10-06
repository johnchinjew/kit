import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { decodeDate, formatDate, oneYearFromToday, today, type TaskDate } from "../src/date";
import { type Task, setTaskDate } from "../src/userData";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it.each([
  ["en-US", "10/05/2026"],
  ["en-GB", "05/10/2026"],
  ["de-DE", "05.10.2026"],
])("formats dates for %s without shifting the calendar day", (locale, expected) => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  expect(formatDate(decodeDate("2026-10-05"), locale)).toBe(expected);
});

it("uses the local calendar date near a UTC day boundary", () => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T01:00:00Z"));
  expect(today()).toBe("2026-10-04");
});

it.each([
  ["2026-10-05T01:00:00Z", "2027-10-04"],
  ["2024-02-29T20:00:00Z", "2025-02-28"],
  ["2023-02-28T20:00:00Z", "2024-02-28"],
  ["2026-12-31T20:00:00Z", "2027-12-31"],
])("calculates the one-year limit from %s", (now, expected) => {
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  expect(oneYearFromToday()).toBe(expected);
});

it.each(["2024-02-29", "2000-02-29", "2026-12-31"])("accepts calendar date %s", (date) => {
  expect(decodeDate(date)).toBe(date);
});

it.each(["2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "", null, 42])(
  "rejects invalid calendar date %j", (date) => {
    expect(() => decodeDate(date)).toThrow("Invalid task date");
  },
);

it("requires validated dates in the task model and date writes", () => {
  expectTypeOf<string>().not.toExtend<TaskDate>();
  expectTypeOf<Task["date"]>().toEqualTypeOf<TaskDate>();
  expectTypeOf<Parameters<typeof setTaskDate>[2]>().toEqualTypeOf<TaskDate>();
  expectTypeOf<ReturnType<typeof today>>().toEqualTypeOf<TaskDate>();
  expectTypeOf<ReturnType<typeof decodeDate>>().toEqualTypeOf<TaskDate>();
});
