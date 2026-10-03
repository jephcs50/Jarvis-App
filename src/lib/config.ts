/**
 * Jarvis server baked in at build time, e.g. in eas.json:
 *   "env": { "EXPO_PUBLIC_JARVIS_SERVER_URL": "https://jarvis-server.onrender.com" }
 * People then only need an access code. They can still change it in Settings.
 */
export const DEFAULT_SERVER_URL = (process.env.EXPO_PUBLIC_JARVIS_SERVER_URL ?? "").replace(/\/+$/, "");
