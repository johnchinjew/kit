import {
  decodeTaskDate,
  taskDateFromUtcDate,
  utcDateFromTaskDate, type TaskDate
} from "./taskDate";

export type Schedule = {
  nextDate: TaskDate;
  every: number;
  unit: IntervalUnit;
  // Used to maintain the intended recurrence day for monthly and yearly schedules, even after shorter months.
  anchorDate: TaskDate;
};

export type IntervalUnit = "Days" | "Weeks" | "Months" | "Years";

export function maxInterval(unit: IntervalUnit): number {
  switch (unit) {
    case "Days": return 365;
    case "Weeks": return 52;
    case "Months": return 12;
    case "Years": return 1;
  }
}

export function nextOccurrenceDate({ nextDate, unit, every, anchorDate }: Schedule): TaskDate {
  const date = utcDateFromTaskDate(nextDate);
  switch (unit) {
    case "Days": {
      date.setUTCDate(date.getUTCDate() + every);
      break;
    }
    case "Weeks": {
      date.setUTCDate(date.getUTCDate() + every * 7);
      break;
    }
    case "Months": {
      const start = utcDateFromTaskDate(anchorDate);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + every);
      const last = new Date(date);
      last.setUTCMonth(last.getUTCMonth() + 1);
      last.setUTCDate(0);
      date.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
      break;
    }
    case "Years": {
      const start = utcDateFromTaskDate(anchorDate);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + every * 12);
      const last = new Date(date);
      last.setUTCMonth(last.getUTCMonth() + 1);
      last.setUTCDate(0);
      date.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
      break;
    }
    default: {
      const unexpectedUnit: never = unit;
      throw new Error(`Unexpected schedule unit: ${unexpectedUnit}`);
    }
  }
  return taskDateFromUtcDate(date);
}

export function occurrenceDates(
  schedule: Schedule,
  endInclusive: TaskDate
): TaskDate[] {
  const dates: TaskDate[] = [];
  for (let date = schedule.nextDate; date <= endInclusive; date = nextOccurrenceDate({ ...schedule, nextDate: date })) {
    dates.push(date);
  }
  return dates;
}

export function decodeSchedule(data: unknown): Schedule {
  if (!isRecord(data)) throw new Error("Invalid schedule");
  const nextDate = decodeTaskDate(data.nextDate);
  if (
    data.unit !== "Days"
    && data.unit !== "Weeks"
    && data.unit !== "Months"
    && data.unit !== "Years"
  ) {
    throw new Error("Invalid schedule: invalid unit");
  }
  if (
    typeof data.every !== "number"
    || !Number.isInteger(data.every)
    || data.every < 1
    || data.every > maxInterval(data.unit)
  ) {
    throw new Error("Invalid schedule: invalid interval");
  }
  return {
    nextDate,
    every: data.every,
    unit: data.unit,
    anchorDate: decodeTaskDate(data.anchorDate)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
