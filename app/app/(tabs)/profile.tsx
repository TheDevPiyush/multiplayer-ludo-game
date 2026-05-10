import FontAwesome from '@expo/vector-icons/FontAwesome';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppDialog from '@/components/Dialog';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { supabase } from '@/util/supabase-client';

const { width: W } = Dimensions.get('window');

type ProfileUser = {
  username: string;
  avatarUrl: string | null;
  provider: string | null;
  totalGames: number;
  totalWins: number;
};

const DEFAULT_USER: ProfileUser = {
  username: 'piyush_4821',
  avatarUrl: null,
  provider: 'google',   
  totalGames: 42,
  totalWins: 17,
};

type StoredUser = {
  username?: string | null;
  avatarUrl?: string | null;
  provider?: string | null;
  totalGames?: number;
  totalWins?: number;
};

type DialogAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type DialogState = {
  visible: boolean;
  title: string;
  message: string;
  actions?: DialogAction[];
  dismissable?: boolean;
};



// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, url, size = 88 }: { name: string; url?: string | null; size?: number }) {
  const [imageError, setImageError] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  const shouldShowImage = Boolean(url) && !imageError;

  return (
    <RNView style={[styles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {shouldShowImage ? (
        <Image
          source={{ uri: url as string }}
          style={[styles.avatarImage, { borderRadius: size / 2 }]}
          onError={() => setImageError(true)}
        />
      ) : (
        <Text weight="bold" style={{ fontSize: size * 0.36, color: '#fff', letterSpacing: 1 }}>
          {initials}
        </Text>
      )}
    </RNView>
  );
}

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <RNView style={styles.statCard}>
      <RNView style={[styles.statAccent, { backgroundColor: color }]} />
      <Text weight="bold" style={[styles.statValue, { color }]}>{value}</Text>
      <Text weight="medium" style={styles.statLabel}>{label}</Text>
    </RNView>
  );
}

function ActionRow({
  icon, label, onPress, danger = false,
}: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  const palette = Colors['dark'];
  return (
    <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={onPress}>
      <RNView style={[styles.actionIcon, { backgroundColor: danger ? 'rgba(217,68,68,0.12)' : palette.elevated }]}>
        <FontAwesome name={icon as any} size={14} color={danger ? '#D94444' : palette.mutedText} />
      </RNView>
      <Text weight="medium" style={[styles.actionLabel, danger && { color: '#D94444' }]}>{label}</Text>
      {!danger && <FontAwesome name="chevron-right" size={11} color={Colors['dark'].dimText} />}
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const palette = Colors['dark'];
  const [user, setUser] = useState<ProfileUser>(DEFAULT_USER);
  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    title: '',
    message: '',
    dismissable: true,
  });

  const providerName = user.provider === 'google' ? 'Google' : user.provider === 'github' ? 'GitHub' : 'OAuth';

  const winRate = user.totalGames > 0
    ? Math.round((user.totalWins / user.totalGames) * 100)
    : 0;

  // ── Animations ──
  const fadeHeader = useRef(new Animated.Value(0)).current;
  const slideStats = useRef(new Animated.Value(30)).current;
  const fadeStats = useRef(new Animated.Value(0)).current;
  const fadeCard = useRef(new Animated.Value(0)).current;
  const slideCard = useRef(new Animated.Value(24)).current;

  // Win rate arc fill
  const arcAnim = useRef(new Animated.Value(0)).current;

  const hideDialog = () => {
    setDialog((prev) => ({ ...prev, visible: false }));
  };

  const showInfoDialog = (title: string, message: string) => {
    setDialog({
      visible: true,
      title,
      message,
      actions: [{ label: 'OK', onPress: hideDialog }],
      dismissable: true,
    });
  };

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(fadeHeader, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeStats, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideStats, { toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(fadeCard, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideCard, { toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.timing(arcAnim, {
      toValue: winRate,
      duration: 900,
      delay: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, []);

  useEffect(() => {
    const loadStoredUser = async () => {
      try {
        const rawUser = await AsyncStorage.getItem('user');
        if (!rawUser) return;

        const parsed = JSON.parse(rawUser) as { user?: StoredUser } | StoredUser;
        const storedUser: StoredUser =
          parsed && typeof parsed === 'object' && 'user' in parsed && parsed.user
            ? parsed.user
            : (parsed as StoredUser);

        setUser((prev) => ({
          ...prev,
          username: storedUser.username ?? prev.username,
          avatarUrl: storedUser.avatarUrl ?? prev.avatarUrl,
          provider: storedUser.provider ?? prev.provider,
          totalGames: typeof storedUser.totalGames === 'number' ? storedUser.totalGames : prev.totalGames,
          totalWins: typeof storedUser.totalWins === 'number' ? storedUser.totalWins : prev.totalWins,
        }));
      } catch {
        showInfoDialog('Profile data error', 'Could not load profile data from local storage.');
      }
    };

    loadStoredUser();
  }, []);

  // ── Actions ──
  const copyUsername = async () => {
    await Clipboard.setStringAsync(user.username);
    showInfoDialog('Copied!', `@${user.username} copied to clipboard.`);
  };

  const shareProfile = async () => {
    await Share.share({ message: `Challenge me on Simple Ludo! My username: @${user.username}` });
  };

  const editUsername = () => {
    showInfoDialog('Edit Username', 'Coming soon!');
  };

  const handleSignOut = () => {
    setDialog({
      visible: true,
      title: 'Sign Out',
      message: 'Are you sure?',
      dismissable: true,
      actions: [
        { label: 'Cancel', onPress: hideDialog },
        {
          label: 'Sign Out',
          onPress: async () => {
            hideDialog();
            await supabase.auth.signOut();
            router.replace('/(login)');
          },
        },
      ],
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <Animated.View style={[styles.header, { paddingTop: insets.top + 16, opacity: fadeHeader }]}>
        {/* Corner accents */}
        <RNView style={[styles.cornerBlob, { top: -30, left: -30, backgroundColor: '#D94444' }]} />
        <RNView style={[styles.cornerBlob, { top: -30, right: -30, backgroundColor: '#3B7DD8' }]} />

        <Avatar name={user.username} url={user.avatarUrl} size={88} />

        <Text weight="bold" style={styles.username}>@{user.username}</Text>

        {/* Provider badge */}
        <RNView style={styles.providerBadge}>
          <FontAwesome
            name={user.provider === 'google' ? 'google' : 'github'}
            size={11}
            color={user.provider === 'google' ? '#EA4335' : '#C0C0D8'}
          />
          <Text weight="semiBold" style={styles.providerText}>
            {providerName} account
          </Text>
        </RNView>
      </Animated.View>

      {/* ── Stats Row ── */}
      <Animated.View style={[
        styles.statsRow,
        { opacity: fadeStats, transform: [{ translateY: slideStats }] },
      ]}>
        <StatCard value={user.totalGames} label="Games" color="#3B7DD8" />
        <StatCard value={user.totalWins} label="Wins" color="#2DAA5C" />
        <StatCard value={`${winRate}%`} label="Win Rate" color="#E8A520" />
      </Animated.View>


      {/* ── Actions ── */}
      <Animated.View style={[styles.section, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}>
        <Text weight="semiBold" style={styles.sectionTitle}>ACCOUNT</Text>
        <RNView style={styles.sectionCard}>
          <ActionRow icon="pencil" label="Edit Username" onPress={editUsername} />
          <RNView style={styles.separator} />
          <ActionRow icon="copy" label="Copy Username" onPress={copyUsername} />
          <RNView style={styles.separator} />
          <ActionRow icon="share-alt" label="Share Profile" onPress={shareProfile} />
        </RNView>
      </Animated.View>

      <Animated.View style={[styles.section, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}>
        <RNView style={styles.sectionCard}>
          <ActionRow icon="sign-out" label="Sign Out" onPress={handleSignOut} danger />
        </RNView>
      </Animated.View>

      {/* ── Build tag ── */}
      <Text weight="regular" style={styles.buildTag}>Simple Ludo v1.0.0</Text>
      <AppDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        onDismiss={hideDialog}
        actions={dialog.actions}
        dismissable={dialog.dismissable}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const palette = Colors['dark'];

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
    backgroundColor: palette.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    overflow: 'hidden',
    gap: 10,
  },
  cornerBlob: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.08,
  },
  avatarWrap: {
    backgroundColor: '#D94444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: palette.border,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  username: {
    fontSize: 22,
    color: palette.text,
    letterSpacing: 0.5,
  },
  providerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  providerText: {
    fontSize: 11,
    color: palette.mutedText,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  statAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    borderRadius: 2,
  },
  statValue: {
    fontSize: 24,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 10,
    color: palette.mutedText,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 10,
    color: palette.dimText,
    letterSpacing: 1.5,
    marginLeft: 4,
    marginBottom: 2,
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },

  // Color tokens
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    padding: 18,
  },
  colorToken: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  colorTokenInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  colorHint: {
    fontSize: 10,
    color: palette.dimText,
    textAlign: 'center',
    paddingBottom: 14,
    letterSpacing: 0.3,
  },

  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: 14,
    color: palette.text,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginLeft: 60,
  },

  buildTag: {
    textAlign: 'center',
    fontSize: 11,
    color: palette.dimText,
    marginTop: 32,
    letterSpacing: 0.5,
  },
});