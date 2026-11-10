import { apiBaseUrl, apiFetch, type Result } from './http';

export type Mission = {
    id: string;
    title: string;
    target: number;
    coins: number;
    progress: number;
    claimed: boolean;
};

/** One day of the daily reward week. `before`: before the player joined, so nothing was missed. */
export type DailyDay = { date: string; coins: number; state: 'collected' | 'missed' | 'today' | 'upcoming' | 'before' };

/** Coins, level, daily reward and today's missions (server: progress/progress.ts getProgress). */
export type Progress = {
    /** India date the missions and daily reward belong to. */
    day: string;
    coins: number;
    xp: number;
    level: number;
    /** XP into the current level, and what the level needs in all. */
    levelXp: number;
    levelXpNeeded: number;
    streak: number;
    daily: {
        claimedToday: boolean;
        /** Today's weekday, Monday 1 … Sunday 7. */
        cycleDay: number;
        rewards: number[];
        /** This India week, Monday first. Older servers don't send it. */
        week?: DailyDay[];
    };
    missions: Mission[];
};

/** What one game paid (server: RewardSummary). */
export type GameReward = {
    coins: number;
    xp: number;
    level: number;
    levelsGained: number;
    missionsDone: string[];
    capped: boolean;
    /** Invite bonus, on top of `coins`: `joined` names the host, `host` the new players. */
    invite?: { coins: number; role: 'joined' | 'host'; names: string[] } | null;
};

export async function fetchProgress(accessToken: string): Promise<Result<Progress>> {
    return apiFetch(accessToken, '/progress');
}

export async function claimDaily(accessToken: string): Promise<Result<{ coins: number; progress: Progress }>> {
    return apiFetch(accessToken, '/progress/daily/claim', { method: 'POST' });
}

export async function claimMission(accessToken: string, missionId: string): Promise<Result<{ coins: number; progress: Progress }>> {
    return apiFetch(accessToken, `/progress/missions/${encodeURIComponent(missionId)}/claim`, { method: 'POST' });
}

/** A finished Vs Computer game, for its (small, capped) reward and mission progress. */
export type OfflineGameReport = {
    gameId: string;
    won: boolean;
    seconds: number;
    moves: number;
    captures: number;
    home: number;
    sixes: number;
};

export async function reportOfflineGame(
    accessToken: string,
    report: OfflineGameReport,
): Promise<Result<{ reward: GameReward | null; progress: Progress }>> {
    return apiFetch(accessToken, '/progress/offline-game', { method: 'POST', body: JSON.stringify(report) });
}

/** Server-tuned values (no sign-in needed). */
export type RemoteConfig = {
    dice?: { strength: number; momentum: number; luckFade: number };
    rewards?: { invite?: { coins: number } };
};

export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
    const base = apiBaseUrl();
    if (!base) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
        const res = await fetch(`${base}/config`, { signal: controller.signal });
        return res.ok ? ((await res.json()) as RemoteConfig) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
