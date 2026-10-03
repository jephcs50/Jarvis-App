import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_SERVER_URL } from "./config";

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
  /** "server": requests go through a Jarvis server holding the API key; "apiKey": straight to Anthropic. */
  connection: "server" | "apiKey";
  serverUrl: string;
  userName: string;
  voiceEnabled: boolean;
  morningReminder: { hour: number; minute: number } | null;
  eveningReminder: { hour: number; minute: number } | null;
  /** Weekly review reminder; weekday 1 = Sunday … 7 = Saturday. */
  weeklyReview: { weekday: number; hour: number; minute: number } | null;
  /** Listen for "Hey Jarvis" while the app is open (needs a Picovoice AccessKey). */
  wakeWordEnabled: boolean;
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
  connection: DEFAULT_SERVER_URL ? "server" : "apiKey",
  serverUrl: DEFAULT_SERVER_URL,
  userName: "",
  voiceEnabled: false,
  morningReminder: { hour: 8, minute: 0 },
  eveningReminder: { hour: 21, minute: 0 },
  weeklyReview: { weekday: 1, hour: 18, minute: 0 },
  wakeWordEnabled: false,
  tone: "balanced",
};

export const EMPTY_STATE: AppState = {
  goals: [],
  memories: [],
  chat: [],
  apiHistory: [],
  settings: DEFAULT_SETTINGS,
};
