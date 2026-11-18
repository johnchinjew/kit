// @vitest-environment jsdom
import { Timestamp } from "firebase/firestore";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, expect, it, vi } from "vitest";
import RepeatingTaskEditor from "../src/RepeatingTaskEditor";
import { nextOccurrenceDate, type RepeatingTask } from "../src/repeatingTask";
import { decodeTaskDate } from "../src/taskDate";
import { deleteRepeatingTask, setRepeatingTaskSchedule, setRepeatingTaskDetails, setRepeatingTaskTitle } from "../src/userData";

vi.mock("../src/userData", () => ({
  deleteRepeatingTask: vi.fn().mockResolvedValue(undefined),
  setRepeatingTaskSchedule: vi.fn().mockResolvedValue(undefined),
  setRepeatingTaskDetails: vi.fn().mockResolvedValue(undefined),
  setRepeatingTaskTitle: vi.fn().mockResolvedValue(undefined),
}));

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it("edits a repeating task without offering task completion or conversion", () => {
  const onBack = vi.fn();
  dispose = render(() => <RepeatingTaskEditor
    repeatingTaskId="rent"
    repeatingTask={{
      title: "Rent", details: "Pay landlord",
      schedule: {
        nextDate: decodeTaskDate("2026-01-31"), interval: 1, intervalUnit: "Months", anchorDate: decodeTaskDate("2026-01-31"),
      },
      scheduleEditedAt: Timestamp.now(),
    }}
    session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
    showNotice={vi.fn()}
    onBack={onBack}
  />, document.body);

  expect([...document.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Back", "Delete"]);
  const date = document.querySelector<HTMLInputElement>('[name="nextDate"]')!;
  date.value = "2026-02-28";
  date.dispatchEvent(new Event("input", { bubbles: true }));
  const intervalUnit = document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')!;
  intervalUnit.value = "Weeks";
  intervalUnit.dispatchEvent(new Event("change", { bubbles: true }));
  const interval = document.querySelector<HTMLInputElement>('[name="interval"]')!;
  interval.value = "2";
  interval.dispatchEvent(new InputEvent("input", { bubbles: true }));
  expect(date.value).toBe("2026-02-28");
  document.querySelector<HTMLButtonElement>("button")!.click();

  expect(setRepeatingTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "rent", {
    nextDate: "2026-02-28", interval: 2, intervalUnit: "Weeks", anchorDate: "2026-02-28",
  });
  expect(setRepeatingTaskTitle).not.toHaveBeenCalled();
  expect(setRepeatingTaskDetails).not.toHaveBeenCalled();
  expect(deleteRepeatingTask).not.toHaveBeenCalled();
  expect(onBack).toHaveBeenCalledOnce();
});

it("preserves the monthly anchor when only the interval changes", () => {
  dispose = render(() => <RepeatingTaskEditor
    repeatingTaskId="rent"
    repeatingTask={{
      title: "Rent", details: "",
      schedule: {
        nextDate: decodeTaskDate("2026-02-28"), interval: 1, intervalUnit: "Months", anchorDate: decodeTaskDate("2026-01-31"),
      },
      scheduleEditedAt: Timestamp.now(),
    }}
    session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
    showNotice={vi.fn()}
    onBack={vi.fn()}
  />, document.body);

  const interval = document.querySelector<HTMLInputElement>('[name="interval"]')!;
  interval.value = "2";
  interval.dispatchEvent(new InputEvent("input", { bubbles: true }));
  document.querySelector<HTMLButtonElement>("button")!.click();

  expect(setRepeatingTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "rent", {
    nextDate: "2026-02-28", interval: 2, intervalUnit: "Months", anchorDate: "2026-01-31",
  });
});

it.each([2, 30])("keeps interval %s within the maximum when changing units", (initialInterval) => {
  dispose = render(() => <RepeatingTaskEditor
    repeatingTaskId="rent"
    repeatingTask={{
      title: "Rent", details: "",
      schedule: {
        nextDate: decodeTaskDate("2026-02-28"), interval: initialInterval, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-02-28"),
      },
      scheduleEditedAt: Timestamp.now(),
    }}
    session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
    showNotice={vi.fn()}
    onBack={vi.fn()}
  />, document.body);

  const intervalUnit = document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')!;
  intervalUnit.value = "Months";
  intervalUnit.dispatchEvent(new Event("change", { bubbles: true }));
  const expectedInterval = initialInterval === 2 ? 2 : 12;
  expect(document.querySelector<HTMLInputElement>('[name="interval"]')!.value).toBe(String(expectedInterval));
  document.querySelector<HTMLButtonElement>("button")!.click();

  expect(setRepeatingTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "rent", {
    nextDate: "2026-02-28", interval: expectedInterval, intervalUnit: "Months", anchorDate: "2026-02-28",
  });
});

it.each(["nextDate", "interval"])("rejects a cleared %s", (field) => {
  const showNotice = vi.fn();
  const onBack = vi.fn();
  dispose = render(() => <RepeatingTaskEditor
    repeatingTaskId="rent"
    repeatingTask={{
      title: "Rent", details: "",
      schedule: {
        nextDate: decodeTaskDate("2026-02-28"), interval: 1, intervalUnit: "Months", anchorDate: decodeTaskDate("2026-01-31"),
      },
      scheduleEditedAt: Timestamp.now(),
    }}
    session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
    showNotice={showNotice}
    onBack={onBack}
  />, document.body);

  const input = document.querySelector<HTMLInputElement>(`[name="${field}"]`)!;
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector<HTMLButtonElement>("button")!.click();

  expect(setRepeatingTaskSchedule).not.toHaveBeenCalled();
  expect(onBack).not.toHaveBeenCalled();
  expect(showNotice).toHaveBeenCalledExactlyOnceWith(field === "nextDate"
    ? "A next date is required."
    : "The interval must be a number from 1 to 12.");
});

it.each(["edited", "unchanged", "reverted"])("saves only an edited schedule after a remote update when the draft is %s", (state) => {
  const [repeatingTask, setRepeatingTask] = createSignal<RepeatingTask>({
    title: "Rent", details: "",
    schedule: {
      nextDate: decodeTaskDate("2026-02-28"), interval: 1, intervalUnit: "Months", anchorDate: decodeTaskDate("2026-01-31"),
    },
    scheduleEditedAt: Timestamp.now(),
  });
  dispose = render(() => <RepeatingTaskEditor
    repeatingTaskId="rent"
    repeatingTask={repeatingTask()}
    session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
    showNotice={vi.fn()}
    onBack={vi.fn()}
  />, document.body);

  const interval = document.querySelector<HTMLInputElement>('[name="interval"]')!;
  if (state !== "unchanged") {
    interval.value = "2";
    interval.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
  if (state === "reverted") {
    interval.value = "1";
    interval.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
  setRepeatingTask((current) => ({
    ...current,
    schedule: {
      nextDate: decodeTaskDate("2026-03-07"), interval: 3, intervalUnit: "Weeks", anchorDate: decodeTaskDate("2026-02-14"),
    },
  }));

  expect(document.querySelector<HTMLInputElement>('[name="nextDate"]')!.value).toBe("2026-02-28");
  expect(document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')!.value).toBe("Months");
  expect(interval.value).toBe(state === "edited" ? "2" : "1");
  expect(interval.max).toBe("12");
  document.querySelector<HTMLButtonElement>("button")!.click();

  if (state === "edited") {
    expect(setRepeatingTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "rent", {
      nextDate: "2026-02-28", interval: 2, intervalUnit: "Months", anchorDate: "2026-01-31",
    });
  } else {
    expect(setRepeatingTaskSchedule).not.toHaveBeenCalled();
  }
});

it.each([
  ["Days", "Months", "2026-11-14", "2026-10-01", "2026-12-14"],
  ["Weeks", "Months", "2026-11-14", "2026-10-01", "2026-12-14"],
  ["Days", "Years", "2026-11-14", "2026-10-01", "2027-11-14"],
  ["Weeks", "Years", "2026-11-14", "2026-10-01", "2027-11-14"],
  ["Months", "Years", "2027-02-28", "2027-01-31", "2028-02-28"],
  ["Years", "Months", "2026-02-28", "2024-02-29", "2026-03-28"],
  ["Months", "Days", "2026-02-28", "2026-01-31", "2026-03-01"],
  ["Years", "Weeks", "2026-02-28", "2024-02-29", "2026-03-07"],
  ["Days", "Weeks", "2026-11-14", "2026-10-01", "2026-11-21"],
  ["Weeks", "Days", "2026-11-14", "2026-10-01", "2026-11-15"],
] as const)("resets the anchor when switching from %s to %s", (from, to, nextDate, anchorDate, followingDate) => {
  dispose = render(() => <RepeatingTaskEditor
    repeatingTaskId="walk"
    repeatingTask={{
      title: "Walk", details: "",
      schedule: {
        nextDate: decodeTaskDate(nextDate), interval: 1, intervalUnit: from, anchorDate: decodeTaskDate(anchorDate),
      },
      scheduleEditedAt: Timestamp.now(),
    }}
    session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
    showNotice={vi.fn()}
    onBack={vi.fn()}
  />, document.body);

  const intervalUnit = document.querySelector<HTMLSelectElement>('[name="intervalUnit"]')!;
  intervalUnit.value = to;
  intervalUnit.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector<HTMLButtonElement>("button")!.click();

  expect(setRepeatingTaskSchedule).toHaveBeenCalledExactlyOnceWith("alice", "walk", {
    nextDate, interval: 1, intervalUnit: to, anchorDate: nextDate,
  });
  const saved = vi.mocked(setRepeatingTaskSchedule).mock.calls[0]![2];
  expect(nextOccurrenceDate(saved)).toBe(followingDate);
});

it.each(["Back"])("trims title and details when clicking %s", (action) => {
  dispose = render(() => <RepeatingTaskEditor
      repeatingTaskId="first"
      repeatingTask={{ title: "Original", details: "Original", schedule: {
        nextDate: decodeTaskDate("2026-10-04"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-10-04"),
      }, scheduleEditedAt: Timestamp.now() }}
      session={{ status: "SignedIn", user: { userId: "alice", photoUrl: null } }}
      showNotice={vi.fn()} onBack={vi.fn()} />, document.body);

  const title = document.querySelector<HTMLInputElement>('[name="title"]')!;
  const details = document.querySelector<HTMLTextAreaElement>('[name="details"]')!;
  title.value = "  Buy  bread  ";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  details.value = " \n  Whole grain\nTwo loaves  \n ";
  details.dispatchEvent(new Event("input", { bubbles: true }));
  expect(title.value).toBe("  Buy  bread  ");
  [...document.querySelectorAll("button")].find((button) => button.textContent === action)!.click();

  expect(setRepeatingTaskTitle).toHaveBeenCalledExactlyOnceWith("alice", "first", "Buy  bread");
  expect(setRepeatingTaskDetails).toHaveBeenCalledExactlyOnceWith("alice", "first", "Whole grain\nTwo loaves");
});
