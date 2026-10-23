import { supabase } from '@/util/supabase-client';
import { apiFetch, type Result } from './game-api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PublicUser = {
    id: string;
    username: string;
    avatarUrl: string | null;
    totalWins: number;
    totalGames: number;
};

/** How the signed-in player relates to someone else. */
export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming';

export type SearchResult = { user: PublicUser; relation: Relation };
export type Friend = { user: PublicUser; online: boolean; since: string | null };
/** Received requests come first in the list, then sent ones. */
export type FriendRequest = { direction: 'incoming' | 'outgoing'; user: PublicUser; createdAt: string };

export type AppNotification = {
    id: string;
    type: 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'ROOM_INVITE';
    createdAt: string;
    /** ROOM_INVITE: the room to join, and whether it's still waiting for players. */
    gameCode: string | null;
    roomOpen?: boolean;
    readAt: string | null;
    actor: PublicUser;
    relation: Relation;
};

export type SocialSummary = {
    unreadNotifications: number;
    incomingRequests: number;
    outgoingRequests: number;
    friends: number;
};

/** One page of a list; pass `nextCursor` back to get the next page (null = no more). */
export type Page<T> = { data: T[]; nextCursor: string | null };

const pageQuery = (cursor?: string) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');

// ─── Calls ────────────────────────────────────────────────────────────────────

async function authed<T>(path: string, init?: RequestInit): Promise<Result<T>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'Not signed in.', status: 401 };
    return apiFetch<T>(token, `/social${path}`, init);
}

export const searchUsers = (q: string) =>
    authed<{ data: SearchResult[] }>(`/users/search?q=${encodeURIComponent(q)}`);

export const getFriends = (cursor?: string) => authed<Page<Friend>>(`/friends${pageQuery(cursor)}`);
export const getFriendRequests = (cursor?: string) => authed<Page<FriendRequest>>(`/requests${pageQuery(cursor)}`);

/** Sends a request, or accepts theirs if they already asked. */
export const addFriend = (userId: string) =>
    authed<{ relation: Relation }>(`/friends/${userId}`, { method: 'POST' });

export const acceptFriend = (userId: string) =>
    authed<{ relation: Relation }>(`/friends/${userId}/accept`, { method: 'POST' });

/** Declines, cancels or unfriends. */
export const removeFriend = (userId: string) =>
    authed<{ relation: Relation }>(`/friends/${userId}`, { method: 'DELETE' });

/** Invite a friend to a room you're in (they get a notification + a live banner). */
export const inviteFriend = (gameCode: string, userId: string) =>
    authed<{ invited: boolean; alreadyInRoom?: boolean }>('/invites', { method: 'POST', body: JSON.stringify({ gameCode, userId }) });

export const getSocialSummary = () => authed<{ data: SocialSummary }>('/summary');
export const getNotifications = (cursor?: string) => authed<Page<AppNotification>>(`/notifications${pageQuery(cursor)}`);
export const markNotificationsRead = () => authed<{ updated: number }>('/notifications/read', { method: 'POST' });
