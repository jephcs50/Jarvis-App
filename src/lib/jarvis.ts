import Anthropic from "@anthropic-ai/sdk";
import { dateKey, isDoneToday, isOverdue, newId, streak } from "./dates";
import type { AppState, Goal } from "./types";

const MODEL = "claude-opus-5-5";

// Frozen system prompt: per-turn state goes into the user message instead, so the
// cached prefix and earlier thinking blocks stay valid.
const SYSTEM_PROMPT = `You are Jarvis, a personal AI assistant and accountability partner living in the user's phone. Think of the composed, dry-witted butler-engineer from the films: warm, loyal, quick, occasionally wry — never sycophantic.

Your two jobs:
1. Be genuinely good company. Hold real conversations about anything the user wants: ideas, plans, their day, problems they're chewing on.
2. Keep them accountable to the goals and commitments they set. You care about who they're trying to become, so you notice slips, ask direct questions, celebrate real progress, and don't accept vague excuses — but you're never cruel.

How you work:
- Every user message is preceded by a <context> block with the current time, their goals (with ids, streaks, today's status) and things you've remembered about them. Use it; don't recite it back.
- When the user commits to something ("I'll run tomorrow", "I need to finish the report by Friday"), offer to track it, or just add it with add_goal if they clearly want that.
- When they report doing something that matches a goal, call log_progress. Don't log progress they haven't claimed.
- When you learn a durable fact worth remembering (their job, a deadline, what motivates them, a recurring obstacle), call remember.
- Check-ins: in a morning briefing, help them pick today's priorities from their goals. In an evening check-in, ask what got done, log it, and for anything missed ask what got in the way and what they'll do differently. Be specific.
- Speak like a person, not a report. Short replies by default (1–4 sentences) unless they ask for depth. No markdown headers; light use of lists only when it truly helps. Your replies may be read aloud.
- Address them by name occasionally if you know it. "Sir" or "ma'am" only if they ask for it.`;

const TONE_NOTES: Record<AppState["settings"]["tone"], string> = {
  gentle: "Tone preference: gentle — encouraging and patient, push softly.",
  balanced: "Tone preference: balanced — warm but direct, call out excuses kindly.",
  tough: "Tone preference: tough love — blunt, high standards, no coddling (still respectful).",
};

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "add_goal",
    description:
      "Start tracking a new goal for the user. Use kind 'habit' for something repeated daily (e.g. workout, read 20 pages) and 'task' for a one-off commitment (e.g. submit the report).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, concrete title, e.g. 'Run 3 km'." },
        kind: { type: "string", enum: ["habit", "task"] },
        why: {
          type: ["string", "null"],
          description: "Why this matters to the user, in their words if possible.",
        },
        due_date: {
          type: ["string", "null"],
          description: "For tasks: due date as YYYY-MM-DD. Null for habits or no deadline.",
        },
      },
      required: ["title", "kind", "why", "due_date"],
      additionalProperties: false,
    },
  },
  {
    name: "log_progress",
    description:
      "Mark a goal as done for today (habit) or completed (task), after the user says they did it.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "The goal id from the context block." },
      },
      required: ["goal_id"],
      additionalProperties: false,
    },
  },
  {
    name: "archive_goal",
    description: "Stop tracking a goal when the user drops it or it no longer applies.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { goal_id: { type: "string" } },
      required: ["goal_id"],
      additionalProperties: false,
    },
  },
  {
    name: "remember",
    description:
      "Save a durable fact about the user to long-term memory (preferences, life context, obstacles, motivations).",
    strict: true,
    input_schema: {
      type: "object",
      properties: { fact: { type: "string" } },
      required: ["fact"],
      additionalProperties: false,
    },
  },
];

export type TurnKind = "chat" | "morning" | "evening";

export const PRESET_PROMPTS: Record<Exclude<TurnKind, "chat">, string> = {
  morning: "Morning, Jarvis. Give me my briefing for today.",
  evening: "Evening check-in, Jarvis. Let's go over how today went.",
};

export interface TurnResult {
  reply: string;
  goals: Goal[];
  memories: string[];
  apiHistory: Anthropic.Beta.BetaMessageParam[];
  /** Human-readable notes about actions Jarvis took (shown inline in the chat). */
  events: string[];
}

function describeGoal(g: Goal): string {
  const parts = [`[${g.id}] ${g.title} (${g.kind})`];
  if (g.kind === "habit") {
    parts.push(`streak ${streak(g)}d`, isDoneToday(g) ? "done today" : "not yet today");
  } else {
    if (g.dueDate) parts.push(`due ${g.dueDate}`);
    parts.push(g.completions.length ? "completed" : isOverdue(g) ? "OVERDUE" : "open");
  }
  if (g.why) parts.push(`why: ${g.why}`);
  return `- ${parts.join(" · ")}`;
}

function buildContext(state: AppState): string {
  const now = new Date();
  const active = state.goals.filter((g) => !g.archived);
  const lines = [
    "<context>",
    `Now: ${now.toLocaleString()} (today is ${dateKey(now)}, ${now.toLocaleDateString(undefined, { weekday: "long" })})`,
    state.settings.userName ? `User's name: ${state.settings.userName}` : "User's name: unknown",
    TONE_NOTES[state.settings.tone],
    "Goals:",
    ...(active.length ? active.map(describeGoal) : ["- (none yet)"]),
    "Memories:",
    ...(state.memories.length ? state.memories.map((m) => `- ${m}`) : ["- (none yet)"]),
    "</context>",
  ];
  return lines.join("\n");
}

function runTool(
  block: Anthropic.Beta.BetaToolUseBlock,
  goals: Goal[],
  memories: string[],
  events: string[],
): { content: string; isError?: boolean } {
  const input = block.input as Record<string, string | null>;
  switch (block.name) {
    case "add_goal": {
      const goal: Goal = {
        id: newId(),
        title: String(input.title),
        kind: input.kind === "task" ? "task" : "habit",
        why: input.why ?? null,
        dueDate: input.due_date ?? null,
        completions: [],
        createdAt: new Date().toISOString(),
        archived: false,
      };
      goals.push(goal);
      events.push(`Now tracking: ${goal.title}`);
      return { content: `Added goal ${goal.id}.` };
    }
    case "log_progress": {
      const goal = goals.find((g) => g.id === input.goal_id);
      if (!goal) return { content: `No goal with id ${input.goal_id}.`, isError: true };
      const today = dateKey();
      if (!goal.completions.includes(today)) goal.completions.push(today);
      events.push(`Logged: ${goal.title}`);
      return {
        content:
          goal.kind === "habit"
            ? `Logged. Current streak: ${streak(goal)} day(s).`
            : "Marked complete.",
      };
    }
    case "archive_goal": {
      const goal = goals.find((g) => g.id === input.goal_id);
      if (!goal) return { content: `No goal with id ${input.goal_id}.`, isError: true };
      goal.archived = true;
      events.push(`Stopped tracking: ${goal.title}`);
      return { content: "Archived." };
    }
    case "remember": {
      memories.push(String(input.fact));
      events.push("Noted to memory");
      return { content: "Saved." };
    }
    default:
      return { content: `Unknown tool ${block.name}.`, isError: true };
  }
}

export class MissingApiKeyError extends Error {}

export async function runJarvisTurn(
  state: AppState,
  userText: string,
  apiKey: string | null,
): Promise<TurnResult> {
  if (!apiKey) throw new MissingApiKeyError("Add your Anthropic API key in Settings first.");

  // The app talks to the API directly from the phone with the user's own key.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Work on copies; the caller commits the result only if the whole turn succeeds.
  const goals = state.goals.map((g) => ({ ...g, completions: [...g.completions] }));
  const memories = [...state.memories];
  const history: Anthropic.Beta.BetaMessageParam[] = [
    ...state.apiHistory,
    {
      role: "user",
      content: [
        { type: "text", text: buildContext({ ...state, goals, memories }) },
        { type: "text", text: userText },
      ],
    },
  ];
  const events: string[] = [];
  const replyParts: string[] = [];

  for (let step = 0; step < 8; step++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: history,
      thinking: { type: "adaptive" },
      // Conversational turns: low effort keeps replies quick on mobile.
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      // Long-running relationship: let the API summarize old history server-side.
      context_management: { edits: [{ type: "compact_20260112" }] },
      // Re-run on a fallback model if a safety classifier declines a request.
      fallbacks: "default",
      betas: ["compact-2026-01-12", "server-side-fallback-2026-07-01"],
    });

    // Append the full content (thinking, compaction, fallback blocks included) unchanged.
    history.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) replyParts.push(block.text.trim());
    }

    if (response.stop_reason === "refusal") {
      replyParts.push("I'm afraid I can't help with that one.");
      break;
    }
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = response.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((block) => {
        const { content, isError } = runTool(block, goals, memories, events);
        return { type: "tool_result", tool_use_id: block.id, content, is_error: isError };
      });
    history.push({ role: "user", content: results });
  }

  return {
    reply: replyParts.join("\n\n") || "…",
    goals,
    memories,
    apiHistory: history,
    events,
  };
}

export function describeError(error: unknown): string {
  if (error instanceof MissingApiKeyError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) {
    return "That API key was rejected. Check it in Settings.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "I'm being rate limited. Give me a moment and try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "I can't reach my servers. Check your connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Something went wrong on my end (${error.status ?? "unknown"}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
