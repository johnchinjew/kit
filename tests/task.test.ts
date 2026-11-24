import { Timestamp } from "firebase/firestore";
import { afterEach, expect, it, vi } from "vitest";
import { taskRetentionElapsed, type Task } from "../src/task";
import { decodeTaskDate } from "../src/taskDate";

afterEach(() => vi.unstubAllEnvs());

it.each(["UTC", "America/Los_Angeles", "Pacific/Auckland"])("reaches the retention limit after 400 days at second precision in %s", (zone) => {
  vi.stubEnv("TZ", zone);
  const completion = "2024-02-29T23:30:00Z";
  const retentionEnd = "2025-04-04T23:30:00Z";
  const task: Task = {
    title: "Task", details: "", date: decodeTaskDate("2020-01-01"),
    completedAt: new Timestamp(Timestamp.fromDate(new Date(completion)).seconds, 123),
  };
  const retentionEndSeconds = Timestamp.fromDate(new Date(retentionEnd)).seconds;
  expect(taskRetentionElapsed(task, new Timestamp(retentionEndSeconds - 1, 999999999))).toBe(false);
  expect(taskRetentionElapsed(task, new Timestamp(retentionEndSeconds, 0))).toBe(true);
  expect(taskRetentionElapsed(task, new Timestamp(retentionEndSeconds + 1, 0))).toBe(true);
});

it("keeps incomplete tasks regardless of their date", () => {
  expect(taskRetentionElapsed({
    title: "Task", details: "", date: decodeTaskDate("2000-01-01"), completedAt: null,
  }, Timestamp.now())).toBe(false);
});
