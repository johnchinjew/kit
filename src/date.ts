declare const brand: unique symbol;
export type TaskDate = string & { readonly [brand]: true; };

export function formatDate(date: TaskDate, locales?: string | string[]): string {
  return new Intl.DateTimeFormat(locales, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function today(): TaskDate {
  const now = new Date();
  return decodeDate(`${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
}

export function oneYearFromToday(): TaskDate {
  const date = new Date(`${today()}T00:00:00Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return decodeDate(date.toISOString().slice(0, 10));
}

export function decodeDate(value: unknown): TaskDate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid task date");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid task date");
  }
  return value as TaskDate;
}
