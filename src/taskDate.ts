declare const brand: unique symbol;
export type TaskDate = string & { readonly [brand]: true; };

export function utcDateFromTaskDate(date: TaskDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function taskDateFromUtcDate(date: Date): TaskDate {
  return decodeTaskDate(date.toISOString().slice(0, 10));
}

export function formatTaskDate(date: TaskDate, today: TaskDate): string {
  const daysFromToday = (utcDateFromTaskDate(date).getTime() - utcDateFromTaskDate(today).getTime()) / 86_400_000;
  if (daysFromToday === -1) return "Yesterday";
  if (daysFromToday === 0) return "Today";
  if (daysFromToday === 1) return "Tomorrow";

  return new Intl.DateTimeFormat(undefined, {
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utcDateFromTaskDate(date));
}

export function taskDateToday(): TaskDate {
  return taskDateFromDate(new Date());
}

export function taskDateFromDate(date: Date): TaskDate {
  return decodeTaskDate(`${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
}

export function taskDateOneYearFromToday(): TaskDate {
  const date = utcDateFromTaskDate(taskDateToday());
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return taskDateFromUtcDate(date);
}

export function decodeTaskDate(value: unknown): TaskDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid task date");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid task date");
  }
  return value as TaskDate;
}
