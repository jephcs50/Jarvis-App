import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Settings } from "./types";

export type ReminderKind = "morning" | "evening" | "weekly";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("checkins", {
      name: "Check-ins",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Replace all scheduled check-ins with the ones in settings. Returns false if permission was denied. */
export async function scheduleCheckIns(settings: Settings): Promise<boolean> {
  if (Platform.OS === "web") return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.morningReminder && !settings.eveningReminder && !settings.weeklyReview) return true;
  if (!(await ensurePermission())) return false;

  const name = settings.userName ? `, ${settings.userName}` : "";
  const reminders: { kind: ReminderKind; time: Settings["morningReminder"]; title: string; body: string }[] = [
    {
      kind: "morning",
      time: settings.morningReminder,
      title: `Good morning${name}`,
      body: "Shall we go over today's priorities?",
    },
    {
      kind: "evening",
      time: settings.eveningReminder,
      title: "Evening check-in",
      body: "How did today go? Let's review before you wind down.",
    },
  ];

  for (const r of reminders) {
    if (!r.time) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { checkin: r.kind } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: r.time.hour,
        minute: r.time.minute,
        channelId: "checkins",
      },
    });
  }
  if (settings.weeklyReview) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Weekly review",
        body: "Ten minutes with Jarvis: what worked this week, what slipped, and next week's focus.",
        data: { checkin: "weekly" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: settings.weeklyReview.weekday,
        hour: settings.weeklyReview.hour,
        minute: settings.weeklyReview.minute,
        channelId: "checkins",
      },
    });
  }
  return true;
}
