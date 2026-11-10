import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { claimAdReward } from '@/apis/ads-api';
import AppDialog from '@/components/Dialog';
import { Coin } from '@/components/progress/Coin';
import { useSocket } from '@/components/SocketProvider';
import { Text } from '@/components/Themed';
import { refreshProgress, showProgress } from '@/hooks/useProgress';
import { adsAvailable, saveAge, savedAge, showRewarded, type AgeAnswer } from '@/util/ads';
import { track } from '@/util/analytics';
import { playEffect } from '@/util/audio';
import { haptic } from '@/util/feedback';
import { remoteAds } from '@/util/remote-config';
import { supabase } from '@/util/supabase-client';

type Props = {
    /** For analytics: double, daily_missed, daily_bonus. */
    placement: string;
    /** What the ad pays for (server: ads/rewards.ts), e.g. "double:game:<roomId>". */
    customData: string;
    /** Coins it pays, shown on the button: the reward is said up front. */
    coins: number;
    label: string;
    tone?: 'dark' | 'gold';
    /** The reward has landed (the server paid it). */
    onRewarded?: (coins: number) => void;
};

/** Waits for the server's confirmation of a verified reward (it lands a moment after the ad closes). */
function awaitReward(socket: ReturnType<typeof useSocket>['socket'], customData: string, ms = 10_000): Promise<number | null> {
    return new Promise(resolve => {
        if (!socket) return resolve(null);
        const [placement, ...rest] = customData.split(':');
        const ref = rest.join(':');
        const done = (coins: number | null) => {
            clearTimeout(timer);
            socket.off('ads:reward', onReward);
            resolve(coins);
        };
        const onReward = (r: { placement: string; ref: string; coins: number }) => {
            if (r.placement === placement && r.ref === ref) done(r.coins);
        };
        const timer = setTimeout(() => done(null), ms);
        socket.on('ads:reward', onReward);
    });
}

/**
 * "Watch an ad for N coins": always the player's choice, with the reward stated before the ad.
 * Asks once whether they're 18 or older (under 18s get only non-personalised ads). Hidden where
 * ads can't show (an older build, no ad unit configured).
 */
export function RewardedButton({ placement, customData, coins, label, tone = 'dark', onRewarded }: Props) {
    const { socket } = useSocket();
    const [busy, setBusy] = useState(false);
    const [askAge, setAskAge] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const offered = useRef(false);
    const available = adsAvailable('rewarded');

    useEffect(() => {
        if (!available || offered.current) return;
        offered.current = true;
        track('ad_offered', { placement });
    }, [available, placement]);

    if (!available) return null;

    const watch = async () => {
        if (busy) return;
        if (!(await savedAge())) {
            setAskAge(true);
            return;
        }
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;
        setBusy(true);
        // Listen before the ad: the verified reward can arrive while it's still closing.
        const confirmed = awaitReward(socket, customData);
        const result = await showRewarded(session.user.id, customData);
        if (result === 'unavailable') {
            setBusy(false);
            setMessage("There's no ad to show right now. Try again in a little while.");
            return;
        }
        if (result === 'closed') {
            setBusy(false);
            return;
        }
        track('ad_watched', { placement });
        let paid: number | null = null;
        if (remoteAds()?.trustClient) {
            // Development: test ads never reach Google's verification, so claim it directly.
            const r = await claimAdReward(session.access_token, customData);
            if (r.ok) {
                paid = r.data.coins;
                void showProgress(r.data.progress);
            } else {
                setMessage(r.error);
            }
        } else {
            paid = await confirmed;
            void refreshProgress();
        }
        setBusy(false);
        if (paid !== null) {
            haptic.success();
            playEffect('home');
            onRewarded?.(paid);
        } else if (!remoteAds()?.trustClient) {
            // It can still land late; the coins show as soon as it does.
            setMessage('Thanks for watching! Your coins are on their way.');
        }
    };

    const answer = async (a: AgeAnswer) => {
        setAskAge(false);
        await saveAge(a);
        void watch();
    };

    const gold = tone === 'gold';
    return (
        <>
            <Pressable
                onPress={watch}
                disabled={busy}
                style={({ pressed }) => [styles.btn, gold ? styles.btnGold : styles.btnDark, pressed && { transform: [{ scale: 0.96 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`${label}: watch an ad for ${coins} coins`}
            >
                {busy ? <ActivityIndicator size="small" color={gold ? '#C27400' : '#FFFFFF'} /> : (
                    <>
                        <MaterialCommunityIcons name="play-circle" size={17} color={gold ? '#C27400' : '#FFFFFF'} />
                        <Text weight="bold" style={[styles.text, gold && styles.textGold]} numberOfLines={1}>{label}</Text>
                        <Coin size={15} />
                        <Text weight="bold" style={[styles.text, gold && styles.textGold]}>+{coins}</Text>
                    </>
                )}
            </Pressable>
            <AppDialog
                visible={askAge}
                title="One quick question"
                message="Are you 18 or older? We ask once, to show the right kind of ads. Under 18s only see ads that aren't based on what they do."
                onDismiss={() => setAskAge(false)}
                actions={[
                    { label: 'Under 18', onPress: () => void answer('minor') },
                    { label: "I'm 18 or older", onPress: () => void answer('adult') },
                ]}
            />
            <AppDialog visible={!!message} title="Rewarded ad" message={message ?? undefined} onDismiss={() => setMessage(null)} />
        </>
    );
}

const styles = StyleSheet.create({
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 38,
        paddingHorizontal: 14,
        borderRadius: 12,
    },
    btnDark: { backgroundColor: 'rgba(255,203,61,0.18)', borderWidth: 1, borderColor: 'rgba(255,203,61,0.55)' },
    btnGold: { backgroundColor: '#FFFFFF' },
    text: { fontSize: 13, color: '#FFFFFF', flexShrink: 1 },
    textGold: { color: '#5A2E00' },
});
