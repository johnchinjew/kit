import { doc, setDoc, Timestamp, type DocumentData, type DocumentReference } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeTaskDate } from "../src/taskDate";
import { nextOccurrenceDate } from "../src/repeatingTask";
import { createTasksFromRepeatingTasks, type UserData } from "../src/userData";

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  doc: vi.fn(),
  getFirestore: vi.fn(),
  setDoc: vi.fn(),
}));

const today = decodeTaskDate("2026-11-04");
let data: UserData;
let submitted: Set<string>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(setDoc).mockResolvedValue(undefined);
  submitted = new Set();
  data = { tasks: {}, repeatingTasks: {
    daily: {
      title: "Walk", details: "", scheduleEditedAt: new Timestamp(100, 0),
      schedule: { nextDate: today, anchorDate: today, interval: 1, intervalUnit: "Days" },
    },
  } };
});

it("suppresses repeated submissions while offline without blocking newly due occurrences", async () => {
  vi.mocked(setDoc).mockReturnValue(new Promise(() => {}));
  void createTasksFromRepeatingTasks("alice", data, today, submitted);
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  expect(setDoc).toHaveBeenCalledTimes(2);

  void createTasksFromRepeatingTasks("alice", data, decodeTaskDate("2026-11-07"), submitted);
  expect(setDoc).toHaveBeenCalledTimes(8);
  expect(vi.mocked(setDoc).mock.calls.filter((call) => (call[1] as DocumentData).operation.type === "CreateTask")
    .map((call) => Object.values((call[1] as DocumentData).tasks)[0]))
    .toEqual(["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((date) => expect.objectContaining({ date })));
});

it("suppresses successful submissions even before the next snapshot arrives", async () => {
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  expect(setDoc).toHaveBeenCalledTimes(2);
});

it("generates a task for each schedule with the same due date and edit timestamp", async () => {
  data.repeatingTasks.other = {
    title: "Read", details: "", scheduleEditedAt: new Timestamp(100, 0),
    schedule: { nextDate: today, anchorDate: today, interval: 1, intervalUnit: "Days" },
  };

  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  await createTasksFromRepeatingTasks("alice", data, today, submitted);

  const createdTasks = vi.mocked(setDoc).mock.calls
    .filter((call) => (call[1] as DocumentData).operation.type === "CreateTask")
    .map((call) => Object.values((call[1] as DocumentData).tasks)[0]);
  expect(createdTasks).toEqual([
    expect.objectContaining({ repeatingTaskId: "daily", title: "Walk", date: today }),
    expect.objectContaining({ repeatingTaskId: "other", title: "Read", date: today }),
  ]);
  expect(setDoc).toHaveBeenCalledTimes(4);
});

it.each(["creation", "advancement"])("reports a rejected %s without releasing the submitted occurrence", async (operation) => {
  if (operation === "advancement") vi.mocked(setDoc).mockResolvedValueOnce(undefined);
  vi.mocked(setDoc).mockRejectedValueOnce(new Error("Write rejected"));
  await expect(createTasksFromRepeatingTasks("alice", data, today, submitted)).rejects.toThrow("Write rejected");
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  expect(setDoc).toHaveBeenCalledTimes(2);
});

it("generates a newly due schedule and treats an explicit schedule edit as a new occurrence identity", async () => {
  data.repeatingTasks.daily!.schedule.nextDate = decodeTaskDate("2026-11-05");
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  expect(setDoc).not.toHaveBeenCalled();
  data.repeatingTasks.daily!.schedule.nextDate = today;
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  data.repeatingTasks.daily!.scheduleEditedAt = new Timestamp(100, 1);
  await createTasksFromRepeatingTasks("alice", data, today, submitted);
  expect(setDoc).toHaveBeenCalledTimes(4);
});

it("creates a task for an occurrence with its own ID and advances the repeating task separately", async () => {
  const userDocument = {} as DocumentReference;
  vi.mocked(doc).mockReturnValue(userDocument);
  const schedule = {
    nextDate: today, interval: 1, intervalUnit: "Months" as const, anchorDate: today,
  };
  const repeatingTask = {
    title: "Rent", details: "Pay landlord", schedule, scheduleEditedAt: Timestamp.fromMillis(1000),
  };
  await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { "repeating.task.with.dots": repeatingTask } }, today, new Set());
  const taskId = (vi.mocked(setDoc).mock.calls[0]![1] as DocumentData).operation.taskId as string;
  expect(taskId).toEqual(expect.any(String));
  expect(setDoc).toHaveBeenCalledTimes(2);
  expect(setDoc).toHaveBeenNthCalledWith(1, userDocument, {
    operation: { type: "CreateTask", taskId },
    tasks: {
      [taskId]: {
        title: "Rent", details: "Pay landlord", completed: false, date: today,
        repeatingTaskId: "repeating.task.with.dots",
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

    await createTasksFromRepeatingTasks("alice", { tasks: {}, repeatingTasks: { rent: repeatingTask } }, decodeTaskDate("2026-03-31"), submitted);

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
    const processing = createTasksFromRepeatingTasks("alice", {
      tasks: {}, repeatingTasks: {
        walk: {
          title: "Walk", details: "",
          schedule: {
            nextDate: decodeTaskDate("2026-03-30"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-03-30"),
          },
          scheduleEditedAt: Timestamp.now(),
        }
      }
    }, decodeTaskDate("2026-03-31"), submitted);

    expect(setDoc).toHaveBeenCalledTimes(4);
    finishCreation();
    finishAdvancement();
    await processing;
    expect(vi.mocked(setDoc).mock.calls.map(([, data]) => (data as DocumentData).operation.type)).toEqual([
      "CreateTask", "AdvanceRepeatingTask", "CreateTask", "AdvanceRepeatingTask",
    ]);
  });

  it.each(["creation", "advancement"])("reports a %s failure after queuing all writes", async (failure) => {
    const data: UserData = {
      tasks: {}, repeatingTasks: {
        walk: {
          title: "Walk", details: "",
          schedule: {
            nextDate: decodeTaskDate("2026-03-29"), interval: 1, intervalUnit: "Days", anchorDate: decodeTaskDate("2026-03-29"),
          },
          scheduleEditedAt: Timestamp.now(),
        }
      }
    };
    const error = new Error("Write rejected");
    if (failure === "advancement") vi.mocked(setDoc).mockResolvedValueOnce(undefined);
    vi.mocked(setDoc).mockRejectedValueOnce(error);

    await expect(createTasksFromRepeatingTasks("alice", data, decodeTaskDate("2026-03-31"), submitted)).rejects.toBe(error);

    expect(setDoc).toHaveBeenCalledTimes(6);
  });
});
