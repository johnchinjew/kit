import {
  doc,
  deleteField,
  getFirestore,
  onSnapshot,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { decodeSchedule, nextOccurrenceDate, type Schedule } from "./schedule";
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

export async function setTaskSchedule(userId: string, taskId: string, schedule: Schedule): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "SetTaskSchedule", taskId },
    tasks: {
      [taskId]: {
        type: "RepeatingTask",
        date: deleteField(),
        completed: deleteField(),
        schedule,
        dateEditedAt: deleteField(),
        completedEditedAt: deleteField(),
        scheduleEditedAt: editedAt,
      }
    },
  }, { merge: true });
}

export async function removeTaskSchedule(userId: string, taskId: string, date: TaskDate): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "RemoveTaskSchedule", taskId },
    tasks: {
      [taskId]: {
        type: "NonRepeatingTask",
        date,
        completed: false,
        schedule: deleteField(),
        dateEditedAt: editedAt,
        completedEditedAt: editedAt,
        scheduleEditedAt: deleteField(),
      }
    },
  }, { merge: true });
}

export async function advanceTaskSchedule(
  userId: string,
  taskId: string,
  repeatingTask: RepeatingTask,
  occurrenceId: string
): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: {
      type: "AdvanceTaskSchedule",
      taskId,
      // Will advance only if the occurrence was materialized by a prior write.
      occurrenceId,
      // Will advance only if the user hasn't edited the schedule since it was read.
      scheduleEditedAt: repeatingTask.scheduleEditedAt,
    },
    tasks: {
      [taskId]: {
        schedule: { nextDate: nextOccurrenceDate(repeatingTask.schedule) },
      },
    },
  }, { merge: true });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "DeleteTask", taskId },
    tasks: { [taskId]: deleteField() },
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
    || typeof data.title !== "string"
    || typeof data.details !== "string"
  ) {
    throw new Error(`Invalid task ${id}`);
  }
  const type = decodeTaskType(id, data.type);
  switch (type) {
    case "RepeatingTask": {
      if (!isRecord(data.schedule)) {
        throw new Error(`Invalid task ${id}: invalid schedule`);
      }
      const schedule = decodeSchedule(data.schedule);
      if (!(data.scheduleEditedAt instanceof Timestamp)) {
        throw new Error(`Invalid task ${id}: invalid schedule timestamp`);
      }
      return {
        title: data.title,
        details: data.details,
        type,
        schedule,
        scheduleEditedAt: data.scheduleEditedAt
      };
    }
    case "NonRepeatingTask": {
      if (typeof data.completed !== "boolean" || typeof data.date !== "string") {
        throw new Error(`Invalid task ${id}`);
      }
      const date = decodeTaskDate(data.date);
      if (data.completed) {
        if (!(data.completedEditedAt instanceof Timestamp)) {
          throw new Error(`Invalid task ${id}: invalid completion timestamp`);
        }
        return { title: data.title, details: data.details, type, date, completedAt: data.completedEditedAt };
      } else {
        return { title: data.title, details: data.details, type, date, completedAt: null };
      }
    }
    default: {
      const unexpectedType: never = type;
      throw new Error(`Invalid task: unexpected type ${unexpectedType}`);
    }
  }
}

function decodeTaskType(id: string, type: unknown): Task["type"] {
  if (type === "NonRepeatingTask" || type === "RepeatingTask") {
    return type;
  }
  throw new Error(`Invalid task ${id}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
