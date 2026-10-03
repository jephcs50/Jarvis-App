import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { isDoneToday, isOverdue, lastSevenDays, streak, weekProgress, weekSummary } from "../../lib/dates";
import { useStore } from "../../lib/store";
import { colors, radius } from "../../lib/theme";
import type { Goal, GoalKind } from "../../lib/types";

function GoalCard({ goal }: { goal: Goal }) {
  const { toggleToday, archiveGoal } = useStore();
  const done = goal.kind === "habit" ? isDoneToday(goal) : goal.completions.length > 0;
  const overdue = isOverdue(goal);

  return (
    <Pressable
      style={[styles.card, done && styles.cardDone]}
      onPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toggleToday(goal.id);
      }}
      onLongPress={() =>
        Alert.alert(goal.title, "Stop tracking this goal?", [
          { text: "Cancel", style: "cancel" },
          { text: "Archive", style: "destructive", onPress: () => archiveGoal(goal.id) },
        ])
      }
    >
      <View style={[styles.check, done && styles.checkDone]}>
        {done && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, done && styles.titleDone]}>{goal.title}</Text>
        {goal.why && <Text style={styles.why}>{goal.why}</Text>}
        {goal.kind === "habit" ? (
          <View style={styles.metaRow}>
            <View style={styles.week}>
              {lastSevenDays(goal).map((d, i) => (
                <View key={i} style={[styles.dot, d && styles.dotOn]} />
              ))}
            </View>
            <Text style={styles.weekCount}>
              {weekProgress(goal).done}/{weekProgress(goal).possible} this week
            </Text>
            <Text style={styles.streak}>🔥 {streak(goal)}</Text>
          </View>
        ) : (
          goal.dueDate && (
            <Text style={[styles.due, overdue && { color: colors.danger }]}>
              {overdue ? "Overdue · " : "Due "}
              {goal.dueDate}
            </Text>
          )
        )}
      </View>
    </Pressable>
  );
}

function AddGoal({ onDone }: { onDone: () => void }) {
  const { addGoal } = useStore();
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [kind, setKind] = useState<GoalKind>("habit");
  const [due, setDue] = useState("");

  const save = () => {
    if (!title.trim()) return;
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due.trim()) ? due.trim() : null;
    addGoal(title, kind, why, dueDate);
    onDone();
  };

  return (
    <View style={styles.form}>
      <View style={styles.segment}>
        {(["habit", "task"] as const).map((k) => (
          <Pressable key={k} style={[styles.segmentItem, kind === k && styles.segmentActive]} onPress={() => setKind(k)}>
            <Text style={[styles.segmentText, kind === k && { color: colors.bg }]}>
              {k === "habit" ? "Daily habit" : "One-off task"}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder={kind === "habit" ? "e.g. Read 20 pages" : "e.g. Send the proposal"}
        placeholderTextColor={colors.textMuted}
        value={title}
        onChangeText={setTitle}
        autoFocus
      />
      <TextInput
        style={styles.input}
        placeholder="Why does this matter? (Jarvis will remind you)"
        placeholderTextColor={colors.textMuted}
        value={why}
        onChangeText={setWhy}
      />
      {kind === "task" && (
        <TextInput
          style={styles.input}
          placeholder="Due date (YYYY-MM-DD, optional)"
          placeholderTextColor={colors.textMuted}
          value={due}
          onChangeText={setDue}
        />
      )}
      <View style={styles.formButtons}>
        <Pressable onPress={onDone} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={save} style={[styles.primaryButton, !title.trim() && { opacity: 0.4 }]}>
          <Text style={styles.primaryText}>Add goal</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export default function GoalsScreen() {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  const active = state.goals.filter((g) => !g.archived);
  const habits = active.filter((g) => g.kind === "habit");
  const tasks = active.filter((g) => g.kind === "task");
  const summary = weekSummary(state.goals);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      {habits.length > 0 && (
        <View style={styles.tiles}>
          <StatTile value={`${summary.habitsDoneToday}/${summary.habitCount}`} label="done today" />
          <StatTile value={summary.weekRate === null ? "–" : `${summary.weekRate}%`} label="this week" />
          <StatTile value={`${summary.bestStreak}`} label={summary.bestStreak === 1 ? "day best streak" : "days best streak"} />
        </View>
      )}

      {adding ? (
        <AddGoal onDone={() => setAdding(false)} />
      ) : (
        <Pressable style={styles.addButton} onPress={() => setAdding(true)}>
          <Text style={styles.addText}>+ New goal</Text>
        </Pressable>
      )}

      {habits.length > 0 && <Text style={styles.section}>Daily habits</Text>}
      {habits.map((g) => (
        <GoalCard key={g.id} goal={g} />
      ))}

      {tasks.length > 0 && <Text style={styles.section}>Commitments</Text>}
      {tasks.map((g) => (
        <GoalCard key={g.id} goal={g} />
      ))}

      {active.length === 0 && !adding && (
        <Text style={styles.empty}>
          No goals yet. Add one here, or just tell Jarvis what you want to get done — it’ll set things up for you.
        </Text>
      )}
      {active.length > 0 && <Text style={styles.hint}>Tap to check off · long-press to archive</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tiles: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tileValue: { color: colors.text, fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tileLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2, textAlign: "center" },
  weekCount: { color: colors.textMuted, fontSize: 12, flex: 1, marginLeft: 10 },
  section: { color: colors.textMuted, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
  card: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
  },
  cardDone: { borderColor: colors.accentDim },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.bg, fontWeight: "800" },
  title: { color: colors.text, fontSize: 17, fontWeight: "500" },
  titleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  why: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  week: { flexDirection: "row", gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
  streak: { color: colors.gold, fontWeight: "600" },
  due: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  addButton: {
    borderColor: colors.accentDim,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
  },
  addText: { color: colors.accent, fontSize: 16 },
  form: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, gap: 10 },
  segment: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: radius.sm, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.sm - 2 },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontWeight: "500" },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  formButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
  primaryText: { color: colors.bg, fontWeight: "700" },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 12 },
  secondaryText: { color: colors.textMuted },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 24, lineHeight: 21 },
  hint: { color: colors.border, textAlign: "center", fontSize: 12, marginTop: 8 },
});
