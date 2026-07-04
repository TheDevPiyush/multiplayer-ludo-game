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

import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { LUDO } from '@/constants/LudoColors';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const palette = Colors.dark;

function PlayTile({
  label,
  sublabel,
  icon,
  color,
  onPress,
  large,
}: {
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  onPress: () => void;
  large?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, large ? styles.tileLarge : styles.tileSmall]}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 55 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 55 }).start()}
      >
        <GlassPanel intensity="heavy" accent={color} style={[styles.tile, large && styles.tileHero]}>
          <RNView style={[styles.tileAccent, { backgroundColor: color }]} />
          <RNView style={styles.tileRow}>
            <RNView style={[styles.iconBubble, { backgroundColor: color + '22', borderColor: color + '44' }]}>
              <FontAwesome name={icon as any} size={large ? 22 : 18} color={color} />
            </RNView>
            <RNView style={styles.tileText}>
              <Text weight="bold" style={[styles.tileLabel, large && styles.tileLabelHero]}>{label}</Text>
              <Text weight="medium" style={styles.tileSub} numberOfLines={2}>{sublabel}</Text>
            </RNView>
            {large ? <FontAwesome name="arrow-right" size={14} color={palette.dimText} /> : null}
          </RNView>
        </GlassPanel>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useCurrentUser();

  const fade = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 550,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -6, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, []);

  const username = user?.username ?? 'player';

  return (
    <RNView style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <Animated.View style={[styles.body, { opacity: fade }]}>
        {/* Greeting chip */}
        <RNView style={styles.greetRow}>
          <Text weight="medium" style={styles.greet}>Hey, </Text>
          <Text weight="bold" style={styles.greetName}>@{username}</Text>
        </RNView>

        {/* Hero brand block */}
        <Animated.View style={{ transform: [{ translateY: floatY }] }}>
          <GlassPanel intensity="medium" style={styles.heroPanel}>
            <RNView style={styles.heroInner}>
              <RNView style={styles.logoMark}>
                {[LUDO.red, LUDO.blue, LUDO.green, LUDO.yellow].map((c, i) => (
                  <RNView key={i} style={[styles.logoDot, { backgroundColor: c }]} />
                ))}
              </RNView>
              <Text weight="bold" style={styles.brand}>Simple Ludo</Text>
              <Text weight="medium" style={styles.tagline}>
                Roll dice · move tokens · talk live with friends
              </Text>
            </RNView>
          </GlassPanel>
        </Animated.View>

        {/* Play section */}
        <RNView style={styles.playSection}>
          <Text weight="semiBold" style={styles.sectionLabel}>Get started</Text>
          <PlayTile
            label="Play Online"
            sublabel="Jump into a room and play in real time"
            icon="globe"
            color={LUDO.red}
            large
            onPress={() => router.push('/(game)/join-room')}
          />
          <RNView style={styles.row}>
            <PlayTile
              label="Create"
              sublabel="Host a private room"
              icon="plus"
              color={LUDO.green}
              onPress={() => router.push('/(game)/create-room')}
            />
            <PlayTile
              label="Join"
              sublabel="Enter a room code"
              icon="sign-in"
              color={LUDO.blue}
              onPress={() => router.push('/(game)/join-room')}
            />
          </RNView>
        </RNView>

        <Text weight="regular" style={styles.footer}>Simple Ludo · v1.0.0</Text>
      </Animated.View>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
  },
  body: {
    flex: 1,
    gap: 20,
  },
  greetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 4,
  },
  greet: {
    fontSize: 15,
    color: palette.mutedText,
  },
  greetName: {
    fontSize: 15,
    color: palette.text,
  },
  heroPanel: {
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  heroInner: {
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: palette.glassBorder,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 6,
    alignContent: 'center',
    justifyContent: 'center',
  },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  brand: {
    fontSize: 28,
    color: palette.text,
    letterSpacing: -0.8,
  },
  tagline: {
    fontSize: 13,
    color: palette.mutedText,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  playSection: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    color: palette.dimText,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginLeft: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  tileLarge: { width: '100%' },
  tileSmall: { flex: 1 },
  tile: {
    borderRadius: 22,
    minHeight: 88,
  },
  tileHero: {
    minHeight: 108,
  },
  tileAccent: {
    position: 'absolute',
    left: 0,
    top: 18,
    bottom: 18,
    width: 3,
    borderRadius: 2,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    paddingLeft: 20,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    flex: 1,
    gap: 4,
  },
  tileLabel: {
    fontSize: 15,
    color: palette.text,
  },
  tileLabelHero: {
    fontSize: 18,
  },
  tileSub: {
    fontSize: 12,
    color: palette.mutedText,
    lineHeight: 16,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: palette.dimText,
    letterSpacing: 0.5,
  },
});
