import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, subscribeUserData } from "../src/userData";

vi.mock("firebase/firestore", () => ({
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

  it("saves to the specified user's document", async () => {
    await expect(createTask("alice", { title: "Buy milk" })).resolves.toBeUndefined();

    expect(doc).toHaveBeenCalledExactlyOnceWith(firestore, "users", "alice");
    expect(setDoc).toHaveBeenCalledExactlyOnceWith(userDocument, {
      tasks: expect.any(Object),
    }, { merge: true });
    const { tasks } = vi.mocked(setDoc).mock.calls[0]![1] as {
      tasks: Record<string, { title: string; }>;
    };
    expect(Object.values(tasks)).toEqual([{ title: "Buy milk" }]);
    expect(Object.keys(tasks)[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("propagates asynchronous write failures and allows further writes", async () => {
    const error = new Error("Save failed");
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(createTask("alice", { title: "Buy milk" })).rejects.toBe(error);
    await expect(createTask("alice", { title: "Buy milk" })).resolves.toBeUndefined();
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it("propagates immediate write failures as promise rejections", async () => {
    const error = new Error("Invalid write");
    vi.mocked(setDoc).mockImplementationOnce(() => { throw error; });

    await expect(createTask("alice", { title: "Buy milk" })).rejects.toBe(error);
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
        futureField: { enabled: true }, tasks: {
          first: { title: "Buy milk", details: "Whole milk" },
          second: { title: "Walk dog" },
        }
      })
    } as unknown as DocumentSnapshot);
    expect(onUserData).toHaveBeenLastCalledWith({
      tasks: {
        first: { title: "Buy milk" },
        second: { title: "Walk dog" },
      }
    });

    receive({
      data: () => ({ tasks: { second: { title: "Walk dog again" } } }),
    } as unknown as DocumentSnapshot);
    expect(onUserData).toHaveBeenLastCalledWith({ tasks: { second: { title: "Walk dog again" } } });
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

  it.each([{}, { title: 42 }, null, Object.assign([], { title: "Invalid array" })])(
    "rejects a malformed task and resumes publishing when data becomes readable: %j",
    (task) => {
      const onUserData = vi.fn();
      const onError = vi.fn();
      subscribeUserData("alice", onUserData, onError);
      const receive = vi.mocked(onSnapshot).mock.calls[0]![1] as
        (snapshot: DocumentSnapshot) => void;
      const valid = { tasks: { valid: { title: "Buy milk" } } };

      receive({ data: () => valid } as unknown as DocumentSnapshot);
      receive({
        data: () => ({
          tasks: {
            valid: { title: "Changed title" },
            malformed: task,
          }
        })
      } as unknown as DocumentSnapshot);

      expect(onUserData).toHaveBeenCalledExactlyOnceWith(valid);
      expect(onError).toHaveBeenCalledExactlyOnceWith(new Error("Invalid task: malformed"));

      receive({ data: () => ({ tasks: {} }) } as unknown as DocumentSnapshot);

      expect(onUserData).toHaveBeenCalledTimes(2);
      expect(onUserData).toHaveBeenLastCalledWith({ tasks: {} });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(setDoc).not.toHaveBeenCalled();
    },
  );

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
