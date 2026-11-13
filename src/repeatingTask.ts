import type { Timestamp } from "firebase/firestore";
import {
  taskDateFromUtcDate,
  utcDateFromTaskDate,
  type TaskDate,
} from "./taskDate";

export type RepeatingTask = {
  title: string;
  details: string;
  schedule: Schedule;
  // Updated when the schedule is edited by the user (not when nextDate is advanced by the app).
  scheduleEditedAt: Timestamp;
};

export type Schedule = {
  nextDate: TaskDate;
  interval: number;
  intervalUnit: IntervalUnit;
  // Preserves the intended day for monthly and yearly repetitions after shorter months.
  anchorDate: TaskDate;
};

export type IntervalUnit = "Days" | "Weeks" | "Months" | "Years";

export function maxInterval(intervalUnit: IntervalUnit): number {
  switch (intervalUnit) {
    case "Days": return 365;
    case "Weeks": return 52;
    case "Months": return 12;
    case "Years": return 1;
  }
}

export function nextOccurrenceDate({ nextDate, intervalUnit, interval, anchorDate }: Schedule): TaskDate {
  const followingDate = utcDateFromTaskDate(nextDate);
  switch (intervalUnit) {
    case "Days": {
      followingDate.setUTCDate(followingDate.getUTCDate() + interval);
      break;
    }
    case "Weeks": {
      followingDate.setUTCDate(followingDate.getUTCDate() + interval * 7);
      break;
    }
    case "Months": {
      const start = utcDateFromTaskDate(anchorDate);
      followingDate.setUTCDate(1);
      followingDate.setUTCMonth(followingDate.getUTCMonth() + interval);
      const last = new Date(followingDate);
      last.setUTCMonth(last.getUTCMonth() + 1);
      last.setUTCDate(0);
      followingDate.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
      break;
    }
    case "Years": {
      const start = utcDateFromTaskDate(anchorDate);
      followingDate.setUTCDate(1);
      followingDate.setUTCMonth(followingDate.getUTCMonth() + interval * 12);
      const last = new Date(followingDate);
      last.setUTCMonth(last.getUTCMonth() + 1);
      last.setUTCDate(0);
      followingDate.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
      break;
    }
    default: {
      const unexpectedUnit: never = intervalUnit;
      throw new Error(`Unexpected repeating task unit: ${unexpectedUnit}`);
    }
  }
  return taskDateFromUtcDate(followingDate);
}

export function occurrenceDates(
  schedule: Schedule,
  endInclusive: TaskDate,
): TaskDate[] {
  const dates: TaskDate[] = [];
  for (let date = schedule.nextDate; date <= endInclusive; date = nextOccurrenceDate({ ...schedule, nextDate: date })) {
    dates.push(date);
  }
  return dates;
}
