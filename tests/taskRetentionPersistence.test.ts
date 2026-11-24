import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getFirestore, deleteField, disableNetwork, enableNetwork, getDocFromCache, setDoc, Timestamp, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { deleteTasksWithElapsedRetention, reopenTask, completeTask, type UserData } from "../src/userData";
import { decodeTaskDate } from "../src/taskDate";

vi.mock("firebase/firestore", async (original) => {
  const firestore = await original<typeof import("firebase/firestore")>();
  return { ...firestore, getFirestore: vi.fn(), setDoc: vi.fn(firestore.setDoc) };
});

let environment: RulesTestEnvironment;
let db: Firestore;
const completedAt = Timestamp.fromDate(new Date("2020-01-01T12:00:00Z"));
const taskPastRetention = { title: "Old", details: "", date: decodeTaskDate("2020-01-01"), completedAt };
const data: UserData = { tasks: { "old.task": taskPastRetention }, repeatingTasks: {} };

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: "demo-kit-task-retention", firestore: {
    rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  } });
});
afterAll(async () => environment.cleanup());
beforeEach(async () => {
  vi.clearAllMocks();
  await environment.clearFirestore();
  db = environment.authenticatedContext("alice").firestore() as unknown as Firestore;
  vi.mocked(getFirestore).mockReturnValue(db);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      tasks: {
        "old.task": { title: "Old", details: "", date: "2020-01-01", completed: true, completedEditedAt: completedAt },
        recent: { title: "Recent", details: "", date: "2020-01-01", completed: true, completedEditedAt: Timestamp.now() },
        open: { title: "Open", details: "", date: "2020-01-01", completed: false },
      },
      repeatingTasks: {}, futureField: "preserved",
    });
  });
});

it("deletes only completed tasks past retention and treats dotted IDs literally", async () => {
  await deleteTasksWithElapsedRetention("alice", { ...data, tasks: {
    ...data.tasks,
    recent: { ...taskPastRetention, completedAt: Timestamp.now() },
    open: { ...taskPastRetention, completedAt: null },
  } });
  const stored = (await getDoc(doc(db, "users/alice"))).data()!;
  expect(Object.keys(stored.tasks).sort()).toEqual(["open", "recent"]);
  expect(stored.futureField).toBe("preserved");
  expect(vi.mocked(setDoc).mock.lastCall![1]).toMatchObject({
    operation: { type: "DeleteTaskWithElapsedRetention", taskId: "old.task", completedAt },
  });
});

it("keeps a task reopened after the candidate snapshot", async () => {
  await reopenTask("alice", "old.task");
  await expect(deleteTasksWithElapsedRetention("alice", data)).rejects.toMatchObject({ code: "permission-denied" });
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"].completed).toBe(false);
});

it("keeps a task completed again after the candidate snapshot", async () => {
  await reopenTask("alice", "old.task");
  const reopenedAt = (await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"].completedEditedAt as Timestamp;
  const clock = vi.spyOn(Timestamp, "now").mockReturnValue(Timestamp.fromMillis(reopenedAt.toMillis() + 1));
  try {
    await completeTask("alice", "old.task");
  } finally {
    clock.mockRestore();
  }
  await expect(deleteTasksWithElapsedRetention("alice", data)).rejects.toMatchObject({ code: "permission-denied" });
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"].completed).toBe(true);
});

it("allows two devices to clean up the same task", async () => {
  await Promise.all([deleteTasksWithElapsedRetention("alice", data), deleteTasksWithElapsedRetention("alice", data)]);
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"]).toBeUndefined();
});

it("rejects a stale completion timestamp even if the new completion is also past retention", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      tasks: { "old.task": { completedEditedAt: new Timestamp(completedAt.seconds + 1, 0) } },
    }, { merge: true });
  });
  await expect(deleteTasksWithElapsedRetention("alice", data)).rejects.toMatchObject({ code: "permission-denied" });
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"]).toBeDefined();
});

it.each([399, 401])("uses server time to enforce the 400-day retention period for a %i-day-old task", async (age) => {
  const completion = Timestamp.fromMillis(Date.now() - age * 86_400_000);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      tasks: { "old.task": { completedEditedAt: completion } },
    }, { merge: true });
  });
  const deletion = setDoc(doc(db, "users/alice"), {
    operation: { type: "DeleteTaskWithElapsedRetention", taskId: "old.task", completedAt: completion },
    tasks: { "old.task": deleteField() },
  }, { merge: true });
  if (age < 400) {
    await expect(deletion).rejects.toMatchObject({ code: "permission-denied" });
    expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"]).toBeDefined();
  } else {
    await deletion;
    expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"]).toBeUndefined();
  }
});

it("rejects retention cleanup that changes the task without deleting it", async () => {
  await expect(setDoc(doc(db, "users/alice"), {
    operation: { type: "DeleteTaskWithElapsedRetention", taskId: "old.task", completedAt },
    tasks: { "old.task": { title: "Kept" } },
  }, { merge: true }))
    .rejects.toMatchObject({ code: "permission-denied" });
});

it.each([false, true])("queues all offline deletions and checks remote state on reconnect (reopened=%s)", async (reopened) => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      tasks: { second: { title: "Second", details: "", date: "2020-01-01", completed: true, completedEditedAt: completedAt } },
    }, { merge: true });
  });
  const reference = doc(db, "users/alice");
  await getDoc(reference);
  await disableNetwork(db);
  try {
    const result = deleteTasksWithElapsedRetention("alice", { ...data, tasks: { ...data.tasks, second: taskPastRetention } })
      .then(() => null, (error: unknown) => error);
    const cached = (await getDocFromCache(reference)).data()!;
    expect(cached.tasks["old.task"]).toBeUndefined();
    expect(cached.tasks.second).toBeUndefined();

    if (reopened) {
      const remote = environment.authenticatedContext("alice").firestore() as unknown as Firestore;
      await setDoc(doc(remote, "users/alice"), {
        operation: { type: "ReopenTask", taskId: "old.task" },
        tasks: { "old.task": { completed: false, completedEditedAt: Timestamp.now() } },
      }, { merge: true });
    }
    await enableNetwork(db);
    if (reopened) expect(await result).toMatchObject({ code: "permission-denied" });
    else expect(await result).toBeNull();
    await vi.waitFor(async () => {
      const stored = (await getDoc(reference)).data()!;
      expect(stored.tasks.second).toBeUndefined();
      if (reopened) expect(stored.tasks["old.task"].completed).toBe(false);
      else expect(stored.tasks["old.task"]).toBeUndefined();
    });
  } finally {
    await enableNetwork(db);
  }
});


it("rejects deletion of an incomplete task even when its timestamp matches", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/alice"), {
      tasks: { "old.task": { completed: false } },
    }, { merge: true });
  });
  await expect(deleteTasksWithElapsedRetention("alice", data)).rejects.toMatchObject({ code: "permission-denied" });
  expect((await getDoc(doc(db, "users/alice"))).data()!.tasks["old.task"].completed).toBe(false);
});
