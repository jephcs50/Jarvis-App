import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import type { VoiceStatus } from "../lib/voice";

const LABELS: Record<VoiceStatus, string> = {
  off: "",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** Replaces the composer during a hands-free conversation. */
export function VoicePanel({
  status,
  transcript,
  onEnd,
}: {
  status: VoiceStatus;
  transcript: string;
  onEnd: () => void;
}) {
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const speed = status === "listening" ? 900 : status === "speaking" ? 600 : 1400;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: speed, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: speed, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, status]);

  const ringColor = status === "listening" ? colors.accent : status === "speaking" ? colors.gold : colors.accentDim;

  return (
    <View style={styles.panel}>
      <View style={styles.orbWrap}>
        <Animated.View
          style={[
            styles.halo,
            {
              borderColor: ringColor,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
            },
          ]}
        />
        <View style={[styles.orb, { borderColor: ringColor, shadowColor: ringColor }]} />
      </View>
      <Text style={styles.status}>{LABELS[status]}</Text>
      <Text style={styles.transcript} numberOfLines={3}>
        {transcript || (status === "listening" ? "Go ahead — say “that’s all” when you’re done." : " ")}
      </Text>
      <Pressable style={styles.end} onPress={onEnd} accessibilityLabel="End hands-free conversation">
        <Text style={styles.endText}>End</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  orbWrap: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 96, height: 96, borderRadius: 48, borderWidth: 3 },
  orb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 6,
    backgroundColor: colors.surfaceRaised,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 10,
  },
  status: { color: colors.text, fontSize: 17, fontWeight: "600" },
  transcript: { color: colors.textMuted, textAlign: "center", minHeight: 40, lineHeight: 20 },
  end: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 28,
  },
  endText: { color: colors.danger, fontWeight: "600" },
});
