import * as Speech from "expo-speech";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useStore } from "../../lib/store";
import { colors, radius } from "../../lib/theme";
import type { Settings } from "../../lib/types";
import { isWakeWordAvailable } from "../../lib/wakeWord";

type Time = Settings["morningReminder"];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const FULL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: { hour: number; minute: number } | null): string {
  return t ? `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}` : "";
}

function parseTime(s: string): Time | undefined {
  if (!s.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : undefined;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ReminderField({ label, value, onSave }: { label: string; value: Time; onSave: (t: Time) => void }) {
  const [text, setText] = useState(formatTime(value));
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { flex: 1 }]}>{label}</Text>
      <TextInput
        style={styles.timeInput}
        value={text}
        onChangeText={setText}
        placeholder="off"
        placeholderTextColor={colors.textMuted}
        keyboardType="numbers-and-punctuation"
        onEndEditing={() => {
          const parsed = parseTime(text);
          if (parsed === undefined) {
            Alert.alert("Invalid time", "Use 24-hour HH:MM, e.g. 07:30. Leave blank to turn off.");
            setText(formatTime(value));
          } else {
            onSave(parsed);
          }
        }}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { state, loaded, hasApiKey, hasPicovoiceKey, saveApiKey, savePicovoiceKey, updateSettings, forgetMemory } =
    useStore();
  const { settings } = state;
  const [keyDraft, setKeyDraft] = useState("");
  const [picovoiceDraft, setPicovoiceDraft] = useState("");
  const [name, setName] = useState<string | null>(null);

  const saveReminders = async (patch: Partial<Settings>) => {
    const ok = await updateSettings(patch);
    if (!ok) Alert.alert("Notifications are off", "Allow notifications for Jarvis in your phone’s settings.");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Section title="Anthropic API key">
        <Text style={styles.help}>
          {hasApiKey ? "✓ Key saved securely on this device." : "Jarvis runs on Claude. Paste a key from console.anthropic.com."}
        </Text>
        <TextInput
          style={styles.input}
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder={hasApiKey ? "Paste a new key to replace" : "sk-ant-..."}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          {hasApiKey && (
            <Pressable style={styles.secondaryButton} onPress={() => saveApiKey("")}>
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.primaryButton, !keyDraft.trim() && { opacity: 0.4 }]}
            disabled={!keyDraft.trim()}
            onPress={async () => {
              await saveApiKey(keyDraft);
              setKeyDraft("");
            }}
          >
            <Text style={styles.primaryText}>Save key</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="About you">
        <View style={styles.row}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.inlineInput}
            value={name ?? settings.userName}
            onChangeText={setName}
            onEndEditing={() => name !== null && updateSettings({ userName: name.trim() })}
            placeholder="optional"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <Text style={[styles.label, { marginTop: 12, marginBottom: 8 }]}>How hard should Jarvis push?</Text>
        <View style={styles.segment}>
          {(["gentle", "balanced", "tough"] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.segmentItem, settings.tone === t && styles.segmentActive]}
              onPress={() => updateSettings({ tone: t })}
            >
              <Text style={[styles.segmentText, settings.tone === t && { color: colors.bg }]}>
                {t === "tough" ? "Tough love" : t[0].toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="Voice">
        <View style={styles.row}>
          <Text style={styles.label}>Read typed replies aloud</Text>
          <Switch
            value={settings.voiceEnabled}
            onValueChange={(v) => {
              updateSettings({ voiceEnabled: v });
              if (v) Speech.speak("At your service.", { language: "en-GB" });
              else Speech.stop();
            }}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        <Text style={styles.help}>
          Typed messages are read aloud when this is on. For a fully hands-free conversation, tap the 🎙 button in the chat:
          Jarvis listens, replies out loud, then listens again. Say “that’s all” or tap End to finish.
        </Text>
      </Section>

      <Section title="“Hey Jarvis” wake word">
        <View style={styles.row}>
          <Text style={styles.label}>Listen for “Hey Jarvis”</Text>
          <Switch
            value={settings.wakeWordEnabled}
            disabled={!hasPicovoiceKey && !settings.wakeWordEnabled}
            onValueChange={(v) => {
              updateSettings({ wakeWordEnabled: v });
            }}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        <Text style={styles.help}>
          While Jarvis is open on screen, say “Hey Jarvis” to start a hands-free conversation. Detection runs entirely on
          your phone. No audio leaves the device until Jarvis wakes up. It pauses when the app is in the background.
          {isWakeWordAvailable() ? "" : "\n\nRequires a development build of the app (not Expo Go)."}
        </Text>
        <Text style={styles.help}>
          {hasPicovoiceKey
            ? "✓ Picovoice AccessKey saved."
            : "The wake word engine needs a free Picovoice AccessKey from console.picovoice.ai."}
        </Text>
        <TextInput
          style={styles.input}
          value={picovoiceDraft}
          onChangeText={setPicovoiceDraft}
          placeholder={hasPicovoiceKey ? "Paste a new AccessKey to replace" : "Picovoice AccessKey"}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          {hasPicovoiceKey && (
            <Pressable
              style={styles.secondaryButton}
              onPress={async () => {
                await savePicovoiceKey("");
                updateSettings({ wakeWordEnabled: false });
              }}
            >
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.primaryButton, !picovoiceDraft.trim() && { opacity: 0.4 }]}
            disabled={!picovoiceDraft.trim()}
            onPress={async () => {
              await savePicovoiceKey(picovoiceDraft);
              setPicovoiceDraft("");
            }}
          >
            <Text style={styles.primaryText}>Save AccessKey</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="Check-ins">
        <ReminderField
          key={`m-${loaded}-${formatTime(settings.morningReminder)}`}
          label="Morning briefing"
          value={settings.morningReminder}
          onSave={(t) => saveReminders({ morningReminder: t })}
        />
        <ReminderField
          key={`e-${loaded}-${formatTime(settings.eveningReminder)}`}
          label="Evening review"
          value={settings.eveningReminder}
          onSave={(t) => saveReminders({ eveningReminder: t })}
        />
        <ReminderField
          key={`w-${loaded}-${formatTime(settings.weeklyReview)}`}
          label="Weekly review"
          value={settings.weeklyReview}
          onSave={(t) =>
            saveReminders({ weeklyReview: t ? { weekday: settings.weeklyReview?.weekday ?? 1, ...t } : null })
          }
        />
        {settings.weeklyReview && (
          <View style={styles.weekdays}>
            {WEEKDAYS.map((label, i) => {
              const weekday = i + 1;
              const selected = settings.weeklyReview?.weekday === weekday;
              return (
                <Pressable
                  key={weekday}
                  style={[styles.weekday, selected && styles.segmentActive]}
                  onPress={() => {
                    const review = settings.weeklyReview;
                    if (review) saveReminders({ weeklyReview: { ...review, weekday } });
                  }}
                  accessibilityLabel={`Weekly review on ${FULL_WEEKDAYS[i]}`}
                >
                  <Text style={[styles.segmentText, selected && { color: colors.bg }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={styles.help}>Tapping a reminder opens Jarvis straight into the check-in. Leave a time blank to turn it off.</Text>
        <Pressable
          style={[styles.secondaryButton, { alignSelf: "flex-start" }]}
          onPress={() =>
            saveReminders({
              morningReminder: settings.morningReminder,
              eveningReminder: settings.eveningReminder,
              weeklyReview: settings.weeklyReview,
            })
          }
        >
          <Text style={{ color: colors.accent }}>Re-enable reminders</Text>
        </Pressable>
      </Section>

      <Section title="What Jarvis remembers">
        {state.memories.length === 0 ? (
          <Text style={styles.help}>Nothing yet. Jarvis saves useful facts as you talk.</Text>
        ) : (
          state.memories.map((m, i) => (
            <View key={`${i}-${m}`} style={styles.memory}>
              <Text style={styles.memoryText}>{m}</Text>
              <Pressable onPress={() => forgetMemory(i)} hitSlop={10}>
                <Text style={styles.danger}>Forget</Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  section: { marginBottom: 22 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { color: colors.text, fontSize: 16 },
  help: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inlineInput: { flex: 1, textAlign: "right", color: colors.text, fontSize: 16, paddingVertical: 4 },
  timeInput: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 90,
    flexGrow: 0,
    textAlign: "center",
    fontSize: 16,
  },
  buttonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
  primaryText: { color: colors.bg, fontWeight: "700" },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 4 },
  danger: { color: colors.danger },
  segment: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.sm, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontWeight: "500" },
  weekdays: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  weekday: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  memory: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  memoryText: { color: colors.text, flex: 1, lineHeight: 20 },
});
