import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useReducer } from 'react';

import type { BackendUser } from '@/apis/auth-api';
import { fetchMe } from '@/apis/user-api';
import { supabase } from '@/util/supabase-client';

const STORAGE_KEY = 'user';

// One copy shared by every screen: a rename on Profile, or a profile that loads late on a slow
// network, shows on Home too without reopening the app.
let current: BackendUser | null = null;
/** Something has been shown: the saved copy or a server answer. */
let settled = false;
let lastError: string | null = null;
let booted = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}

function setCurrent(user: BackendUser | null) {
    current = user;
    emit();
}

async function savedUser(): Promise<BackendUser | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const cached = parsed?.user ?? parsed;
        return cached?.username ? (cached as BackendUser) : null;
    } catch {
        return null;
    }
}

/** Fetches the player's profile and updates every screen. Calls made meanwhile share the one request. */
export function refreshCurrentUser(): Promise<void> {
    inflight ??= (async () => {
        lastError = null;
        try {
            const { data } = await supabase.auth.getSession();
            const session = data.session;
            if (!session) {
                setCurrent(null);
                return;
            }
            const result = await fetchMe(session.access_token);
            if (!result.ok) {
                lastError = result.error;
                // Offline: the saved copy, if it's this account's.
                const saved = await savedUser();
                if (!current && saved && saved.id === session.user.id) current = saved;
                return;
            }
            current = result.data.user;
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: result.data.user })).catch(() => {});
        } catch (e) {
            lastError = e instanceof Error ? e.message : 'Failed to load profile';
        } finally {
            settled = true;
            emit();
        }
    })().finally(() => {
        inflight = null;
    });
    return inflight;
}

/** First use anywhere: paint the saved profile at once, then revalidate. */
function boot() {
    if (booted) return;
    booted = true;
    void savedUser().then(saved => {
        if (saved && !current) {
            current = saved;
            settled = true;
            emit();
        }
    });
    void refreshCurrentUser();
}

// Another account never shows after switching; a sign-in loads the new one.
supabase.auth.onAuthStateChange((event, session) => {
    if (!session) {
        if (current) setCurrent(null);
        return;
    }
    if (current && current.id !== session.user.id) setCurrent(null);
    if (booted && (event === 'SIGNED_IN' || event === 'USER_UPDATED') && current?.id !== session.user.id) {
        // Outside the callback: Supabase calls made inside it can deadlock.
        setTimeout(() => void refreshCurrentUser(), 0);
    }
});

export function useCurrentUser() {
    const [, rerender] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        listeners.add(rerender);
        boot();
        return () => void listeners.delete(rerender);
    }, []);

    return {
        user: current,
        loading: !settled,
        error: lastError,
        refresh: refreshCurrentUser,
        /** Shows a profile the server just sent back (e.g. after linking an account). */
        setUser: (user: BackendUser | null) => setCurrent(user),
    };
}
