/**
 * Live sockets per (room, user). Presence is in memory only — it is never
 * written to Postgres. When a user's last socket drops, a grace timer runs
 * before they are treated as disconnected (and their turns go on autopilot).
 */

const liveSockets = new Map<string, Map<string, Set<string>>>();
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS ?? 15_000);

const key = (roomId: string, userId: string) => `${roomId}:${userId}`;

export function getRoomPresence(roomId: string): string[] {
    return Array.from(liveSockets.get(roomId)?.keys() ?? []);
}

export function onlineCount(roomId: string): number {
    return liveSockets.get(roomId)?.size ?? 0;
}

export function isUserOnline(roomId: string, userId: string): boolean {
    return (liveSockets.get(roomId)?.get(userId)?.size ?? 0) > 0;
}

/** Returns true if this is the user's first live socket in the room. */
export function addSocket(roomId: string, userId: string, socketId: string): boolean {
    let users = liveSockets.get(roomId);
    if (!users) liveSockets.set(roomId, (users = new Map()));
    let set = users.get(userId);
    if (!set) users.set(userId, (set = new Set()));
    const first = set.size === 0;
    set.add(socketId);

    const t = graceTimers.get(key(roomId, userId));
    if (t) {
        clearTimeout(t);
        graceTimers.delete(key(roomId, userId));
    }
    return first;
}

/** Returns true if that was the user's last live socket in the room. */
export function removeSocket(roomId: string, userId: string, socketId: string): boolean {
    const users = liveSockets.get(roomId);
    const set = users?.get(userId);
    if (!users || !set) return false;
    set.delete(socketId);
    if (set.size > 0) return false;
    users.delete(userId);
    if (users.size === 0) liveSockets.delete(roomId);
    return true;
}

export function scheduleDisconnect(roomId: string, userId: string, onTimeout: () => void) {
    const k = key(roomId, userId);
    if (graceTimers.has(k) || isUserOnline(roomId, userId)) return;
    graceTimers.set(k, setTimeout(() => {
        graceTimers.delete(k);
        if (!isUserOnline(roomId, userId)) onTimeout();
    }, GRACE_MS));
}
