import { onSnapshot, type DocumentReference, type DocumentSnapshot } from "firebase/firestore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { onSnapshotAfterWaitingForServer } from "../src/firestore";

vi.mock("firebase/firestore", () => ({ onSnapshot: vi.fn() }));

const reference = {} as DocumentReference;
const cached = { metadata: { fromCache: true } } as DocumentSnapshot;
const server = { metadata: { fromCache: false } } as DocumentSnapshot;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.mocked(onSnapshot).mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

it("delivers a server snapshot immediately and cancels the cached fallback", () => {
  const onData = vi.fn();
  onSnapshotAfterWaitingForServer(reference, onData, vi.fn());
  expect(onSnapshot).toHaveBeenCalledWith(reference, { includeMetadataChanges: true }, expect.any(Function), expect.any(Function));
  const receive = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (snapshot: DocumentSnapshot) => void;

  const data = () => ({ title: "Unchanged" });
  const confirmed = { data, metadata: { fromCache: false } } as unknown as DocumentSnapshot;
  receive({ data, metadata: { fromCache: true } } as unknown as DocumentSnapshot);
  vi.advanceTimersByTime(500);
  expect(onData).not.toHaveBeenCalled();
  receive(confirmed);
  expect(onData).toHaveBeenCalledExactlyOnceWith(confirmed);
  vi.advanceTimersByTime(1500);
  expect(onData).toHaveBeenCalledTimes(1);

  receive(cached);
  expect(onData).toHaveBeenLastCalledWith(cached);
  expect(onData).toHaveBeenCalledTimes(2);
});

it("delivers immediately when the first snapshot is already from the server", () => {
  const onData = vi.fn();
  onSnapshotAfterWaitingForServer(reference, onData, vi.fn());
  const receive = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (snapshot: DocumentSnapshot) => void;

  receive(server);
  expect(onData).toHaveBeenCalledExactlyOnceWith(server);
  vi.advanceTimersByTime(1500);
  expect(onData).toHaveBeenCalledTimes(1);
});

it("delivers the latest cached snapshot after 1.5 seconds without restarting the delay", () => {
  const onData = vi.fn();
  onSnapshotAfterWaitingForServer(reference, onData, vi.fn());
  const receive = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (snapshot: DocumentSnapshot) => void;
  const latest = { metadata: { fromCache: true }, data: () => ({ title: "Updated" }) } as unknown as DocumentSnapshot;

  receive(cached);
  vi.advanceTimersByTime(500);
  receive(latest);
  vi.advanceTimersByTime(999);
  expect(onData).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onData).toHaveBeenCalledExactlyOnceWith(latest);
  receive(cached);
  expect(onData).toHaveBeenLastCalledWith(cached);
  expect(onData).toHaveBeenCalledTimes(2);
  receive(server);
  expect(onData).toHaveBeenLastCalledWith(server);
  expect(onData).toHaveBeenCalledTimes(3);
});

it("waits for a real snapshot if no data arrives during the delay", () => {
  const onData = vi.fn();
  onSnapshotAfterWaitingForServer(reference, onData, vi.fn());
  const receive = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (snapshot: DocumentSnapshot) => void;

  vi.advanceTimersByTime(1500);
  expect(onData).not.toHaveBeenCalled();
  receive(cached);
  expect(onData).toHaveBeenCalledExactlyOnceWith(cached);
});

it("cancels pending delivery and unsubscribes on cleanup", () => {
  const onData = vi.fn();
  const unsubscribe = vi.fn();
  vi.mocked(onSnapshot).mockReturnValue(unsubscribe);
  const cleanup = onSnapshotAfterWaitingForServer(reference, onData, vi.fn());
  const receive = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (snapshot: DocumentSnapshot) => void;

  receive(cached);
  cleanup();
  vi.advanceTimersByTime(1500);
  expect(onData).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("reports listener errors immediately and cancels pending delivery", () => {
  const onData = vi.fn();
  const onError = vi.fn();
  onSnapshotAfterWaitingForServer(reference, onData, onError);
  const receive = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (snapshot: DocumentSnapshot) => void;
  const fail = vi.mocked(onSnapshot).mock.calls[0]![3]!;
  const error = new Error("Permission denied");

  receive(cached);
  fail(error as Parameters<typeof fail>[0]);
  expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  vi.advanceTimersByTime(1500);
  expect(onData).not.toHaveBeenCalled();
});
