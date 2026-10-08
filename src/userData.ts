import {
  doc,
  deleteField,
  FieldPath,
  getFirestore,
  onSnapshot,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { decodeRecurrence, nextOccurrence, type Recurrence } from "./recurrence";
import { decodeTaskDate, taskDateToday, type TaskDate } from "./taskDate";

export type UserData = { tasks: Record<string, Task>; };

export type Task = NonRepeatingTask | RepeatingTask;

export type NonRepeatingTask = {
  type: "NonRepeatingTask";
  title: string;
  details: string;
  date: TaskDate;
  completedAt: Timestamp | null;
};

export type Schedule = { nextDate: TaskDate; recurrence: Recurrence; };

export type RepeatingTask = {
  type: "RepeatingTask";
  title: string;
  details: string;
  schedule: Schedule;
  scheduleEditedAt: Timestamp;
};

export function emptyUserData(): UserData {
  return { tasks: {} };
}

export async function createTask(userId: string, taskId: string): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "CreateTask", taskId },
    tasks: {
      [taskId]: {
        type: "NonRepeatingTask",
        title: "",
        details: "",
        completed: false,
        date: taskDateToday(),
        titleEditedAt: editedAt,
        detailsEditedAt: editedAt,
        completedEditedAt: editedAt,
        dateEditedAt: editedAt,
      }
    },
  }, { merge: true });
}

export async function createTaskOccurrence(
  userId: string,
  taskId: string,
  repeatingTask: RepeatingTask,
): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "CreateTask", taskId },
    tasks: {
      [taskId]: {
        type: "NonRepeatingTask",
        title: repeatingTask.title,
        details: repeatingTask.details,
        completed: false,
        date: repeatingTask.schedule.nextDate,
        titleEditedAt: editedAt,
        detailsEditedAt: editedAt,
        completedEditedAt: editedAt,
        dateEditedAt: editedAt,
      }
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

export async function setTaskSchedule(userId: string, taskId: string, date: TaskDate, recurrence: Recurrence | null): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetTaskSchedule", taskId },
    tasks: {
      [taskId]: {
        type: recurrence ? "RepeatingTask" : "NonRepeatingTask",
        date: recurrence ? deleteField() : date,
        schedule: recurrence ? { nextDate: date, recurrence } : deleteField(),
        completed: recurrence ? deleteField() : false,
        completedEditedAt: recurrence ? deleteField() : editedAt,
        scheduleEditedAt: recurrence ? editedAt : deleteField(),
        dateEditedAt: recurrence ? deleteField() : editedAt,
      }
    },
  }, { mergeFields: ["operation", ...["type", "date", "dateEditedAt", "completed", "completedEditedAt", "schedule", "scheduleEditedAt"].map((field) => new FieldPath("tasks", taskId, field))] });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "DeleteTask", taskId },
    tasks: { [taskId]: deleteField() },
  }, { merge: true });
}

export async function advanceTaskSchedule(userId: string, taskId: string, task: RepeatingTask, occurrenceId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: {
      type: "AdvanceTaskSchedule", taskId, occurrenceId, scheduleEditedAt: task.scheduleEditedAt,
    },
    tasks: {
      [taskId]: { schedule: { nextDate: nextOccurrence(task.schedule.recurrence, task.schedule.nextDate) } },
    },
  }, { merge: true });
}

export function subscribeUserData(
  userId: string,
  onUserData: (userData: UserData) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(doc(getFirestore(), "users", userId), (snapshot) => {
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
  if (!("tasks" in data)) return emptyUserData();
  if (!isRecord(data.tasks)) throw new Error("Invalid tasks map");

  return {
    tasks: Object.fromEntries(Object.entries(data.tasks).map(([id, task]) => [id, decodeTask(id, task)])),
  };
}

function decodeTask(id: string, data: unknown): Task {
  if (
    !isRecord(data)
    || (data.type !== "NonRepeatingTask" && data.type !== "RepeatingTask")
    || typeof data.title !== "string"
    || typeof data.details !== "string"
  ) {
    throw new Error(`Invalid task ${id}`);
  }
  const fields = { title: data.title, details: data.details };
  if (data.type === "RepeatingTask") {
    if (!isRecord(data.schedule)) throw new Error(`Invalid task ${id}: invalid schedule`);
    let nextDate: TaskDate;
    try {
      nextDate = decodeTaskDate(data.schedule.nextDate);
    } catch {
      throw new Error(`Invalid task ${id}: invalid next date`);
    }
    const recurrence = decodeRecurrence(data.schedule.recurrence);
    if (!(data.scheduleEditedAt instanceof Timestamp)) throw new Error(`Invalid task ${id}: invalid schedule timestamp`);
    return { ...fields, type: "RepeatingTask", schedule: { nextDate, recurrence }, scheduleEditedAt: data.scheduleEditedAt };
  }
  if (typeof data.completed !== "boolean" || typeof data.date !== "string") throw new Error(`Invalid task ${id}`);
  let date: TaskDate;
  try {
    date = decodeTaskDate(data.date);
  } catch {
    throw new Error(`Invalid task ${id}: invalid date`);
  }
  if (data.completed) {
    if (!(data.completedEditedAt instanceof Timestamp)) {
      throw new Error(`Invalid task ${id}: invalid completion timestamp`);
    }
    return { ...fields, type: "NonRepeatingTask", date, completedAt: data.completedEditedAt };
  }
  return { ...fields, type: "NonRepeatingTask", date, completedAt: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
