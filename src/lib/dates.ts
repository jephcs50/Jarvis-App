import type { Goal } from "./types";

/** Local-time date key, e.g. 2026-10-03. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function isDoneToday(goal: Goal): boolean {
  return goal.completions.includes(dateKey());
}

/** Consecutive days a habit was completed, ending today (or yesterday if today isn't done yet). */
export function streak(goal: Goal): number {
  const done = new Set(goal.completions);
  let cursor = new Date();
  if (!done.has(dateKey(cursor))) cursor = addDays(cursor, -1);
  let count = 0;
  while (done.has(dateKey(cursor))) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** Completions in the last 7 days, oldest first. */
export function lastSevenDays(goal: Goal): boolean[] {
  const done = new Set(goal.completions);
  return Array.from({ length: 7 }, (_, i) => done.has(dateKey(addDays(new Date(), i - 6))));
}

export function isOverdue(goal: Goal): boolean {
  return (
    goal.kind === "task" &&
    goal.completions.length === 0 &&
    goal.dueDate !== null &&
    goal.dueDate < dateKey()
  );
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
