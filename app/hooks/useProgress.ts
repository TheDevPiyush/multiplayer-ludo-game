import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { claimDaily as claimDailyApi, claimMission as claimMissionApi, fetchProgress, type Progress } from '@/apis/progress-api';
import { track } from '@/util/analytics';
import { supabase } from '@/util/supabase-client';

// One copy shared by every screen, so Home shows the last numbers at once while it refreshes.
let cached: { userId: string; progress: Progress } | null = null;
const listeners = new Set<(p: Progress | null) => void>();

function publish(userId: string | null, progress: Progress | null) {
    cached = userId && progress ? { userId, progress } : null;
    for (const l of listeners) l(cached?.progress ?? null);
}

// Another account's coins never show after switching.
supabase.auth.onAuthStateChange((_event, session) => {
    if (cached && cached.userId !== session?.user.id) publish(null, null);
});

async function session() {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    return s ? { token: s.access_token, userId: s.user.id } : null;
}

/** Fetches the player's progress and updates every screen showing it. */
export async function refreshProgress() {
    const s = await session();
    if (!s) return publish(null, null);
    const r = await fetchProgress(s.token);
    if (r.ok) publish(s.userId, r.data);
}

/** Puts progress the server sent back (after a claim or a game report) on every screen. */
export async function showProgress(progress: Progress) {
    const s = await session();
    if (s) publish(s.userId, progress);
}

type ClaimResult = { ok: true; coins: number } | { ok: false; error: string };

export function useProgress() {
    const [progress, setProgress] = useState<Progress | null>(cached?.progress ?? null);

    useEffect(() => {
        listeners.add(setProgress);
        return () => void listeners.delete(setProgress);
    }, []);

    useFocusEffect(useCallback(() => void refreshProgress(), []));

    const claimDaily = useCallback(async (): Promise<ClaimResult> => {
        const s = await session();
        if (!s) return { ok: false, error: 'Sign in to collect rewards.' };
        const r = await claimDailyApi(s.token);
        if (!r.ok) {
            void refreshProgress();
            return { ok: false, error: r.error };
        }
        publish(s.userId, r.data.progress);
        track('daily_claim', { day: r.data.progress.daily.cycleDay, streak: r.data.progress.streak });
        return { ok: true, coins: r.data.coins };
    }, []);

    const claimMission = useCallback(async (missionId: string): Promise<ClaimResult> => {
        const s = await session();
        if (!s) return { ok: false, error: 'Sign in to collect rewards.' };
        const r = await claimMissionApi(s.token, missionId);
        if (!r.ok) {
            void refreshProgress();
            return { ok: false, error: r.error };
        }
        publish(s.userId, r.data.progress);
        track('mission_claim', { mission: missionId });
        return { ok: true, coins: r.data.coins };
    }, []);

    return { progress, claimDaily, claimMission, refresh: refreshProgress };
}
