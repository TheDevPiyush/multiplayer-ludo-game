import type { Request, Response } from 'express';

import { GUEST_PROVIDER, type AuthUser } from '../lib/auth.ts';
import { prisma } from '../lib/prisma.ts';
import { games } from '../game/services.ts';
import { getUserRow, userRows, type UserRow } from '../game/user-cache.ts';
import { log } from '../lib/logger.ts';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
/** After the first (free) rename, one change per this long. */
const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const GUEST_PREFIX = 'guest_';

/** What the app sees of its own row — no admin flag or provider ids. */
function publicUser(u: UserRow) {
    return {
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl,
        provider: u.provider,
        isGuest: u.provider === GUEST_PROVIDER,
        totalWins: u.totalWins,
        totalGames: u.totalGames,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        usernameChangeAt: u.usernameChangedAt ? new Date(u.usernameChangedAt.getTime() + USERNAME_COOLDOWN_MS) : null,
    };
}

/** How they signed in ('google', 'email', or the guest marker). */
function providerOf(u: AuthUser): string {
    if (u.isAnonymous) return GUEST_PROVIDER;
    const main = u.app_metadata?.provider as string | undefined;
    if (main && main !== GUEST_PROVIDER) return main;
    // A linked guest keeps 'anonymous' as its first provider; the linked one is in the list.
    const all = (u.app_metadata?.providers as string[] | undefined) ?? [];
    return all.find(p => p !== GUEST_PROVIDER) ?? 'email';
}

/** Name stem from the sign-in profile: Google name, else the email's local part. */
function usernameBase(u: AuthUser): string {
    if (u.isAnonymous) return 'guest';
    const meta = u.user_metadata;
    const raw = meta?.user_name || meta?.preferred_username || meta?.full_name || meta?.name || u.email?.split('@')[0] || 'player';
    return String(raw)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 15) || 'player';
}

function avatarOf(u: AuthUser): string | null {
    const meta = u.user_metadata;
    return (typeof meta?.avatar_url === 'string' && meta.avatar_url) || (typeof meta?.picture === 'string' && meta.picture) || null;
}

const withSuffix = (base: string) => `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
const isUniqueClash = (e: unknown) => (e as { code?: string })?.code === 'P2002';

/**
 * Returns the player row for an authenticated user, creating it on first sign-in
 * (OAuth, email OTP or guest alike). Safe to call concurrently.
 */
async function ensureUser(authUser: AuthUser): Promise<{ user: UserRow; created: boolean }> {
    const existing = await getUserRow(authUser.id);
    if (existing) {
        if (existing.provider === GUEST_PROVIDER && !authUser.isAnonymous) {
            return { user: await upgradeGuest(existing, authUser), created: false };
        }
        if (existing.provider === GUEST_PROVIDER) touchGuest(existing);
        return { user: existing, created: false };
    }

    const base = usernameBase(authUser);
    const provider = providerOf(authUser);
    const avatarUrl = avatarOf(authUser);
    for (let attempt = 0; attempt < 10; attempt++) {
        try {
            const user = await prisma.user.create({
                data: { id: authUser.id, username: withSuffix(base), provider, providerId: authUser.id, avatarUrl },
            });
            userRows.set(user.id, user);
            return { user, created: true };
        } catch (e) {
            if (!isUniqueClash(e)) throw e;
            // Unique clash: either the username is taken, or a parallel request created this user.
            const raced = await prisma.user.findUnique({ where: { id: authUser.id } });
            if (raced) {
                userRows.set(raced.id, raced);
                return { user: raced, created: false };
            }
        }
    }
    throw new Error('Could not pick a unique username.');
}

const TOUCH_EVERY_MS = 24 * 60 * 60 * 1000;

/** Marks a guest as active (at most daily), so the inactive-guest cleanup leaves them alone. */
function touchGuest(row: UserRow) {
    if (Date.now() - row.updatedAt.getTime() < TOUCH_EVERY_MS) return;
    // Cached copy first, so parallel requests don't all write.
    userRows.set(row.id, { ...row, updatedAt: new Date() });
    prisma.user
        .update({ where: { id: row.id }, data: { updatedAt: new Date() } })
        .then(user => userRows.set(user.id, user))
        .catch(e => log.error('touchGuest failed', { user: row.id, error: (e as Error)?.message }));
}

const upgrading = new Map<string, Promise<UserRow>>();

/**
 * A guest just linked Google or an email. The Supabase user (and so this row,
 * its games, stats and history) is the same one; only the placeholder name and
 * the sign-in details change. Runs once even if several requests race here.
 */
function upgradeGuest(row: UserRow, authUser: AuthUser): Promise<UserRow> {
    let pending = upgrading.get(row.id);
    if (!pending) {
        pending = (async () => {
            const avatar = avatarOf(authUser);
            const base = {
                provider: providerOf(authUser),
                ...(!row.avatarUrl && avatar ? { avatarUrl: avatar } : {}),
            };
            // Keep a name they picked themselves; swap the generated guest_1234.
            const rename = row.username.startsWith(GUEST_PREFIX);
            for (let attempt = 0; attempt < 10; attempt++) {
                try {
                    const user = await prisma.user.update({
                        where: { id: row.id },
                        data: rename ? { ...base, username: withSuffix(usernameBase(authUser)) } : base,
                    });
                    userRows.set(user.id, user);
                    games.invalidateProfile(user.id, { username: user.username, avatarUrl: user.avatarUrl });
                    log.info('guest saved their progress', { user: user.id, provider: user.provider });
                    return user;
                } catch (e) {
                    if (!rename || !isUniqueClash(e)) throw e;
                }
            }
            throw new Error('Could not pick a unique username.');
        })().finally(() => upgrading.delete(row.id));
        upgrading.set(row.id, pending);
    }
    return pending;
}

export async function registerUser(req: Request, res: Response) {
    try {
        const { user, created } = await ensureUser(req.user!);
        return res.status(created ? 201 : 200).json({ registered: created, user: publicUser(user) });
    } catch (error) {
        log.error('registerUser failed', { user: req.user?.id, error: (error as Error)?.message });
        return res.status(500).json({ message: 'Failed to register user' });
    }
}

export async function getMe(req: Request, res: Response) {
    try {
        const { user } = await ensureUser(req.user!);
        return res.status(200).json({ user: publicUser(user) });
    } catch (error) {
        log.error('getMe failed', { user: req.user?.id, error: (error as Error)?.message });
        return res.status(500).json({ message: 'Failed to load profile' });
    }
}

export async function updateUsername(req: Request, res: Response) {
    try {
        const username = String(req.body?.username ?? '').trim().toLowerCase();
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ message: 'Username must be 3–20 characters: a–z, 0–9 or _.' });
        }
        const current = await getUserRow(req.user!.id);
        if (!current) return res.status(404).json({ message: 'Finish signing in first.' });
        if (current.username === username) return res.status(200).json({ user: publicUser(current), message: 'Username updated.' });

        const nextChange = current.usernameChangedAt ? current.usernameChangedAt.getTime() + USERNAME_COOLDOWN_MS : 0;
        if (nextChange > Date.now()) {
            const days = Math.ceil((nextChange - Date.now()) / (24 * 60 * 60 * 1000));
            return res.status(429).json({ message: `You can change your username again in ${days} day${days === 1 ? '' : 's'}.` });
        }

        const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
        if (taken && taken.id !== req.user!.id) return res.status(409).json({ message: 'That username is taken.' });

        const user = await prisma.user.update({ where: { id: req.user!.id }, data: { username, usernameChangedAt: new Date() } });
        userRows.set(user.id, user);
        games.invalidateProfile(user.id, { username: user.username, avatarUrl: user.avatarUrl });
        return res.status(200).json({ user: publicUser(user), message: 'Username updated.' });
    } catch (error) {
        // Someone took it between the check and the write.
        if ((error as { code?: string })?.code === 'P2002') return res.status(409).json({ message: 'That username is taken.' });
        log.error('updateUsername failed', { user: req.user?.id, error: (error as Error)?.message });
        return res.status(500).json({ message: 'Failed to update username' });
    }
}
