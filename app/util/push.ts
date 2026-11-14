import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import type { useRouter } from 'expo-router';
import { AppState, Platform } from 'react-native';

type Router = ReturnType<typeof useRouter>;

import { removePushToken, savePushToken } from '@/apis/user-api';
import { friendsHref, friendsTabFromPath, isInitialRouteDone, joinCodeFromUrl, setPendingLink, type PendingLink } from '@/util/links';
import { supabase } from '@/util/supabase-client';

/**
 * The server sends on these by id (server/notifications/push.ts); people can
 * switch each one off in Android settings. All of them pop up on screen, play
 * a sound and show on the lock screen: that takes HIGH importance.
 *
 * Android never lets an app change a channel's importance or sound once it
 * exists, so a channel that needs new settings gets a new id and the old one is
 * deleted. Keep the ids in step with CHANNEL in server/notifications/push.ts.
 */
const CHANNELS: { id: string; name: string; description: string }[] = [
    { id: 'invites-v2', name: 'Game invites', description: 'When a friend invites you to their table' },
    { id: 'friend-alerts-v2', name: 'Friends', description: 'Friend requests, and friends coming online' },
    { id: 'game-reminders-v2', name: 'Game reminders', description: 'A nudge to come and play' },
    { id: 'announcements-v2', name: 'News & updates', description: 'Announcements from Simple Ludo' },
];
/**
 * `friends`, `reminders`: DEFAULT importance (no pop-up).
 * The unsuffixed ids: the system sound, before the game's own.
 */
const RETIRED_CHANNELS = ['friends', 'reminders', 'invites', 'friend-alerts', 'game-reminders', 'announcements'];

/**
 * Bundled by the expo-notifications plugin (`sounds` in app.json) into Android's
 * res/raw and the iOS bundle. Android finds it by name without the extension.
 */
const NOTIFICATION_SOUND = 'custom_notification.wav';

// While the app is open, show pushes too (banner + sound), as Android does when it isn't.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/** Home visits within this long of a sync don't send it again (Home is visited a lot). App opens always send. */
const RESYNC_MS = 5 * 60_000;

const supported = Platform.OS === 'android' || Platform.OS === 'ios';
let channelsReady = false;
let askedThisRun = false;
let synced: { userId: string; token: string; at: number } | null = null;

async function ensureChannels() {
    if (Platform.OS !== 'android' || channelsReady) return;
    // Android 13+ only shows the permission prompt once a channel exists.
    await Promise.all([
        ...CHANNELS.map(c =>
            Notifications.setNotificationChannelAsync(c.id, {
                name: c.name,
                description: c.description,
                importance: Notifications.AndroidImportance.HIGH,
                sound: NOTIFICATION_SOUND,
                enableVibrate: true,
                vibrationPattern: [0, 250, 200, 250],
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
                showBadge: true,
                lightColor: '#4B3BF2',
            }),
        ),
        ...RETIRED_CHANNELS.map(id => Notifications.deleteNotificationChannelAsync(id).catch(() => {})),
    ]);
    channelsReady = true;
}

async function currentToken(): Promise<string | null> {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
}

let inFlight: Promise<void> | null = null;

/**
 * Sends this device's push token to the server, which keeps each user's newest
 * 3 devices (newest first) and takes the token off any other account.
 *
 * `prompt`: ask for permission if we still may (once per app run). Only Home
 * asks; app opens just sync when permission is already there.
 * `force`: send even if this token was sent a moment ago (every app open does,
 * so this device moves to the front of the user's list).
 */
export async function syncPushToken({ prompt = false, force = false }: { prompt?: boolean; force?: boolean } = {}): Promise<void> {
    if (!supported) return;
    // An open and a Home focus often fire together: one request serves both.
    // A call that may prompt waits for it, then runs (the prompt mustn't be skipped).
    while (inFlight) {
        if (!prompt) return inFlight;
        await inFlight;
    }
    inFlight = (async () => {
        try {
            await ensureChannels();
            let perm = await Notifications.getPermissionsAsync();
            if (prompt && perm.status !== 'granted' && perm.canAskAgain && !askedThisRun) {
                askedThisRun = true;
                perm = await Notifications.requestPermissionsAsync();
            }
            if (perm.status !== 'granted') return;

            const { data } = await supabase.auth.getSession();
            const session = data.session;
            if (!session) return;
            const token = await currentToken();
            if (!token) return;
            const fresh = synced && synced.userId === session.user.id && synced.token === token && Date.now() - synced.at < RESYNC_MS;
            if (fresh && !force) return;

            const res = await savePushToken(session.access_token, token);
            if (res.ok) synced = { userId: session.user.id, token, at: Date.now() };
        } catch (e) {
            // No Firebase config in this build, no Play services, offline…: no pushes, nothing else breaks.
            console.warn('push token sync failed', e instanceof Error ? e.message : e);
        } finally {
            inFlight = null;
        }
    })();
    return inFlight;
}

/**
 * Keeps the server's copy of this device's token current for as long as the
 * app runs: on launch and sign-in, each time the app comes back to the
 * foreground, and when the OS hands the app a new token. Mount once, at the root.
 */
export function startPushTokenSync(): () => void {
    if (!supported) return () => {};
    const sync = () => void syncPushToken({ force: true });

    // INITIAL_SESSION covers launch while signed in; SIGNED_IN covers logging in (or switching account).
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
        if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) sync();
    });

    let state: string = AppState.currentState ?? 'active';
    const appState = AppState.addEventListener('change', next => {
        if (state.match(/inactive|background/) && next === 'active') sync();
        state = next;
    });

    // FCM / APNs rotated this device's token: the Expo token may have changed with it.
    const rotated = Notifications.addPushTokenListener(sync);

    return () => {
        auth.subscription.unsubscribe();
        appState.remove();
        rotated.remove();
    };
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
            // Launching: the root layout is about to route (to Home, or a room), and takes the link then.
            if (!data.session || !isInitialRouteDone()) return setPendingLink(link);
            if (link.kind === 'join') router.push({ pathname: '/join/[code]', params: { code: link.code } });
            else router.push(friendsHref(link.tab));
        });
    });
    return () => sub.remove();
}
