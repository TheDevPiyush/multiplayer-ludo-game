import type { NextFunction, Request, Response } from 'express';

import { Prisma } from '../generated/prisma/client.ts';
import { BOT_PROVIDER } from '../game/bots';
import { games } from '../game/services';
import { GUEST_PROVIDER } from '../lib/auth';
import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { TtlCache } from '../lib/ttl-cache';
import { sendPushes, type PushMessage } from '../notifications/push';
import { parseInput, statusOf, statusWhere, type AnnouncementInput } from '../announcements/announcements';
import { isUserOnline } from '../socket/socket-server';

// ─── Access ──────────────────────────────────────────────────────────────────

/** `User.isAdmin` per user, briefly cached (every console request checks it). Cleared when it changes. */
const adminFlag = new TtlCache<string, boolean>(30_000, 5 * 60_000);

async function isAdmin(userId: string): Promise<boolean> {
    const cached = adminFlag.get(userId);
    if (cached !== undefined) return cached;
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
    const ok = row?.isAdmin === true;
    adminFlag.set(userId, ok);
    return ok;
}

/** Mount after token verification. Admin is `User.isAdmin` in the database; guests never are. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = req.user;
    try {
        if (user && !user.isAnonymous && (await isAdmin(user.id))) return next();
    } catch (e) {
        log.error('admin check failed', { user: user?.id, error: (e as Error)?.message });
        return res.status(500).json({ message: 'Something went wrong.' });
    }
    log.warn('admin console: access denied', { user: user?.id, email: user?.email });
    res.status(403).json({ message: 'This account is not an admin.' });
}

/** Browsers call the API from the website's origin. */
export function adminCors(req: Request, res: Response, next: NextFunction) {
    const allowed = (process.env.ADMIN_ORIGINS ?? 'https://simple-ludo.thedevpiyush.com,http://localhost:3000')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
}

function handle(name: string, fn: (req: Request, res: Response) => Promise<unknown>) {
    return async (req: Request, res: Response) => {
        try {
            await fn(req, res);
        } catch (e) {
            log.error(`admin ${name} failed`, { user: req.user?.id, error: (e as Error)?.message });
            res.status(500).json({ message: 'Something went wrong.' });
        }
    };
}

// ─── Paging ──────────────────────────────────────────────────────────────────

const MAX_PAGE_SIZE = 100;

/** Page-number paging (admin tables show "page 3 of 12"). */
function pageOf(req: Request) {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)));
    return { page, pageSize, skip: (page - 1) * pageSize };
}

function query(req: Request, max = 80): string {
    return String(req.query.q ?? '').trim().slice(0, max);
}

// ─── Emails (Supabase auth schema) ───────────────────────────────────────────

/**
 * Emails live in Supabase's `auth.users`, not in our tables. The database role
 * can usually read it; when it can't, the console simply shows no emails.
 */
async function emailsFor(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    try {
        const rows = await prisma.$queryRaw<{ id: string; email: string | null }[]>`
            SELECT id::text AS id, email FROM auth.users WHERE id::text = ANY(${ids})`;
        for (const r of rows) if (r.email) out.set(r.id, r.email);
    } catch (e) {
        log.debug('admin: auth.users not readable', { error: (e as Error)?.message });
    }
    return out;
}

async function idsByEmail(q: string): Promise<string[]> {
    try {
        const rows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id::text AS id FROM auth.users WHERE email ILIKE ${'%' + q + '%'} LIMIT 200`;
        return rows.map(r => r.id);
    } catch {
        return [];
    }
}

// ─── Overview ────────────────────────────────────────────────────────────────

export const me = handle('me', async (req, res) => {
    res.json({ data: { id: req.user!.id, email: req.user!.email ?? null } });
});

export const stats = handle('stats', async (_req, res) => {
    const [users, guests, withDevices, newToday] = await Promise.all([
        prisma.user.count({ where: { NOT: { provider: BOT_PROVIDER } } }),
        prisma.user.count({ where: { provider: GUEST_PROVIDER } }),
        prisma.user.count({ where: { NOT: [{ provider: BOT_PROVIDER }, { pushTokens: { isEmpty: true } }] } }),
        prisma.user.count({ where: { NOT: { provider: BOT_PROVIDER }, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
    ]);
    const live = games.liveRooms();
    res.json({
        data: {
            users,
            guests,
            withDevices,
            newToday,
            playing: live.filter(r => r.room.status === 'PLAYING').length,
            lobbies: live.filter(r => r.room.status === 'WAITING').length,
        },
    });
});

// ─── Users ───────────────────────────────────────────────────────────────────

type UserType = 'all' | 'accounts' | 'guests' | 'bots' | 'admins';

function typeWhere(type: UserType): Prisma.UserWhereInput {
    switch (type) {
        case 'accounts': return { NOT: [{ provider: GUEST_PROVIDER }, { provider: BOT_PROVIDER }] };
        case 'guests': return { provider: GUEST_PROVIDER };
        case 'bots': return { provider: BOT_PROVIDER };
        case 'admins': return { isAdmin: true };
        default: return { NOT: { provider: BOT_PROVIDER } };
    }
}

export const listUsers = handle('listUsers', async (req, res) => {
    const { page, pageSize, skip } = pageOf(req);
    const q = query(req).replace(/^@/, '');
    const rawType = String(req.query.type ?? 'all');
    const type: UserType = (['all', 'accounts', 'guests', 'bots', 'admins'] as const).includes(rawType as UserType) ? (rawType as UserType) : 'all';
    const withDevice = req.query.withDevice === '1';

    const and: Prisma.UserWhereInput[] = [typeWhere(type)];
    if (withDevice) and.push({ NOT: { pushTokens: { isEmpty: true } } });
    if (q) {
        const emailIds = q.length >= 3 ? await idsByEmail(q) : [];
        and.push({
            OR: [
                { username: { contains: q.toLowerCase(), mode: 'insensitive' } },
                { id: { startsWith: q } },
                ...(emailIds.length ? [{ id: { in: emailIds } }] : []),
            ],
        });
    }
    const where: Prisma.UserWhereInput = { AND: and };

    const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            skip,
            take: pageSize,
            select: {
                id: true, username: true, avatarUrl: true, provider: true, totalGames: true, totalWins: true,
                pushTokens: true, lastSeenAt: true, createdAt: true, isAdmin: true,
            },
        }),
    ]);
    const emails = await emailsFor(rows.map(r => r.id));

    res.json({
        data: rows.map(({ pushTokens, ...r }) => ({
            ...r,
            email: emails.get(r.id) ?? null,
            devices: pushTokens.length,
            online: isUserOnline(r.id),
        })),
        page,
        pageSize,
        total,
    });
});

/**
 * Grants or revokes admin. Only saved accounts can be admins (guests and bots
 * can't sign in to the console), and nobody can remove their own access.
 */
export const setAdmin = handle('setAdmin', async (req, res) => {
    const id = String(req.params.userId ?? '');
    const grant = req.body?.isAdmin;
    if (typeof grant !== 'boolean') return res.status(400).json({ message: 'isAdmin must be true or false.' });
    if (id === req.user!.id && !grant) return res.status(400).json({ message: "You can't remove your own admin access." });

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true, provider: true, isAdmin: true } });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (grant && (user.provider === GUEST_PROVIDER || user.provider === BOT_PROVIDER)) {
        return res.status(400).json({ message: 'Only saved accounts can be admins.' });
    }

    if (user.isAdmin !== grant) {
        await prisma.user.update({ where: { id }, data: { isAdmin: grant } });
        log.info(grant ? 'admin granted' : 'admin revoked', { by: req.user!.id, user: id, username: user.username });
    }
    // Takes effect on their next request, not after the cache expires.
    adminFlag.delete(id);
    res.json({ data: { id, isAdmin: grant } });
});

// ─── Live games ──────────────────────────────────────────────────────────────

export const listGames = handle('listGames', async (req, res) => {
    const { page, pageSize, skip } = pageOf(req);
    const q = query(req).toLowerCase().replace(/^@/, '');
    const status = String(req.query.status ?? 'all').toUpperCase();

    let rooms = games.liveRooms();
    if (status === 'PLAYING' || status === 'WAITING') rooms = rooms.filter(r => r.room.status === status);
    if (q) {
        rooms = rooms.filter(({ room }) =>
            room.gameCode.toLowerCase().includes(q) || room.players.some(p => p.username.toLowerCase().includes(q)));
    }
    // Newest activity first: games by start, lobbies by creation.
    const at = (r: (typeof rooms)[number]) => Date.parse(r.room.startedAt ?? r.room.createdAt);
    rooms.sort((a, b) => at(b) - at(a));

    const now = Date.now();
    res.json({
        data: rooms.slice(skip, skip + pageSize).map(({ room, paused, online }) => {
            const g = room.game;
            return {
                id: room.id,
                gameCode: room.gameCode,
                status: room.status,
                isPrivate: room.isPrivate,
                maxPlayers: room.maxPlayers,
                createdAt: room.createdAt,
                startedAt: room.startedAt,
                turn: g && g.phase !== 'OVER' ? g.turn : null,
                dice: g?.dice ?? null,
                moves: room.moveLog.length,
                version: room.version,
                paused,
                connected: online,
                turnMsLeft: room.turnEndsAt === null ? null : Math.max(0, room.turnEndsAt - now),
                players: room.players.map(p => ({
                    userId: p.userId,
                    username: p.username,
                    color: p.color,
                    status: p.status,
                    isBot: !!p.isBot,
                    finished: g?.players.find(x => x.color === p.color)?.rank ?? null,
                })),
            };
        }),
        page,
        pageSize,
        total: rooms.length,
    });
});

// ─── Notifications ───────────────────────────────────────────────────────────

const TITLE_MAX = 65;
const BODY_MAX = 240;
/** App routes a notification may open (the app ignores anything else and opens Home). */
const URL_RE = /^\/(?:friends(?:\?tab=(?:friends|requests))?|join\/[A-Z0-9]{6})?$/;
/** Users fetched per database round trip when sending to everyone. */
const SEND_BATCH = 1_000;
const MAX_PICKED = 1_000;

export const sendNotification = handle('sendNotification', async (req, res) => {
    const title = String(req.body?.title ?? '').trim();
    const body = String(req.body?.body ?? '').trim();
    const url = String(req.body?.url ?? '/').trim() || '/';
    const audience = req.body?.audience === 'all' ? 'all' : 'users';
    const userIds: string[] = Array.isArray(req.body?.userIds)
        ? [...new Set((req.body.userIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length <= 64))]
        : [];

    if (!title || title.length > TITLE_MAX) return res.status(400).json({ message: `Title is required (at most ${TITLE_MAX} characters).` });
    if (!body || body.length > BODY_MAX) return res.status(400).json({ message: `Message is required (at most ${BODY_MAX} characters).` });
    if (!URL_RE.test(url)) return res.status(400).json({ message: 'Unknown destination.' });
    if (audience === 'users' && userIds.length === 0) return res.status(400).json({ message: 'Pick at least one user.' });
    if (userIds.length > MAX_PICKED) return res.status(400).json({ message: `Pick at most ${MAX_PICKED} users, or send to everyone.` });

    const message: PushMessage = { title, body, url };
    let recipients = 0;
    const result = { sent: 0, dead: 0, failed: 0 };
    const send = async (rows: { id: string; pushTokens: string[] }[]) => {
        const items = rows.filter(r => r.pushTokens.length > 0).map(r => ({ userId: r.id, tokens: r.pushTokens, message }));
        if (items.length === 0) return;
        recipients += items.length;
        const r = await sendPushes(items, 'announcement');
        result.sent += r.sent;
        result.dead += r.dead;
        result.failed += r.failed;
    };

    if (audience === 'users') {
        await send(await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, pushTokens: true } }));
    } else {
        let cursor: string | undefined;
        for (;;) {
            const rows = await prisma.user.findMany({
                where: { NOT: [{ provider: BOT_PROVIDER }, { pushTokens: { isEmpty: true } }] },
                orderBy: { id: 'asc' },
                take: SEND_BATCH,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: { id: true, pushTokens: true },
            });
            if (rows.length === 0) break;
            await send(rows);
            cursor = rows[rows.length - 1]!.id;
            if (rows.length < SEND_BATCH) break;
        }
    }

    // The pushes are out: a failed log write must not make the send look failed (and invite a resend).
    const saved = await prisma.adminBroadcast.create({
        data: {
            title, body, url, audience,
            recipients,
            devices: result.sent,
            sentById: req.user!.id,
            sentBy: req.user!.email ?? null,
        },
    }).catch(e => {
        log.error('admin broadcast log failed', { error: (e as Error)?.message });
        return null;
    });
    log.info('admin broadcast', { by: req.user!.email, audience, recipients, ...result });
    res.json({ data: { id: saved?.id ?? null, recipients, ...result } });
});

export const listBroadcasts = handle('listBroadcasts', async (req, res) => {
    const { page, pageSize, skip } = pageOf(req);
    const q = query(req);
    const where: Prisma.AdminBroadcastWhereInput = q
        ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }] }
        : {};
    const [total, rows] = await Promise.all([
        prisma.adminBroadcast.count({ where }),
        prisma.adminBroadcast.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    ]);
    res.json({ data: rows, page, pageSize, total });
});

// ─── Announcements ───────────────────────────────────────────────────────────

const announcementSelect = {
    id: true, title: true, html: true, startsAt: true, endsAt: true, audience: true, userIds: true,
    everyOpen: true, priority: true, active: true, createdBy: true, updatedBy: true, createdAt: true, updatedAt: true,
} satisfies Prisma.AnnouncementSelect;

type AnnouncementRow = Prisma.AnnouncementGetPayload<{ select: typeof announcementSelect }>;

function announcementDto({ userIds, ...a }: AnnouncementRow, now = new Date()) {
    return { ...a, userCount: userIds.length, status: statusOf(a, now) };
}

/** The users an announcement is aimed at, for the editor's chips. */
async function pickedUsers(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatarUrl: true, provider: true } });
    return rows;
}

export const listAnnouncements = handle('listAnnouncements', async (req, res) => {
    const { page, pageSize, skip } = pageOf(req);
    const q = query(req);
    const now = new Date();
    const status = String(req.query.status ?? 'all');
    const where: Prisma.AnnouncementWhereInput = {
        AND: [statusWhere(status, now), q ? { title: { contains: q, mode: 'insensitive' } } : {}],
    };
    const [total, rows, counts] = await Promise.all([
        prisma.announcement.count({ where }),
        prisma.announcement.findMany({
            where,
            orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
            skip,
            take: pageSize,
            select: announcementSelect,
        }),
        // For the filter tabs.
        Promise.all((['live', 'scheduled', 'ended', 'paused'] as const).map(s => prisma.announcement.count({ where: statusWhere(s, now) }))),
    ]);
    res.json({
        data: rows.map(r => announcementDto(r, now)),
        page,
        pageSize,
        total,
        counts: { live: counts[0], scheduled: counts[1], ended: counts[2], paused: counts[3] },
    });
});

export const getAnnouncement = handle('getAnnouncement', async (req, res) => {
    const row = await prisma.announcement.findUnique({ where: { id: String(req.params.id) }, select: announcementSelect });
    if (!row) return res.status(404).json({ message: 'Announcement not found.' });
    res.json({ data: { ...announcementDto(row), userIds: row.userIds, users: await pickedUsers(row.userIds) } });
});

export const createAnnouncement = handle('createAnnouncement', async (req, res) => {
    const parsed = parseInput(req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });
    const row = await prisma.announcement.create({
        data: { ...parsed.value, createdById: req.user!.id, createdBy: req.user!.email ?? null },
        select: announcementSelect,
    });
    log.info('announcement created', { by: req.user!.email, id: row.id, audience: row.audience });
    res.status(201).json({ data: announcementDto(row) });
});

/** Full edit, or a partial one (e.g. `{ active: false }` to pause). */
export const updateAnnouncement = handle('updateAnnouncement', async (req, res) => {
    const id = String(req.params.id);
    const current = await prisma.announcement.findUnique({ where: { id }, select: announcementSelect });
    if (!current) return res.status(404).json({ message: 'Announcement not found.' });
    const parsed = parseInput(req.body, current as AnnouncementInput);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });
    const row = await prisma.announcement.update({
        where: { id },
        data: { ...parsed.value, updatedBy: req.user!.email ?? null },
        select: announcementSelect,
    });
    log.info('announcement updated', { by: req.user!.email, id });
    res.json({ data: announcementDto(row) });
});

export const deleteAnnouncement = handle('deleteAnnouncement', async (req, res) => {
    const id = String(req.params.id);
    const gone = await prisma.announcement.deleteMany({ where: { id } });
    if (gone.count === 0) return res.status(404).json({ message: 'Announcement not found.' });
    log.info('announcement deleted', { by: req.user!.email, id });
    res.json({ data: { id } });
});
