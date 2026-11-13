import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getFirestore, setDoc, Timestamp, type Firestore, type DocumentData } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  completeTask,
  createRepeatingTask,
  createTasksFromRepeatingTasks,
  deleteRepeatingTask,
  setRepeatingTaskDetails,
  setRepeatingTaskSchedule,
  setRepeatingTaskTitle,
  setTaskDate,
} from "../src/userData";
import { decodeTaskDate, taskDateToday } from "../src/taskDate";

vi.mock("firebase/firestore", async (original) => {
  const firestore = await original<typeof import("firebase/firestore")>();
  return { ...firestore, getFirestore: vi.fn(), setDoc: vi.fn(firestore.setDoc) };
});

vi.mock("../src/taskDate", async (original) => ({
  ...await original<typeof import("../src/taskDate")>(), taskDateToday: vi.fn(),
}));

let environment: RulesTestEnvironment;
let db: Firestore;
const editedAt = Timestamp.fromMillis(Date.now() - 10_000);
const schedule = {
  nextDate: decodeTaskDate("2026-01-31"),
  interval: 1,
  intervalUnit: "Months" as const,
  anchorDate: decodeTaskDate("2026-01-31"),
};
const repeatingTask = {
  title: "Rent",
  details: "Pay landlord",
  schedule,
  scheduleEditedAt: editedAt,
};

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: "demo-kit-repeating-task", firestore: {
    rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  } });
});
afterAll(async () => environment.cleanup());
beforeEach(async () => {
  vi.mocked(taskDateToday).mockReturnValue(decodeTaskDate("2026-01-31"));
  await environment.clearFirestore();
  db = environment.authenticatedContext("alice").firestore() as unknown as Firestore;
  vi.mocked(getFirestore).mockReturnValue(db);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      tasks: {}, repeatingTasks: { rent: {
        ...repeatingTask,
        titleEditedAt: editedAt,
        detailsEditedAt: editedAt,
      } },
    });
  });
});

it("uses task UUIDs and allows duplicate tasks created concurrently for the same occurrence", async () => {
  const results = await Promise.allSettled([
    createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } }),
    createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(Object.keys(stored.tasks)).toHaveLength(2);
  for (const taskId of Object.keys(stored.tasks)) expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
  expect(Object.values(stored.tasks).map((task) => (task as { date: string }).date)).toEqual([
    "2026-01-31", "2026-01-31",
  ]);
  expect(stored.repeatingTasks.rent.schedule.nextDate).toBe("2026-02-28");
});

it("creates a task for an occurrence after the repeating task's title and details change", async () => {
  await setRepeatingTaskTitle("alice", "rent", "Apartment rent");
  await setRepeatingTaskDetails("alice", "rent", "Pay by bank transfer");

  await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } });

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(Object.values(stored.tasks)).toEqual([expect.objectContaining({ title: "Rent", details: "Pay landlord" })]);
  expect(stored.repeatingTasks.rent).toMatchObject({ title: "Apartment rent", details: "Pay by bank transfer" });
});

it("creates tasks for occurrences after the schedule changes or the repeating task is deleted", async () => {
  await setRepeatingTaskSchedule("alice", "rent", { ...schedule, nextDate: decodeTaskDate("2026-03-31") });
  await expect(createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } })).rejects.toThrow();

  await deleteRepeatingTask("alice", "rent");
  const repeatingTaskAtLaterDate = { ...repeatingTask, schedule: { ...schedule, nextDate: decodeTaskDate("2026-02-28") } };
  vi.mocked(taskDateToday).mockReturnValue(decodeTaskDate("2026-02-28"));
  await expect(createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTaskAtLaterDate } })).rejects.toThrow();

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(Object.values(stored.tasks).map((task) => (task as { date: string }).date).sort()).toEqual(["2026-01-31", "2026-02-28"]);
  expect(stored.repeatingTasks.rent).toBeUndefined();
});

it("creates a repeating task without creating a task", async () => {
  await createRepeatingTask("alice", "new-repeating-task");

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(stored.tasks).toEqual({});
  expect(stored.repeatingTasks["new-repeating-task"]).toMatchObject({
    title: "", details: "",
    schedule: { nextDate: taskDateToday(), interval: 1, intervalUnit: "Days", anchorDate: taskDateToday() },
    scheduleEditedAt: expect.any(Timestamp),
  });
});

it("catches up several due dates while preserving the monthly anchor", async () => {
  vi.mocked(taskDateToday).mockReturnValue(decodeTaskDate("2026-03-31"));
  await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } });

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(Object.values(stored.tasks).map((task) => (task as { date: string }).date).sort()).toEqual([
    "2026-01-31", "2026-02-28", "2026-03-31",
  ]);
  expect(stored.repeatingTasks.rent.schedule.nextDate).toBe("2026-04-30");
});

it("advances after the created task's date changes", async () => {
  const original = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
  let taskId!: string;
  vi.mocked(setDoc).mockImplementationOnce(async (reference, data, options) => {
    await original.setDoc(reference, data, options!);
    taskId = (data as DocumentData).operation.taskId as string;
    await setTaskDate("alice", taskId, decodeTaskDate("2026-02-01"));
  });
  await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } });

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(stored.tasks[taskId].date).toBe("2026-02-01");
  expect(stored.repeatingTasks.rent.schedule.nextDate).toBe("2026-02-28");
});

it("allows a task created for a later occurrence to advance the schedule when an earlier advancement is missing", async () => {
  const repeatingTaskAtLaterDate = { ...repeatingTask, schedule: { ...schedule, nextDate: decodeTaskDate("2026-02-28") } };
  vi.mocked(taskDateToday).mockReturnValue(decodeTaskDate("2026-02-28"));
  await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTaskAtLaterDate } });

  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(stored.repeatingTasks.rent.schedule.nextDate).toBe("2026-03-31");
});

it("keeps task edits independent from repeating task edits and leaves tasks after repeating task deletion", async () => {
  await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } });
  const initial = (await getDoc(doc(db, "users/alice"))).data()!;
  const taskId = Object.keys(initial.tasks)[0]!;
  await Promise.all([
    setTaskDate("alice", taskId, decodeTaskDate("2026-02-01")),
    completeTask("alice", taskId),
    setRepeatingTaskSchedule("alice", "rent", {
      ...schedule,
      nextDate: decodeTaskDate("2026-03-31"), interval: 2, intervalUnit: "Months", anchorDate: schedule.anchorDate,
    }),
    setRepeatingTaskTitle("alice", "rent", "Apartment rent"),
  ]);

  let stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(stored.tasks[taskId]).toMatchObject({ title: "Rent", date: "2026-02-01", completed: true });
  expect(stored.repeatingTasks.rent).toMatchObject({
    title: "Apartment rent", schedule: { nextDate: "2026-03-31", interval: 2, intervalUnit: "Months" },
  });

  await deleteRepeatingTask("alice", "rent");
  await expect(setRepeatingTaskTitle("alice", "rent", "Deleted repeating task")).rejects.toThrow();
  stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(stored.repeatingTasks.rent).toBeUndefined();
  expect(stored.tasks[taskId]).toMatchObject({ title: "Rent", date: "2026-02-01", completed: true });
});
