import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { decodeTaskDate, taskDateToday, type TaskDate } from "./taskDate";

export type UserData = { tasks: Record<string, Task>; };

export type Task = { title: string; completed: boolean; date: TaskDate; };

export function emptyUserData(): UserData {
  return { tasks: {} };
}

export async function createTask(userId: string, taskId: string): Promise<void> {
  const editedAt = Timestamp.now();
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "createTask", taskId },
    tasks: {
      [taskId]: {
        title: "",
        completed: false,
        date: taskDateToday(),
        titleEditedAt: editedAt,
        completedEditedAt: editedAt,
        dateEditedAt: editedAt,
      }
    },
  }, { merge: true });
}

export async function setTaskTitle(userId: string, taskId: string, title: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "setTaskTitle", taskId },
    tasks: { [taskId]: { title, titleEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function completeTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "completeTask", taskId },
    tasks: { [taskId]: { completed: true, completedEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function setTaskDate(userId: string, taskId: string, date: TaskDate): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "setTaskDate", taskId },
    tasks: { [taskId]: { date, dateEditedAt: Timestamp.now() } },
  }, { merge: true });
}

export async function reopenTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    operation: { type: "reopenTask", taskId },
    tasks: { [taskId]: { completed: false, completedEditedAt: Timestamp.now() } },
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
    || typeof data.completed !== "boolean"
    || typeof data.date !== "string"
  ) {
    throw new Error(`Invalid task ${id}`);
  }
  let date: TaskDate;
  try {
    date = decodeTaskDate(data.date);
  } catch {
    throw new Error(`Invalid task ${id}: invalid date`);
  }
  return { title: data.title, completed: data.completed, date };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
