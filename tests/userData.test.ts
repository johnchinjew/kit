import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { decodeTaskDate, taskDateToday } from "../src/taskDate";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeTask, createTask, reopenTask, setTaskDate, setTaskTitle, subscribeUserData } from "../src/userData";

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  doc: vi.fn(),
  getFirestore: vi.fn(),
  onSnapshot: vi.fn(),
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

  it("creates an empty task with the specified ID in the user's document", async () => {
    await expect(createTask("alice", "first")).resolves.toBeUndefined();

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      operation: { type: "createTask", taskId: "first" },
      tasks: { first: {
        title: "", completed: false, date: taskDateToday(),
        titleEditedAt: expect.any(Timestamp),
        dateEditedAt: expect.any(Timestamp),
        completedEditedAt: expect.any(Timestamp),
      } },
    }, { merge: true });
  });

  it("uses the client clock for creation and subsequent edits", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await createTask("alice", "first");
      const created = vi.mocked(setDoc).mock.calls[0]![1];
      expect(created).toMatchObject({ tasks: { first: {
        titleEditedAt: Timestamp.fromMillis(now),
        dateEditedAt: Timestamp.fromMillis(now),
        completedEditedAt: Timestamp.fromMillis(now),
      } } });

      clock.mockReturnValue(now + 1_000);
      await setTaskTitle("alice", "first", "Bread");
      expect(vi.mocked(setDoc).mock.calls[1]![1]).toMatchObject({ tasks: { first: {
        titleEditedAt: Timestamp.fromMillis(now + 1_000),
      } } });
    } finally {
      clock.mockRestore();
    }
  });

  it("propagates asynchronous write failures and allows further writes", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(createTask("alice", "first")).rejects.toBe(error);
    await expect(createTask("alice", "second")).resolves.toBeUndefined();
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("propagates immediate write failures as promise rejections", async () => {
    const error = new Error("Invalid write");
    vi.mocked(setDoc).mockImplementationOnce(() => { throw error; });

    await expect(createTask("alice", "first")).rejects.toBe(error);
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
      operation: { type: "setTaskTitle", taskId: "task.with.dots" },
      tasks: { "task.with.dots": {
        title: "Buy bread",
        titleEditedAt: expect.any(Timestamp),
      } },
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
      operation: { type: "setTaskDate", taskId: "task.with.dots" },
      tasks: { "task.with.dots": {
        date: "2026-10-04",
        dateEditedAt: expect.any(Timestamp),
      } },
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
      operation: { type: "completeTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": {
        completed: true,
        completedEditedAt: expect.any(Timestamp),
      } },
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
      operation: { type: "reopenTask", taskId: "task.with.dots" },
      tasks: { "task.with.dots": {
        completed: false,
        completedEditedAt: expect.any(Timestamp),
      } },
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
    vi.mocked(onSnapshot).mockReturnValue(unsubscribe);
    const onUserData = vi.fn();
    const onError = vi.fn();

    expect(subscribeUserData("alice", onUserData, onError)).toBe(unsubscribe);
    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith(
      userDocument, expect.any(Function), onError,
    );
  });

  it("reads task IDs and titles and follows subsequent snapshots", () => {
    const onUserData = vi.fn();
    subscribeUserData("alice", onUserData, vi.fn());
    const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({
        operation: { type: "setTaskTitle", taskId: "first" },
        futureField: { enabled: true }, tasks: {
          first: {
            title: "Buy milk", completed: false, date: "2026-10-04",
            titleEditedAt: Timestamp.now(),
            details: "Whole milk",
          },
          second: { title: "Walk dog", completed: false, date: "2026-10-04" },
        }
      })
    } as unknown as DocumentSnapshot);
    expect(onUserData).toHaveBeenLastCalledWith({
      tasks: {
        first: { title: "Buy milk", completedAt: null, date: "2026-10-04" },
        second: { title: "Walk dog", completedAt: null, date: "2026-10-04" },
      }
    });

    receive({
      data: () => ({ tasks: { second: { title: "Walk dog again", completed: false, date: "2026-10-04" } } }),
    } as unknown as DocumentSnapshot);
    expect(onUserData).toHaveBeenLastCalledWith({ tasks: { second: { title: "Walk dog again", completedAt: null, date: "2026-10-04" } } });
  });

  it("reads incomplete and completed tasks", () => {
    const completedAt = Timestamp.fromMillis(1000);
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({ tasks: {
        incomplete: { title: "Walk dog", completed: false, date: "2026-10-04" },
        completed: { title: "Buy bread", completed: true, date: "2026-10-04", completedEditedAt: completedAt },
      } }),
    } as unknown as DocumentSnapshot);

    expect(onUserData).toHaveBeenCalledExactlyOnceWith({ tasks: {
      incomplete: { title: "Walk dog", completedAt: null, date: "2026-10-04" },
      completed: { title: "Buy bread", date: "2026-10-04", completedAt },
    } });
    expect(onError).not.toHaveBeenCalled();
  });

  it("reads completion timestamps and follows reopening and completion snapshots", () => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    for (const [completed, milliseconds] of [[true, 1000], [false, 2000], [true, 3000]] as const) {
      const task = {
        title: "Buy bread", completed, date: "2026-10-04",
        completedEditedAt: Timestamp.fromMillis(milliseconds),
      };
      receive({ data: () => ({ tasks: { first: task } }) } as unknown as DocumentSnapshot);
      expect(onUserData).toHaveBeenLastCalledWith({ tasks: { first: {
        title: "Buy bread", date: "2026-10-04",
        completedAt: completed ? Timestamp.fromMillis(milliseconds) : null,
      } } });
    }
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 42, "2026-10-05", { seconds: 1000, nanoseconds: 0 }])(
    "rejects an invalid completion timestamp: %j",
    (completedEditedAt) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;

      receive({ data: () => ({ tasks: { first: {
        title: "Buy bread", completed: true, date: "2026-10-04", completedEditedAt,
      } } }) } as unknown as DocumentSnapshot);

      expect(onUserData).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("Invalid task first: invalid completion timestamp"));
    },
  );

  it("rejects a completed task without a completion timestamp", () => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({ data: () => ({ tasks: { first: {
      title: "Buy bread", completed: true, date: "2026-10-04",
    } } }) } as unknown as DocumentSnapshot);

    expect(onUserData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("Invalid task first: invalid completion timestamp"));
  });

  it.each([undefined, {}, { tasks: {} }, { futureField: true }])(
    "reads empty user data for a missing document or tasks field: %j",
    (data) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;

      receive({ data: () => data } as unknown as DocumentSnapshot);

      expect(onUserData).toHaveBeenCalledExactlyOnceWith({ tasks: {} });
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each([null, [], 42, { tasks: null }, { tasks: [] }, { tasks: 42 }, { tasks: undefined }])(
    "reports malformed data without publishing an empty replacement: %j",
    (data) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;

      receive({ data: () => data } as unknown as DocumentSnapshot);

      expect(onUserData).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    },
  );

  it.each([{}, { title: 42, completed: false, date: "2026-10-04" }, { title: "Buy milk", date: "2026-10-04" },
    { title: "Buy milk", completed: false },
    { title: "Buy milk", completed: false, date: undefined },
    { title: "Buy milk", completed: "true", date: "2026-10-04" },
    { title: "Buy milk", completed: null, date: "2026-10-04" }, { title: "Buy milk", completed: undefined, date: "2026-10-04" },
    { title: "Buy milk", completed: false, date: null },
    { title: "Buy milk", completed: false, date: 42 },
    null, Object.assign([], { title: "Invalid array" })])(
    "rejects a malformed task and resumes publishing when data becomes readable: %j",
    (task) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;
      const valid = { tasks: { valid: { title: "Buy milk", completed: false, date: "2026-10-04" } } };

      receive({ data: () => valid } as unknown as DocumentSnapshot);
      receive({
        data: () => ({
          tasks: {
            valid: { title: "Changed title", completed: false, date: "2026-10-04" },
            malformed: task,
          }
        })
      } as unknown as DocumentSnapshot);

      expect(onUserData).toHaveBeenCalledExactlyOnceWith({ tasks: {
        valid: { title: "Buy milk", date: "2026-10-04", completedAt: null },
      } });
      expect(onError).toHaveBeenCalledExactlyOnceWith(new Error(
        "Invalid task malformed",
      ));

      receive({ data: () => ({ tasks: {} }) } as unknown as DocumentSnapshot);

      expect(onUserData).toHaveBeenCalledTimes(2);
      expect(onUserData).toHaveBeenLastCalledWith({ tasks: {} });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(setDoc).not.toHaveBeenCalled();
    },
  );

  it.each(["2026-02-30", "10/04/2026", ""])("reports the task ID and date requirement for invalid date %j", (date) => {
    const onUserData = vi.fn();
    const onError = vi.fn();
    subscribeUserData("alice", onUserData, onError);
    const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    receive({
      data: () => ({ tasks: { malformed: { title: "Buy milk", completed: false, date } } }),
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
    const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
      (snapshot: DocumentSnapshot) => void;

    expect(() => receive({ data: () => ({}) } as DocumentSnapshot)).toThrow(error);
    expect(onError).not.toHaveBeenCalled();
  });
});
