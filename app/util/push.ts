import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import type { Router } from 'expo-router';
import { Platform } from 'react-native';

import { removePushToken, savePushToken } from '@/apis/user-api';
import { friendsHref, friendsTabFromPath, joinCodeFromUrl, setPendingLink, type PendingLink } from '@/util/links';
import { supabase } from '@/util/supabase-client';

/** The server sends on these by id; people can switch each one off in Android settings. */
const CHANNELS: { id: string; name: string; description: string; importance: Notifications.AndroidImportance }[] = [
    { id: 'invites', name: 'Game invites', description: 'When a friend invites you to their table', importance: Notifications.AndroidImportance.HIGH },
    { id: 'friends', name: 'Friends', description: 'Friend requests, and friends coming online', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'reminders', name: 'Game reminders', description: 'A nudge to come and play', importance: Notifications.AndroidImportance.DEFAULT },
];

/** The same token again this soon after a sync isn't sent again (Home is visited a lot). */
const RESYNC_MS = 5 * 60_000;

const supported = Platform.OS === 'android' || Platform.OS === 'ios';
let channelsReady = false;
let askedThisRun = false;
let synced: { userId: string; token: string; at: number } | null = null;

async function ensureChannels() {
    if (Platform.OS !== 'android' || channelsReady) return;
    // Android 13+ only shows the permission prompt once a channel exists.
    await Promise.all(
        CHANNELS.map(c =>
            Notifications.setNotificationChannelAsync(c.id, {
                name: c.name,
                description: c.description,
                importance: c.importance,
                lightColor: '#4B3BF2',
            }),
        ),
    );
    channelsReady = true;
}

async function currentToken(): Promise<string | null> {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
}

/**
 * Asks for permission (once per app run, while the system still lets us) and
 * sends this device's push token to the server, which keeps the newest 3 per user.
 * Called on every Home visit, so the server always has the devices in use.
 */
export async function syncPushToken(): Promise<void> {
    if (!supported) return;
    try {
        await ensureChannels();
        let perm = await Notifications.getPermissionsAsync();
        if (perm.status !== 'granted' && perm.canAskAgain && !askedThisRun) {
            askedThisRun = true;
            perm = await Notifications.requestPermissionsAsync();
        }
        if (perm.status !== 'granted') return;

        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;
        const token = await currentToken();
        if (!token) return;
        if (synced && synced.userId === session.user.id && synced.token === token && Date.now() - synced.at < RESYNC_MS) return;

        const res = await savePushToken(session.access_token, token);
        if (res.ok) synced = { userId: session.user.id, token, at: Date.now() };
    } catch (e) {
        // No Firebase config in this build, no Play services, offline…: no pushes, nothing else breaks.
        console.warn('push token sync failed', e instanceof Error ? e.message : e);
    }
}

/** Before signing out: this device stops getting that account's notifications. */
export async function forgetPushToken(): Promise<void> {
    if (!supported) return;
    try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) return;
        const token = synced?.token ?? ((await Notifications.getPermissionsAsync()).status === 'granted' ? await currentToken() : null);
        synced = null;
        if (token) await removePushToken(accessToken, token);
    } catch {
        // Signing out goes ahead regardless; the next account on this phone claims the token anyway.
    }
}

// ─── Taps ────────────────────────────────────────────────────────────────────

/** `data.url` the server puts on each push → where the app goes. */
function linkFor(url: unknown): PendingLink | null {
    if (typeof url !== 'string') return null;
    const code = joinCodeFromUrl(url);
    if (code) return { kind: 'join', code };
    const tab = friendsTabFromPath(url);
    return tab ? { kind: 'friends', tab } : null;
}

const handled = new Set<string>();

/** The link of a tap not acted on yet (each tap is seen by both the launch check and the listener). */
function takeTap(response: Notifications.NotificationResponse | null): PendingLink | null {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
    const id = response.notification.request.identifier;
    if (handled.has(id)) return null;
    handled.add(id);
    return linkFor(response.notification.request.content.data?.url);
}

/**
 * Opens what a tapped notification points at. A tap that launched the app is
 * left as a pending link, which the root layout follows once sign-in is known.
 * Call before the root layout's sign-in routing.
 */
export function listenForNotificationTaps(router: Router): () => void {
    if (!supported) return () => {};
    const launch = takeTap(Notifications.getLastNotificationResponse());
    if (launch) setPendingLink(launch);

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
        const link = takeTap(response);
        if (!link) return;
        void supabase.auth.getSession().then(({ data }) => {
            // Signed out: sign-in comes first, then the root layout follows the link.
            if (!data.session) return setPendingLink(link);
            if (link.kind === 'join') router.push({ pathname: '/join/[code]', params: { code: link.code } });
            else router.push(friendsHref(link.tab));
        });
    });
    return () => sub.remove();
}
