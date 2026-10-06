import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, Timestamp } from "firebase/firestore";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let environment: RulesTestEnvironment;
const oldTime = Timestamp.fromMillis(Date.now() - 10_000);
const editTime = Timestamp.fromMillis(Date.now() - 5_000);
const task = {
  title: "Buy milk", completed: false, date: "2024-10-04",
  titleEditedAt: oldTime, dateEditedAt: oldTime, completedEditedAt: oldTime,
  futureField: 42,
};

describe("Firestore security rules", () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: "demo-kit-tasks", firestore: { rules },
    });
  });
  afterAll(async () => { await environment.cleanup(); });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/alice"), {
        futureField: true, tasks: { "task.with.dots": task, other: task },
      });
    });
  });

  it("allows only the owner to read and denies listing, deletion, and other paths", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(alice, "users/alice")));
    await assertSucceeds(getDoc(doc(bob, "users/bob")));
    for (const db of [bob, anonymous]) {
      await assertFails(getDoc(doc(db, "users/alice")));
      await assertFails(setDoc(doc(db, "users/alice"), {
        operation: { type: "setTaskTitle", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { title: "Changed", titleEditedAt: editTime } },
      }, { merge: true }));
    }
    await assertFails(getDocs(collection(alice, "users")));
    await assertFails(deleteDoc(doc(alice, "users/alice")));
    await assertFails(setDoc(doc(alice, "users/alice/private/data"), { value: true }));
    const taskId = crypto.randomUUID();
    for (const db of [alice, anonymous]) {
      await assertFails(setDoc(doc(db, "users/bob"), {
        operation: { type: "createTask", taskId }, tasks: { [taskId]: {
          title: "", completed: false, date: "2024-10-04",
          titleEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
        } },
      }));
    }
  });

  it.each(["bob", "alice"])("creates a task in a missing or existing user document: %s", async (userId) => {
    const db = environment.authenticatedContext(userId).firestore();
    const reference = doc(db, "users", userId);
    const taskId = crypto.randomUUID();
    const created = { title: "", completed: false, date: "2024-10-04",
      titleEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime };
    await assertSucceeds(setDoc(reference, {
      operation: { type: "createTask", taskId }, tasks: { [taskId]: created },
    }, { merge: true }));
    expect((await getDoc(reference)).data()!.tasks[taskId]).toEqual(created);
    await assertFails(setDoc(reference, {
      operation: { type: "createTask", taskId }, tasks: { [taskId]: { ...created, title: "Overwrite" } },
    }, { merge: true }));
  });

  it("creates the first task in a legacy document without a tasks field", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob"), { futureField: true });
    });
    const reference = doc(environment.authenticatedContext("bob").firestore(), "users/bob");
    const taskId = crypto.randomUUID();
    await assertSucceeds(setDoc(reference, {
      operation: { type: "createTask", taskId }, tasks: { [taskId]: {
        title: "", completed: false, date: "2024-10-04",
        titleEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
      } },
    }, { merge: true }));
    expect((await getDoc(reference)).data()!.futureField).toBe(true);
  });

  it.each([
    ["setTaskTitle", { title: "Buy bread", titleEditedAt: editTime }],
    ["setTaskDate", { date: "2024-10-05", dateEditedAt: editTime }],
    ["completeTask", { completed: true, completedEditedAt: editTime }],
    ["reopenTask", { completed: false, completedEditedAt: editTime }],
  ])("allows %s on an existing task and rejects missing tasks and missing documents", async (taskOperation, patch) => {
    const db = environment.authenticatedContext("alice").firestore();
    const reference = doc(db, "users/alice");
    await assertSucceeds(setDoc(reference, {
      operation: { type: taskOperation, taskId: "task.with.dots" }, tasks: { "task.with.dots": patch },
    }, { merge: true }));
    expect((await getDoc(reference)).data()!.tasks.other).toEqual(task);
    await assertFails(setDoc(reference, {
      operation: { type: taskOperation, taskId: "missing" }, tasks: { missing: patch },
    }, { merge: true }));
    await assertFails(setDoc(doc(environment.authenticatedContext("bob").firestore(), "users/bob"), {
      operation: { type: taskOperation, taskId: "missing" }, tasks: { missing: patch },
    }, { merge: true }));
  });

  it("merges concurrent title and date edits while preserving unknown fields", async () => {
    const first = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    const second = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await Promise.all([
      assertSucceeds(setDoc(first, { operation: { type: "setTaskTitle", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime } } }, { merge: true })),
      assertSucceeds(setDoc(second, { operation: { type: "setTaskDate", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { date: "2024-10-06", dateEditedAt: editTime } } }, { merge: true })),
    ]);
    expect((await getDoc(first)).data()).toEqual({
      futureField: true,
      operation: { type: expect.stringMatching(/^setTask(Title|Date)$/), taskId: "task.with.dots" },
      tasks: { other: task, "task.with.dots": {
        ...task, title: "Bread", date: "2024-10-06",
        titleEditedAt: editTime,
        dateEditedAt: editTime,
      } },
    });
  });

  it("allows concurrent creates without losing tasks", async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    await Promise.all(ids.map(async (taskId) => {
      const db = environment.authenticatedContext("alice").firestore();
      await assertSucceeds(setDoc(doc(db, "users/alice"), {
        operation: { type: "createTask", taskId }, tasks: { [taskId]: {
          title: "", completed: false, date: "2024-10-04",
          titleEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
        } },
      }, { merge: true }));
    }));
    const data = (await getDoc(doc(environment.authenticatedContext("alice").firestore(), "users/alice"))).data()!;
    expect(Object.keys(data.tasks)).toHaveLength(4);
    expect(data.tasks.other).toEqual(task);
  });

  it.each([
    ["setTaskTitle", "title", "Bread", "titleEditedAt"],
    ["setTaskDate", "date", "2024-10-06", "dateEditedAt"],
    ["completeTask", "completed", true, "completedEditedAt"],
    ["reopenTask", "completed", false, "completedEditedAt"],
  ])("rejects stale, equal, future, and invalid timestamps for %s", async (taskOperation, field, value, timestampField) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    for (const time of [Timestamp.fromMillis(oldTime.toMillis() - 1), oldTime,
      Timestamp.fromMillis(Date.now() + 600_000), "invalid", 42, null]) {
      await assertFails(setDoc(reference, { operation: { type: taskOperation, taskId: "task.with.dots" },
        tasks: { "task.with.dots": { [field]: value, [timestampField]: time } } }, { merge: true }));
    }
    await assertFails(setDoc(reference, { operation: { type: taskOperation, taskId: "task.with.dots" },
      tasks: { "task.with.dots": { [field]: value } } }, { merge: true }));
    await assertSucceeds(setDoc(reference, { operation: { type: taskOperation, taskId: "task.with.dots" },
      tasks: { "task.with.dots": { [field]: value, [timestampField]: editTime } } }, { merge: true }));
    await assertFails(setDoc(reference, { operation: { type: taskOperation, taskId: "task.with.dots" },
      tasks: { "task.with.dots": { [field]: value, [timestampField]: oldTime } } }, { merge: true }));
  });

  it("edits legacy tasks without timestamps without rewriting their other fields", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/alice"), {
        tasks: { legacy: {
          title: "Milk", completed: false, date: "2024-10-04", futureField: 42,
        } },
      });
    });
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    for (const [taskOperation, patch] of [
      ["setTaskTitle", { title: "Bread", titleEditedAt: editTime }],
      ["setTaskDate", { date: "2024-10-06", dateEditedAt: editTime }],
      ["completeTask", { completed: true, completedEditedAt: editTime }],
    ] as const) {
      await assertSucceeds(setDoc(reference, { operation: { type: taskOperation, taskId: "legacy" },
        tasks: { legacy: patch } }, { merge: true }));
    }
    expect((await getDoc(reference)).data()).toMatchObject({
      operation: { type: "completeTask", taskId: "legacy" },
      tasks: { legacy: { futureField: 42 } },
    });
  });

  it("allows independent title and date edits after another device completes the task", async () => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, { operation: { type: "completeTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { completed: true, completedEditedAt: editTime } } }, { merge: true });
    for (const [taskOperation, patch] of [
      ["setTaskTitle", { title: "Bread", titleEditedAt: editTime }],
      ["setTaskDate", { date: "2024-10-06", dateEditedAt: editTime }],
    ] as const) {
      await assertSucceeds(setDoc(reference, { operation: { type: taskOperation, taskId: "task.with.dots" },
        tasks: { "task.with.dots": patch } }, { merge: true }));
    }
    expect((await getDoc(reference)).data()!.tasks["task.with.dots"]).toEqual({
      ...task, completed: true, title: "Bread", date: "2024-10-06",
      titleEditedAt: editTime,
      dateEditedAt: editTime,
      completedEditedAt: editTime,
    });
  });

  it.each([
    ["completeTask", false],
    ["reopenTask", true],
    ["completeTask", deleteField()],
  ])("leaves completion values to the client for %s", async (type, completed) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertSucceeds(setDoc(reference, {
      operation: { type, taskId: "task.with.dots" },
      tasks: { "task.with.dots": { completed, completedEditedAt: editTime } },
    }, { merge: true }));
  });

  it.each([
    { title: deleteField() },
    { completed: true },
    { futureField: 43 },
    { futureField: deleteField() },
    { dateEditedAt: editTime },
  ])("trusts clients to scope task field changes: %j", async (patch) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertSucceeds(setDoc(reference, {
      operation: { type: "setTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime, ...patch } },
    }, { merge: true }));
  });

  it.each([
    { tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime }, other: deleteField() } },
    { tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime }, other: { title: "Other task" } } },
    { futureField: false },
    { newField: true },
  ])("trusts clients to scope document changes: %j", async (patch) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertSucceeds(setDoc(reference, {
      operation: { type: "setTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime } },
      ...patch,
    }, { merge: true }));
  });

  it.each([
    { tasks: deleteField() },
    { tasks: { "task.with.dots": deleteField() } },
    { tasks: { other: { title: "Wrong target", titleEditedAt: editTime } } },
    { tasks: [] },
    { operation: { type: "setTaskTitle", taskId: "" } },
    { operation: { type: "setTaskTitle", taskId: 42 } },
    { operation: { type: "delete", taskId: "task.with.dots" } },
    { operation: deleteField() },
    { operation: null },
    { operation: [] },
    { operation: "setTaskTitle" },
    { operation: {} },
    { operation: { taskId: "task.with.dots" } },
    { operation: { type: "setTaskTitle" } },
    { operation: { type: 42, taskId: "task.with.dots" } },
  ])("rejects invalid operation metadata or target: %j", async (patch) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertFails(setDoc(reference, {
      operation: { type: "setTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime } },
      ...patch,
    }, { merge: true }));
  });

  it("requires the protocol but leaves document replacement to the client", async () => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertFails(setDoc(reference, { tasks: {} }));
    await assertFails(setDoc(reference, { tasks: { "task.with.dots": { title: "Bread" } } }, { merge: true }));
    await assertFails(setDoc(reference, {
      taskId: "task.with.dots", taskOperation: "setTitle",
      tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime } },
    }, { merge: true }));
    await assertSucceeds(setDoc(reference, { operation: { type: "setTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { ...task, title: "Bread", titleEditedAt: editTime } } }));
  });

  it("leaves date validation to the client on creation and editing", async () => {
    const date = "2026-02-29";
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    const taskId = crypto.randomUUID();
    await assertSucceeds(setDoc(reference, {
      operation: { type: "createTask", taskId },
      tasks: { [taskId]: {
        title: "", completed: false, date,
        titleEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
      } },
    }, { merge: true }));
    await assertSucceeds(setDoc(reference, {
      operation: { type: "setTaskDate", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { date, dateEditedAt: editTime } },
    }, { merge: true }));
  });

  it("allows owner-written task data without validating domain fields", async () => {
    const taskId = crypto.randomUUID();
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertSucceeds(setDoc(reference, { operation: { type: "createTask", taskId }, tasks: { [taskId]: {
      title: 42, completed: "invalid", date: null, extra: true,
      titleEditedAt: oldTime, dateEditedAt: oldTime, completedEditedAt: oldTime,
    } } }, { merge: true }));
    await assertSucceeds(setDoc(reference, { operation: { type: "setTaskTitle", taskId },
      tasks: { [taskId]: { title: false, titleEditedAt: editTime } } }, { merge: true }));
    await assertSucceeds(setDoc(reference, { operation: { type: "completeTask", taskId },
      tasks: { [taskId]: { completed: true, completedEditedAt: editTime } } }, { merge: true }));
    expect((await getDoc(reference)).data()!.tasks[taskId]).toMatchObject({
      title: false, completed: true, date: null, extra: true,
    });
  });

  it.each([
    { titleEditedAt: "bad" }, { titleEditedAt: deleteField() },
    { dateEditedAt: 42 }, { dateEditedAt: deleteField() },
    { completedEditedAt: null }, { completedEditedAt: deleteField() },
    { titleEditedAt: Timestamp.fromMillis(Date.now() + 600_000),
      dateEditedAt: Timestamp.fromMillis(Date.now() + 600_000),
      completedEditedAt: Timestamp.fromMillis(Date.now() + 600_000) },
  ])("requires valid concurrency timestamps on new tasks: %j", async (patch) => {
    const taskId = crypto.randomUUID();
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertFails(setDoc(reference, { operation: { type: "createTask", taskId }, tasks: { [taskId]: {
      title: "", completed: false, date: "2024-10-04",
      titleEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime, ...patch,
    } } }, { merge: true }));
  });
});
