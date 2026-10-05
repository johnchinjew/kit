// @vitest-environment jsdom
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import Editor from "../src/Editor";
import { completeTask, reopenTask, setTaskTitle, type Task } from "../src/userData";

vi.mock("../src/userData", () => ({
  completeTask: vi.fn().mockResolvedValue(undefined),
  reopenTask: vi.fn().mockResolvedValue(undefined),
  setTaskTitle: vi.fn().mockResolvedValue(undefined),
}));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it.each(["Back", "Reopen"])("keeps completed tasks read-only when clicking %s", (action) => {
  const onBack = vi.fn();
  dispose = render(() => (
    <Editor
      initialDraft={{ id: "first", task: { title: "Buy bread", completed: true } }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={onBack}
    />
  ), document.body);

  const input = document.querySelector("input")!;
  expect(input.readOnly).toBe(true);
  input.value = "Changed title";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const buttons = [...document.querySelectorAll("button")];
  expect(buttons.map((button) => button.textContent)).toEqual(["Back", "Reopen"]);
  buttons.find((button) => button.textContent === action)!.click();

  expect(setTaskTitle).not.toHaveBeenCalled();
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
      initialDraft={{ id: "first", task: { title: "Buy bread", completed: false } }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={vi.fn()}
    />
  ), document.body);

  const input = document.querySelector("input")!;
  expect(input.readOnly).toBe(false);
  input.value = "Buy eggs";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  [...document.querySelectorAll("button")].find((button) => button.textContent === action)!.click();

  expect(setTaskTitle).toHaveBeenCalledExactlyOnceWith("alice", "first", "Buy eggs");
  if (action === "Complete") {
    expect(completeTask).toHaveBeenCalledExactlyOnceWith("alice", "first");
  } else {
    expect(completeTask).not.toHaveBeenCalled();
  }
});

it("does not save a draft if the task is completed on another device", () => {
  const [task, setTask] = createSignal<Task>({ title: "Buy bread", completed: false });
  dispose = render(() => (
    <Editor
      initialDraft={{ id: "first", task: task() }}
      session={{ status: "signed-in", user: { id: "alice", photoUrl: null } }}
      showNotice={vi.fn()}
      onBack={vi.fn()}
    />
  ), document.body);

  const input = document.querySelector("input")!;
  input.value = "Buy eggs";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  setTask({ title: "Buy bread", completed: true });
  expect(input.readOnly).toBe(true);
  [...document.querySelectorAll("button")].find((button) => button.textContent === "Back")!.click();

  expect(setTaskTitle).not.toHaveBeenCalled();
});
