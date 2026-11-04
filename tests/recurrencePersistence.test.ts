import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { disableNetwork, doc, enableNetwork, getDoc, getDocFromCache, getDocFromServer, getFirestore, setDoc, Timestamp, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { advanceTaskSchedule, completeTask, createTaskOccurrence, deleteTask, reopenTask, setTaskDate, setTaskSchedule, removeTaskSchedule, setTaskTitle, subscribeUserData, type UserData } from "../src/userData";
import { decodeTaskDate as date } from "../src/taskDate";

vi.mock("firebase/firestore", async (original) => ({
  ...await original<typeof import("firebase/firestore")>(), getFirestore: vi.fn(),
}));
let environment: RulesTestEnvironment;
let db: Firestore;
const editedAt = Timestamp.fromMillis(Date.now() - 10_000);
const schedule = { nextDate: date("2026-01-31"), every: 1, unit: "Months" as const, anchorDate: date("2026-01-31") };

const task = { type: "RepeatingTask" as const, title: "Rent", details: "Pay", schedule, scheduleEditedAt: editedAt };

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: "demo-kit-recurrence", firestore: {
    rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  } });
});
afterAll(async () => environment.cleanup());
beforeEach(async () => {
  await environment.clearFirestore();
  db = environment.authenticatedContext("alice").firestore() as unknown as Firestore;
  vi.mocked(getFirestore).mockReturnValue(db);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), { tasks: { "repeat.with.dots": {
      type: "RepeatingTask", title: task.title, details: task.details, schedule: task.schedule,
      titleEditedAt: editedAt, detailsEditedAt: editedAt, scheduleEditedAt: editedAt,
    } } });
  });
});

it("keeps independent occurrences from concurrent devices while advancing once", async () => {
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  await Promise.all([createTaskOccurrence("alice", firstId, task), createTaskOccurrence("alice", secondId, task)]);
  const results = await Promise.allSettled([
    advanceTaskSchedule("alice", "repeat.with.dots", task, firstId),
    advanceTaskSchedule("alice", "repeat.with.dots", task, secondId),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  let tasks = (await getDoc(doc(db, "users/alice"))).data()!.tasks;
  expect(Object.keys(tasks)).toHaveLength(3);
  expect(tasks["repeat.with.dots"]).toMatchObject({ type: "RepeatingTask", schedule: { ...schedule, nextDate: "2026-02-28" }, scheduleEditedAt: editedAt });
  expect(tasks["repeat.with.dots"].dateEditedAt).toBeUndefined();
  expect(tasks["repeat.with.dots"].date).toBeUndefined();
  expect(tasks["repeat.with.dots"].completed).toBeUndefined();
  expect(tasks["repeat.with.dots"].completedEditedAt).toBeUndefined();
  for (const id of [firstId, secondId]) {
    expect(tasks[id]).toMatchObject({ type: "NonRepeatingTask", title: "Rent", details: "Pay", date: "2026-01-31", completed: false });
    expect(tasks[id].schedule).toBeUndefined();
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  await completeTask("alice", firstId);
  await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, firstId)).rejects.toThrow();
  tasks = (await getDoc(doc(db, "users/alice"))).data()!.tasks;
  expect(tasks[firstId].completed).toBe(true);
  expect(tasks[secondId].completed).toBe(false);
  const nextId = crypto.randomUUID();
  await createTaskOccurrence("alice", nextId, { ...task, schedule: { ...task.schedule, nextDate: date("2026-02-28") } });
  await advanceTaskSchedule("alice", "repeat.with.dots", { ...task, schedule: { ...task.schedule, nextDate: date("2026-02-28") } }, nextId);
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"].schedule.nextDate).toBe("2026-03-31");
});

it("keeps captured occurrence content after source content or schedule changes", async () => {
  await setTaskTitle("alice", "repeat.with.dots", "New title");
  const occurrenceId = crypto.randomUUID();
  await createTaskOccurrence("alice", occurrenceId, task);
  await advanceTaskSchedule("alice", "repeat.with.dots", task, occurrenceId);
  await setTaskSchedule("alice", "repeat.with.dots", { ...schedule, nextDate: date("2026-02-15"), anchorDate: date("2026-02-15") });
  const staleId = crypto.randomUUID();
  await createTaskOccurrence("alice", staleId, task);
  await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, staleId)).rejects.toThrow();
  const tasks = (await getDoc(doc(db, "users/alice"))).data()!.tasks;
  expect(tasks["repeat.with.dots"]).toMatchObject({ title: "New title", schedule: { nextDate: "2026-02-15" } });
  for (const id of [occurrenceId, staleId]) expect(tasks[id]).toMatchObject({ title: "Rent", details: "Pay", date: "2026-01-31" });
});

it("keeps occurrences created after the source is converted or deleted", async () => {
  await removeTaskSchedule("alice", "repeat.with.dots", date("2026-02-28"));
  let tasks = (await getDoc(doc(db, "users/alice"))).data()!.tasks;
  expect(tasks["repeat.with.dots"]).toMatchObject({ type: "NonRepeatingTask", date: "2026-02-28", completed: false });
  expect(tasks["repeat.with.dots"].schedule).toBeUndefined();
  expect(tasks["repeat.with.dots"].scheduleEditedAt).toBeUndefined();
  expect(tasks["repeat.with.dots"].dateEditedAt).toBeInstanceOf(Timestamp);
  const firstId = crypto.randomUUID();
  await createTaskOccurrence("alice", firstId, task);
  await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, firstId)).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await setTaskSchedule("alice", "repeat.with.dots", { ...schedule, nextDate: date("2026-02-28") });
  await deleteTask("alice", "repeat.with.dots");
  const secondId = crypto.randomUUID();
  await createTaskOccurrence("alice", secondId, task);
  await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, secondId)).rejects.toThrow();
  tasks = (await getDoc(doc(db, "users/alice"))).data()!.tasks;
  expect(tasks["repeat.with.dots"]).toBeUndefined();
  expect(Object.keys(tasks)).toHaveLength(2);
  for (const id of [firstId, secondId]) expect(tasks[id]).toMatchObject({ title: "Rent", details: "Pay", date: "2026-01-31" });
});

it.each(["incomplete", "completed", "repeating"])("deletes a %s task without affecting other tasks and rejects subsequent edits", async (state) => {
  const taskId = "task.with.dots";
  if (state === "repeating") {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/alice"), { tasks: { [taskId]: {
        type: "RepeatingTask", title: task.title, details: task.details, schedule: task.schedule,
        titleEditedAt: editedAt, detailsEditedAt: editedAt, scheduleEditedAt: editedAt,
      } } }, { merge: true });
    });
  } else {
    await createTaskOccurrence("alice", taskId, task);
    if (state === "completed") await completeTask("alice", taskId);
  }
  const reference = doc(db, "users/alice");
  const otherTask = (await getDoc(reference)).data()!.tasks["repeat.with.dots"];
  await deleteTask("alice", taskId);
  expect((await getDoc(reference)).data()).toEqual({
    operation: { type: "DeleteTask", taskId }, tasks: { "repeat.with.dots": otherTask },
  });
  await expect(deleteTask("alice", taskId)).rejects.toThrow();
  await expect(setTaskTitle("alice", taskId, "Stale edit")).rejects.toThrow();
  expect((await getDoc(reference)).data()!.tasks).toEqual({ "repeat.with.dots": otherTask });
});

it("does not advance before the occurrence exists and never moves backward", async () => {
  const occurrenceId = crypto.randomUUID();
  await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, occurrenceId)).rejects.toThrow();
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"].schedule.nextDate).toBe("2026-01-31");
  await createTaskOccurrence("alice", occurrenceId, { ...task, schedule: { ...task.schedule, nextDate: date("2026-03-31") } });
  await advanceTaskSchedule("alice", "repeat.with.dots", { ...task, schedule: { ...task.schedule, nextDate: date("2026-03-31") } }, occurrenceId);
  await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, occurrenceId)).rejects.toThrow();
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"]).toMatchObject({
    schedule: { ...schedule, nextDate: "2026-04-30" }, scheduleEditedAt: editedAt,
  });
});

it("syncs offline occurrence edits and completion even when another device already advanced the schedule", async () => {
  await getDoc(doc(db, "users/alice"));
  await disableNetwork(db);
  const occurrenceId = crypto.randomUUID();
  const clock = vi.spyOn(Timestamp, "now").mockReturnValue(Timestamp.fromMillis(editedAt.toMillis() + 1_000));
  const creation = createTaskOccurrence("alice", occurrenceId, task);
  const advancement = advanceTaskSchedule("alice", "repeat.with.dots", task, occurrenceId);
  clock.mockReturnValue(Timestamp.fromMillis(editedAt.toMillis() + 2_000));
  const edit = setTaskTitle("alice", occurrenceId, "Paid offline");
  const completion = completeTask("alice", occurrenceId);
  const results = Promise.allSettled([creation, advancement, edit, completion]);
  try {
    const cached = (await getDocFromCache(doc(db, "users/alice"))).data()!.tasks;
    expect(cached["repeat.with.dots"].schedule.nextDate).toBe("2026-02-28");
    expect(cached[occurrenceId]).toMatchObject({ title: "Paid offline", completed: true });

    const otherDb = environment.authenticatedContext("alice").firestore() as unknown as Firestore;
    vi.mocked(getFirestore).mockReturnValue(otherDb);
    const otherId = crypto.randomUUID();
    await createTaskOccurrence("alice", otherId, task);
    await advanceTaskSchedule("alice", "repeat.with.dots", task, otherId);

    await enableNetwork(db);
    expect((await results).map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled"]);
    const synced = (await getDocFromServer(doc(db, "users/alice"))).data()!.tasks;
    expect(Object.keys(synced)).toHaveLength(3);
    expect(synced[occurrenceId]).toMatchObject({ title: "Paid offline", details: "Pay", date: "2026-01-31", completed: true });
    expect(synced[otherId]).toMatchObject({ title: "Rent", date: "2026-01-31", completed: false });
    expect(synced["repeat.with.dots"]).toMatchObject({ schedule: { ...schedule, nextDate: "2026-02-28" }, scheduleEditedAt: editedAt });
  } finally {
    clock.mockRestore();
    vi.mocked(getFirestore).mockReturnValue(db);
    await enableNetwork(db);
    await results;
  }
});

it("decodes schedule and reports unknown schedules as invalid data", async () => {
  const data = await new Promise<UserData>((resolve, reject) => {
    const unsubscribe = subscribeUserData("alice", (data) => { unsubscribe(); resolve(data); }, reject);
  });
  expect(data.tasks["repeat.with.dots"]).toEqual(task);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), { tasks: { "repeat.with.dots": { schedule: { unit: "weekdays" } } } }, { merge: true });
  });
  await getDoc(doc(db, "users/alice"));
  const receive = vi.fn();
  const error = await new Promise<Error>((resolve) => {
    const unsubscribe = subscribeUserData("alice", receive, (error) => { unsubscribe(); resolve(error); });
  });
  expect(error.message).toBe("Invalid schedule: invalid unit");
  expect(receive).not.toHaveBeenCalled();
});

it("rejects advancement from a previous schedule version even when the next date is unchanged", async () => {
  const version = Timestamp.fromMillis(editedAt.toMillis() + 1_000);
  const clock = vi.spyOn(Timestamp, "now").mockReturnValue(version);
  try {
    const changedSchedule = { ...schedule, every: 2 };
    await setTaskSchedule("alice", "repeat.with.dots", changedSchedule);
    const occurrenceId = crypto.randomUUID();
    await createTaskOccurrence("alice", occurrenceId, task);
    await expect(advanceTaskSchedule("alice", "repeat.with.dots", task, occurrenceId)).rejects.toThrow();
    await advanceTaskSchedule("alice", "repeat.with.dots", {
      ...task, schedule: changedSchedule, scheduleEditedAt: version,
    }, occurrenceId);
    const tasks = (await getDoc(doc(db, "users/alice"))).data()!.tasks;
    expect(tasks["repeat.with.dots"]).toMatchObject({ schedule: { ...schedule, nextDate: "2026-03-31", every: 2 }, scheduleEditedAt: version });
    expect(Object.keys(tasks)).toHaveLength(2);
  } finally {
    clock.mockRestore();
  }
});

it("preserves edit ordering across task conversions and rejects one-off date writes while repeating", async () => {
  const clock = vi.spyOn(Timestamp, "now");
  try {
    const oneOffVersion = Timestamp.fromMillis(editedAt.toMillis() + 1_000);
    clock.mockReturnValue(oneOffVersion);
    await removeTaskSchedule("alice", "repeat.with.dots", task.schedule.nextDate);
    for (const staleTime of [editedAt, oneOffVersion]) {
      clock.mockReturnValue(staleTime);
      await expect(setTaskSchedule("alice", "repeat.with.dots", task.schedule)).rejects.toThrow();
    }
    const dateVersion = Timestamp.fromMillis(editedAt.toMillis() + 2_000);
    clock.mockReturnValue(dateVersion);
    await setTaskDate("alice", "repeat.with.dots", date("2026-02-01"));
    clock.mockReturnValue(oneOffVersion);
    await expect(setTaskSchedule("alice", "repeat.with.dots", task.schedule)).rejects.toThrow();

    const repeatVersion = Timestamp.fromMillis(editedAt.toMillis() + 3_000);
    clock.mockReturnValue(repeatVersion);
    await setTaskSchedule("alice", "repeat.with.dots", task.schedule);
    for (const staleTime of [dateVersion, repeatVersion]) {
      clock.mockReturnValue(staleTime);
      await expect(removeTaskSchedule("alice", "repeat.with.dots", task.schedule.nextDate)).rejects.toThrow();
    }
    clock.mockReturnValue(Timestamp.fromMillis(repeatVersion.toMillis() + 1_000));
    await expect(setTaskDate("alice", "repeat.with.dots", date("2026-02-01"))).rejects.toThrow();
    const source = (await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"];
    expect(source).toMatchObject({ type: "RepeatingTask", schedule: task.schedule, scheduleEditedAt: repeatVersion });
    expect(source.dateEditedAt).toBeUndefined();
    await removeTaskSchedule("alice", "repeat.with.dots", date("2026-02-01"));
    expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"].type).toBe("NonRepeatingTask");
  } finally {
    clock.mockRestore();
  }
});

it("orders conversions after completion edits and rejects stale completion after converting back", async () => {
  const clock = vi.spyOn(Timestamp, "now");
  try {
    clock.mockReturnValue(Timestamp.fromMillis(editedAt.toMillis() + 1_000));
    await removeTaskSchedule("alice", "repeat.with.dots", task.schedule.nextDate);
    const completionTime = Timestamp.fromMillis(editedAt.toMillis() + 2_000);
    clock.mockReturnValue(completionTime);
    await completeTask("alice", "repeat.with.dots");
    clock.mockReturnValue(Timestamp.fromMillis(editedAt.toMillis() + 3_000));
    await expect(setTaskSchedule("alice", "repeat.with.dots", task.schedule)).rejects.toThrow();
    await reopenTask("alice", "repeat.with.dots");
    clock.mockReturnValue(completionTime);
    await expect(setTaskSchedule("alice", "repeat.with.dots", task.schedule)).rejects.toThrow();

    clock.mockReturnValue(Timestamp.fromMillis(editedAt.toMillis() + 4_000));
    await setTaskSchedule("alice", "repeat.with.dots", task.schedule);
    await expect(completeTask("alice", "repeat.with.dots")).rejects.toThrow();
    clock.mockReturnValue(Timestamp.fromMillis(editedAt.toMillis() + 5_000));
    await removeTaskSchedule("alice", "repeat.with.dots", task.schedule.nextDate);
    clock.mockReturnValue(completionTime);
    await expect(completeTask("alice", "repeat.with.dots")).rejects.toThrow();
    expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"]).toMatchObject({
      type: "NonRepeatingTask", completed: false, completedEditedAt: Timestamp.fromMillis(editedAt.toMillis() + 5_000),
    });
  } finally {
    clock.mockRestore();
  }
});

it("merges the schedule while preserving other fields and title and details edits", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), { tasks: { "repeat.with.dots": {
      schedule: { futureField: true },
    } } }, { merge: true });
  });
  await setTaskTitle("alice", "repeat.with.dots", "New title");
  await setTaskSchedule("alice", "repeat.with.dots", { ...schedule, nextDate: date("2026-02-15"), anchorDate: date("2026-02-15") });
  const stored = (await getDoc(doc(db, "users/alice"))).data()!.tasks["repeat.with.dots"];
  expect(stored.schedule).toEqual({ ...schedule, nextDate: "2026-02-15", futureField: true, anchorDate: "2026-02-15" });
  expect(stored.title).toBe("New title");
  expect(stored.details).toBe("Pay");
  expect(stored.titleEditedAt.toMillis()).toBeGreaterThan(editedAt.toMillis());
  expect(stored.detailsEditedAt).toEqual(editedAt);
});
