import { decodeTaskDate, type TaskDate } from "./taskDate";

export const intervalLimits = { Days: 365, Weeks: 52, Months: 12, Years: 1 } as const;
export type IntervalUnit = keyof typeof intervalLimits;
export type Recurrence = { type: "Interval"; every: number; unit: IntervalUnit; anchor: TaskDate; };

export function decodeRecurrence(value: unknown): Recurrence {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid recurrence");
  const rule = value as Record<string, unknown>;
  if (rule.type !== "Interval") throw new Error("Invalid recurrence type");
  if (typeof rule.unit !== "string" || !Object.hasOwn(intervalLimits, rule.unit)) throw new Error("Invalid recurrence unit");
  const unit = rule.unit as IntervalUnit;
  if (typeof rule.every !== "number" || !Number.isInteger(rule.every) || rule.every < 1 || rule.every > intervalLimits[unit]) {
    throw new Error("Invalid recurrence interval");
  }
  return { type: "Interval", every: rule.every, unit, anchor: decodeTaskDate(rule.anchor) };
}

export function nextOccurrence(rule: Recurrence, current: TaskDate): TaskDate {
  const date = new Date(`${current}T00:00:00Z`);
  if (rule.unit === "Days" || rule.unit === "Weeks") {
    date.setUTCDate(date.getUTCDate() + rule.every * (rule.unit === "Weeks" ? 7 : 1));
  } else {
    const anchor = new Date(`${rule.anchor}T00:00:00Z`);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + rule.every * (rule.unit === "Years" ? 12 : 1));
    const last = new Date(date);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    date.setUTCDate(Math.min(anchor.getUTCDate(), last.getUTCDate()));
  }
  return decodeTaskDate(date.toISOString().slice(0, 10));
}

export function occurrenceDates(rule: Recurrence, start: TaskDate, through: TaskDate): TaskDate[] {
  const dates: TaskDate[] = [];
  for (let date = start; date <= through; date = nextOccurrence(rule, date)) dates.push(date);
  return dates;
}
