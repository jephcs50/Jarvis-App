import type { PorcupineManager as PorcupineManagerType } from "@picovoice/porcupine-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, NativeModules } from "react-native";
import { getPicovoiceKey } from "./storage";
import { requestMicrophone } from "./voice";

// Porcupine is a native module (not in Expo Go). Load it lazily so the app still runs without it.
type PorcupineModule = typeof import("@picovoice/porcupine-react-native");
function loadPorcupine(): PorcupineModule | null {
  if (!NativeModules.PvPorcupine || !NativeModules.PvVoiceProcessor) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@picovoice/porcupine-react-native");
  } catch {
    return null;
  }
}

const porcupine = loadPorcupine();

/** Higher catches more wake words but risks false triggers. Range 0–1. */
const SENSITIVITY = 0.65;

export type WakeWordStatus = "off" | "listening" | "error";

export function isWakeWordAvailable(): boolean {
  return porcupine !== null;
}

function describeWakeWordError(error: unknown): string {
  if (porcupine && error instanceof porcupine.PorcupineErrors.PorcupineActivationError) {
    return "Your Picovoice AccessKey was rejected. Check it in Settings.";
  }
  if (porcupine && error instanceof porcupine.PorcupineErrors.PorcupineActivationLimitError) {
    return "Your Picovoice AccessKey has reached its device limit.";
  }
  return `Wake word stopped: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Listens on-device for "Jarvis" (so "Hey Jarvis" works too) while the app is in the foreground.
 * The mic is released before `onWake` runs, so the speech recognizer can take over.
 * Pass `paused` while something else (a hands-free conversation) is using the microphone.
 */
export function useWakeWord({
  enabled,
  paused,
  keyVersion,
  onWake,
}: {
  enabled: boolean;
  paused: boolean;
  keyVersion: number;
  onWake: () => void;
}) {
  const [status, setStatus] = useState<WakeWordStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === "active");

  const manager = useRef<PorcupineManagerType | null>(null);
  // Native start/stop calls are async; run them one at a time so toggles can't interleave.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  const enqueue = (task: () => Promise<void>) => {
    queue.current = queue.current.then(task).catch(() => {});
  };

  const release = async () => {
    const m = manager.current;
    manager.current = null;
    if (!m) return;
    await m.stop().catch(() => {});
    m.delete();
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => sub.remove();
  }, []);

  // A new key means a new engine.
  useEffect(() => {
    enqueue(release);
  }, [keyVersion]);

  useEffect(() => {
    const shouldListen = enabled && !paused && foreground;
    enqueue(async () => {
      if (!shouldListen) {
        if (enabled) await manager.current?.stop().catch(() => {});
        else await release();
        setStatus("off");
        return;
      }
      if (!porcupine) {
        setStatus("error");
        setError("The wake word needs a development build of the app.");
        return;
      }
      try {
        if (!manager.current) {
          const accessKey = await getPicovoiceKey();
          if (!accessKey) {
            setStatus("error");
            setError("Add your Picovoice AccessKey in Settings to use “Hey Jarvis”.");
            return;
          }
          if (!(await requestMicrophone())) {
            setStatus("error");
            setError("Jarvis needs microphone access to listen for “Hey Jarvis”.");
            return;
          }
          manager.current = await porcupine.PorcupineManager.fromBuiltInKeywords(
            accessKey,
            [porcupine.BuiltInKeywords.JARVIS],
            () => {
              // Free the mic first, then hand over to the conversation.
              enqueue(async () => {
                await manager.current?.stop().catch(() => {});
                setStatus("off");
                onWakeRef.current();
              });
            },
            (e) => {
              setStatus("error");
              setError(describeWakeWordError(e));
            },
            undefined,
            undefined,
            [SENSITIVITY],
          );
        }
        await manager.current.start();
        setError(null);
        setStatus("listening");
      } catch (e) {
        await release();
        setStatus("error");
        setError(describeWakeWordError(e));
      }
    });
  }, [enabled, paused, foreground, keyVersion]);

  // Release the engine when the screen goes away.
  useEffect(() => () => enqueue(release), []);

  return { status, error };
}
