import type { Href } from 'expo-router';

/** Host that serves /invite/<code> and the app-link verification files. Set in .env; app.config.ts registers the same host with Android/iOS. */
const LINK_BASE = (process.env.EXPO_PUBLIC_LINK_URL || process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

/** /invite/ is the shared form; /join/ is the custom scheme's path and older shared links. */
const JOIN_RE = /(?:^|\/)(?:join|invite)\/([A-Za-z0-9]{6})(?:[/?#]|$)/;

/** https://…/invite/ABC123 — opens the app when installed, a landing page otherwise. */
export function roomInviteUrl(gameCode: string): string {
    return `${LINK_BASE}/invite/${gameCode.toUpperCase()}`;
}

/** Room code from any link form: https://host/invite/ABC123, https://host/join/ABC123, simpleludo://join/ABC123. */
export function joinCodeFromUrl(url: string): string | null {
    const m = JOIN_RE.exec(url);
    return m ? m[1]!.toUpperCase() : null;
}

/** Path + query of an http(s) link to our host, for the router. Other URLs pass through. */
export function routerPathFromUrl(url: string): string {
    const m = /^https?:\/\/[^/]+(\/[^#]*)?/i.exec(url);
    return m ? m[1] || '/' : url;
}

// ─── Friends modal ────────────────────────────────────────────────────────────

export type FriendsTab = 'friends' | 'requests';

/** The friends modal is a route: /friends?tab=requests works from anywhere (and as a deep link). */
export function friendsHref(tab: FriendsTab = 'friends'): Href {
    return { pathname: '/friends', params: { tab } };
}

// ─── Pending link ─────────────────────────────────────────────────────────────

export type PendingLink = { kind: 'join'; code: string } | { kind: 'friends'; tab: FriendsTab };

/**
 * A link that arrived before the app could act on it: on a cold start (the
 * root layout routes on sign-in and would replace it), or while signed out.
 * The root layout routes to it once the player is signed in.
 */
let pendingLink: PendingLink | null = null;

export function setPendingLink(link: PendingLink | null) {
    pendingLink = link;
}

export function takePendingLink(): PendingLink | null {
    const link = pendingLink;
    pendingLink = null;
    return link;
}

/** Forget a pending join once the join screen has dealt with it. */
export function clearPendingJoin(code: string) {
    if (pendingLink?.kind === 'join' && pendingLink.code === code) pendingLink = null;
}

/** /friends?tab=requests → 'requests'; null for other paths. */
export function friendsTabFromPath(path: string): FriendsTab | null {
    if (!/^\/friends(?:[/?#]|$)/.test(path)) return null;
    return /[?&]tab=requests\b/.test(path) ? 'requests' : 'friends';
}
