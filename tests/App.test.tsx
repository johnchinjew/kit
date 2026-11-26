// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { createSession, type Session } from "../src/session";
import { decodeTaskDate } from "../src/taskDate";
import {
  createRepeatingTask,
  createTasksFromRepeatingTasks,
  createTask,
  deleteTasksWithElapsedRetention,
  subscribeUserData,
  type UserData
} from "../src/userData";

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
  deleteTasksWithElapsedRetention: vi.fn(),
}));

let dispose: (() => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IntersectionObserver", vi.fn(class {
    observe = vi.fn();
    disconnect = vi.fn();
  }));
  vi.setSystemTime(new Date(2026, 10, 4, 12));
  vi.mocked(deleteTasksWithElapsedRetention).mockResolvedValue(undefined);
  vi.mocked(createTask).mockResolvedValue(undefined);
  vi.mocked(createRepeatingTask).mockResolvedValue(undefined);
  vi.mocked(createTasksFromRepeatingTasks).mockResolvedValue(undefined);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shows a synchronized list selector after the header scrolls away and hides it at the top", () => {
  let onIntersection!: IntersectionObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", vi.fn(class {
    constructor(callback: IntersectionObserverCallback) { onIntersection = callback; }
    observe = observe;
    disconnect = disconnect;
  }));
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);

  const header = document.querySelector("header")!;
  const original = header.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  const findStickySelector = () => [...document.querySelectorAll<HTMLSelectElement>('select[aria-label="List selector"]')]
    .find((select) => !header.contains(select));
  const observer = vi.mocked(IntersectionObserver).mock.instances[0]!;
  expect(observe).toHaveBeenCalledWith(header);
  expect(document.querySelectorAll("select")).toHaveLength(1);

  onIntersection([{ isIntersecting: false, boundingClientRect: { bottom: -1 } } as IntersectionObserverEntry], observer);

  expect(document.querySelectorAll("select")).toHaveLength(2);
  const sticky = findStickySelector()!;
  expect(sticky.value).toBe("Schedule");
  expect(sticky.parentElement!.querySelectorAll("button")).toHaveLength(0);
  sticky.value = "Completed";
  sticky.dispatchEvent(new Event("change", { bubbles: true }));
  expect(original.value).toBe("Completed");
  expect(document.querySelector("main")!.textContent).toContain("Tasks are automatically deleted one year after completion.");

  onIntersection([{ isIntersecting: true, boundingClientRect: { bottom: 64 } } as IntersectionObserverEntry], observer);
  expect(document.querySelectorAll("select")).toHaveLength(1);
  expect(original.value).toBe("Completed");

  onIntersection([{ isIntersecting: false, boundingClientRect: { bottom: -1 } } as IntersectionObserverEntry], observer);
  expect(document.querySelectorAll("select")).toHaveLength(2);
  expect(findStickySelector()?.value).toBe("Completed");
  dispose!();
  dispose = undefined;
  expect(disconnect).toHaveBeenCalledOnce();
});

it("keeps list switching usable without IntersectionObserver", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);

  expect(document.querySelectorAll("select")).toHaveLength(1);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Completed";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  expect(document.querySelector("main")!.textContent).toContain("Tasks are automatically deleted one year after completion.");
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
  const data: UserData = {
    tasks: {}, repeatingTasks: {
      rent: {
        title: "Rent", details: "",
        schedule: {
          nextDate: decodeTaskDate("2026-11-04"), interval: 1, intervalUnit: "Months", anchorDate: decodeTaskDate("2026-11-04"),
        },
        scheduleEditedAt: Timestamp.now(),
      }
    }
  };
  let receive: (data: UserData) => void = () => { };
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
  const data: UserData = {
    tasks: {}, repeatingTasks: {
      rent: {
        title: "Rent", details: "",
        schedule: {
          nextDate: decodeTaskDate("2026-11-02"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-11-02"),
        },
        scheduleEditedAt: Timestamp.now(),
      }
    }
  };
  let receive: (data: UserData) => void = () => { };
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
    onUserData({
      tasks: {
        older: { title: "Older", details: "", date: decodeTaskDate("2026-10-08"), completedAt: older },
        newer: { title: "Newer", details: "", date: decodeTaskDate("2026-10-07"), completedAt: newer },
        newest: { title: "Newest", details: "Finished the report", date: decodeTaskDate("2026-10-09"), completedAt: newest },
        later: { title: "Later", details: "", completedAt: null, date: decodeTaskDate("2026-10-06") },
        earlier: { title: "Earlier", details: "", completedAt: null, date: decodeTaskDate("2026-10-04") },
      }, repeatingTasks: {}
    });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  expect([...document.querySelectorAll("li button > span:first-child")].map((title) => title.textContent)).toEqual(["Earlier", "Later"]);
  expect([...document.querySelectorAll("li time")].map((time) => time.getAttribute("datetime"))).toEqual(["2026-10-04", "2026-10-06"]);

  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
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
    onData({
      tasks: {
        done: { title: "Done", details: "", date: decodeTaskDate("2026-10-01"), completedAt },
      }, repeatingTasks: {}
    });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Completed";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  expect(document.querySelector("li time")!.textContent).toBe(`Completed ${label}`);
  expect(document.querySelector("li time")!.getAttribute("datetime")).toBe(completedAt.toDate().toISOString());
});

it.each([false, true])("returns to the list when the open task with completed=%s is deleted remotely", (completed) => {
  const completedAt = completed ? Timestamp.now() : null;
  const task = { title: "Deleted task", details: "", date: decodeTaskDate("2026-10-07"), completedAt };
  const remaining = { ...task, title: "Remaining task" };
  let receive: (data: UserData) => void = () => { };
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: { selected: task, remaining }, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  if (completed) {
    const mode = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
    mode.value = "Completed";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.querySelector<HTMLButtonElement>("li button")!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Deleted task");
  receive({ tasks: { remaining }, repeatingTasks: {} });
  expect(document.querySelector('[name="title"]')).toBeNull();
  expect(document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!.value).toBe(completed ? "Completed" : "Schedule");
  expect(document.querySelector("li button > span:first-child")!.textContent).toBe("Remaining task");
  document.querySelector<HTMLButtonElement>("li button")!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Remaining task");
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});

it("discards an open task draft when the signed-in user changes", () => {
  const [session, setSession] = createSignal<Session>({ status: "SignedIn", user: { userId: "alice", photoUrl: null } });
  vi.mocked(createSession).mockReturnValueOnce({ session, signIn: vi.fn(), signOut: vi.fn() });
  const unsubscribeAlice = vi.fn();
  vi.mocked(subscribeUserData).mockReturnValueOnce(unsubscribeAlice).mockReturnValueOnce(vi.fn());
  dispose = render(() => <App />, document.body);
  const add = () => [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();

  add();
  const title = document.querySelector<HTMLInputElement>('[name="title"]')!;
  title.value = "Alice's draft";
  title.dispatchEvent(new Event("input", { bubbles: true }));

  setSession({ status: "SignedIn", user: { userId: "bob", photoUrl: null } });

  expect(document.querySelector('[name="title"]')).toBeNull();
  expect(unsubscribeAlice).toHaveBeenCalledOnce();
  expect(subscribeUserData).toHaveBeenLastCalledWith("bob", expect.any(Function), expect.any(Function));
  expect(createTask).not.toHaveBeenCalled();
  expect(createRepeatingTask).not.toHaveBeenCalled();

  add();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("");
  document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();
  expect(createTask).toHaveBeenCalledExactlyOnceWith("bob", expect.any(String), "", "", "2026-11-04");
});

it("discards the draft and returns to the list when Cancel is pressed", () => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  const add = () => [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();

  add();
  const title = document.querySelector<HTMLInputElement>('[name="title"]')!;
  expect(document.activeElement).toBe(title);
  title.value = "Discard this task";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Cancel")!.click();

  expect(document.querySelector('[name="title"]')).toBeNull();
  expect(createTask).not.toHaveBeenCalled();
  expect(createRepeatingTask).not.toHaveBeenCalled();
  add();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("");
});

it.each(["Save", "Cmd+Enter", "Ctrl+Enter"])("creates an untitled task for today when saving a fresh draft with %s", (action) => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();
  expect(createTask).not.toHaveBeenCalled();

  if (action === "Cmd+Enter" || action === "Ctrl+Enter") {
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: action === "Cmd+Enter", ctrlKey: action === "Ctrl+Enter", bubbles: true }));
  } else {
    document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();
  }
  expect(createTask).toHaveBeenCalledExactlyOnceWith("alice", expect.any(String), "", "", "2026-11-04");
  expect(createRepeatingTask).not.toHaveBeenCalled();
  expect(document.querySelector('[name="title"]')).toBeNull();
});

it("accepts a date one year from today and rejects the following day", () => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();

  const date = document.querySelector<HTMLInputElement>('[name="date"]')!;
  const save = document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!;
  date.value = "2027-11-05";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  save.click();

  expect(createTask).not.toHaveBeenCalled();
  expect(document.querySelector('[name="date"]')).toBe(date);

  date.value = "2027-11-04";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  save.click();

  expect(createTask).toHaveBeenCalledExactlyOnceWith("alice", expect.any(String), "", "", "2027-11-04");
  expect(document.querySelector('[name="date"]')).toBeNull();
});

it("clamps a multi-day repeat interval to one when switched to Years", () => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();
  document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();

  const interval = document.querySelector<HTMLInputElement>('[name="interval"]')!;
  interval.value = "3";
  interval.dispatchEvent(new Event("input", { bubbles: true }));
  const unit = document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')!;
  unit.value = "Years";
  unit.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();

  expect(createRepeatingTask).toHaveBeenCalledExactlyOnceWith("alice", expect.any(String), "", "", {
    nextDate: "2026-11-04", anchorDate: "2026-11-04", interval: 1, intervalUnit: "Years",
  });
});

it.each([false, true])("creates the finished draft only on Save, with repeat=%s", (repeat) => {
  let receive!: (data: UserData) => void;
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const add = () => [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();
  const save = () => document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();

  add();
  const title = document.querySelector<HTMLInputElement>('[name="title"]')!;
  title.value = " Laundry ";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  const details = document.querySelector<HTMLTextAreaElement>('[name="details"]')!;
  details.value = " Wash the sheets ";
  details.dispatchEvent(new Event("input", { bubbles: true }));
  const date = "2026-11-12";
  const dateInput = document.querySelector<HTMLInputElement>('[name="date"]')!;
  dateInput.value = date;
  dateInput.dispatchEvent(new Event("input", { bubbles: true }));
  const toggle = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  toggle.click();
  const interval = document.querySelector<HTMLInputElement>('[name="interval"]')!;
  interval.value = "0";
  interval.dispatchEvent(new Event("input", { bubbles: true }));
  save();
  expect(document.querySelector('[name="title"]')).toBe(title);
  if (repeat) {
    interval.value = "2";
    interval.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    toggle.click();
  }
  receive({ tasks: {}, repeatingTasks: {} });
  expect(title.value).toBe(" Laundry ");
  expect(createTask).not.toHaveBeenCalled();
  expect(createRepeatingTask).not.toHaveBeenCalled();

  save();
  if (repeat) {
    expect(createRepeatingTask).toHaveBeenCalledExactlyOnceWith("alice", expect.any(String), "Laundry", "Wash the sheets", {
      nextDate: date, anchorDate: date, interval: 2, intervalUnit: "Days",
    });
    expect(createTask).not.toHaveBeenCalled();
  } else {
    expect(createTask).toHaveBeenCalledExactlyOnceWith("alice", expect.any(String), "Laundry", "Wash the sheets", date);
    expect(createRepeatingTask).not.toHaveBeenCalled();
  }
  expect(document.querySelector('[name="title"]')).toBeNull();
});

it("projects a repeating task separately from its generated tasks", () => {
  vi.mocked(subscribeUserData).mockImplementation((_userId, onUserData) => {
    onUserData({
      tasks: {}, repeatingTasks: {
        rent: {
          title: "Rent", details: "",
          schedule: {
            nextDate: decodeTaskDate("2026-11-05"), interval: 1, intervalUnit: "Weeks", anchorDate: decodeTaskDate("2026-11-05"),
          },
          scheduleEditedAt: Timestamp.now(),
        },
      }
    });
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

it.each([false, true])("returns to the originating task editor after viewing its schedule, completed=%s", (completed) => {
  const date = decodeTaskDate("2026-11-04");
  const nextDate = decodeTaskDate("2026-11-05");
  const task = { title: "Rent occurrence", details: "", date, repeatingTaskId: "rent", completedAt: completed ? Timestamp.now() : null };
  const repeatingTask = {
    title: "Rent schedule", details: "Pay by bank transfer",
    schedule: { nextDate, interval: 1, intervalUnit: "Months" as const, anchorDate: date },
    scheduleEditedAt: Timestamp.now(),
  };
  let receive!: (data: UserData) => void;
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: { task }, repeatingTasks: { rent: repeatingTask } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  if (completed) {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
    select.value = "Completed";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.querySelector<HTMLButtonElement>("li button")!.click();
  const title = document.querySelector<HTMLInputElement>('[name="title"]')!;
  if (!completed) {
    title.value = "Local draft";
    title.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const heading = document.querySelector("h2")!;
  expect(heading.textContent).toBe("Repeating task");
  const repeatingTaskButton = heading.parentElement!.querySelector("button")!;
  expect(repeatingTaskButton.textContent).toContain(repeatingTask.title);
  expect(repeatingTaskButton.textContent).toContain(repeatingTask.details);
  expect(repeatingTaskButton.querySelector('[role="img"][aria-label="Repeating task"]')?.textContent).toBe("↻");
  expect(repeatingTaskButton.querySelector("time")?.getAttribute("datetime")).toBe(nextDate);
  expect(repeatingTaskButton.querySelector("time")?.textContent).toBe("Tomorrow");
  repeatingTaskButton.click();

  expect(document.querySelectorAll("main")).toHaveLength(1);
  const editor = document.querySelector("main")!;
  expect(editor.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe("Rent schedule");
  expect(editor.querySelector<HTMLInputElement>('[name="nextDate"]')?.value).toBe(nextDate);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, cancelable: true }));
  expect(document.querySelector('[name="nextDate"]')).toBeNull();
  const draftTitle = completed ? "Rent occurrence" : "Local draft";
  expect(document.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe(draftTitle);

  document.querySelector("h2")!.parentElement!.querySelector("button")!.click();
  expect(document.querySelector('[name="nextDate"]')).not.toBeNull();
  receive({ tasks: { task }, repeatingTasks: {} });
  expect(document.querySelector('[name="nextDate"]')).toBeNull();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe(draftTitle);
  expect(document.querySelector("h2")).toBeNull();
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
  let receive: (data: UserData) => void = () => { };
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: { task }, repeatingTasks: { repeating: repeatingTask } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);

  const otherTitle = kind === "Task" ? "Repeating" : "Task";
  [...document.querySelectorAll<HTMLButtonElement>("li button")].find((button) => button.querySelector("span:first-child")?.textContent === otherTitle)!.click();
  expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe(kind === "Task" ? "Repeating" : "Task");
  document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();

  const title = kind === "Task" ? "Task" : "Repeating";
  [...document.querySelectorAll<HTMLButtonElement>("li button")].find((button) => button.querySelector("span:first-child")?.textContent === title)!.click();
  const input = document.querySelector<HTMLInputElement>('[name="title"]')!;
  expect(input.value).toBe(kind === "Task" ? "Task" : "Repeating");
  expect(document.querySelector('[name="intervalUnit"]') !== null).toBe(kind === "RepeatingTask");
  expect([...document.querySelectorAll("h2")].map((heading) => heading.textContent)).not.toContain("Repeating task");
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

it.each(["Schedule", "Open"])("sorts normal tasks before repeating occurrences on the same day in %s", (mode) => {
  const completedAt = Timestamp.fromDate(new Date("2026-11-03T12:00:00Z"));
  const data: UserData = {
    tasks: {
      later: { title: "Later", details: "", date: decodeTaskDate("2026-11-06"), completedAt: null },
      done: { title: "Done", details: "", date: decodeTaskDate("2026-11-01"), completedAt },
      earlier: { title: "Earlier", details: "", date: decodeTaskDate("2026-11-04"), completedAt: null },
      sameDay: { title: "Zebra", details: "", date: decodeTaskDate("2026-11-05"), completedAt: null },
    },
    repeatingTasks: {
      weekly: {
        title: "Weekly", details: "",
        schedule: {
          nextDate: decodeTaskDate("2026-11-05"), interval: 1, intervalUnit: "Weeks", anchorDate: decodeTaskDate("2026-11-05"),
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

  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = mode;
  select.dispatchEvent(new Event("change", { bubbles: true }));

  const rows = [...document.querySelectorAll("li")];
  expect(rows.slice(0, 4).map((row) => row.querySelector("button > span:first-child")!.textContent)).toEqual(["Earlier", "Zebra", "Weekly", "Later"]);
  expect(rows.slice(0, 4).map((row) => row.querySelector("time")!.getAttribute("datetime"))).toEqual([
    "2026-11-04", "2026-11-05", "2026-11-05", "2026-11-06",
  ]);
  expect(rows[2]!.querySelector('[role="img"][aria-label="Repeating task"]')).not.toBeNull();

  if (mode === "Schedule") {
    expect(rows[4]?.querySelector("button > span:first-child")?.textContent).toBe("Weekly");
    expect(rows[4]?.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-12");
  } else {
    expect(rows).toHaveLength(4);
  }
});


it("applies task retention to the first snapshot once per subscription", async () => {
  const data: UserData = { tasks: {}, repeatingTasks: {} };
  const [session, setSession] = createSignal<Session>({ status: "SignedIn", user: { userId: "alice", photoUrl: null } });
  vi.mocked(createSession).mockReturnValueOnce({ session, signIn: vi.fn(), signOut: vi.fn() });
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData(data);
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  expect(deleteTasksWithElapsedRetention).toHaveBeenCalledExactlyOnceWith("alice", data);

  const onData = vi.mocked(subscribeUserData).mock.lastCall![1]!;
  onData(data);
  onData(data);
  await Promise.resolve();
  expect(deleteTasksWithElapsedRetention).toHaveBeenCalledExactlyOnceWith("alice", data);

  setSession({ status: "SignedOut" });
  setSession({ status: "SignedIn", user: { userId: "bob", photoUrl: null } });
  vi.mocked(subscribeUserData).mock.lastCall![1]!(data);
  expect(deleteTasksWithElapsedRetention).toHaveBeenLastCalledWith("bob", data);
  expect(deleteTasksWithElapsedRetention).toHaveBeenCalledTimes(2);
});

it("reports retention cleanup failures without retrying on every snapshot", async () => {
  vi.mocked(deleteTasksWithElapsedRetention).mockRejectedValueOnce(new Error("Offline"));
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  const onData = vi.mocked(subscribeUserData).mock.lastCall![1]!;
  const data: UserData = { tasks: {}, repeatingTasks: {} };
  onData(data);
  await vi.waitFor(() => expect(document.body.textContent).toContain("Could not complete clean up."));
  onData(data);
  expect(deleteTasksWithElapsedRetention).toHaveBeenCalledTimes(1);
});

it("offers Search first while defaulting to Schedule, and clears the search phrase", () => {
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData({ tasks: {
      task: { title: "Laundry", details: "Sheets", date: decodeTaskDate("2026-11-04"), completedAt: null },
    }, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  expect(select.value).toBe("Schedule");
  expect(select.options[0]!.value).toBe("Search");
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const search = document.querySelector('[role="search"]')!;
  const results = document.querySelector('ul[role="list"]')!;
  const input = search.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  expect(document.activeElement).toBe(input);
  expect(search.querySelector('[aria-label="Clear search"]')).toBeNull();
  input.value = "missing";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(results.querySelectorAll("li")).toHaveLength(0);
  search.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!.click();
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
  expect(results.querySelectorAll("li")).toHaveLength(1);
  expect(search.querySelector('[aria-label="Clear search"]')).toBeNull();
});


it("clears the search phrase when switching list modes", () => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  input.value = "Laundry";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  select.value = "Open";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));

  expect(document.querySelector<HTMLInputElement>('[aria-label="Search"]')!.value).toBe("");
  expect(document.querySelector('[aria-label="Clear search"]')).toBeNull();
});

it("keeps the search input focused while typing and preserves the phrase across an editor visit", () => {
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData({ tasks: {
      task: { title: "Laundry", details: "Sheets", date: decodeTaskDate("2026-11-04"), completedAt: null },
    }, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  input.focus();
  for (const phrase of ["L", "La", "Lau"]) {
    input.value = phrase;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector('[aria-label="Search"]')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(select.value).toBe("Search");
  }
  document.querySelector<HTMLButtonElement>("li button")!.click();
  document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();
  expect(document.querySelector<HTMLInputElement>('[aria-label="Search"]')!.value).toBe("Lau");
  expect(document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!.value).toBe("Search");
});

it("updates search results from live data without resetting the phrase or focus", () => {
  const date = decodeTaskDate("2026-11-04");
  let receive!: (data: UserData) => void;
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    receive = onData;
    receive({ tasks: {
      original: { title: "Wash sheets", details: "", date, completedAt: null },
    }, repeatingTasks: {} });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  input.focus();
  input.value = "wash";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelector("li")!.textContent).toContain("Wash sheets");

  receive({ tasks: {
    original: { title: "Fold sheets", details: "", date, completedAt: null },
    added: { title: "Wash towels", details: "", date, completedAt: null },
    unrelated: { title: "Buy groceries", details: "", date, completedAt: null },
  }, repeatingTasks: {} });

  expect([...document.querySelectorAll("li button > span:first-child")].map(row => row.textContent)).toEqual(["Wash towels"]);
  expect(document.querySelector('[aria-label="Search"]')).toBe(input);
  expect(input.value).toBe("wash");
  expect(document.activeElement).toBe(input);
  expect(subscribeUserData).toHaveBeenCalledTimes(1);
});

it("mixes search results by status and task date and opens each kind in its editor", () => {
  const date = decodeTaskDate("2026-11-04");
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData({ tasks: {
      open: { title: "Wash towels", details: "Open details", date, completedAt: null },
      later: { title: "Wash aprons", details: "Later open details", date: decodeTaskDate("2026-11-05"), completedAt: null },
      doneLater: { title: "Wash blankets", details: "Later details", date: decodeTaskDate("2026-11-02"), completedAt: Timestamp.fromDate(new Date("2026-11-03T12:00:00Z")) },
      doneEarlier: { title: "Wash sheets", details: "Earlier details", date: decodeTaskDate("2026-11-01"), completedAt: Timestamp.fromDate(new Date("2026-11-02T12:00:00Z")) },
    }, repeatingTasks: {
      repeat: { title: "Wash clothes", details: "Repeating details", schedule: {
        nextDate: date, anchorDate: date, interval: 1, intervalUnit: "Days",
      }, scheduleEditedAt: Timestamp.now() },
    } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  input.value = "wash";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  expect([...document.querySelectorAll("li button > span:first-child")].map(row => row.textContent)).toEqual([
    "Wash towels", "Wash clothes", "Wash aprons", "Wash sheets", "Wash blankets",
  ]);
  expect(document.querySelectorAll("li .line-through")).toHaveLength(2);

  for (const expected of [
    { title: "Wash towels", details: "Open details", repeating: false, completed: false },
    { title: "Wash clothes", details: "Repeating details", repeating: true, completed: false },
    { title: "Wash aprons", details: "Later open details", repeating: false, completed: false },
    { title: "Wash sheets", details: "Earlier details", repeating: false, completed: true },
    { title: "Wash blankets", details: "Later details", repeating: false, completed: true },
  ]) {
    [...document.querySelectorAll<HTMLButtonElement>("li button")].find(button => button.querySelector("span")!.textContent === expected.title)!.click();
    const title = document.querySelector<HTMLInputElement>('[name="title"]')!;
    expect(title.value).toBe(expected.title);
    expect(title.readOnly).toBe(expected.completed);
    expect(document.querySelector<HTMLTextAreaElement>('[name="details"]')!.value).toBe(expected.details);
    expect(document.querySelector('[name="intervalUnit"]') !== null).toBe(expected.repeating);
    const exitLabel = expected.completed ? "Back" : "Save";
    document.querySelector<HTMLButtonElement>(`[aria-label="${exitLabel}"]`)!.click();
    expect(document.querySelector<HTMLInputElement>('[aria-label="Search"]')!.value).toBe("wash");
  }
});


it("orders search matches by status, date, then title without relevance ranking", () => {
  const date = decodeTaskDate("2026-11-04");
  const data: UserData = { tasks: {
    done: { title: "cat cat cat", details: "", date, completedAt: Timestamp.now() },
    partial: { title: "caterpillar", details: "", date, completedAt: null },
    details: { title: "Details", details: "cat", date, completedAt: null },
    later: { title: "Cat zebra", details: "", date: decodeTaskDate("2026-11-05"), completedAt: null },
    zebra: { title: "Cat zebra", details: "", date, completedAt: null },
    alpha: { title: "Cat alpha", details: "", date, completedAt: null },
    more: { title: "Cat cat", details: "", date, completedAt: null },
  }, repeatingTasks: {} };
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData(data);
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  input.value = "cat";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  expect([...document.querySelectorAll("li button > span:first-child")].map(row => row.textContent)).toEqual([
    "Cat alpha", "Cat cat", "Cat zebra", "caterpillar", "Details", "Cat zebra", "cat cat cat",
  ]);
});


it("finds detail-only matches in open, completed, and repeating tasks", () => {
  const date = decodeTaskDate("2026-11-04");
  vi.mocked(subscribeUserData).mockImplementation((_userId, onData) => {
    onData({ tasks: {
      open: { title: "Groceries", details: "Buy café beans", date, completedAt: null },
      completed: { title: "Shopping", details: "Bought café beans", date, completedAt: Timestamp.now() },
      unrelated: { title: "Laundry", details: "Wash sheets", date, completedAt: null },
    }, repeatingTasks: {
      repeat: { title: "Subscription", details: "Order café beans", schedule: {
        nextDate: date, anchorDate: date, interval: 1, intervalUnit: "Months",
      }, scheduleEditedAt: Timestamp.now() },
    } });
    return vi.fn();
  });
  dispose = render(() => <App />, document.body);
  const select = document.querySelector<HTMLSelectElement>('[aria-label="List selector"]')!;
  select.value = "Search";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
  input.value = "  CAFE   beans ";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  expect([...document.querySelectorAll("li button > span:first-child")].map(row => row.textContent)).toEqual([
    "Groceries", "Subscription", "Shopping",
  ]);
});

it("names the sign out button and uses the placeholder when there is no profile photo", () => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);

  const photo = document.querySelector('button[aria-label="Sign out"] img');
  expect(photo?.getAttribute("src")).toBe("/assets/profile-placeholder.svg");
  expect(photo?.getAttribute("alt")).toBe("");
});

it("shows a missing-date alert and prevents saving", () => {
  vi.mocked(subscribeUserData).mockReturnValue(vi.fn());
  dispose = render(() => <App />, document.body);
  [...document.querySelectorAll("button")].find((button) => /\bAdd task$/.test(button.textContent ?? ""))!.click();
  const date = document.querySelector<HTMLInputElement>('[name="date"]')!;
  date.value = "";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLButtonElement>('[aria-label="Save"]')!.click();

  expect(document.querySelector('[role="alert"]')?.textContent).toBe("A date is required.");
  expect(createTask).not.toHaveBeenCalled();
});
