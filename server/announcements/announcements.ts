import type { Request, Response } from 'express';

import { Prisma } from '../generated/prisma/client.ts';
import type { AuthUser } from '../lib/auth';
import { log } from '../lib/logger';
import { prisma } from '../lib/prisma';

/**
 * Announcements: notices written in the admin console and shown in the app as a
 * modal. The app asks for them on opening and after signing in; whichever are
 * live for that user (between `startsAt` and `endsAt`, not paused, aimed at
 * them) come back, highest priority first.
 */

export const AUDIENCES = ['all', 'accounts', 'guests', 'users'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const TITLE_MAX = 80;
/** HTML is kept small: images go in by URL, not embedded. */
export const HTML_MAX = 200_000;
export const MAX_USERS = 1_000;
const MAX_SPAN_MS = 366 * 24 * 3600_000;
/** A phone shows at most this many in a row. */
const MAX_LIVE = 10;

export type AnnouncementInput = {
    title: string;
    html: string;
    startsAt: Date;
    endsAt: Date;
    audience: Audience;
    userIds: string[];
    everyOpen: boolean;
    priority: number;
    active: boolean;
};

/**
 * Strips what has no business in a notice: scripts, embedded objects and frames,
 * inline event handlers and javascript: links. Admins write these, so this is a
 * safety net, not a full sanitiser (the app's WebView has no bridge to abuse).
 */
export function cleanHtml(html: string): string {
    return html
        .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<(script|iframe|object|embed|frame|frameset|base|meta|link)\b[^>]*>/gi, '')
        .replace(/<\/(iframe|object|embed|frame|frameset)\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src|action)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"')
        .trim();
}

/** Some text or an image, not just empty tags. */
function hasContent(html: string): boolean {
    return /<img\b/i.test(html) || html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '').length > 0;
}

/** Validates an admin's create / update body. With `base` (an update), fields that weren't sent keep its values. */
export function parseInput(body: unknown, base?: AnnouncementInput): { ok: true; value: AnnouncementInput } | { ok: false; message: string } {
    const b = (body ?? {}) as Record<string, unknown>;
    const pick = <K extends keyof AnnouncementInput>(k: K, read: (v: unknown) => AnnouncementInput[K] | undefined): AnnouncementInput[K] | undefined =>
        b[k] === undefined ? base?.[k] : read(b[k]);

    const title = pick('title', v => (typeof v === 'string' ? v.trim() : undefined));
    if (!title || title.length > TITLE_MAX) return { ok: false, message: `Title is required (at most ${TITLE_MAX} characters).` };

    const html = pick('html', v => (typeof v === 'string' ? cleanHtml(v) : undefined));
    if (!html || !hasContent(html) || html.length > HTML_MAX) {
        return { ok: false, message: `Write something in the notice (HTML at most ${HTML_MAX / 1000} KB; add images by URL).` };
    }

    const date = (v: unknown) => {
        if (typeof v !== 'string') return undefined;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const startsAt = pick('startsAt', date);
    const endsAt = pick('endsAt', date);
    if (!startsAt || !endsAt) return { ok: false, message: 'Start and end date / time are required.' };
    if (endsAt <= startsAt) return { ok: false, message: 'The end must be after the start.' };
    if (endsAt.getTime() - startsAt.getTime() > MAX_SPAN_MS) return { ok: false, message: 'An announcement can run for at most a year.' };

    const audience = pick('audience', v => (AUDIENCES.includes(v as Audience) ? (v as Audience) : undefined));
    if (!audience) return { ok: false, message: 'Unknown audience.' };

    const rawIds = pick('userIds', v => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64) : undefined)) ?? [];
    const userIds = audience === 'users' ? [...new Set(rawIds)] : [];
    if (audience === 'users' && userIds.length === 0) return { ok: false, message: 'Pick at least one user.' };
    if (userIds.length > MAX_USERS) return { ok: false, message: `Pick at most ${MAX_USERS} users.` };

    const priority = pick('priority', v => (typeof v === 'number' && Number.isInteger(v) ? Math.max(-100, Math.min(100, v)) : undefined)) ?? 0;
    const everyOpen = pick('everyOpen', v => (typeof v === 'boolean' ? v : undefined)) ?? false;
    const active = pick('active', v => (typeof v === 'boolean' ? v : undefined)) ?? true;

    return { ok: true, value: { title, html, startsAt, endsAt, audience, userIds, everyOpen, priority, active } };
}

export type AnnouncementStatus = 'live' | 'scheduled' | 'ended' | 'paused';

export function statusOf(a: { active: boolean; startsAt: Date; endsAt: Date }, now = new Date()): AnnouncementStatus {
    if (!a.active) return 'paused';
    if (a.endsAt <= now) return 'ended';
    if (a.startsAt > now) return 'scheduled';
    return 'live';
}

/** Where-clause for one status (the admin list's filter). */
export function statusWhere(status: string, now = new Date()): Prisma.AnnouncementWhereInput {
    switch (status) {
        case 'live': return { active: true, startsAt: { lte: now }, endsAt: { gt: now } };
        case 'scheduled': return { active: true, startsAt: { gt: now } };
        case 'ended': return { active: true, endsAt: { lte: now } };
        case 'paused': return { active: false };
        default: return {};
    }
}

/** The announcements live right now for this user, in the order the app shows them. */
export async function liveFor(user: AuthUser, now = new Date()) {
    return prisma.announcement.findMany({
        where: {
            ...statusWhere('live', now),
            OR: [
                { audience: 'all' },
                { audience: user.isAnonymous ? 'guests' : 'accounts' },
                { audience: 'users', userIds: { has: user.id } },
            ],
        },
        orderBy: [{ priority: 'desc' }, { startsAt: 'asc' }, { createdAt: 'asc' }],
        take: MAX_LIVE,
        select: { id: true, title: true, html: true, everyOpen: true, updatedAt: true },
    });
}

/** GET /announcements (the app): what to show now. */
export async function getAnnouncements(req: Request, res: Response) {
    try {
        const rows = await liveFor(req.user!);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ data: rows.map(r => ({ ...r, updatedAt: r.updatedAt.toISOString() })) });
    } catch (e) {
        log.error('announcements failed', { user: req.user?.id, error: (e as Error)?.message });
        res.status(500).json({ message: 'Something went wrong.' });
    }
}
