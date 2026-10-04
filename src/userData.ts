import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

export type UserData = { tasks: Record<string, Task>; };

export type Task = { title: string; };

export function emptyUserData(): UserData {
  return { tasks: {} };
}

export async function createTask(userId: string, taskId: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    tasks: { [taskId]: { title: "" } },
  }, { merge: true });
}

export async function setTaskTitle(userId: string, taskId: string, title: string): Promise<void> {
  await setDoc(doc(getFirestore(), "users", userId), {
    tasks: { [taskId]: { title } },
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
    tasks: Object.fromEntries(Object.entries(data.tasks).map(([id, task]) => {
      if (!isRecord(task) || typeof task.title !== "string") {
        throw new Error(`Invalid task: ${id}`);
      }
      return [id, { title: task.title }];
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
