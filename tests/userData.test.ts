import {
  doc,
  deleteField,
  getFirestore,
  setDoc,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { onSnapshotAfterWaitingForServer } from "../src/firestore";
import { nextOccurrenceDate } from "../src/repeatingTask";
import { decodeTaskDate, taskDateToday } from "../src/taskDate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeTask,
  createRepeatingTask,
  createTasksFromRepeatingTasks,
  createTask,
  deleteRepeatingTask,
  deleteTask,
  reopenTask,
  setRepeatingTaskSchedule,
  setRepeatingTaskDetails,
  setRepeatingTaskTitle,
  setTaskDate,
  setTaskDetails,
  setTaskTitle,
  subscribeUserData,
  type UserData,
} from "../src/userData";

vi.mock("../src/firestore", () => ({ onSnapshotAfterWaitingForServer: vi.fn() }));

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  doc: vi.fn(),
  getFirestore: vi.fn(),
  setDoc: vi.fn(),
}));

describe("User data: task creation", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  const task = { title: "Groceries", details: "Buy milk", date: decodeTaskDate("2026-11-12") };

  it("creates a task with the specified ID in the user's document", async () => {
    await expect(createTask("alice", "first", task.title, task.details, task.date)).resolves.toBeUndefined();

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "CreateTask", taskId: "first" },
      tasks: {
        first: {
          ...task, completed: false,
          titleEditedAt: expect.any(Timestamp),
          detailsEditedAt: expect.any(Timestamp),
          dateEditedAt: expect.any(Timestamp),
          completedEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
  });

  it("uses the client clock for creation and subsequent edits", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await createTask("alice", "first", task.title, task.details, task.date);
      const created = vi.mocked(setDoc).mock.calls[0]![1];
      expect(created).toMatchObject({
        tasks: {
          first: {
            titleEditedAt: Timestamp.fromMillis(now),
            detailsEditedAt: Timestamp.fromMillis(now),
            dateEditedAt: Timestamp.fromMillis(now),
            completedEditedAt: Timestamp.fromMillis(now),
          }
        }
      });

      clock.mockReturnValue(now + 1_000);
      await setTaskTitle("alice", "first", "Bread");
      expect(vi.mocked(setDoc).mock.calls[1]![1]).toMatchObject({
        tasks: {
          first: {
            titleEditedAt: Timestamp.fromMillis(now + 1_000),
          }
        }
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("propagates asynchronous write failures and allows further writes", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(createTask("alice", "first", task.title, task.details, task.date)).rejects.toBe(error);
    await expect(createTask("alice", "second", task.title, task.details, task.date)).resolves.toBeUndefined();
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("propagates immediate write failures as promise rejections", async () => {
    const error = new Error("Invalid write");
    vi.mocked(setDoc).mockImplementationOnce(() => { throw error; });

    await expect(createTask("alice", "first", task.title, task.details, task.date)).rejects.toBe(error);
  });
});

describe("User data: task deletion", () => {
  it("removes the specified literal task ID and propagates write failures", async () => {
    vi.resetAllMocks();
    const firestore = {} as Firestore;
    const userDocument = {} as DocumentReference;
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    await expect(deleteTask("alice", "task.with.dots")).resolves.toBeUndefined();
    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "DeleteTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": deleteField() },
    }, { merge: true });

    const error = new Error("Delete failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);
    await expect(deleteTask("alice", "first")).rejects.toBe(error);
  });
});

describe("User data: repeating task operations", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  it("creates a repeating task as its own resource", async () => {
    const date = decodeTaskDate("2026-11-12");
    const schedule = { nextDate: date, anchorDate: date, interval: 2, intervalUnit: "Weeks" as const };
    await createRepeatingTask("alice", "repeating.task.with.dots", "Laundry", "Sheets", schedule);
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "CreateRepeatingTask", repeatingTaskId: "repeating.task.with.dots" },
      repeatingTasks: {
        "repeating.task.with.dots": {
          title: "Laundry", details: "Sheets", schedule,
          titleEditedAt: expect.any(Timestamp),
          detailsEditedAt: expect.any(Timestamp),
          scheduleEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
  });

  it("writes repeating task title, details, and schedule as separate operations", async () => {
    const schedule = {
      nextDate: decodeTaskDate("2026-01-31"), interval: 1, intervalUnit: "Months" as const, anchorDate: decodeTaskDate("2026-01-31"),
    };
    await setRepeatingTaskTitle("alice", "repeating-task", "Rent");
    await setRepeatingTaskDetails("alice", "repeating-task", "Pay landlord");
    await setRepeatingTaskSchedule("alice", "repeating-task", schedule);
    await deleteRepeatingTask("alice", "repeating-task");
    expect(setDoc).toHaveBeenNthCalledWith(1, userDocument, {
      operation: { type: "SetRepeatingTaskTitle", repeatingTaskId: "repeating-task" },
      repeatingTasks: { "repeating-task": { title: "Rent", titleEditedAt: expect.any(Timestamp) } },
    }, { merge: true });
    expect(setDoc).toHaveBeenNthCalledWith(2, userDocument, {
      operation: { type: "SetRepeatingTaskDetails", repeatingTaskId: "repeating-task" },
      repeatingTasks: { "repeating-task": { details: "Pay landlord", detailsEditedAt: expect.any(Timestamp) } },
    }, { merge: true });
    expect(setDoc).toHaveBeenNthCalledWith(3, userDocument, {
      operation: { type: "SetRepeatingTaskSchedule", repeatingTaskId: "repeating-task" },
      repeatingTasks: { "repeating-task": { schedule, scheduleEditedAt: expect.any(Timestamp) } },
    }, { merge: true });
    expect(setDoc).toHaveBeenNthCalledWith(4, userDocument, {
      operation: { type: "DeleteRepeatingTask", repeatingTaskId: "repeating-task" },
      repeatingTasks: { "repeating-task": deleteField() },
    }, { merge: true });
  });

  it("creates a task for an occurrence with its own ID and advances the repeating task separately", async () => {
    const schedule = {
      nextDate: taskDateToday(), interval: 1, intervalUnit: "Months" as const, anchorDate: taskDateToday(),
    };
    const repeatingTask = {
      title: "Rent", details: "Pay landlord", schedule, scheduleEditedAt: Timestamp.fromMillis(1000),
    };
    await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { "repeating.task.with.dots": repeatingTask } });
    const taskId = (vi.mocked(setDoc).mock.calls[0]![1] as DocumentData).operation.taskId as string;
    expect(taskId).toEqual(expect.any(String));
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenNthCalledWith(1, userDocument, {
      operation: { type: "CreateTask", taskId },
      tasks: {
        [taskId]: {
          title: "Rent", details: "Pay landlord", completed: false, date: taskDateToday(),
          titleEditedAt: expect.any(Timestamp), detailsEditedAt: expect.any(Timestamp),
          completedEditedAt: expect.any(Timestamp), dateEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
    expect(setDoc).toHaveBeenNthCalledWith(2, userDocument, {
      operation: {
        type: "AdvanceRepeatingTask", repeatingTaskId: "repeating.task.with.dots", createdTaskId: taskId,
        scheduleEditedAt: repeatingTask.scheduleEditedAt,
      },
      repeatingTasks: { "repeating.task.with.dots": { schedule: { nextDate: nextOccurrenceDate(schedule) } } },
    }, { merge: true });
  });
});

describe("User data: task title editing", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  it("targets only the selected task's title, treating the ID as a literal map key", async () => {
    await expect(setTaskTitle("alice", "task.with.dots", "Buy bread")).resolves.toBeUndefined();

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "SetTaskTitle", taskId: "task.with.dots" },
      tasks: {
        "task.with.dots": {
          title: "Buy bread",
          titleEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
  });

  it("propagates write failures and allows further edits", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(setTaskTitle("alice", "first", "Buy bread")).rejects.toBe(error);
    await expect(setTaskTitle("alice", "first", "Buy eggs")).resolves.toBeUndefined();
  });

  it("propagates immediate write failures as promise rejections", async () => {
    const error = new Error("Invalid write");
    vi.mocked(setDoc).mockImplementationOnce(() => { throw error; });

    await expect(setTaskTitle("alice", "first", "Buy bread")).rejects.toBe(error);
  });
});

describe("User data: task details editing", () => {
  it("merges only details and their edit timestamp, including clearing details", async () => {
    vi.resetAllMocks();
    const reference = {} as DocumentReference;
    vi.mocked(doc).mockReturnValue(reference);
    vi.mocked(setDoc).mockResolvedValue(undefined);
    for (const details of ["Whole grain\nTwo loaves", ""]) {
      await setTaskDetails("alice", "task.with.dots", details);
      expect(setDoc).toHaveBeenLastCalledWith(reference, {
        operation: { type: "SetTaskDetails", taskId: "task.with.dots" },
        tasks: { "task.with.dots": { details, detailsEditedAt: expect.any(Timestamp) } },
      }, { merge: true });
    }
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);
    await expect(setTaskDetails("alice", "first", "Bread")).rejects.toBe(error);
  });
});

describe("User data: task date editing", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  it("merges only the selected task's date", async () => {
    await setTaskDate("alice", "task.with.dots", decodeTaskDate("2026-10-04"));

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "SetTaskDate", taskId: "task.with.dots" },
      tasks: {
        "task.with.dots": {
          date: "2026-10-04",
          dateEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
  });

  it("propagates write failures", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);
    await expect(setTaskDate("alice", "first", decodeTaskDate("2026-10-04"))).rejects.toBe(error);
  });
});

describe("User data: task completion", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  it("targets only the selected task's completed flag, treating the ID as a literal map key", async () => {
    await expect(completeTask("alice", "task.with.dots")).resolves.toBeUndefined();

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "CompleteTask", taskId: "task.with.dots" },
      tasks: {
        "task.with.dots": {
          completed: true,
          completedEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
  });

  it("propagates write failures and allows another attempt", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(completeTask("alice", "first")).rejects.toBe(error);
    await expect(completeTask("alice", "first")).resolves.toBeUndefined();
  });
});

describe("User data: task reopening", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  it("targets only the selected task's completed flag, treating the ID as a literal map key", async () => {
    await expect(reopenTask("alice", "task.with.dots")).resolves.toBeUndefined();

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "ReopenTask", taskId: "task.with.dots" },
      tasks: {
        "task.with.dots": {
          completed: false,
          completedEditedAt: expect.any(Timestamp),
        }
      },
    }, { merge: true });
  });

  it("propagates write failures and allows another attempt", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(reopenTask("alice", "first")).rejects.toBe(error);
    await expect(reopenTask("alice", "first")).resolves.toBeUndefined();
  });
});

describe("User data: subscription", () => {
  const firestore = {} as Firestore;
  const userDocument = {} as DocumentReference;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(firestore);
    vi.mocked(doc).mockReturnValue(userDocument);
  });

  it("subscribes to the specified user's document and returns its cleanup", () => {
    const unsubscribe = vi.fn();
    vi.mocked(onSnapshotAfterWaitingForServer).mockReturnValue(unsubscribe);
    const onUserData = vi.fn();
    const onError = vi.fn();

    expect(subscribeUserData("alice", onUserData, onError)).toBe(unsubscribe);
    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(onSnapshotAfterWaitingForServer).toHaveBeenCalledExactlyOnceWith(
      userDocument, expect.any(Function), onError,
    );
  });

  it("reads task IDs and titles and follows subsequent snapshots", () => {
    const onUserData = vi.fn();
    subscribeUserData("alice", onUserData, vi.fn());
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({
        operation: { type: "SetTaskTitle", taskId: "first" },
        futureField: { enabled: true }, tasks: {
          first: {
            title: "Buy milk", details: "Whole milk", completed: false, date: "2026-10-04",
            titleEditedAt: Timestamp.now(),
          },
          second: { title: "Walk dog", details: "", completed: false, date: "2026-10-04" },
        }
      })
    } as unknown as DocumentSnapshot);
    expect(onUserData).toHaveBeenLastCalledWith({
      tasks: {
        first: { title: "Buy milk", details: "Whole milk", completedAt: null, date: "2026-10-04" },
        second: { title: "Walk dog", details: "", completedAt: null, date: "2026-10-04" },
      }, repeatingTasks: {},
    });

    receive({
      data: () => ({ tasks: { second: { title: "Walk dog again", details: "", completed: false, date: "2026-10-04" } } }),
    } as unknown as DocumentSnapshot);
    expect(onUserData).toHaveBeenLastCalledWith({ tasks: { second: { title: "Walk dog again", details: "", completedAt: null, date: "2026-10-04" } }, repeatingTasks: {} });
  });

  it("reads incomplete and completed tasks", () => {
    const completedAt = Timestamp.fromMillis(1000);
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({
        tasks: {
          incomplete: { title: "Walk dog", details: "", completed: false, date: "2026-10-04" },
          completed: { title: "Buy bread", details: "", completed: true, date: "2026-10-04", completedEditedAt: completedAt },
        }
      }),
    } as unknown as DocumentSnapshot);

    expect(onUserData).toHaveBeenCalledExactlyOnceWith({
      tasks: {
        incomplete: { title: "Walk dog", details: "", completedAt: null, date: "2026-10-04" },
        completed: { title: "Buy bread", details: "", date: "2026-10-04", completedAt },
      }, repeatingTasks: {}
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("decodes repeating tasks independently from tasks", () => {
    const scheduleEditedAt = Timestamp.fromMillis(1000);
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;
    receive({
      data: () => ({
        repeatingTasks: {
          rent: {
            title: "Rent", details: "Pay landlord",
            schedule: { nextDate: "2026-01-31", interval: 1, intervalUnit: "Months", anchorDate: "2026-01-31" }, scheduleEditedAt,
          }
        }
      })
    } as unknown as DocumentSnapshot);

    expect(onUserData).toHaveBeenCalledExactlyOnceWith({
      tasks: {}, repeatingTasks: {
        rent: {
          title: "Rent", details: "Pay landlord",
          schedule: { nextDate: "2026-01-31", interval: 1, intervalUnit: "Months", anchorDate: "2026-01-31" }, scheduleEditedAt,
        }
      }
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reads completion timestamps and follows reopening and completion snapshots", () => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    for (const [completed, milliseconds] of [[true, 1000], [false, 2000], [true, 3000]] as const) {
      const task = {
        title: "Buy bread", details: "", completed, date: "2026-10-04",
        completedEditedAt: Timestamp.fromMillis(milliseconds),
      };
      receive({ data: () => ({ tasks: { first: task } }) } as unknown as DocumentSnapshot);
      expect(onUserData).toHaveBeenLastCalledWith({
        tasks: {
          first: {
            title: "Buy bread", details: "", date: "2026-10-04",
            completedAt: completed ? Timestamp.fromMillis(milliseconds) : null,
          }
        }, repeatingTasks: {}
      });
    }
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, [], {}])("rejects invalid details: %j", (details) => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as (snapshot: DocumentSnapshot) => void;
    receive({
      data: () => ({
        tasks: {
          first: {
            title: "Bread", details, completed: false, date: "2026-10-04",
          }
        }
      })
    } as unknown as DocumentSnapshot);
    expect(onUserData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("Invalid task first"));
  });

  it.each([null, undefined, 42, "2026-10-05", { seconds: 1000, nanoseconds: 0 }])(
    "rejects an invalid completion timestamp: %j",
    (completedEditedAt) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;

      receive({
        data: () => ({
          tasks: {
            first: {
              title: "Buy bread", details: "", completed: true, date: "2026-10-04", completedEditedAt,
            }
          }
        })
      } as unknown as DocumentSnapshot);

      expect(onUserData).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("Invalid task first: invalid completion timestamp"));
    },
  );

  it("rejects a completed task without a completion timestamp", () => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({
        tasks: {
          first: {
            title: "Buy bread", details: "", completed: true, date: "2026-10-04",
          }
        }
      })
    } as unknown as DocumentSnapshot);

    expect(onUserData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("Invalid task first: invalid completion timestamp"));
  });

  it.each([undefined, {}, { tasks: {} }, { futureField: true }])(
    "reads empty user data for a missing document or tasks field: %j",
    (data) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;

      receive({ data: () => data } as unknown as DocumentSnapshot);

      expect(onUserData).toHaveBeenCalledExactlyOnceWith({ tasks: {}, repeatingTasks: {} });
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], 42, { tasks: null }, { tasks: [] }, { tasks: 42 }, { tasks: undefined }, { repeatingTasks: null }, { repeatingTasks: [] }])(
    "reports malformed data without publishing an empty replacement: %j",
    (data) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;

      receive({ data: () => data } as unknown as DocumentSnapshot);

      expect(onUserData).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    },
  );

  it.each([
    { title: "Buy milk", details: "", completed: false },
    { title: "Buy milk", details: "", completed: false, date: undefined },
    { title: "Buy milk", details: "", completed: false, date: null },
    { title: "Buy milk", details: "", completed: false, date: 42 },
    {}, { title: 42, details: "", completed: false, date: "2026-10-04" }, { title: "Buy milk", details: "", date: "2026-10-04" },
    { title: "Buy milk", details: "", completed: "true", date: "2026-10-04" },
    { title: "Buy milk", details: "", completed: null, date: "2026-10-04" }, { title: "Buy milk", details: "", completed: undefined, date: "2026-10-04" },
    null, Object.assign([], { title: "Invalid array" })])(
      "rejects a malformed task and resumes publishing when data becomes readable: %j",
      (task) => {
        const onUserData = vi.fn();
        const onError = vi.fn();
        subscribeUserData("alice", onUserData, onError);
        const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
          (snapshot: DocumentSnapshot) => void;
        const valid = { tasks: { valid: { title: "Buy milk", details: "", completed: false, date: "2026-10-04" } } };

        receive({ data: () => valid } as unknown as DocumentSnapshot);
        receive({
          data: () => ({
            tasks: {
              valid: { title: "Changed title", details: "", completed: false, date: "2026-10-04" },
              malformed: task,
            }
          })
        } as unknown as DocumentSnapshot);

        expect(onUserData).toHaveBeenCalledExactlyOnceWith({
          tasks: {
            valid: { title: "Buy milk", details: "", date: "2026-10-04", completedAt: null },
          }, repeatingTasks: {}
        });
        expect(onError).toHaveBeenCalledExactlyOnceWith(new Error(
          "Invalid task malformed",
        ));

        receive({ data: () => ({ tasks: {} }) } as unknown as DocumentSnapshot);

        expect(onUserData).toHaveBeenCalledTimes(2);
        expect(onUserData).toHaveBeenLastCalledWith({ tasks: {}, repeatingTasks: {} });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(setDoc).not.toHaveBeenCalled();
      },
    );

  it.each(["2026-02-30", "10/04/2026", ""])("reports the task ID and date requirement for invalid date %j", (date) => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({ tasks: { malformed: { title: "Buy milk", details: "", completed: false, date } } }),
    } as unknown as DocumentSnapshot);

    expect(onUserData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error(
      "Invalid task malformed: invalid date",
    ));
  });

  it("does not report consumer exceptions as malformed data", () => {
    const error = new Error("Consumer failed");
    const onUserData = vi.fn(() => { throw error; });
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    expect(() => receive({ data: () => ({}) } as DocumentSnapshot)).toThrow(error);
    expect(onError).not.toHaveBeenCalled();
  });

  function decodeRepeatingTaskForTest(data: unknown) {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshotAfterWaitingForServer).mock.lastCall![1] as (snapshot: DocumentSnapshot) => void;
    receive({ data: () => ({ repeatingTasks: { test: data } }) } as unknown as DocumentSnapshot);
    if (onError.mock.calls.length) throw onError.mock.calls[0]![0];
    return onUserData.mock.calls[0]![0].repeatingTasks.test;
  }

  const validRepeatingTask = {
    title: "",
    details: "",
    schedule: {
      nextDate: "2026-01-01",
      interval: 1,
      intervalUnit: "Days",
      anchorDate: "2026-01-01",
    },
    scheduleEditedAt: Timestamp.fromMillis(0),
  };

  it.each([
    [{ schedule: undefined }, "Invalid schedule: not a record"],
    [{ schedule: [] }, "Invalid schedule: not a record"],
    [{ scheduleEditedAt: undefined }, "Invalid repeating task test: invalid schedule timestamp"],
    [{ scheduleEditedAt: { seconds: 1, nanoseconds: 0 } }, "Invalid repeating task test: invalid schedule timestamp"],
    [{ schedule: { ...validRepeatingTask.schedule, nextDate: undefined } }, "Invalid schedule: invalid next date"],
    [{ schedule: { ...validRepeatingTask.schedule, nextDate: "2026-02-30" } }, "Invalid schedule: invalid next date"],
    [{ schedule: { ...validRepeatingTask.schedule, anchorDate: null } }, "Invalid schedule: invalid anchor date"],
  ])("rejects invalid repeating task fields: %j", (patch, message) => {
    expect(() => decodeRepeatingTaskForTest({ ...validRepeatingTask, ...patch })).toThrow(message);
  });

  it.each([["Days", 366], ["Weeks", 53], ["Months", 13], ["Years", 2], ["Days", 0], ["Days", 1.5], ["Days", -1]])(
    "rejects an invalid interval %s %s", (intervalUnit, interval) => {
      expect(() => decodeRepeatingTaskForTest({ ...validRepeatingTask, schedule: { ...validRepeatingTask.schedule, intervalUnit, interval } })).toThrow();
    },
  );

  it.each(["Days", "Weeks", "Months", "Years"])("decodes valid interval units: %s", (intervalUnit) => {
    const repeatingTask = { ...validRepeatingTask, schedule: { ...validRepeatingTask.schedule, intervalUnit } };
    expect(decodeRepeatingTaskForTest(repeatingTask)).toEqual(repeatingTask);
    expect(() => decodeRepeatingTaskForTest({ ...repeatingTask, schedule: { ...repeatingTask.schedule, intervalUnit: intervalUnit.toLowerCase() } }))
      .toThrow("Invalid schedule: invalid unit");
  });

  it("rejects unknown units and invalid dates", () => {
    expect(() => decodeRepeatingTaskForTest({ ...validRepeatingTask, schedule: { ...validRepeatingTask.schedule, intervalUnit: "fortnights" } }))
      .toThrow("Invalid schedule: invalid unit");
    expect(() => decodeRepeatingTaskForTest({ ...validRepeatingTask, schedule: { ...validRepeatingTask.schedule, anchorDate: "2026-02-29" } }))
      .toThrow("Invalid schedule: invalid anchor date");
  });
});

describe("User data: tasks from repeating tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 12));
    vi.mocked(setDoc).mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

  it("creates all due occurrences through today and preserves the monthly anchor", async () => {
    const repeatingTask = {
      title: "Rent", details: "Pay landlord",
      schedule: {
        nextDate: decodeTaskDate("2026-01-31"), interval: 1, intervalUnit: "Months" as const, anchorDate: decodeTaskDate("2026-01-31"),
      },
      scheduleEditedAt: Timestamp.now(),
    };

    await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } });

    expect(setDoc).toHaveBeenCalledTimes(6);
    const taskIds = new Set<string>();
    for (const [index, date] of ["2026-01-31", "2026-02-28", "2026-03-31"].entries()) {
      const creation = vi.mocked(setDoc).mock.calls[index * 2]![1] as DocumentData;
      const advancement = vi.mocked(setDoc).mock.calls[index * 2 + 1]![1];
      const taskId = creation.operation.taskId as string;
      taskIds.add(taskId);
      expect(creation).toMatchObject({
        operation: { type: "CreateTask", taskId },
        tasks: { [taskId]: { title: "Rent", details: "Pay landlord", date, completed: false } },
      });
      expect(advancement).toEqual({
        operation: { type: "AdvanceRepeatingTask", repeatingTaskId: "rent", createdTaskId: taskId, scheduleEditedAt: repeatingTask.scheduleEditedAt },
        repeatingTasks: { rent: { schedule: { nextDate: ["2026-02-28", "2026-03-31", "2026-04-30"][index] } } },
      });
    }
    expect(taskIds.size).toBe(3);
    expect(repeatingTask.schedule.nextDate).toBe("2026-01-31");
  });

  it("queues all occurrences and advancements before server acknowledgement", async () => {
    let finishCreation!: () => void;
    let finishAdvancement!: () => void;
    const creation = new Promise<void>((resolve) => { finishCreation = resolve; });
    const advancement = new Promise<void>((resolve) => { finishAdvancement = resolve; });
    vi.mocked(setDoc).mockReturnValueOnce(creation).mockReturnValueOnce(advancement);
    const processing = createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { walk: {
      title: "Walk", details: "",
      schedule: {
        nextDate: decodeTaskDate("2026-03-30"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-03-30"),
      },
      scheduleEditedAt: Timestamp.now(),
    } } });

    expect(setDoc).toHaveBeenCalledTimes(4);
    finishCreation();
    finishAdvancement();
    await processing;
    expect(vi.mocked(setDoc).mock.calls.map(([, data]) => (data as DocumentData).operation.type)).toEqual([
      "CreateTask", "AdvanceRepeatingTask", "CreateTask", "AdvanceRepeatingTask",
    ]);
  });

  it.each(["creation", "advancement"])("reports a %s failure after queuing all writes", async (failure) => {
    const data: UserData = { tasks: {}, repeatingTasks: { walk: {
      title: "Walk", details: "",
      schedule: {
        nextDate: decodeTaskDate("2026-03-29"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-03-29"),
      },
      scheduleEditedAt: Timestamp.now(),
    } } };
    const error = new Error("Write rejected");
    if (failure === "advancement") vi.mocked(setDoc).mockResolvedValueOnce(undefined);
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(createTasksFromRepeatingTasks("alice", data)).rejects.toBe(error);

    expect(setDoc).toHaveBeenCalledTimes(6);
  });
});
