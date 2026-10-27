import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppDialog from '@/components/Dialog';
import { GlassPanel } from '@/components/GlassPanel';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { LUDO } from '@/constants/LudoColors';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsGuest } from '@/hooks/useIsGuest';
import { leaveGuest, LEAVE_GUEST_DIALOG, takenDialog } from '@/util/guest';
import { VolumeSlider } from '@/components/VolumeSlider';
import { playEffect, setAudioSettings, useAudioSettings } from '@/util/audio';
import { supabase } from '@/util/supabase-client';

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

function ToggleRow({
  icon, label, value, onChange,
}: { icon: string; label: string; value: boolean; onChange: (next: boolean) => void }) {
  const palette = Colors['dark'];
  return (
    <RNView style={styles.actionRow}>
      <RNView style={[styles.actionIcon, { backgroundColor: palette.elevated }]}>
        <FontAwesome name={icon as any} size={14} color={palette.mutedText} />
      </RNView>
      <Text weight="medium" style={styles.actionLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: 'rgba(255,255,255,0.18)', true: LUDO.green }}
        thumbColor="#FFFFFF"
      />
    </RNView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const palette = Colors['dark'];
  const { user, loading, refresh } = useCurrentUser();
  const audio = useAudioSettings();
  const auth = useAuth();
  // The session knows at once (e.g. right after linking); the profile row may still be loading.
  const sessionGuest = useIsGuest();
  const guest = sessionGuest || !!user?.isGuest;
  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    title: '',
    message: '',
    dismissable: true,
  });

  const account = guest
    ? { label: 'Guest', icon: 'user-secret', color: '#FFC83D' }
    : user?.provider === 'google'
      ? { label: 'Google account', icon: 'google', color: '#EA4335' }
      : { label: 'Email account', icon: 'envelope', color: '#8FB4FF' };

  const totalGames = user?.totalGames ?? 0;
  const totalWins = user?.totalWins ?? 0;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

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

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

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
  }, [winRate]);

  // ── Actions ──
  const copyUsername = async () => {
    if (!user?.username) return;
    await Clipboard.setStringAsync(user.username);
    showInfoDialog('Copied!', `@${user.username} copied to clipboard.`);
  };

  const shareProfile = async () => {
    if (!user?.username) return;
    await Share.share({ message: `Challenge me on Simple Ludo! My username: @${user.username}` });
  };

  const editUsername = () => {
    router.push('/edit-username');
  };

  const confirmLeaveGuest = () =>
    setDialog({
      visible: true,
      ...LEAVE_GUEST_DIALOG,
      dismissable: true,
      actions: [
        { label: 'Cancel', onPress: hideDialog },
        {
          label: 'Leave guest',
          onPress: async () => {
            hideDialog();
            await leaveGuest();
            router.replace('/(login)');
          },
        },
      ],
    });

  const saveWithGoogle = async () => {
    const res = await auth.linkGoogle();
    if (res.ok) {
      await refresh();
      showInfoDialog('Progress saved', 'You’re now signed in with Google. Your stats and history came with you.');
    } else if (res.reason === 'taken') {
      setDialog({
        visible: true,
        ...takenDialog('Google account'),
        dismissable: true,
        actions: [
          { label: 'Sign in to it', onPress: confirmLeaveGuest },
          { label: 'Use another', onPress: hideDialog },
        ],
      });
    }
  };

  const handleSignOut = () => {
    if (guest) return confirmLeaveGuest();
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
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <Animated.View style={[styles.headerWrap, { paddingTop: insets.top + 12, opacity: fadeHeader }]}>
        <GlassPanel intensity="heavy" style={styles.header}>
          <Avatar name={user?.username ?? '?'} url={user?.avatarUrl} size={88} />
          <Text weight="bold" style={styles.username}>@{user?.username ?? (loading ? '…' : 'player')}</Text>
          <RNView style={styles.providerBadge}>
            <FontAwesome name={account.icon as any} size={11} color={account.color} />
            <Text weight="semiBold" style={styles.providerText}>{account.label}</Text>
          </RNView>
        </GlassPanel>
      </Animated.View>

      {/* ── Guest: save progress ── */}
      {guest && (
        <Animated.View style={[styles.section, { opacity: fadeHeader }]}>
          <GlassPanel intensity="heavy" accent="#FFC83D" style={styles.saveCard}>
            <RNView style={styles.saveTitleRow}>
              <FontAwesome name="save" size={16} color="#FFC83D" />
              <Text weight="bold" style={styles.saveTitle}>Save your progress</Text>
            </RNView>
            <Text weight="medium" style={styles.saveText}>
              You're playing as a guest. Link Google or an email to keep your stats on any phone, add friends and chat in games. Guest accounts unused for 30 days are deleted.
            </Text>
            <RNView style={styles.saveButtons}>
              <TouchableOpacity
                style={[styles.saveBtn, styles.saveBtnGoogle]}
                activeOpacity={0.85}
                onPress={() => void saveWithGoogle()}
                disabled={auth.loading.googleLoading}
              >
                {auth.loading.googleLoading ? (
                  <ActivityIndicator color="#3B3BE8" />
                ) : (
                  <>
                    <FontAwesome name="google" size={14} color="#EA4335" />
                    <Text weight="bold" style={styles.saveBtnGoogleText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, styles.saveBtnEmail]}
                activeOpacity={0.85}
                onPress={() => router.push('/save-progress')}
                disabled={auth.loading.googleLoading}
              >
                <FontAwesome name="envelope" size={13} color="#FFFFFF" />
                <Text weight="bold" style={styles.saveBtnEmailText}>Email</Text>
              </TouchableOpacity>
            </RNView>
          </GlassPanel>
        </Animated.View>
      )}

      {/* ── Stats Row ── */}
      <Animated.View style={[
        styles.statsRow,
        { opacity: fadeStats, transform: [{ translateY: slideStats }] },
      ]}>
        <StatCard value={totalGames} label="Games" color={LUDO.blue} />
        <StatCard value={totalWins} label="Wins" color={LUDO.green} />
        <StatCard value={`${winRate}%`} label="Win Rate" color={LUDO.yellow} />
      </Animated.View>


      {/* ── Game ── */}
      <Animated.View style={[styles.section, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}>
        <Text weight="semiBold" style={styles.sectionTitle}>GAME</Text>
        <RNView style={styles.sectionCard}>
          <ToggleRow icon="music" label="Music" value={audio.music} onChange={music => setAudioSettings({ music })} />
          <RNView style={styles.sliderRow}>
            <VolumeSlider
              label="Music volume"
              value={audio.musicVolume}
              disabled={!audio.music}
              color={LUDO.blue}
              onChange={musicVolume => setAudioSettings({ musicVolume })}
            />
          </RNView>
          <RNView style={styles.separator} />
          <ToggleRow icon="volume-up" label="Sound effects" value={audio.sound} onChange={sound => setAudioSettings({ sound })} />
          <RNView style={styles.sliderRow}>
            <VolumeSlider
              label="Sound effects volume"
              value={audio.effectsVolume}
              disabled={!audio.sound}
              color={LUDO.green}
              onChange={effectsVolume => setAudioSettings({ effectsVolume })}
              // Let the player hear the new level.
              onRelease={() => playEffect('capture')}
            />
          </RNView>
          <RNView style={styles.separator} />
          <ToggleRow icon="mobile" label="Vibration" value={audio.haptics} onChange={haptics => setAudioSettings({ haptics })} />
        </RNView>
      </Animated.View>

      {/* ── Actions ── */}
      <Animated.View style={[styles.section, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}>
        <Text weight="semiBold" style={styles.sectionTitle}>ACCOUNT</Text>
        <RNView style={styles.sectionCard}>
          <ActionRow icon="pencil" label="Edit Username" onPress={editUsername} />
          <RNView style={styles.separator} />
          <ActionRow icon="ban" label="Blocked Players" onPress={() => router.push('/blocked')} />
          {/* Guests can't be found or added, so there's nothing to share yet. */}
          {!guest && (
            <>
              <RNView style={styles.separator} />
              <ActionRow icon="copy" label="Copy Username" onPress={copyUsername} />
              <RNView style={styles.separator} />
              <ActionRow icon="share-alt" label="Share Profile" onPress={shareProfile} />
            </>
          )}
        </RNView>
      </Animated.View>

      <Animated.View style={[styles.section, { opacity: fadeCard, transform: [{ translateY: slideCard }] }]}>
        <RNView style={styles.sectionCard}>
          <ActionRow icon="sign-out" label={guest ? 'Leave guest account' : 'Sign Out'} onPress={handleSignOut} danger />
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
      {/* Unexpected linking errors (from useAuth). */}
      <AppDialog
        visible={auth.dialog.visible}
        title={auth.dialog.title}
        message={auth.dialog.message}
        onDismiss={auth.hideDialog}
        actions={[{ label: 'OK', onPress: auth.hideDialog }]}
      />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const palette = Colors['dark'];

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
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
  sliderRow: { paddingLeft: 60, paddingRight: 16, paddingBottom: 6, marginTop: -6 },
  saveCard: { padding: 18, gap: 10, borderColor: 'rgba(255, 200, 61, 0.45)' },
  saveTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveTitle: { fontSize: 17, color: '#FFFFFF' },
  saveText: { fontSize: 13, lineHeight: 19, color: 'rgba(255, 255, 255, 0.75)' },
  saveButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnGoogle: { backgroundColor: '#FFFFFF' },
  saveBtnGoogleText: { fontSize: 14, color: '#111120' },
  saveBtnEmail: { backgroundColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.22)' },
  saveBtnEmailText: { fontSize: 14, color: '#FFFFFF' },
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