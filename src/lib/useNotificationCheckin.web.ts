import type { ReminderKind } from "./notifications";

/** Notifications aren't supported on web. */
export function useNotificationCheckin(): { id: string; kind: ReminderKind } | null {
  return null;
}
