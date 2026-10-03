import * as Speech from "expo-speech";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { dateKey, newId } from "./dates";
import { describeError, runJarvisTurn } from "./jarvis";
import { scheduleCheckIns } from "./notifications";
import { JARVIS_VOICE } from "./voice";
import {
  getApiKey,
  getPicovoiceKey,
  loadState,
  saveState,
  setApiKey as persistApiKey,
  setPicovoiceKey as persistPicovoiceKey,
} from "./storage";
import { EMPTY_STATE, type AppState, type ChatMessage, type Goal, type GoalKind, type Settings } from "./types";

interface Store {
  state: AppState;
  loaded: boolean;
  thinking: boolean;
  hasApiKey: boolean;
  hasPicovoiceKey: boolean;
  /** Bumps whenever the Picovoice key changes, so the wake-word engine can re-initialize. */
  picovoiceKeyVersion: number;
  /** Sends a message to Jarvis and resolves with the reply, or null if nothing was sent or it failed. */
  send: (text: string, options?: SendOptions) => Promise<string | null>;
  addGoal: (title: string, kind: GoalKind, why: string | null, dueDate: string | null) => void;
  toggleToday: (goalId: string) => void;
  archiveGoal: (goalId: string) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  saveApiKey: (key: string) => Promise<void>;
  savePicovoiceKey: (key: string) => Promise<void>;
  forgetMemory: (index: number) => void;
  newConversation: () => void;
}

export interface SendOptions {
  /** Hands-free voice turn: Jarvis keeps it short, and the caller handles speaking the reply. */
  voice?: boolean;
}

const StoreContext = createContext<Store | null>(null);

function message(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: newId(), role, text, ts: new Date().toISOString() };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasPicovoiceKey, setHasPicovoiceKey] = useState(false);
  const [picovoiceKeyVersion, setPicovoiceKeyVersion] = useState(0);
  // Latest state for async callbacks, so a Jarvis turn sees edits made while it was loading.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    Promise.all([loadState(), getApiKey(), getPicovoiceKey()]).then(([s, key, picovoiceKey]) => {
      setState(s);
      setHasApiKey(Boolean(key));
      setHasPicovoiceKey(Boolean(picovoiceKey));
      setLoaded(true);
      scheduleCheckIns(s.settings).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (loaded) saveState(state).catch(() => {});
  }, [state, loaded]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);

  const send = useCallback(
    async (text: string, options: SendOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return null;
      update((s) => ({ ...s, chat: [...s.chat, message("user", trimmed)] }));
      setThinking(true);
      try {
        const result = await runJarvisTurn(stateRef.current, trimmed, await getApiKey(), {
          voice: options.voice ?? false,
        });
        update((s) => ({
          ...s,
          goals: result.goals,
          memories: result.memories,
          apiHistory: result.apiHistory,
          chat: [
            ...s.chat,
            ...result.events.map((e) => message("event", e)),
            message("jarvis", result.reply),
          ],
        }));
        if (stateRef.current.settings.voiceEnabled && !options.voice) {
          Speech.stop();
          Speech.speak(result.reply, JARVIS_VOICE);
        }
        return result.reply;
      } catch (error) {
        update((s) => ({ ...s, chat: [...s.chat, message("event", describeError(error))] }));
        return null;
      } finally {
        setThinking(false);
      }
    },
    [thinking, update],
  );

  const addGoal = useCallback<Store["addGoal"]>(
    (title, kind, why, dueDate) => {
      const goal: Goal = {
        id: newId(),
        title: title.trim(),
        kind,
        why: why?.trim() || null,
        dueDate: kind === "task" ? dueDate : null,
        completions: [],
        createdAt: new Date().toISOString(),
        archived: false,
      };
      update((s) => ({ ...s, goals: [...s.goals, goal] }));
    },
    [update],
  );

  const toggleToday = useCallback(
    (goalId: string) => {
      const today = dateKey();
      update((s) => ({
        ...s,
        goals: s.goals.map((g) => {
          if (g.id !== goalId) return g;
          if (g.kind === "task") {
            return { ...g, completions: g.completions.length ? [] : [today] };
          }
          const done = g.completions.includes(today);
          return {
            ...g,
            completions: done ? g.completions.filter((d) => d !== today) : [...g.completions, today],
          };
        }),
      }));
    },
    [update],
  );

  const archiveGoal = useCallback(
    (goalId: string) =>
      update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === goalId ? { ...g, archived: true } : g)) })),
    [update],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const settings = { ...stateRef.current.settings, ...patch };
      update((s) => ({ ...s, settings }));
      if ("morningReminder" in patch || "eveningReminder" in patch || "userName" in patch) {
        return scheduleCheckIns(settings).catch(() => false);
      }
      return true;
    },
    [update],
  );

  const saveApiKey = useCallback(async (key: string) => {
    await persistApiKey(key);
    setHasApiKey(Boolean(key.trim()));
  }, []);

  const savePicovoiceKey = useCallback(async (key: string) => {
    await persistPicovoiceKey(key);
    setHasPicovoiceKey(Boolean(key.trim()));
    setPicovoiceKeyVersion((v) => v + 1);
  }, []);

  const forgetMemory = useCallback(
    (index: number) => update((s) => ({ ...s, memories: s.memories.filter((_, i) => i !== index) })),
    [update],
  );

  const newConversation = useCallback(
    () => update((s) => ({ ...s, chat: [], apiHistory: [] })),
    [update],
  );

  return (
    <StoreContext.Provider
      value={{
        state,
        loaded,
        thinking,
        hasApiKey,
        hasPicovoiceKey,
        picovoiceKeyVersion,
        send,
        addGoal,
        toggleToday,
        archiveGoal,
        updateSettings,
        saveApiKey,
        savePicovoiceKey,
        forgetMemory,
        newConversation,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
