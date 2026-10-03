import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { EMPTY_STATE, type AppState } from "./types";

const STATE_KEY = "jarvis.state.v1";
const API_KEY_KEY = "jarvis.anthropicApiKey";
const PICOVOICE_KEY_KEY = "jarvis.picovoiceAccessKey";
const ACCESS_CODE_KEY = "jarvis.serverAccessCode";

export async function loadState(): Promise<AppState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      settings: { ...EMPTY_STATE.settings, ...parsed.settings },
    };
  } catch {
    return EMPTY_STATE;
  }
}

export async function saveState(state: AppState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

// SecureStore has no web implementation; the web build (used for quick testing) falls back to
// AsyncStorage, which is browser localStorage and not encrypted.
const secret = {
  get: (key: string) => (Platform.OS === "web" ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key)),
  set: (key: string, value: string) =>
    Platform.OS === "web" ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value),
  remove: (key: string) =>
    Platform.OS === "web" ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key),
};

export async function getApiKey(): Promise<string | null> {
  return secret.get(API_KEY_KEY);
}

export async function setApiKey(key: string): Promise<void> {
  if (key.trim()) {
    await secret.set(API_KEY_KEY, key.trim());
  } else {
    await secret.remove(API_KEY_KEY);
  }
}

export async function getPicovoiceKey(): Promise<string | null> {
  return secret.get(PICOVOICE_KEY_KEY);
}

export async function setPicovoiceKey(key: string): Promise<void> {
  if (key.trim()) {
    await secret.set(PICOVOICE_KEY_KEY, key.trim());
  } else {
    await secret.remove(PICOVOICE_KEY_KEY);
  }
}

export async function getAccessCode(): Promise<string | null> {
  return secret.get(ACCESS_CODE_KEY);
}

export async function setAccessCode(code: string): Promise<void> {
  if (code.trim()) {
    await secret.set(ACCESS_CODE_KEY, code.trim());
  } else {
    await secret.remove(ACCESS_CODE_KEY);
  }
}
