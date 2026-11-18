// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { createSession, type Session } from "../src/session";
import { decodeTaskDate } from "../src/taskDate";
import { createRepeatingTask, createTasksFromRepeatingTasks, createTask, subscribeUserData, type UserData } from "../src/userData";

vi.mock("../src/session", () => ({
  createSession: vi.fn(() => ({
    session: () => ({ status: "SignedIn", user: { userId: "alice", photoUrl: null } }),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("../src/userData", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/userData")>(),
  subscribeUserData: vi.fn(),
  createTask: vi.fn(),
  createRepeatingTask: vi.fn(),
  createTasksFromRepeatingTasks: vi.fn(),
}));

let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  vi.setSystemTime(new Date(2026, 10, 4, 12));
  vi.mocked(createTask).mockResolvedValue(undefined);
  vi.mocked(createRepeatingTask).mockResolvedValue(undefined);
  vi.mocked(createTasksFromRepeatingTasks).mockResolvedValue(undefined);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

it("only shows the pre-alpha notice on the sign-in screen", () => {
  const [session, setSession] = createSignal<Session>({ status: "CheckingAuth" });
  vi.mocked(createSession).mockReturnValueOnce({ session, signIn: vi.fn(), signOut: vi.fn() });
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);

  const message = "Kit is in pre-alpha.";
  expect(document.body.textContent).not.toContain(message);

  setSession({ status: "SignedOut" });
  expect(document.body.textContent).toContain(message);
  const feedbackLink = document.querySelector<HTMLAnchorElement>("main a");
  expect(feedbackLink?.textContent).toBe("open an issue");
  expect(feedbackLink?.getAttribute("href")).toBe("https://github.com/johnchinjew/kit/issues");

  setSession({ status: "SignedIn", user: { userId: "alice", photoUrl: null } });
  expect(document.body.textContent).not.toContain(message);
  expect(feedbackLink?.isConnected).toBe(false);
});

it.each([false, true])("only processes the first snapshot, with initial due tasks=%s", async (initiallyDue) => {
  const data: UserData = { tasks: {}, repeatingTasks: { rent: {
    title: "Rent", details: "",
    schedule: {
      nextDate: decodeTaskDate("2026-11-04"), interval: 1, intervalUnit: "Months", anchorDate: decodeTaskDate("2026-11-04"),
    },
    scheduleEditedAt: Timestamp.now(),
  } } };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive(initiallyDue ? data : { tasks: {}, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  receive(data);
  await Promise.resolve();
  receive(data);
  await Promise.resolve();

  expect(createTasksFromRepeatingTasks).toHaveBeenCalledExactlyOnceWith(
    "alice", initiallyDue ? data : { tasks: {}, repeatingTasks: {} },
  );
});

it("shows startup recurrence failures and does not retry on later snapshots", async () => {
  let rejectProcessing!: (error: Error) => void;
  vi.mocked(createTasksFromRepeatingTasks).mockReturnValue(new Promise<void>((_resolve, reject) => {
    rejectProcessing = reject;
  }));
  const data: UserData = { tasks: {}, repeatingTasks: { rent: {
    title: "Rent", details: "",
    schedule: {
      nextDate: decodeTaskDate("2026-11-02"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-11-02"),
    },
    scheduleEditedAt: Timestamp.now(),
  } } };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive(data);
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  rejectProcessing(new Error("Write failed"));
  await vi.waitFor(() => expect(document.body.textContent).toContain(
    "Could not update repeating tasks. Please close and reopen Kit.",
  ));
  receive(data);
  await Promise.resolve();
  expect(createTasksFromRepeatingTasks).toHaveBeenCalledExactlyOnceWith("alice", data);
});

it("orders completed tasks by completion instant and displays completion dates", () => {
  const older = Timestamp.fromDate(new Date("2026-10-04T12:00:00Z"));
  const newer = Timestamp.fromDate(new Date("2026-10-05T12:00:00Z"));
  const newest = new Timestamp(newer.seconds, newer.nanoseconds + 1);
  vi.mocked(subscribeUserData).mockImplementation((_userId, onUserData) => {
    onUserData({ tasks: {
      older: { title: "Older", details: "", date: decodeTaskDate("2026-10-08"), completedAt: older },
      newer: { title: "Newer", details: "", date: decodeTaskDate("2026-10-07"), completedAt: newer },
      newest: { title: "Newest", details: "Finished the report", date: decodeTaskDate("2026-10-09"), completedAt: newest },
      later: { title: "Later", details: "", completedAt: null, date: decodeTaskDate("2026-10-06") },
      earlier: { title: "Earlier", details: "", completedAt: null, date: decodeTaskDate("2026-10-04") },
    }, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  expect([...document.querySelectorAll("li button > span:first-child")].map((title) => title.textContent)).toEqual(["Earlier", "Later"]);
  expect([...document.querySelectorAll("li time")].map((time) => time.getAttribute("datetime"))).toEqual(["2026-10-04", "2026-10-06"]);

  const select = document.querySelector("select")!;
  select.value = "Completed";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  const rows = [...document.querySelectorAll("li")];
  expect(rows.map((row) => row.querySelector("button > span:first-child")!.textContent)).toEqual(["Newest", "Newer", "Older"]);
  expect(rows[0]!.textContent).not.toContain("Finished the report");
  expect(rows[1]!.querySelector("time")!.getAttribute("datetime")).toBe(newer.toDate().toISOString());
  expect(rows[1]!.querySelector("time")!.textContent).toBe("Completed Oct 5");
  expect(rows[2]!.querySelector("time")!.getAttribute("datetime")).toBe(older.toDate().toISOString());
});

it.each([
  { day: 4, label: "Today" },
  { day: 3, label: "Yesterday" },
])("shows completed tasks with a $label label", ({ day, label }) => {
  const completedAt = Timestamp.fromDate(new Date(2026, 10, day, 23, 30));
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData({ tasks: {
      done: { title: "Done", details: "", date: decodeTaskDate("2026-10-01"), completedAt },
    }, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector("select")!;
  select.value = "Completed";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  expect(document.querySelector("li time")!.textContent).toBe(`Completed ${label}`);
  expect(document.querySelector("li time")!.getAttribute("datetime")).toBe(completedAt.toDate().toISOString());
});

it.each([false, true])("returns to the list when the open task with completed=%s is deleted remotely", (completed) => {
  const completedAt = completed ? Timestamp.now() : null;
  const task = { title: "Deleted task", details: "", date: decodeTaskDate("2026-10-07"), completedAt };
  const remaining = { ...task, title: "Remaining task" };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: { selected: task, remaining }, repeatingTasks: {} });
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
  receive({ tasks: { remaining }, repeatingTasks: {} });
  expect(document.querySelector('[name="title"]')).toBeNull();
  expect(document.body.textContent).not.toContain("Loading task");
  expect(document.querySelector("select")!.value).toBe(completed ? "Completed" : "Schedule");
  expect(document.querySelector("li button > span:first-child")!.textContent).toBe("Remaining task");
  document.querySelector<HTMLButtonElement>("li button")!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Remaining task");
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});

it("keeps a newly created task selected while waiting for its first snapshot", () => {
  vi.mocked(createTask).mockImplementation(() => new Promise(() => {}));
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: {}, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => button.textContent === "＋ Task")!.click();
  const taskId = vi.mocked(createTask).mock.calls[0]![1];
  receive({ tasks: {}, repeatingTasks: {} });
  expect(document.body.textContent).toContain("Loading task");
  receive({ tasks: { [taskId]: {
    title: "New task", details: "", date: decodeTaskDate("2026-10-07"), completedAt: null,
  } }, repeatingTasks: {} });
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("New task");
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});

it("projects a repeating task separately from its generated tasks", () => {
  vi.mocked(subscribeUserData).mockImplementation((_userId, onUserData) => {
    onUserData({ tasks: {}, repeatingTasks: {
      rent: {
        title: "Rent", details: "",
        schedule: {
          nextDate: decodeTaskDate("2026-11-05"), interval: 1, intervalUnit: "Weeks", anchorDate: decodeTaskDate("2026-11-05"),
        },
        scheduleEditedAt: Timestamp.now(),
      },
    } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  const rows = [...document.querySelectorAll("li")];
  expect(rows.length).toBeGreaterThan(2);
  expect(rows.length).toBeLessThanOrEqual(53);
  expect(rows.slice(0, 2).map((row) => row.querySelector("button > span:first-child")!.textContent)).toEqual(["Rent", "Rent"]);
  expect(rows.slice(0, 2).map((row) => row.querySelector("time")!.getAttribute("datetime"))).toEqual([
    "2026-11-05", "2026-11-12",
  ]);
  document.querySelector<HTMLButtonElement>("li button")!.click();
  expect(document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')).not.toBeNull();
  expect([...document.querySelectorAll("button")].map((button) => button.textContent)).not.toContain("Complete");

});

it("keeps a newly created repeating task selected while waiting for its first snapshot", () => {
  vi.mocked(createRepeatingTask).mockImplementation(() => new Promise(() => {}));
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: {}, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => button.textContent === "＋ Repeating Task")!.click();
  const repeatingTaskId = vi.mocked(createRepeatingTask).mock.calls[0]![1];
  receive({ tasks: {}, repeatingTasks: {} });
  expect(document.body.textContent).toContain("Loading repeating task");
  receive({ tasks: {}, repeatingTasks: { [repeatingTaskId]: {
    title: "", details: "",
    schedule: {
      nextDate: decodeTaskDate("2026-11-05"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-11-05"),
    },
    scheduleEditedAt: Timestamp.now(),
  } } });
  expect(document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')!.value).toBe("Days");
  expect(document.querySelector("button")!.textContent).toBe("←");
});

it.each(["Task", "RepeatingTask"])("switches editors and preserves the %s draft during live updates", (kind) => {
  const task = { title: "Task", details: "", date: decodeTaskDate("2026-11-05"), completedAt: null };
  const repeatingTask = {
    title: "Repeating", details: "",
    schedule: {
      nextDate: decodeTaskDate("2026-11-06"), interval: 1, intervalUnit: "Weeks" as const, anchorDate: decodeTaskDate("2026-11-06"),
    },
    scheduleEditedAt: Timestamp.now(),
  };
  let receive: (data: UserData) => void = () => {};
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: { task }, repeatingTasks: { repeating: repeatingTask } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  const otherTitle = kind === "Task" ? "Repeating" : "Task";
  [...document.querySelectorAll<HTMLButtonElement>("li button")].find((button) => button.querySelector("span:first-child")?.textContent === otherTitle)!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe(kind === "Task" ? "Repeating" : "Task");
  [...document.querySelectorAll("button")].find((button) => button.textContent === "←")!.click();

  const title = kind === "Task" ? "Task" : "Repeating";
  [...document.querySelectorAll<HTMLButtonElement>("li button")].find((button) => button.querySelector("span:first-child")?.textContent === title)!.click();
  const input = document.querySelector<HTMLInputElement>('[name="title"]')!;
  expect(input.value).toBe(kind === "Task" ? "Task" : "Repeating");
  expect(document.querySelector('[name="intervalUnit"]') !== null).toBe(kind === "RepeatingTask");
  input.value = "Local draft";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  receive({
    tasks: { task: { ...task, title: "Remote task", completedAt: Timestamp.now() } },
    repeatingTasks: { repeating: { ...repeatingTask, title: "Remote repeating task" } },
  });

  expect(document.querySelector('[name="title"]')).toBe(input);
  expect(input.value).toBe("Local draft");
  expect(input.readOnly).toBe(kind === "Task");
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});

it("sorts tasks and repeating rows together and excludes completed tasks", () => {
  const completedAt = Timestamp.fromDate(new Date("2026-11-03T12:00:00Z"));
  const data: UserData = {
    tasks: {
      later: { title: "Later", details: "", date: decodeTaskDate("2026-11-06"), completedAt: null },
      done: { title: "Done", details: "", date: decodeTaskDate("2026-11-01"), completedAt },
      earlier: { title: "Earlier", details: "", date: decodeTaskDate("2026-11-04"), completedAt: null },
    },
    repeatingTasks: {
      yearly: {
        title: "Yearly", details: "",
        schedule: {
          nextDate: decodeTaskDate("2026-11-05"), interval: 1, intervalUnit: "Years", anchorDate: decodeTaskDate("2026-11-05"),
        },
        scheduleEditedAt: Timestamp.now(),
      },
    },
  };
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData(data);
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  expect([...document.querySelectorAll("li button > span:first-child")].map((title) => title.textContent)).toEqual(["Earlier", "Yearly", "Later"]);
  expect([...document.querySelectorAll("li time")].map((time) => time.getAttribute("datetime"))).toEqual([
    "2026-11-04", "2026-11-05", "2026-11-06",
  ]);
  expect(document.querySelectorAll("li")[1]!.textContent).toContain("↻");

});
