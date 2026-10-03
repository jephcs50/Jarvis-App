import type Anthropic from "@anthropic-ai/sdk";

export type GoalKind = "habit" | "task";

export interface Goal {
  id: string;
  title: string;
  kind: GoalKind;
  /** Why this matters to the user — Jarvis uses it to motivate. */
  why: string | null;
  /** YYYY-MM-DD, tasks only. */
  dueDate: string | null;
  /** Date keys (YYYY-MM-DD) on which a habit was done, or the day a task was completed. */
  completions: string[];
  createdAt: string;
  archived: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "jarvis" | "event";
  text: string;
  ts: string;
}

export interface Settings {
  userName: string;
  voiceEnabled: boolean;
  morningReminder: { hour: number; minute: number } | null;
  eveningReminder: { hour: number; minute: number } | null;
  /** How hard Jarvis pushes back. */
  tone: "gentle" | "balanced" | "tough";
}

export interface AppState {
  goals: Goal[];
  memories: string[];
  chat: ChatMessage[];
  /** Raw Claude conversation, kept append-only so thinking/compaction blocks stay valid. */
  apiHistory: Anthropic.Beta.BetaMessageParam[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  userName: "",
  voiceEnabled: false,
  morningReminder: { hour: 8, minute: 0 },
  eveningReminder: { hour: 21, minute: 0 },
  tone: "balanced",
};

export const EMPTY_STATE: AppState = {
  goals: [],
  memories: [],
  chat: [],
  apiHistory: [],
  settings: DEFAULT_SETTINGS,
};
