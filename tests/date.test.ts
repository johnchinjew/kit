import { afterEach, expect, it, vi } from "vitest";
import { formatDate } from "../src/date";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  ["America/Los_Angeles", "10/04/2026"],
  ["Asia/Tokyo", "10/05/2026"],
])("formats an instant using the local calendar date in %s", (timeZone, expected) => {
  vi.stubEnv("TZ", timeZone);
  const DateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (_locales, options) {
    return new DateTimeFormat("en-US", options);
  });
  expect(formatDate(new Date("2026-10-05T01:00:00Z"))).toBe(expected);
});
