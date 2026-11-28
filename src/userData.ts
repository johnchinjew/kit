import {
  doc,
  deleteField,
  getFirestore,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { onSnapshotAfterWaitingForServer } from "./firestore";
import { taskRetentionElapsed, type Task } from "./task";
import {
  occurrenceDates,
  maxInterval,
  nextOccurrenceDate,
  type IntervalUnit,
  type RepeatingTask,
  type Schedule
} from "./repeatingTask";
import { decodeTaskDate, type TaskDate } from "./taskDate";

export type UserData = {
  tasks: Record<string, Task>;
  repeatingTasks: Record<string, RepeatingTask>;
};

export function emptyUserData(): UserData {
  return { tasks: {}, repeatingTasks: {} };
}

// WRITE TASKS

export async function createTask(
  userId: string,
  taskId: string,
  title: string,
  details: string,
  date: TaskDate,
): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "CreateTask", taskId },
    tasks: {
      [taskId]: {
        title,
        details,
        completed: false,
        date,
        titleEditedAt: editedAt,
        detailsEditedAt: editedAt,
        completedEditedAt: editedAt,
        dateEditedAt: editedAt,
      }
    },
  }, { merge: true });
}

// Reuse the submittedTaskCreations set across all calls of createTasksFromRepeatingTasks() to prevent duplicate tasks
// from being created, which happens when createTasksFromRepeatingTasks() is called before an updated snapshot arrives.
export async function createTasksFromRepeatingTasks(
  userId: string,
  userData: UserData,
  today: TaskDate,
  submittedTaskCreations: Set<string>,
): Promise<void> {

  // setDoc() immediately applies the mutation locally, but its promise does not resolve until the server accepts.
  // To avoid getting stuck at the first write while offline, submit all the writes before awaiting their promises.
  const writes: Promise<void>[] = [];
  for (const [repeatingTaskId, repeatingTask] of Object.entries(userData.repeatingTasks)) {
    for (const date of occurrenceDates(repeatingTask.schedule, today)) {
      // Skip if we already created a task
      const key = JSON.stringify({
        repeatingTaskId,
        scheduleEditedAt: repeatingTask.scheduleEditedAt,
        date,
      });
      if (submittedTaskCreations.has(key)) {
        continue;
      }
      submittedTaskCreations.add(key);

      // Create a task and advance the repeating task
      const taskId = crypto.randomUUID();
      const current = { ...repeatingTask, schedule: { ...repeatingTask.schedule, nextDate: date } };
      writes.push(createTaskFromRepeatingTask(userId, taskId, repeatingTaskId, repeatingTask, date));
      writes.push(advanceRepeatingTask(userId, repeatingTaskId, current, taskId));
    }
  }
  // Await everything here so the caller can catch errors when the server responds, i.e. when online.
  await Promise.all(writes);
}

async function createTaskFromRepeatingTask(
  userId: string,
  taskId: string,
  repeatingTaskId: string,
  repeatingTask: RepeatingTask,
  date: TaskDate,
): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "CreateTask", taskId },
    tasks: {
      [taskId]: {
        title: repeatingTask.title,
        details: repeatingTask.details,
        completed: false,
        date,
        repeatingTaskId,
        titleEditedAt: editedAt,
        detailsEditedAt: editedAt,
        completedEditedAt: editedAt,
        dateEditedAt: editedAt,
      }
    },
  }, { merge: true });
}

async function advanceRepeatingTask(
  userId: string,
  repeatingTaskId: string,
  repeatingTask: RepeatingTask,
  createdTaskId: string,
): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: {
      type: "AdvanceRepeatingTask",
      repeatingTaskId,
      // Firestore accepts the advance only if the created task exists.
      createdTaskId,
      // Firestore accepts the advance only if the schedule hasn't been edited since this client read it.
      scheduleEditedAt: repeatingTask.scheduleEditedAt,
    },
    repeatingTasks: {
      [repeatingTaskId]: {
        schedule: { nextDate: nextOccurrenceDate(repeatingTask.schedule) },
      },
    },
  }, { merge: true });
}

export async function setTaskTitle(userId: string, taskId: string, title: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetTaskTitle", taskId },
    tasks: { [taskId]: { title, titleEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function setTaskDetails(userId: string, taskId: string, details: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetTaskDetails", taskId },
    tasks: { [taskId]: { details, detailsEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function completeTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "CompleteTask", taskId },
    tasks: { [taskId]: { completed: true, completedEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function setTaskDate(userId: string, taskId: string, date: TaskDate): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetTaskDate", taskId },
    tasks: { [taskId]: { date, dateEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function reopenTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "ReopenTask", taskId },
    tasks: { [taskId]: { completed: false, completedEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "DeleteTask", taskId },
    tasks: { [taskId]: deleteField() },
  }, { merge: true });
}

export async function deleteTasksWithElapsedRetention(userId: string, data: UserData): Promise<void> {
  const now = Timestamp.now();

  // setDoc() immediately applies the mutation locally, but its promise does not resolve until the server accepts.
  // To avoid getting stuck at the first write while offline, submit all the writes before awaiting their promises.
  const writes: Promise<void>[] = [];
  for (const [taskId, task] of Object.entries(data.tasks)) {
    if (taskRetentionElapsed(task, now)) {
      writes.push(deleteTaskWithElapsedRetention(userId, taskId, task));
    }
  }
  // Await everything here so the caller can catch errors when the server responds, i.e. when online.
  await Promise.all(writes);
}

async function deleteTaskWithElapsedRetention(userId: string, taskId: string, task: Task): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: {
      type: "DeleteTaskWithElapsedRetention",
      taskId,
      // Firestore accepts the deletion only if the task is still completed with this completion timestamp, or is already deleted.
      completedAt: task.completedAt,
    },
    tasks: { [taskId]: deleteField() },
  }, { merge: true });
}

// WRITE REPEATING TASKS

export async function createRepeatingTask(
  userId: string,
  repeatingTaskId: string,
  title: string,
  details: string,
  schedule: Schedule,
): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "CreateRepeatingTask", repeatingTaskId },
    repeatingTasks: {
      [repeatingTaskId]: {
        title,
        details,
        schedule,
        titleEditedAt: editedAt,
        detailsEditedAt: editedAt,
        scheduleEditedAt: editedAt,
      }
    },
  }, { merge: true });
}

export async function setRepeatingTaskTitle(userId: string, repeatingTaskId: string, title: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetRepeatingTaskTitle", repeatingTaskId },
    repeatingTasks: { [repeatingTaskId]: { title, titleEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function setRepeatingTaskDetails(userId: string, repeatingTaskId: string, details: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetRepeatingTaskDetails", repeatingTaskId },
    repeatingTasks: { [repeatingTaskId]: { details, detailsEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function setRepeatingTaskSchedule(
  userId: string,
  repeatingTaskId: string,
  schedule: Schedule,
): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetRepeatingTaskSchedule", repeatingTaskId },
    repeatingTasks: { [repeatingTaskId]: { schedule, scheduleEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function deleteRepeatingTask(userId: string, repeatingTaskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "DeleteRepeatingTask", repeatingTaskId },
    repeatingTasks: { [repeatingTaskId]: deleteField() },
  }, { merge: true });
}

// READ USER DATA

export function subscribeUserData(
  userId: string,
  onUserData: (userData: UserData) => void,
  onError: (error: Error) => void,
) {
  return onSnapshotAfterWaitingForServer(doc(getFirestore(), "users", userId), (snapshot) => {
    let userData: UserData;
    try {
      userData = decodeUserData(snapshot.data());
    } catch (error) {
      onError(error instanceof Error ? error : new Error("Unexpected user decode error"));
      return;
    }
    onUserData(userData);
  }, onError);
}

function decodeUserData(data: unknown): UserData {
  if (data === undefined) return emptyUserData();
  if (!isRecord(data)) throw new Error("Invalid user document");
  const rawTasks = "tasks" in data ? data.tasks : {};
  const rawRepeatingTasks = "repeatingTasks" in data ? data.repeatingTasks : {};
  if (!isRecord(rawTasks)) throw new Error("Invalid tasks map");
  if (!isRecord(rawRepeatingTasks)) throw new Error("Invalid repeating task map");

  return {
    tasks: Object.fromEntries(Object.entries(rawTasks).map(([taskId, task]) => [taskId, decodeTask(taskId, task)])),
    repeatingTasks: Object.fromEntries(Object.entries(rawRepeatingTasks).map(([repeatingTaskId, repeatingTask]) => [repeatingTaskId, decodeRepeatingTask(repeatingTaskId, repeatingTask)])),
  };
}

function decodeTask(taskId: string, data: unknown): Task {
  if (
    !isRecord(data)
    || typeof data.title !== "string"
    || typeof data.details !== "string"
    || typeof data.completed !== "boolean"
    || typeof data.date !== "string"
  ) {
    throw new Error(`Invalid task ${taskId}`);
  }
  let date: TaskDate;
  try {
    date = decodeTaskDate(data.date);
  } catch {
    throw new Error(`Invalid task ${taskId}: invalid date`);
  }

  const { repeatingTaskId, title, details } = data;
  const fields = {
    ...(typeof repeatingTaskId === "string" ? { repeatingTaskId } : {}),
    title,
    details,
    date,
  };

  if (data.completed) {
    if (!(data.completedEditedAt instanceof Timestamp)) {
      throw new Error(`Invalid task ${taskId}: invalid completion timestamp`);
    }
    return { ...fields, completedAt: data.completedEditedAt };
  }
  return { ...fields, completedAt: null };
}

function decodeRepeatingTask(repeatingTaskId: string, data: unknown): RepeatingTask {
  if (
    !isRecord(data)
    || typeof data.title !== "string"
    || typeof data.details !== "string"
  ) {
    throw new Error(`Invalid repeating task ${repeatingTaskId}`);
  }

  if (!(data.scheduleEditedAt instanceof Timestamp)) {
    throw new Error(`Invalid repeating task ${repeatingTaskId}: invalid schedule timestamp`);
  }

  return {
    title: data.title,
    details: data.details,
    schedule: decodeSchedule(data.schedule),
    scheduleEditedAt: data.scheduleEditedAt,
  };
}

function decodeSchedule(data: unknown): Schedule {
  if (!isRecord(data)) {
    throw new Error("Invalid schedule: not a record");
  }

  let nextDate: TaskDate;
  try {
    nextDate = decodeTaskDate(data.nextDate);
  } catch {
    throw new Error("Invalid schedule: invalid next date");
  }

  let anchorDate: TaskDate;
  try {
    anchorDate = decodeTaskDate(data.anchorDate);
  } catch {
    throw new Error("Invalid schedule: invalid anchor date");
  }

  let intervalUnit: IntervalUnit;
  try {
    intervalUnit = decodeIntervalUnit(data.intervalUnit);
  } catch {
    throw new Error("Invalid schedule: invalid unit");
  }

  if (
    typeof data.interval !== "number"
    || !Number.isInteger(data.interval)
    || data.interval < 1
    || data.interval > maxInterval(intervalUnit)
  ) {
    throw new Error("Invalid schedule: invalid interval");
  }

  return {
    nextDate,
    interval: data.interval,
    intervalUnit,
    anchorDate,
  };
}

function decodeIntervalUnit(value: unknown): IntervalUnit {
  if (
    value !== "Days"
    && value !== "Weeks"
    && value !== "Months"
    && value !== "Years"
  ) {
    throw new Error(`Invalid interval unit: ${value}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
