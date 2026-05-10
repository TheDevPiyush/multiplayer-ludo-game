import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';

// ─── Mock — replace with store/context ───────────────────────────────────────
const MOCK_USER = {
  username: 'piyush_4821',
  totalGames: 42,
  totalWins: 17,
};

const palette = Colors['dark'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <RNView style={[styles.statPill, { borderColor: color + '30' }]}>
      <RNView style={[styles.statDot, { backgroundColor: color }]} />
      <Text weight="bold" style={[styles.statValue, { color }]}>{value}</Text>
      <Text weight="medium" style={styles.statLabel}>{label}</Text>
    </RNView>
  );
}

function GameButton({
  label, sublabel, icon, color, onPress, large = false,
}: {
  label: string; sublabel: string; icon: string;
  color: string; onPress: () => void; large?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }] }, large ? { width: '100%' } : { flex: 1 }]}>
      <TouchableOpacity
        style={[styles.btn, large && styles.btnLarge, { borderColor: color + '35' }]}
        activeOpacity={1}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        {/* Ambient blob */}
        <RNView style={[styles.btnBlob, { backgroundColor: color }]} />

        {/* Centered content */}
        <RNView style={styles.btnContent}>
          <RNView style={[styles.btnIconWrap, { backgroundColor: color + '18' }]}>
            <FontAwesome name={icon as any} size={large ? 22 : 18} color={color} />
          </RNView>
          <Text weight="bold" style={[styles.btnLabel, large && styles.btnLabelLarge]}>{label}</Text>
          <Text weight="medium" style={styles.btnSub}>{sublabel}</Text>
        </RNView>

        {/* Bottom accent line */}
        <RNView style={[styles.btnAccent, { backgroundColor: color }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const winRate = MOCK_USER.totalGames > 0
    ? Math.round((MOCK_USER.totalWins / MOCK_USER.totalGames) * 100)
    : 0;

  const fadeTop = useRef(new Animated.Value(0)).current;
  const slideTop = useRef(new Animated.Value(-16)).current;
  const fadePills = useRef(new Animated.Value(0)).current;
  const fadeBtns = useRef(new Animated.Value(0)).current;
  const slideBtns = useRef(new Animated.Value(24)).current;
  const dicePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dicePulse, { toValue: 1.1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dicePulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(fadeTop, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideTop, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(fadePills, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeBtns, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideBtns, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <RNView style={[styles.screen, { backgroundColor: palette.background }]}>

      {/* Ambient corner blobs */}
      <RNView style={[styles.blob, { top: -60, left: -60, backgroundColor: '#D94444' }]} />
      <RNView style={[styles.blob, { bottom: -60, right: -60, backgroundColor: '#3B7DD8' }]} />

      {/* ── Top bar ── */}
      <Animated.View style={[
        styles.topBar,
        { paddingTop: insets.top + 16, opacity: fadeTop, transform: [{ translateY: slideTop }] },
      ]}>
        <RNView>
          <Text weight="medium" style={styles.greeting}>Helloo 👋</Text>
          <Text weight="bold" style={styles.username}>@{MOCK_USER.username}</Text>
        </RNView>

        <Animated.View style={{ transform: [{ scale: dicePulse }] }}>
          <RNView style={styles.dice}>
            <RNView style={[styles.diceDot, { top: 7, left: 7, backgroundColor: '#D94444' }]} />
            <RNView style={[styles.diceDot, { top: 7, right: 7, backgroundColor: '#3B7DD8' }]} />
            <RNView style={[styles.diceDot, { bottom: 7, left: 7, backgroundColor: '#2DAA5C' }]} />
            <RNView style={[styles.diceDot, { bottom: 7, right: 7, backgroundColor: '#E8A520' }]} />
          </RNView>
        </Animated.View>
      </Animated.View>

      {/* ── Stat pills ── */}
      <Animated.View style={[styles.pillsRow, { opacity: fadePills }]}>
        <StatPill value={MOCK_USER.totalGames} label="Games" color="#3B7DD8" />
        <StatPill value={MOCK_USER.totalWins} label="Wins" color="#2DAA5C" />
        <StatPill value={`${winRate}%`} label="Win Rate" color="#E8A520" />
      </Animated.View>

      {/* ── Buttons — hero of the screen ── */}
      <Animated.View style={[
        styles.btnsWrap,
        { opacity: fadeBtns, transform: [{ translateY: slideBtns }] },
      ]}>
        <GameButton
          label="Play Online"
          sublabel="Match with random players"
          icon="globe"
          color="#D94444"
          large
          onPress={() => router.push('/(game)/lobby')}
        />
        <RNView style={styles.halfRow}>
          <GameButton
            label="Create"
            sublabel="Private room"
            icon="plus-circle"
            color="#2DAA5C"
            onPress={() => router.push('/(game)/create-room')}
          />
          <GameButton
            label="Join"
            sublabel="Enter code"
            icon="sign-in"
            color="#3B7DD8"
            onPress={() => router.push('/(game)/join-room')}
          />
        </RNView>
      </Animated.View>

      <Text weight="regular" style={[styles.buildTag, { paddingBottom: insets.bottom + 12 }]}>
        Simple Ludo v1.0.0
      </Text>
    </RNView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  blob: {
    position: 'absolute',
    width: 200, height: 200,
    borderRadius: 100,
    opacity: 0.06,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  greeting: {
    fontSize: 12,
    color: palette.mutedText,
  },
  username: {
    fontSize: 18,
    color: palette.text,
    letterSpacing: 0.2,
  },
  dice: {
    width: 40, height: 40,
    borderRadius: 10,
    backgroundColor: palette.elevated,
    borderWidth: 1.5,
    borderColor: palette.border,
  },
  diceDot: {
    position: 'absolute',
    width: 7, height: 7,
    borderRadius: 3.5,
  },

  // Stat pills
  pillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: palette.elevated,
    borderWidth: 0.5,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  statDot: { width: 5, height: 5, borderRadius: 2.5 },
  statValue: { fontSize: 12 },
  statLabel: { fontSize: 11, color: palette.mutedText },

  // Buttons
  btnsWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    justifyContent: 'center',
  },
  halfRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    backgroundColor: palette.card,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 130,
    justifyContent: 'center',
  },
  btnLarge: { minHeight: 150 },
  btnBlob: {
    position: 'absolute',
    top: -40, right: -40,
    width: 110, height: 110,
    borderRadius: 55,
    opacity: 0.06,
  },
  btnContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  btnIconWrap: {
    width: 48, height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    fontSize: 15,
    color: palette.text,
    letterSpacing: 0.2,
  },
  btnLabelLarge: { fontSize: 17 },
  btnSub: {
    fontSize: 11,
    color: palette.mutedText,
    textAlign: 'center',
  },
  btnAccent: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 3,
    opacity: 0.65,
  },

  buildTag: {
    textAlign: 'center',
    fontSize: 11,
    color: palette.dimText,
    letterSpacing: 0.5,
  },
});