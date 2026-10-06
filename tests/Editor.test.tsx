// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import { decodeTaskDate } from "../src/taskDate";
import Editor from "../src/Editor";
import { completeTask, reopenTask, setTaskDate, setTaskTitle, type Task } from "../src/userData";

vi.mock("../src/userData", () => ({
  completeTask: vi.fn().mockResolvedValue(undefined),
  reopenTask: vi.fn().mockResolvedValue(undefined),
  setTaskDate: vi.fn().mockResolvedValue(undefined),
  setTaskTitle: vi.fn().mockResolvedValue(undefined),
}));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it.each(["Back", "Reopen"])("keeps completed tasks read-only when clicking %s", (action) => {
  const onBack = vi.fn();
  dispose = render(() => (
    <Editor
      taskId="first"
      task={{ title: "Buy bread", date: decodeTaskDate("2026-10-04"), completedAt: Timestamp.now() }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={onBack}
    />
  ), document.body);

  const input = document.querySelector("input")!;
  expect(input.readOnly).toBe(true);
  input.value = "Changed title";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const date = document.querySelector<HTMLInputElement>('input[name="date"]')!;
  expect(date.readOnly).toBe(true);
  date.value = "2026-10-05";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  const buttons = [...document.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).toEqual(["Back", "Reopen"]);
  buttons.find((button) => button.textContent === action)!.click();

  expect(setTaskTitle).not.toHaveBeenCalled();
  expect(setTaskDate).not.toHaveBeenCalled();
  expect(completeTask).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalledOnce();
  if (action === "Reopen") {
    expect(reopenTask).toHaveBeenCalledExactlyOnceWith("alice", "first");
  } else {
    expect(reopenTask).not.toHaveBeenCalled();
  }
});

it.each(["Back", "Complete"])("saves edits to incomplete tasks when clicking %s", (action) => {
  dispose = render(() => (
    <Editor
      taskId="first"
      task={{ title: "Buy bread", completedAt: null, date: decodeTaskDate("2026-10-04") }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={vi.fn()}
    />
  ), document.body);

  const input = document.querySelector("input")!;
  expect(input.readOnly).toBe(false);
  const date = document.querySelector<HTMLInputElement>('input[name="date"]')!;
  date.value = "2026-10-05";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  input.value = "Buy eggs";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  [...document.querySelectorAll("button")].find((button) => button.textContent === action)!.click();

  expect(setTaskDate).toHaveBeenCalledExactlyOnceWith("alice", "first", "2026-10-05");
  expect(setTaskTitle).toHaveBeenCalledExactlyOnceWith("alice", "first", "Buy eggs");
  if (action === "Complete") {
    expect(completeTask).toHaveBeenCalledExactlyOnceWith("alice", "first");
  } else {
    expect(completeTask).not.toHaveBeenCalled();
  }
});

it("does not save a draft if the task is completed on another device", () => {
  const [task, setTask] = createSignal<Task>({ title: "Buy bread", completedAt: null, date: decodeTaskDate("2026-10-04") });
  dispose = render(() => (
    <Editor
      taskId="first"
      task={task()}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={vi.fn()}
    />
  ), document.body);

  const input = document.querySelector("input")!;
  const date = document.querySelector<HTMLInputElement>('input[name="date"]')!;
  date.value = "2026-10-05";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  input.value = "Buy eggs";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  setTask({ title: "Buy bread", date: decodeTaskDate("2026-10-04"), completedAt: Timestamp.now() });
  expect(input.readOnly).toBe(true);
  expect(date.readOnly).toBe(true);
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click();

  expect(setTaskTitle).not.toHaveBeenCalled();
  expect(setTaskDate).not.toHaveBeenCalled();
});

it("prevents saving a cleared task date", () => {
  const showNotice = vi.fn();
  const onBack = vi.fn();
  dispose = render(() => (
    <Editor
      taskId="first"
      task={{ title: "Buy bread", completedAt: null, date: decodeTaskDate("2026-10-04") }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={showNotice}
      onBack={onBack}
    />
  ), document.body);

  const date = document.querySelector<HTMLInputElement>('input[name="date"]')!;
  date.value = "";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click();

  expect(setTaskDate).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
  expect(showNotice).toHaveBeenCalledExactlyOnceWith("A date is required.");
});

it.each(["Back", "Complete"])("rejects dates beyond one year when clicking %s", (action) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 4, 12));
  const showNotice = vi.fn();
  const onBack = vi.fn();
  dispose = render(() => (
    <Editor
      taskId="first"
      task={{ title: "Buy bread", completedAt: null, date: decodeTaskDate("2026-10-04") }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={showNotice}
      onBack={onBack}
    />
  ), document.body);

  const date = document.querySelector<HTMLInputElement>('input[name="date"]')!;
  date.value = "2027-10-05";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  [...document.querySelectorAll("button")].find((button) => button.textContent === action)!.click();

  expect(setTaskDate).not.toHaveBeenCalled();
  expect(setTaskTitle).not.toHaveBeenCalled();
  expect(completeTask).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
  expect(showNotice).toHaveBeenCalledExactlyOnceWith("The date cannot be more than 1 year in the future.");

  date.value = "2027-10-04";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  [...document.querySelectorAll("button")].find((button) => button.textContent === action)!.click();
  expect(setTaskDate).toHaveBeenCalledExactlyOnceWith("alice", "first", "2027-10-04");
  expect(onBack).toHaveBeenCalledOnce();
});

it.each(["title", "date"] as const)("saves only the edited %s when the other field changes remotely", (field) => {
  const [task, setTask] = createSignal<Task>({ title: "Buy bread", completedAt: null, date: decodeTaskDate("2026-10-04") });
  dispose = render(() => (
    <Editor
      taskId="first"
      task={task()}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={vi.fn()}
    />
  ), document.body);

  const input = document.querySelector<HTMLInputElement>(`input[name="${field}"]`)!;
  input.value = field === "title" ? "Buy eggs" : "2026-10-05";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  setTask(field === "title"
    ? { title: "Buy bread", completedAt: null, date: decodeTaskDate("2026-10-06") }
    : { title: "Buy milk", completedAt: null, date: decodeTaskDate("2026-10-04") });
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click();

  if (field === "title") {
    expect(setTaskTitle).toHaveBeenCalledExactlyOnceWith("alice", "first", "Buy eggs");
    expect(setTaskDate).not.toHaveBeenCalled();
  } else {
    expect(setTaskDate).toHaveBeenCalledExactlyOnceWith("alice", "first", "2026-10-05");
    expect(setTaskTitle).not.toHaveBeenCalled();
  }
});
