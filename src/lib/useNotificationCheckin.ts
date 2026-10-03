import { useLastNotificationResponse } from "expo-notifications";
import type { ReminderKind } from "./notifications";

/** The check-in reminder the user tapped to open the app, if any. */
export function useNotificationCheckin(): { id: string; kind: ReminderKind } | null {
  const response = useLastNotificationResponse();
  const id = response?.notification.request.identifier;
  const kind = response?.notification.request.content.data?.checkin;
  if (!id || (kind !== "morning" && kind !== "evening")) return null;
  return { id, kind };
}
