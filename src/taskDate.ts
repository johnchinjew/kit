declare const brand: unique symbol;
export type TaskDate = string & { readonly [brand]: true; };

export function formatTaskDate(date: TaskDate): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function taskDateToday(): TaskDate {
  const now = new Date();
  return decodeTaskDate(`${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
}

export function taskDateOneYearFromToday(): TaskDate {
  const date = new Date(`${taskDateToday()}T00:00:00Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return decodeTaskDate(date.toISOString().slice(0, 10));
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
