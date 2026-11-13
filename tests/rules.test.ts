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
  title: "Buy milk", details: "", completed: false, date: "2024-10-04",
  titleEditedAt: oldTime, detailsEditedAt: oldTime, dateEditedAt: oldTime, completedEditedAt: oldTime,
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
        operation: { type: "SetTaskTitle", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { title: "Changed", titleEditedAt: editTime } },
      }, { merge: true }));
    }
    await assertFails(getDocs(collection(alice, "users")));
    await assertFails(deleteDoc(doc(alice, "users/alice")));
    await assertFails(setDoc(doc(alice, "users/alice/private/data"), { value: true }));
    const taskId = crypto.randomUUID();
    for (const db of [alice, anonymous]) {
      await assertFails(setDoc(doc(db, "users/bob"), {
        operation: { type: "CreateTask", taskId }, tasks: { [taskId]: {
          title: "", details: "", completed: false, date: "2024-10-04",
          titleEditedAt: editTime, detailsEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
        } },
      }));
    }
  });

  it.each([false, true])("deletes a task with completed=%s and rejects subsequent edits", async (completed) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    if (completed) await setDoc(reference, {
      operation: { type: "CompleteTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { completed: true, completedEditedAt: editTime } },
    }, { merge: true });
    await assertSucceeds(setDoc(reference, {
      operation: { type: "DeleteTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": deleteField() },
    }, { merge: true }));
    expect((await getDoc(reference)).data()).toEqual({
      futureField: true, operation: { type: "DeleteTask", taskId: "task.with.dots" }, tasks: { other: task },
    });
    for (const [type, patch] of [
      ["SetTaskTitle", { title: "Stale edit", titleEditedAt: editTime }],
      ["CompleteTask", { completed: true, completedEditedAt: editTime }],
      ["ReopenTask", { completed: false, completedEditedAt: editTime }],
      ["DeleteTask", deleteField()],
    ] as const) {
      await assertFails(setDoc(reference, {
        operation: { type, taskId: "task.with.dots" }, tasks: { "task.with.dots": patch },
      }, { merge: true }));
    }
    expect((await getDoc(reference)).data()!.tasks).toEqual({ other: task });
  });

  it("rejects task deletion by other users or without removing the specified task", async () => {
    for (const db of [environment.authenticatedContext("bob").firestore(), environment.unauthenticatedContext().firestore()]) {
      await assertFails(setDoc(doc(db, "users/alice"), {
        operation: { type: "DeleteTask", taskId: "task.with.dots" },
        tasks: { "task.with.dots": deleteField() },
      }, { merge: true }));
    }
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertFails(setDoc(reference, {
      operation: { type: "DeleteTask", taskId: "missing" }, tasks: { missing: deleteField() },
    }, { merge: true }));
    await assertFails(setDoc(reference, {
      operation: { type: "DeleteTask", taskId: "task.with.dots" }, tasks: { other: deleteField() },
    }, { merge: true }));
    expect((await getDoc(reference)).data()!.tasks).toEqual({ "task.with.dots": task, other: task });
  });

  it.each(["bob", "alice"])("creates a task in a missing or existing user document: %s", async (userId) => {
    const db = environment.authenticatedContext(userId).firestore();
    const reference = doc(db, "users", userId);
    const taskId = crypto.randomUUID();
    const created = { title: "", details: "", completed: false, date: "2024-10-04",
      titleEditedAt: editTime, detailsEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime };
    await assertSucceeds(setDoc(reference, {
      operation: { type: "CreateTask", taskId }, tasks: { [taskId]: created },
    }, { merge: true }));
    expect((await getDoc(reference)).data()!.tasks[taskId]).toEqual(created);
    await assertFails(setDoc(reference, {
      operation: { type: "CreateTask", taskId }, tasks: { [taskId]: { ...created, title: "Overwrite" } },
    }, { merge: true }));
  });

  it("creates the first task in a legacy document without a tasks field", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob"), { futureField: true });
    });
    const reference = doc(environment.authenticatedContext("bob").firestore(), "users/bob");
    const taskId = crypto.randomUUID();
    await assertSucceeds(setDoc(reference, {
      operation: { type: "CreateTask", taskId }, tasks: { [taskId]: {
        title: "", details: "", completed: false, date: "2024-10-04",
        titleEditedAt: editTime, detailsEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
      } },
    }, { merge: true }));
    expect((await getDoc(reference)).data()!.futureField).toBe(true);
  });

  it.each([
    ["SetTaskTitle", { title: "Buy bread", titleEditedAt: editTime }],
    ["SetTaskDetails", { details: "Two loaves", detailsEditedAt: editTime }],
    ["SetTaskDate", { date: "2024-10-05", dateEditedAt: editTime }],
    ["CompleteTask", { completed: true, completedEditedAt: editTime }],
    ["ReopenTask", { completed: false, completedEditedAt: editTime }],
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

  it("merges concurrent title, details, and date edits while preserving unknown fields", async () => {
    const first = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    const second = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await Promise.all([
      assertSucceeds(setDoc(second, { operation: { type: "SetTaskDetails", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { details: "Two loaves", detailsEditedAt: editTime } } }, { merge: true })),
      assertSucceeds(setDoc(first, { operation: { type: "SetTaskTitle", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime } } }, { merge: true })),
      assertSucceeds(setDoc(second, { operation: { type: "SetTaskDate", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { date: "2024-10-06", dateEditedAt: editTime } } }, { merge: true })),
    ]);
    expect((await getDoc(first)).data()).toEqual({
      futureField: true,
      operation: { type: expect.stringMatching(/^SetTask(Title|Details|Date)$/), taskId: "task.with.dots" },
      tasks: { other: task, "task.with.dots": {
        ...task, title: "Bread", details: "Two loaves", date: "2024-10-06",
        titleEditedAt: editTime,
        detailsEditedAt: editTime,
        dateEditedAt: editTime,
      } },
    });
  });

  it("allows concurrent creates without losing tasks", async () => {
    const taskIds = [crypto.randomUUID(), crypto.randomUUID()];
    await Promise.all(taskIds.map(async (taskId) => {
      const db = environment.authenticatedContext("alice").firestore();
      await assertSucceeds(setDoc(doc(db, "users/alice"), {
        operation: { type: "CreateTask", taskId }, tasks: { [taskId]: {
          title: "", details: "", completed: false, date: "2024-10-04",
          titleEditedAt: editTime, detailsEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
        } },
      }, { merge: true }));
    }));
    const data = (await getDoc(doc(environment.authenticatedContext("alice").firestore(), "users/alice"))).data()!;
    expect(Object.keys(data.tasks)).toHaveLength(4);
    expect(data.tasks.other).toEqual(task);
  });

  it.each([
    ["SetTaskTitle", "title", "Bread", "titleEditedAt"],
    ["SetTaskDetails", "details", "Two loaves", "detailsEditedAt"],
    ["SetTaskDate", "date", "2024-10-06", "dateEditedAt"],
    ["CompleteTask", "completed", true, "completedEditedAt"],
    ["ReopenTask", "completed", false, "completedEditedAt"],
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
          title: "Milk", details: "", completed: false, date: "2024-10-04", futureField: 42,
        } },
      });
    });
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    for (const [taskOperation, patch] of [
      ["SetTaskTitle", { title: "Bread", titleEditedAt: editTime }],
      ["SetTaskDate", { date: "2024-10-06", dateEditedAt: editTime }],
      ["CompleteTask", { completed: true, completedEditedAt: editTime }],
    ] as const) {
      await assertSucceeds(setDoc(reference, { operation: { type: taskOperation, taskId: "legacy" },
        tasks: { legacy: patch } }, { merge: true }));
    }
    expect((await getDoc(reference)).data()).toMatchObject({
      operation: { type: "CompleteTask", taskId: "legacy" },
      tasks: { legacy: { futureField: 42 } },
    });
  });

  it("allows independent title and date edits after another device completes the task", async () => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await setDoc(reference, { operation: { type: "CompleteTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { completed: true, completedEditedAt: editTime } } }, { merge: true });
    for (const [taskOperation, patch] of [
      ["SetTaskTitle", { title: "Bread", titleEditedAt: editTime }],
      ["SetTaskDate", { date: "2024-10-06", dateEditedAt: editTime }],
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
    { tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime }, other: deleteField() } },
    { tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime }, other: { title: "Other task" } } },
    { futureField: false },
    { newField: true },
  ])("trusts clients to scope document changes: %j", async (patch) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertSucceeds(setDoc(reference, {
      operation: { type: "SetTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { title: "Bread", titleEditedAt: editTime } },
      ...patch,
    }, { merge: true }));
  });

  it.each([
    { tasks: deleteField() },
    { tasks: { "task.with.dots": deleteField() } },
    { tasks: { other: { title: "Wrong target", titleEditedAt: editTime } } },
    { tasks: [] },
    { operation: { type: "SetTaskTitle", taskId: "" } },
    { operation: { type: "SetTaskTitle", taskId: 42 } },
    { operation: { type: "delete", taskId: "task.with.dots" } },
    { operation: deleteField() },
    { operation: null },
    { operation: [] },
    { operation: "SetTaskTitle" },
    { operation: {} },
    { operation: { taskId: "task.with.dots" } },
    { operation: { type: "SetTaskTitle" } },
    { operation: { type: 42, taskId: "task.with.dots" } },
  ])("rejects invalid operation metadata or target: %j", async (patch) => {
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertFails(setDoc(reference, {
      operation: { type: "SetTaskTitle", taskId: "task.with.dots" },
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
    await assertSucceeds(setDoc(reference, { operation: { type: "SetTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { ...task, title: "Bread", titleEditedAt: editTime } } }));
  });

  it("leaves date validation to the client on creation and editing", async () => {
    const date = "2026-02-29";
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    const taskId = crypto.randomUUID();
    await assertSucceeds(setDoc(reference, {
      operation: { type: "CreateTask", taskId },
      tasks: { [taskId]: {
        title: "", details: "", completed: false, date,
        titleEditedAt: editTime, detailsEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime,
      } },
    }, { merge: true }));
    await assertSucceeds(setDoc(reference, {
      operation: { type: "SetTaskDate", taskId: "task.with.dots" },
      tasks: { "task.with.dots": { date, dateEditedAt: editTime } },
    }, { merge: true }));
  });

  it.each([
    { titleEditedAt: "bad" }, { titleEditedAt: deleteField() },
    { detailsEditedAt: "bad" }, { detailsEditedAt: deleteField() },
    { dateEditedAt: 42 }, { dateEditedAt: deleteField() },
    { completedEditedAt: null }, { completedEditedAt: deleteField() },
    { titleEditedAt: Timestamp.fromMillis(Date.now() + 600_000),
      dateEditedAt: Timestamp.fromMillis(Date.now() + 600_000),
      completedEditedAt: Timestamp.fromMillis(Date.now() + 600_000) },
  ])("requires valid concurrency timestamps on new tasks: %j", async (patch) => {
    const taskId = crypto.randomUUID();
    const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
    await assertFails(setDoc(reference, { operation: { type: "CreateTask", taskId }, tasks: { [taskId]: {
      title: "", details: "", completed: false, date: "2024-10-04",
      titleEditedAt: editTime, detailsEditedAt: editTime, dateEditedAt: editTime, completedEditedAt: editTime, ...patch,
    } } }, { merge: true }));
  });

  describe("repeating tasks", () => {
    const schedule = { nextDate: "2026-01-31", interval: 1, intervalUnit: "Months", anchorDate: "2026-01-31" };
    const repeatingTask = {
      title: "Rent", details: "Pay landlord", schedule,
      titleEditedAt: oldTime, detailsEditedAt: oldTime, scheduleEditedAt: oldTime,
    };

    beforeEach(async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users/alice"), {
          repeatingTasks: { rent: repeatingTask },
        }, { merge: true });
      });
    });

    it.each(["titleEditedAt", "detailsEditedAt", "scheduleEditedAt"])(
      "requires a valid %s on repeating task creation", async (field) => {
        const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
        for (const time of [deleteField(), "invalid", null, Timestamp.fromMillis(-1),
          Timestamp.fromMillis(Date.now() + 600_000)]) {
          await assertFails(setDoc(reference, {
            operation: { type: "CreateRepeatingTask", repeatingTaskId: "new" },
            repeatingTasks: { new: { ...repeatingTask, [field]: time } },
          }, { merge: true }));
        }
        await assertSucceeds(setDoc(reference, {
          operation: { type: "CreateRepeatingTask", repeatingTaskId: "new" },
          repeatingTasks: { new: repeatingTask },
        }, { merge: true }));
      },
    );

    it.each([
      ["SetRepeatingTaskTitle", "title", "Apartment rent", "titleEditedAt"],
      ["SetRepeatingTaskDetails", "details", "Bank transfer", "detailsEditedAt"],
      ["SetRepeatingTaskSchedule", "schedule", { ...schedule, interval: 2 }, "scheduleEditedAt"],
    ])("rejects stale, equal, future, and invalid timestamps for %s", async (type, field, value, timestampField) => {
      const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
      for (const time of [Timestamp.fromMillis(oldTime.toMillis() - 1), oldTime,
        Timestamp.fromMillis(Date.now() + 600_000), "invalid", null, deleteField()]) {
        await assertFails(setDoc(reference, {
          operation: { type, repeatingTaskId: "rent" },
          repeatingTasks: { rent: { [field]: value, [timestampField]: time } },
        }, { merge: true }));
      }
      await assertSucceeds(setDoc(reference, {
        operation: { type, repeatingTaskId: "rent" },
        repeatingTasks: { rent: { [field]: value, [timestampField]: editTime } },
      }, { merge: true }));
    });

    it("requires the created task to exist before advancing", async () => {
      const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
      const advance = {
        operation: { type: "AdvanceRepeatingTask", repeatingTaskId: "rent", createdTaskId: "created", scheduleEditedAt: oldTime },
        repeatingTasks: { rent: { schedule: { nextDate: "2026-02-28" } } },
      };
      await assertFails(setDoc(reference, advance, { merge: true }));
      expect((await getDoc(reference)).data()!.repeatingTasks.rent).toEqual(repeatingTask);

      await assertSucceeds(setDoc(reference, {
        operation: { type: "CreateTask", taskId: "created" },
        tasks: { created: task },
      }, { merge: true }));
      await assertSucceeds(setDoc(reference, advance, { merge: true }));
      expect((await getDoc(reference)).data()!.repeatingTasks.rent).toEqual({
        ...repeatingTask, schedule: { ...schedule, nextDate: "2026-02-28" },
      });
    });

    it.each(["2026-01-30", "2026-01-31"])("rejects advancement to an earlier or unchanged date: %s", async (nextDate) => {
      const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
      const operation = {
        type: "AdvanceRepeatingTask", repeatingTaskId: "rent", createdTaskId: "other", scheduleEditedAt: oldTime,
      };
      await assertFails(setDoc(reference, {
        operation, repeatingTasks: { rent: { schedule: { nextDate } } },
      }, { merge: true }));
      expect((await getDoc(reference)).data()!.repeatingTasks.rent).toEqual(repeatingTask);
      await assertSucceeds(setDoc(reference, {
        operation, repeatingTasks: { rent: { schedule: { nextDate: "2026-02-28" } } },
      }, { merge: true }));
    });

    it("rejects an old schedule version even when its next date is unchanged", async () => {
      const reference = doc(environment.authenticatedContext("alice").firestore(), "users/alice");
      await assertSucceeds(setDoc(reference, {
        operation: { type: "SetRepeatingTaskSchedule", repeatingTaskId: "rent" },
        repeatingTasks: { rent: { schedule: { ...schedule, interval: 2 }, scheduleEditedAt: editTime } },
      }, { merge: true }));
      const advance = {
        operation: { type: "AdvanceRepeatingTask", repeatingTaskId: "rent", createdTaskId: "other", scheduleEditedAt: oldTime },
        repeatingTasks: { rent: { schedule: { nextDate: "2026-03-31" } } },
      };
      await assertFails(setDoc(reference, advance, { merge: true }));
      expect((await getDoc(reference)).data()!.repeatingTasks.rent).toEqual({
        ...repeatingTask, schedule: { ...schedule, interval: 2 }, scheduleEditedAt: editTime,
      });
      await assertSucceeds(setDoc(reference, {
        ...advance, operation: { ...advance.operation, scheduleEditedAt: editTime },
      }, { merge: true }));
      expect((await getDoc(reference)).data()!.repeatingTasks.rent).toEqual({
        ...repeatingTask, schedule: { ...schedule, interval: 2, nextDate: "2026-03-31" }, scheduleEditedAt: editTime,
      });
    });
  });

});
