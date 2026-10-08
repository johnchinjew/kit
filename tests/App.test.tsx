// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { decodeTaskDate } from "../src/taskDate";
import { formatDate } from "../src/date";
import { advanceTaskSchedule, createTask, createTaskOccurrence, subscribeUserData, type UserData } from "../src/userData";

vi.mock("../src/session", () => ({
  createSession: () => ({
    session: () => ({ status: "SignedIn", user: { id: "alice", photoUrl: null } }),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock("../src/userData", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/userData")>(),
  subscribeUserData: vi.fn(),
  createTask: vi.fn().mockResolvedValue(undefined),
  createTaskOccurrence: vi.fn().mockResolvedValue(undefined),
  advanceTaskSchedule: vi.fn().mockResolvedValue(undefined),
}));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("orders completed tasks by completion instant and displays completion dates", () => {
  const older = Timestamp.fromDate(new Date("2026-10-04T12:00:00Z"));
  const newer = Timestamp.fromDate(new Date("2026-10-05T12:00:00Z"));
  const newest = new Timestamp(newer.seconds, newer.nanoseconds + 1);
  vi.mocked(subscribeUserData).mockImplementation((_userId, onUserData) => {
    onUserData({ tasks: {
      older: { type: "NonRepeatingTask", title: "Older", details: "", date: decodeTaskDate("2026-10-08"), completedAt: older },
      newer: { type: "NonRepeatingTask", title: "Newer", details: "", date: decodeTaskDate("2026-10-07"), completedAt: newer },
      newest: { type: "NonRepeatingTask", title: "Newest", details: "", date: decodeTaskDate("2026-10-09"), completedAt: newest },
      later: { type: "NonRepeatingTask", title: "Later", details: "", completedAt: null, date: decodeTaskDate("2026-10-06") },
      earlier: { type: "NonRepeatingTask", title: "Earlier", details: "", completedAt: null, date: decodeTaskDate("2026-10-04") },
    } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  expect([...document.querySelectorAll("li button")].map((button) => button.textContent)).toEqual(["Earlier", "Later"]);
  expect([...document.querySelectorAll("li time")].map((time) => time.getAttribute("datetime"))).toEqual(["2026-10-04", "2026-10-06"]);

  const select = document.querySelector("select")!;
  select.value = "Completed";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  const rows = [...document.querySelectorAll("li")];
  expect(rows.map((row) => row.querySelector("button")!.textContent)).toEqual(["Newest", "Newer", "Older"]);
  expect(rows[1]!.querySelector("time")!.getAttribute("datetime")).toBe(newer.toDate().toISOString());
  expect(rows[1]!.querySelector("time")!.textContent).toBe(formatDate(newer.toDate()));
  expect(rows[2]!.querySelector("time")!.getAttribute("datetime")).toBe(older.toDate().toISOString());
});


it("projects through a year, opens the canonical schedule, and materializes only after reopening", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 30, 12));
  vi.mocked(createTaskOccurrence).mockResolvedValue(undefined);
  vi.mocked(advanceTaskSchedule).mockResolvedValue(undefined);
  const repeating = { type: "RepeatingTask" as const, title: "Rent", details: "Pay", schedule: { nextDate: decodeTaskDate("2026-01-31"),
    recurrence: { type: "Interval" as const, every: 1, unit: "Months" as const, anchor: decodeTaskDate("2026-01-31") } },
    scheduleEditedAt: Timestamp.now() };
  vi.mocked(subscribeUserData).mockImplementation((_id, receive) => {
    receive({ tasks: { repeating } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const times = [...document.querySelectorAll("li time")].map((time) => time.getAttribute("datetime"));
  expect(times).toHaveLength(12);
  expect(times.slice(0, 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  expect(createTaskOccurrence).not.toHaveBeenCalled();
  expect(advanceTaskSchedule).not.toHaveBeenCalled();
  const mode = document.querySelector<HTMLSelectElement>("select")!;
  mode.value = "Completed";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  expect(document.querySelectorAll("li")).toHaveLength(0);
  mode.value = "Schedule";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelectorAll<HTMLButtonElement>("li button")[2]!.click();
  expect(document.querySelector<HTMLInputElement>('[name="date"]')!.value).toBe("2026-01-31");
  expect(document.querySelector<HTMLSelectElement>('[name="repeat"]')!.value).toBe("Months");
  vi.setSystemTime(new Date(2026, 0, 31, 0));
  vi.advanceTimersByTime(30_000);
  expect(createTaskOccurrence).not.toHaveBeenCalled();
  expect(advanceTaskSchedule).not.toHaveBeenCalled();
  dispose?.();
  document.body.replaceChildren();
  dispose = render(() => <App />, document.body);
  expect(createTask).not.toHaveBeenCalled();
  expect(createTaskOccurrence).toHaveBeenCalledExactlyOnceWith("alice", expect.any(String), repeating);
  const occurrenceId = vi.mocked(createTaskOccurrence).mock.calls[0]![1];
  expect(occurrenceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(advanceTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "repeating", repeating, occurrenceId);
});

it.each(["creation", "advancement"])("reports failed %s without retrying on updates or time passing", async (failure) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 31, 12));
  vi.mocked(createTaskOccurrence).mockResolvedValue(undefined);
  vi.mocked(advanceTaskSchedule).mockResolvedValue(undefined);
  if (failure === "creation") vi.mocked(createTaskOccurrence).mockRejectedValueOnce(new Error("Creation failed"));
  else vi.mocked(advanceTaskSchedule).mockRejectedValueOnce(new Error("Advancement failed"));
  const repeating = { type: "RepeatingTask" as const, title: "Rent", details: "Pay", schedule: { nextDate: decodeTaskDate("2026-01-31"),
    recurrence: { type: "Interval" as const, every: 1, unit: "Months" as const, anchor: decodeTaskDate("2026-01-31") } },
    scheduleEditedAt: Timestamp.now() };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_id, onData) => {
    receive = onData;
    receive({ tasks: { repeating } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const occurrenceId = vi.mocked(createTaskOccurrence).mock.calls[0]![1];
  await vi.advanceTimersByTimeAsync(0);
  expect(document.body.textContent).toContain("Could not update repeating tasks. Close and reopen Kit to try again later.");
  receive({ tasks: { repeating } });
  receive({ tasks: {
    repeating,
    [occurrenceId]: { type: "NonRepeatingTask", title: "Paid offline", details: "Pay", date: repeating.schedule.nextDate, completedAt: Timestamp.now() },
  } });
  await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1_000);
  expect(createTaskOccurrence).toHaveBeenCalledExactlyOnceWith("alice", occurrenceId, repeating);
  expect(advanceTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "repeating", repeating, occurrenceId);
});

it("queues all overdue occurrences from the first snapshot without waiting for online acknowledgments", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 31, 12));
  vi.mocked(createTaskOccurrence).mockImplementation(() => new Promise(() => {}));
  vi.mocked(advanceTaskSchedule).mockImplementation(() => new Promise(() => {}));
  const repeating = { type: "RepeatingTask" as const, title: "Walk", details: "Park", schedule: { nextDate: decodeTaskDate("2026-01-29"),
    recurrence: { type: "Interval" as const, every: 1, unit: "Days" as const, anchor: decodeTaskDate("2026-01-29") } },
    scheduleEditedAt: Timestamp.now() };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_id, onData) => {
    receive = onData;
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  expect(createTaskOccurrence).not.toHaveBeenCalled();
  receive({ tasks: { repeating } });
  expect(createTaskOccurrence).toHaveBeenCalledTimes(3);
  expect(advanceTaskSchedule).toHaveBeenCalledTimes(3);
  const dates = ["2026-01-29", "2026-01-30", "2026-01-31"];
  const ids = new Set<string>();
  for (const [index, call] of vi.mocked(createTaskOccurrence).mock.calls.entries()) {
    const [userId, occurrenceId, task] = call;
    expect(userId).toBe("alice");
    expect(task).toEqual({ ...repeating, schedule: { ...repeating.schedule, nextDate: dates[index] } });
    expect(vi.mocked(advanceTaskSchedule).mock.calls[index]).toEqual(["alice", "repeating", task, occurrenceId]);
    ids.add(occurrenceId);
  }
  expect(ids.size).toBe(3);
  receive({ tasks: { repeating } });
  expect(createTaskOccurrence).toHaveBeenCalledTimes(3);
  expect(advanceTaskSchedule).toHaveBeenCalledTimes(3);
});
