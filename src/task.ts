import type { Timestamp } from "firebase/firestore";
import type { TaskDate } from "./taskDate";

export type Task = {
  title: string;
  details: string;
  date: TaskDate;
  completedAt: Timestamp | null;
};

