import type { Timestamp } from "firebase/firestore";
import type { TaskDate } from "./taskDate";

export type Task = {
  title: string;
  details: string;
  date: TaskDate;
  completedAt: Timestamp | null;
  // If present, identifies the repeating task that generated this task, even if that repeating task has since been
  // deleted. If absent, this task WAS NOT generated from a repeating task, or, this task WAS generated from a repeating
  // task before we began recording repeatingTaskId.
  repeatingTaskId?: string;
};

export function taskRetentionElapsed(task: Task, now: Timestamp): boolean {
  if (task.completedAt === null) {
    return false;
  }
  const elapsedSeconds = now.seconds - task.completedAt.seconds;
  const retentionSeconds = 400 * 24 * 60 * 60;
  return elapsedSeconds >= retentionSeconds;
}
