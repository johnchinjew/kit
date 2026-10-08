// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { decodeTaskDate } from "../src/taskDate";
import { formatDate } from "../src/date";
import { createTask, subscribeUserData, type UserData } from "../src/userData";

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
}));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.resetAllMocks();
});

it("orders completed tasks by completion instant and displays completion dates", () => {
  const older = Timestamp.fromDate(new Date("2026-10-04T12:00:00Z"));
  const newer = Timestamp.fromDate(new Date("2026-10-05T12:00:00Z"));
  const newest = new Timestamp(newer.seconds, newer.nanoseconds + 1);
  vi.mocked(subscribeUserData).mockImplementation((_userId, onUserData) => {
    onUserData({ tasks: {
      older: { title: "Older", details: "", date: decodeTaskDate("2026-10-08"), completedAt: older },
      newer: { title: "Newer", details: "", date: decodeTaskDate("2026-10-07"), completedAt: newer },
      newest: { title: "Newest", details: "", date: decodeTaskDate("2026-10-09"), completedAt: newest },
      later: { title: "Later", details: "", completedAt: null, date: decodeTaskDate("2026-10-06") },
      earlier: { title: "Earlier", details: "", completedAt: null, date: decodeTaskDate("2026-10-04") },
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

it.each([false, true])("returns to the list when the open task with completed=%s is deleted remotely", (completed) => {
  const completedAt = completed ? Timestamp.now() : null;
  const task = { title: "Deleted task", details: "", date: decodeTaskDate("2026-10-07"), completedAt };
  const remaining = { ...task, title: "Remaining task" };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_id, onData) => {
    receive = onData;
    receive({ tasks: { selected: task, remaining } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  if (completed) {
    const mode = document.querySelector("select")!;
    mode.value = "Completed";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.querySelector<HTMLButtonElement>("li button")!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Deleted task");
  receive({ tasks: { remaining } });
  expect(document.querySelector('[name="title"]')).toBeNull();
  expect(document.body.textContent).not.toContain("Loading task");
  expect(document.querySelector("select")!.value).toBe(completed ? "Completed" : "Schedule");
  expect(document.querySelector("li button")!.textContent).toBe("Remaining task");
  document.querySelector<HTMLButtonElement>("li button")!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Remaining task");
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});

it("keeps a newly created task selected while waiting for its first snapshot", () => {
  vi.mocked(createTask).mockImplementation(() => new Promise(() => {}));
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_id, onData) => {
    receive = onData;
    receive({ tasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Add")!.click();
  const taskId = vi.mocked(createTask).mock.calls[0]![1];
  receive({ tasks: {} });
  expect(document.body.textContent).toContain("Loading task");
  receive({ tasks: { [taskId]: {
    title: "New task", details: "", date: decodeTaskDate("2026-10-07"), completedAt: null,
  } } });
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("New task");
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});
