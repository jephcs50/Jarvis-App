import * as Haptics from "expo-haptics";
import { useLastNotificationResponse } from "expo-notifications";
import { router } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { PRESET_PROMPTS } from "../../lib/jarvis";
import { useStore } from "../../lib/store";
import { useHandsFree } from "../../lib/voice";
import { VoicePanel } from "../../components/VoicePanel";
import { colors, radius } from "../../lib/theme";
import type { ChatMessage } from "../../lib/types";

const QUICK_ACTIONS = [
  { label: "☀ Morning briefing", prompt: PRESET_PROMPTS.morning },
  { label: "☾ Evening check-in", prompt: PRESET_PROMPTS.evening },
  { label: "I'm procrastinating", prompt: "Jarvis, I'm procrastinating. Help me get moving." },
  { label: "New goal", prompt: "I want to set a new goal. Help me make it concrete." },
];

function Bubble({ item }: { item: ChatMessage }) {
  if (item.role === "event") {
    return <Text style={styles.event}>— {item.text} —</Text>;
  }
  const mine = item.role === "user";
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      <Text style={[styles.bubbleText, mine && { color: colors.bg }]}>{item.text}</Text>
    </View>
  );
}

export default function ChatScreen() {
  const { state, loaded, thinking, hasApiKey, send, newConversation } = useStore();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const voice = useHandsFree((text) => send(text, { voice: true }));
  const handsFree = voice.status !== "off";

  const startHandsFree = () => {
    if (!hasApiKey) {
      router.navigate("/settings");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    voice.start();
  };

  // Tapping a morning/evening reminder opens the app straight into that check-in.
  const response = useLastNotificationResponse();
  const handledNotification = useRef<string | null>(null);
  useEffect(() => {
    const id = response?.notification.request.identifier;
    const kind = response?.notification.request.content.data?.checkin;
    if (!loaded || !id || handledNotification.current === id) return;
    handledNotification.current = id;
    if (kind === "morning" || kind === "evening") send(PRESET_PROMPTS[kind]);
  }, [response, loaded, send]);

  const submit = (text: string) => {
    if (!text.trim() || thinking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setDraft("");
    send(text);
  };

  const data = [...state.chat].reverse();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {!hasApiKey && loaded && (
        <Pressable style={styles.banner} onPress={() => router.navigate("/settings")}>
          <Text style={styles.bannerText}>Add your Anthropic API key in Settings to wake Jarvis up →</Text>
        </Pressable>
      )}

      <FlatList
        ref={listRef}
        inverted
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Bubble item={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          thinking ? (
            <View style={[styles.bubble, styles.theirs, styles.thinking]}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.thinkingText}>Thinking…</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.reactor} />
            <Text style={styles.emptyTitle}>Jarvis online.</Text>
            <Text style={styles.emptyBody}>
              Tell me what you’re working toward, or just talk. I’ll keep track — and keep you honest.
            </Text>
          </View>
        }
      />

      {voice.notice && (
        <Pressable style={styles.notice} onPress={voice.dismissNotice}>
          <Text style={styles.noticeText}>{voice.notice}</Text>
        </Pressable>
      )}

      {handsFree ? (
        <VoicePanel status={voice.status} transcript={voice.partial} onEnd={voice.stop} />
      ) : (
        <>
      <View style={styles.quickRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={QUICK_ACTIONS}
          keyExtractor={(a) => a.label}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
          renderItem={({ item }) => (
            <Pressable style={styles.chip} onPress={() => submit(item.prompt)} disabled={thinking}>
              <Text style={styles.chipText}>{item.label}</Text>
            </Pressable>
          )}
        />
      </View>

      <View style={styles.composer}>
        <Pressable
          onPress={() =>
            Alert.alert("New conversation?", "Jarvis keeps your goals and memories, but this chat will be cleared.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Start fresh",
                onPress: () => {
                  Speech.stop();
                  newConversation();
                },
              },
            ])
          }
          style={styles.iconButton}
          accessibilityLabel="Start a new conversation"
          disabled={thinking}
        >
          <Text style={styles.iconText}>↺</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Talk to Jarvis…"
          placeholderTextColor={colors.textMuted}
          multiline
          onSubmitEditing={() => submit(draft)}
        />
        {draft.trim() ? (
          <Pressable
            style={[styles.send, thinking && { opacity: 0.4 }]}
            onPress={() => submit(draft)}
            disabled={thinking}
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.send, thinking && { opacity: 0.4 }]}
            onPress={startHandsFree}
            disabled={thinking}
            accessibilityLabel="Start hands-free voice conversation"
          >
            <Text style={styles.micText}>🎙</Text>
          </Pressable>
        )}
      </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 12, gap: 8, flexGrow: 1 },
  banner: { backgroundColor: colors.surfaceRaised, padding: 12, borderBottomColor: colors.gold, borderBottomWidth: 1 },
  bannerText: { color: colors.gold, textAlign: "center" },
  bubble: { maxWidth: "85%", paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.lg },
  mine: { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  event: { color: colors.accentDim, fontSize: 12, textAlign: "center", marginVertical: 2 },
  thinking: { flexDirection: "row", alignItems: "center", gap: 8 },
  thinkingText: { color: colors.textMuted },
  // Inverted list: the empty state is flipped, so un-flip it.
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, transform: [{ scaleY: -1 }] },
  reactor: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 6,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 20,
    shadowColor: colors.accent,
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "600", marginBottom: 8 },
  emptyBody: { color: colors.textMuted, textAlign: "center", lineHeight: 21 },
  quickRow: { paddingVertical: 8 },
  chip: {
    borderColor: colors.accentDim,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { color: colors.accent, fontSize: 13 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    maxHeight: 120,
  },
  iconButton: { width: 40, height: 42, alignItems: "center", justifyContent: "center" },
  iconText: { color: colors.textMuted, fontSize: 22 },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: colors.bg, fontSize: 22, fontWeight: "700" },
  micText: { fontSize: 20 },
  notice: { backgroundColor: colors.surfaceRaised, paddingVertical: 8, paddingHorizontal: 14 },
  noticeText: { color: colors.gold, fontSize: 13, textAlign: "center" },
});
