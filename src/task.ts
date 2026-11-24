import type { Timestamp } from "firebase/firestore";
import type { TaskDate } from "./taskDate";

export type Task = {
  title: string;
  details: string;
  date: TaskDate;
  completedAt: Timestamp | null;
};

export function taskRetentionElapsed(task: Task, now: Timestamp): boolean {
  if (task.completedAt === null) {
    return false;
  }
  const elapsedSeconds = now.seconds - task.completedAt.seconds;
  const retentionSeconds = 400 * 24 * 60 * 60;
  return elapsedSeconds >= retentionSeconds;
}
