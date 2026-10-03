import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { EMPTY_STATE, type AppState } from "./types";

const STATE_KEY = "jarvis.state.v1";
const API_KEY_KEY = "jarvis.anthropicApiKey";

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

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY_KEY);
}

export async function setApiKey(key: string): Promise<void> {
  if (key.trim()) {
    await SecureStore.setItemAsync(API_KEY_KEY, key.trim());
  } else {
    await SecureStore.deleteItemAsync(API_KEY_KEY);
  }
}
