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

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Habit check-ins in the last 7 days, and how many were possible since the habit was created. */
export function weekProgress(goal: Goal): { done: number; possible: number } {
  const today = dateKey();
  const since = daysBetween(dateKey(new Date(goal.createdAt)), today);
  const possible = Math.max(1, Math.min(7, since + 1));
  const done = goal.completions.filter((d) => {
    const ago = daysBetween(d, today);
    return ago >= 0 && ago < 7;
  }).length;
  return { done: Math.min(done, possible), possible };
}

export interface WeekSummary {
  habitsDoneToday: number;
  habitCount: number;
  /** Share of possible habit check-ins done in the last 7 days, 0–100, or null with no habits. */
  weekRate: number | null;
  bestStreak: number;
  tasksDoneThisWeek: number;
}

export function weekSummary(goals: Goal[]): WeekSummary {
  const active = goals.filter((g) => !g.archived);
  const habits = active.filter((g) => g.kind === "habit");
  const today = dateKey();
  let done = 0;
  let possible = 0;
  for (const h of habits) {
    const w = weekProgress(h);
    done += w.done;
    possible += w.possible;
  }
  return {
    habitsDoneToday: habits.filter(isDoneToday).length,
    habitCount: habits.length,
    weekRate: possible ? Math.round((done / possible) * 100) : null,
    bestStreak: habits.reduce((best, h) => Math.max(best, streak(h)), 0),
    tasksDoneThisWeek: goals.filter(
      (g) => g.kind === "task" && g.completions.some((d) => daysBetween(d, today) < 7),
    ).length,
  };
}
