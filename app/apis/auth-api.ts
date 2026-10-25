import { apiFetch } from './http';

export type BackendUser = {
    id: string;
    username: string;
    avatarUrl: string | null;
    provider: string | null;
    /** Playing without an account until they link Google or an email. */
    isGuest: boolean;
    totalWins: number;
    totalGames: number;
    createdAt: string;
    updatedAt: string;
    /** When the next username change is allowed; null = now. */
    usernameChangeAt: string | null;
};

export type RegisterUserResponse = {
    registered: boolean;
    user: BackendUser;
};

export type RegisterUserResult = | { ok: true; data: RegisterUserResponse }
    | { ok: false; error: string; status?: number };

/** POST /auth/register — creates the player row on first sign-in (safe to repeat). */
export async function registerUserAfterOAuth(accessToken: string): Promise<RegisterUserResult> {
    const res = await apiFetch<RegisterUserResponse>(accessToken, '/auth/register', { method: 'POST' });
    if (res.ok && !res.data?.user?.id) return { ok: false, error: 'Invalid response from server.' };
    return res;
}
