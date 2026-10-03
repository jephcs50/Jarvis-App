import type { EventSubscription } from "expo-modules-core";
import type { ExpoSpeechRecognitionModule as RecognizerModule } from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

// expo-speech-recognition is a native module that isn't in Expo Go. Load it lazily so the
// rest of the app still runs there; hands-free mode just reports itself unavailable.
function loadRecognizer(): typeof RecognizerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech-recognition").ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

const recognizer = loadRecognizer();

export const JARVIS_VOICE: Speech.SpeechOptions = { language: "en-GB", rate: 1.0 };

/** Saying one of these ends hands-free mode instead of being sent to Jarvis. */
const EXIT_PHRASE = /^(ok(ay)?[, ]+)?(stop( listening)?|that'?s all|goodbye|good night|bye|thanks?,? that'?s it|i'?m done)( jarvis)?[.!]*$/i;

/** After this many listens in a row with no speech, hands-free mode switches itself off. */
const MAX_SILENT_LISTENS = 3;

export type VoiceStatus = "off" | "listening" | "thinking" | "speaking";

export function isHandsFreeAvailable(): boolean {
  try {
    return recognizer?.isRecognitionAvailable() ?? false;
  } catch {
    return false;
  }
}

/**
 * Hands-free conversation loop: listen → send what was heard → speak the reply → listen again.
 * `send` returns Jarvis's reply text, or null if the turn failed.
 */
export function useHandsFree(send: (text: string) => Promise<string | null>) {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [partial, setPartial] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const active = useRef(false);
  const heard = useRef("");
  const silentListens = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const listen = useCallback(() => {
    if (!recognizer || !active.current) return;
    heard.current = "";
    setPartial("");
    setStatus("listening");
    recognizer.start({
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
      // Record and play through the loudspeaker (not the earpiece), with Bluetooth headsets allowed.
      iosCategory: {
        category: "playAndRecord",
        categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
        mode: "default",
      },
      androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500 },
    });
  }, []);

  const stop = useCallback((message: string | null = null) => {
    active.current = false;
    setStatus("off");
    setPartial("");
    setNotice(message);
    try {
      recognizer?.abort();
    } catch {
      // Already stopped.
    }
    Speech.stop();
  }, []);

  const start = useCallback(async () => {
    if (!recognizer || !isHandsFreeAvailable()) {
      setNotice("Speech recognition isn't available here. Hands-free mode needs a development build of the app.");
      return;
    }
    const permission = await recognizer.requestPermissionsAsync();
    if (!permission.granted) {
      setNotice("Jarvis needs microphone and speech recognition access for hands-free mode.");
      return;
    }
    Speech.stop();
    active.current = true;
    silentListens.current = 0;
    setNotice(null);
    listen();
  }, [listen]);

  const handleHeard = useCallback(
    async (text: string) => {
      if (EXIT_PHRASE.test(text)) {
        stop();
        Speech.speak("Very good. I'll be here.", JARVIS_VOICE);
        return;
      }
      setStatus("thinking");
      const reply = await sendRef.current(text);
      if (!active.current) return;
      if (reply === null) {
        stop("Hands-free paused after an error.");
        return;
      }
      setStatus("speaking");
      Speech.speak(reply, {
        ...JARVIS_VOICE,
        onDone: listen,
        onError: listen,
      });
    },
    [listen, stop],
  );

  useEffect(() => {
    if (!recognizer) return;
    const subs: EventSubscription[] = [
      recognizer.addListener("result", (event) => {
        const transcript = event.results[0]?.transcript ?? "";
        if (event.isFinal) heard.current = transcript;
        else setPartial(transcript);
      }),
      recognizer.addListener("error", (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          stop("Microphone or speech recognition access was denied.");
        }
        // Other errors (no-speech, network, …) are followed by "end", handled below.
      }),
      recognizer.addListener("end", () => {
        if (!active.current) return;
        const text = heard.current.trim();
        if (!text) {
          silentListens.current += 1;
          if (silentListens.current >= MAX_SILENT_LISTENS) stop("Hands-free turned off after a quiet spell.");
          else listen();
          return;
        }
        silentListens.current = 0;
        setPartial(text);
        handleHeard(text);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [handleHeard, listen, stop]);

  // Never keep the mic open in the background, and release it when the screen goes away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && active.current) stop();
    });
    return () => {
      sub.remove();
      if (active.current) stop();
    };
  }, [stop]);

  return { status, partial, notice, start, stop: () => stop(), dismissNotice: () => setNotice(null) };
}
