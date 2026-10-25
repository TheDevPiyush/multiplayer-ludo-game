import type { Request, Response } from 'express';

import { games } from '../game/services';
import { prisma } from '../lib/prisma';
import { log } from '../lib/logger';
import { afterCursor, pageParams, toPage } from '../lib/paging';
import { getIO } from '../socket/socket-server';

export type Relation = 'none' | 'friends' | 'outgoing' | 'incoming';

const userSummary = {
    id: true,
    username: true,
    avatarUrl: true,
    totalWins: true,
    totalGames: true,
} as const;

/** Pending requests one user may have out at once. */
const MAX_OUTGOING = 100;
/** Re-inviting the same friend to the same room sooner than this doesn't ping them again. */
const REINVITE_MS = 30_000;

function handle(name: string, fn: (req: Request, res: Response) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            await fn(req, res);
        } catch (e) {
            log.error(`${name} failed`, { user: req.user?.id, error: (e as Error)?.message });
            return res.status(500).json({ message: 'Something went wrong.' });
        }
    };
}

function isOnline(userId: string): boolean {
    return (getIO()?.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0) > 0;
}

/** Tells a user's open apps to refresh badges / lists. */
function notify(userId: string, reason: 'request' | 'accepted' | 'removed' | 'invite', fromUserId: string, extra?: object) {
    getIO()?.to(`user:${userId}`).emit('social:update', { reason, fromUserId, ...extra });
}

/** Both directions of a pair; either may exist. */
function pairWhere(a: string, b: string) {
    return {
        OR: [
            { requesterId: a, addresseeId: b },
            { requesterId: b, addresseeId: a },
        ],
    };
}

function relationOf(me: string, f: { requesterId: string; status: string } | undefined): Relation {
    if (!f) return 'none';
    if (f.status === 'ACCEPTED') return 'friends';
    return f.requesterId === me ? 'outgoing' : 'incoming';
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const searchUsers = handle('searchUsers', async (req, res) => {
    const me = req.user!.id;
    const q = String(req.query.q ?? '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
    if (q.length < 2) return res.status(200).json({ data: [] });

    const users = await prisma.user.findMany({
        where: { username: { startsWith: q }, id: { not: me } },
        orderBy: { username: 'asc' },
        take: 20,
        select: userSummary,
    });
    if (users.length === 0) return res.status(200).json({ data: [] });

    const ids = users.map(u => u.id);
    const links = await prisma.friendship.findMany({
        where: {
            OR: [
                { requesterId: me, addresseeId: { in: ids } },
                { addresseeId: me, requesterId: { in: ids } },
            ],
        },
        select: { requesterId: true, addresseeId: true, status: true },
    });
    const byOther = new Map(links.map(l => [l.requesterId === me ? l.addresseeId : l.requesterId, l]));

    res.status(200).json({
        data: users.map(u => ({ user: u, relation: relationOf(me, byOther.get(u.id)) })),
    });
});

// ─── Friends & requests ──────────────────────────────────────────────────────

/** Most recently added first. Online status is live from the socket server. */
export const listFriends = handle('listFriends', async (req, res) => {
    const me = req.user!.id;
    const { limit, cursor } = pageParams(req, 30);
    const found = await prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] },
        orderBy: [{ respondedAt: 'desc' }, { id: 'desc' }],
        ...afterCursor(cursor, limit),
        select: {
            id: true,
            requesterId: true,
            respondedAt: true,
            requester: { select: userSummary },
            addressee: { select: userSummary },
        },
    });
    const { rows, nextCursor } = toPage(found, limit);

    res.status(200).json({
        data: rows.map(r => {
            const user = r.requesterId === me ? r.addressee : r.requester;
            return { user, online: isOnline(user.id), since: r.respondedAt };
        }),
        nextCursor,
    });
});

/**
 * Received requests (newest first), then sent ones, as one paged list. The
 * cursor says which half it's in: `in:<id>` or `out:<id>`.
 */
export const listRequests = handle('listRequests', async (req, res) => {
    const me = req.user!.id;
    const { limit, cursor } = pageParams(req);
    const [phase, after] = cursor?.startsWith('out:') ? ['out', cursor.slice(4)] : ['in', cursor?.replace(/^in:/, '')];
    const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const data: { direction: 'incoming' | 'outgoing'; user: unknown; createdAt: Date }[] = [];

    if (phase === 'in') {
        const found = await prisma.friendship.findMany({
            where: { addresseeId: me, status: 'PENDING' },
            orderBy: order,
            ...afterCursor(after || undefined, limit),
            select: { id: true, createdAt: true, requester: { select: userSummary } },
        });
        const { rows, nextCursor } = toPage(found, limit);
        data.push(...rows.map(r => ({ direction: 'incoming' as const, user: r.requester, createdAt: r.createdAt })));
        if (nextCursor) return res.status(200).json({ data, nextCursor: `in:${nextCursor}` });
    }

    // Received ones are exhausted: fill the rest of the page with sent ones.
    const room = limit - data.length;
    if (room === 0) return res.status(200).json({ data, nextCursor: 'out:' });
    const found = await prisma.friendship.findMany({
        where: { requesterId: me, status: 'PENDING' },
        orderBy: order,
        ...afterCursor(phase === 'out' ? after || undefined : undefined, room),
        select: { id: true, createdAt: true, addressee: { select: userSummary } },
    });
    const { rows, nextCursor } = toPage(found, room);
    data.push(...rows.map(r => ({ direction: 'outgoing' as const, user: r.addressee, createdAt: r.createdAt })));
    res.status(200).json({ data, nextCursor: nextCursor ? `out:${nextCursor}` : null });
});

/** Accepts a pending request from `otherId` to `me`. Returns false if there is none. */
async function acceptFrom(me: string, otherId: string): Promise<boolean> {
    const pending = await prisma.friendship.findUnique({
        where: { requesterId_addresseeId: { requesterId: otherId, addresseeId: me } },
    });
    if (!pending || pending.status !== 'PENDING') return false;

    await prisma.$transaction([
        prisma.friendship.update({ where: { id: pending.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } }),
        prisma.notification.updateMany({ where: { friendshipId: pending.id, userId: me }, data: { readAt: new Date() } }),
        prisma.notification.create({
            data: { userId: otherId, type: 'FRIEND_ACCEPTED', actorId: me, friendshipId: pending.id },
        }),
    ]);
    notify(otherId, 'accepted', me);
    notify(me, 'accepted', otherId);
    return true;
}

/** Send a request — or accept theirs, if they already asked. */
export const sendRequest = handle('sendRequest', async (req, res) => {
    const me = req.user!.id;
    const otherId = String(req.params.userId ?? '');
    if (!otherId || otherId === me) return res.status(400).json({ message: "You can't add yourself." });

    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) return res.status(404).json({ message: 'Player not found.' });

    const existing = await prisma.friendship.findFirst({ where: pairWhere(me, otherId) });
    if (existing) {
        if (existing.status === 'ACCEPTED') return res.status(200).json({ relation: 'friends' satisfies Relation });
        if (existing.requesterId === me) return res.status(200).json({ relation: 'outgoing' satisfies Relation });
        await acceptFrom(me, otherId);
        return res.status(200).json({ relation: 'friends' satisfies Relation });
    }

    const outgoing = await prisma.friendship.count({ where: { requesterId: me, status: 'PENDING' } });
    if (outgoing >= MAX_OUTGOING) {
        return res.status(429).json({ message: 'Too many pending requests. Wait for some to be answered.' });
    }

    try {
        const friendship = await prisma.friendship.create({ data: { requesterId: me, addresseeId: otherId } });
        await prisma.notification.create({
            data: { userId: otherId, type: 'FRIEND_REQUEST', actorId: me, friendshipId: friendship.id },
        });
    } catch (e) {
        // Double tap: the request already exists.
        if ((e as { code?: string })?.code !== 'P2002') throw e;
    }
    notify(otherId, 'request', me);
    res.status(201).json({ relation: 'outgoing' satisfies Relation });
});

export const acceptRequest = handle('acceptRequest', async (req, res) => {
    const me = req.user!.id;
    const ok = await acceptFrom(me, String(req.params.userId ?? ''));
    if (!ok) return res.status(404).json({ message: 'That request is no longer pending.' });
    res.status(200).json({ relation: 'friends' satisfies Relation });
});

/** Decline, cancel or unfriend — whatever links the pair is removed. */
export const removeFriend = handle('removeFriend', async (req, res) => {
    const me = req.user!.id;
    const otherId = String(req.params.userId ?? '');
    const { count } = await prisma.friendship.deleteMany({ where: pairWhere(me, otherId) });
    if (count > 0) notify(otherId, 'removed', me);
    res.status(200).json({ relation: 'none' satisfies Relation });
});

// ─── Room invites ────────────────────────────────────────────────────────────

/**
 * Invite a friend to a room you're in. Re-inviting the same friend to the same
 * room refreshes the one invite instead of stacking new ones.
 */
export const inviteToRoom = handle('inviteToRoom', async (req, res) => {
    const me = req.user!.id;
    const gameCode = String(req.body?.gameCode ?? '').toUpperCase();
    const friendId = String(req.body?.userId ?? '');

    const room = await games.getRoom({ gameCode });
    if (!room || !games.isMember(room, me)) return res.status(404).json({ message: 'Room not found.' });
    if (room.status !== 'WAITING') return res.status(400).json({ message: 'This game has already started.' });
    if (games.isMember(room, friendId)) return res.status(200).json({ invited: true, alreadyInRoom: true });
    if (room.players.length >= room.maxPlayers) return res.status(400).json({ message: 'The room is full.' });

    const friendship = await prisma.friendship.findFirst({ where: { ...pairWhere(me, friendId), status: 'ACCEPTED' }, select: { id: true } });
    if (!friendship) return res.status(403).json({ message: 'You can only invite friends.' });

    const existing = await prisma.notification.findFirst({
        where: { userId: friendId, actorId: me, type: 'ROOM_INVITE', gameCode },
        select: { id: true, createdAt: true },
    });
    if (existing && Date.now() - existing.createdAt.getTime() < REINVITE_MS) {
        return res.status(200).json({ invited: true });
    }
    if (existing) {
        await prisma.notification.update({ where: { id: existing.id }, data: { createdAt: new Date(), readAt: null } });
    } else {
        await prisma.notification.create({ data: { userId: friendId, type: 'ROOM_INVITE', actorId: me, gameCode } });
    }

    const inviter = room.players.find(p => p.userId === me);
    notify(friendId, 'invite', me, { gameCode, username: inviter?.username });
    res.status(200).json({ invited: true });
});

// ─── Notifications ───────────────────────────────────────────────────────────

/** Badge and tab counts — lists are paged, so their totals come from here. */
export const getSummary = handle('getSummary', async (req, res) => {
    const me = req.user!.id;
    const [unreadNotifications, incomingRequests, outgoingRequests, friends] = await Promise.all([
        prisma.notification.count({ where: { userId: me, readAt: null } }),
        prisma.friendship.count({ where: { addresseeId: me, status: 'PENDING' } }),
        prisma.friendship.count({ where: { requesterId: me, status: 'PENDING' } }),
        prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] } }),
    ]);
    res.status(200).json({ data: { unreadNotifications, incomingRequests, outgoingRequests, friends } });
});

export const listNotifications = handle('listNotifications', async (req, res) => {
    const me = req.user!.id;
    const { limit, cursor } = pageParams(req);
    const found = await prisma.notification.findMany({
        where: { userId: me },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...afterCursor(cursor, limit),
        select: {
            id: true,
            type: true,
            createdAt: true,
            readAt: true,
            gameCode: true,
            actor: { select: userSummary },
            friendship: { select: { requesterId: true, status: true } },
        },
    });
    const { rows, nextCursor } = toPage(found, limit);

    // Invites stay useful only while their room is still waiting for players.
    const codes = [...new Set(rows.flatMap(n => (n.type === 'ROOM_INVITE' && n.gameCode ? [n.gameCode] : [])))];
    const open = new Set(
        codes.length
            ? (await prisma.gameRoom.findMany({ where: { gameCode: { in: codes }, status: 'WAITING' }, select: { gameCode: true } })).map(r => r.gameCode)
            : [],
    );

    res.status(200).json({
        data: rows.map(({ friendship, ...n }) => ({
            ...n,
            relation: relationOf(me, friendship ?? undefined),
            ...(n.type === 'ROOM_INVITE' ? { roomOpen: open.has(n.gameCode ?? '') } : {}),
        })),
        nextCursor,
    });
});

export const markNotificationsRead = handle('markNotificationsRead', async (req, res) => {
    const me = req.user!.id;
    const { count } = await prisma.notification.updateMany({
        where: { userId: me, readAt: null },
        data: { readAt: new Date() },
    });
    res.status(200).json({ updated: count });
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Drops notifications nobody needs any more, so the table doesn't grow forever. */
export async function pruneNotifications(now = Date.now()) {
    const [read, invites] = await Promise.all([
        prisma.notification.deleteMany({ where: { readAt: { lt: new Date(now - 30 * DAY_MS) } } }),
        // An invite is only useful while its room is waiting for players.
        prisma.notification.deleteMany({ where: { type: 'ROOM_INVITE', createdAt: { lt: new Date(now - DAY_MS) } } }),
    ]);
    log.info('notifications pruned', { read: read.count, invites: invites.count });
}

/** Runs the cleanup a minute after start, then daily. */
export function startNotificationCleanup() {
    const run = () => void pruneNotifications().catch(e => log.error('notification cleanup failed', { error: (e as Error)?.message }));
    setTimeout(run, 60_000).unref?.();
    setInterval(run, DAY_MS).unref?.();
}
