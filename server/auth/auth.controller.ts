import type { Request, Response } from 'express';

import type { AuthUser } from '../lib/auth.ts';
import { prisma } from '../lib/prisma.ts';
import { games } from '../game/services.ts';
import { getUserRow, userRows, type UserRow } from '../game/user-cache.ts';
import { log } from '../lib/logger.ts';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Returns the player row for an authenticated user, creating it on first sign-in
 * (works for OAuth and email OTP alike). Safe to call concurrently.
 */
async function ensureUser(authUser: AuthUser): Promise<{ user: UserRow; created: boolean }> {
    const existing = await getUserRow(authUser.id);
    if (existing) return { user: existing, created: false };

    const meta = authUser.user_metadata;
    const rawUsername =
        meta?.user_name ||
        meta?.preferred_username ||
        meta?.full_name ||
        meta?.name ||
        authUser.email?.split('@')[0] ||
        'player';

    const baseUsername =
        String(rawUsername)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 15) || 'player';

    const avatarUrl =
        (typeof meta?.avatar_url === 'string' && meta.avatar_url) ||
        (typeof meta?.picture === 'string' && meta.picture) ||
        null;
    const provider = (authUser.app_metadata?.provider as string | undefined) ?? 'email';

    for (let attempt = 0; attempt < 10; attempt++) {
        const username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
        try {
            const user = await prisma.user.create({
                data: { id: authUser.id, username, provider, providerId: authUser.id, avatarUrl },
            });
            userRows.set(user.id, user);
            return { user, created: true };
        } catch (e) {
            if ((e as { code?: string })?.code !== 'P2002') throw e;
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

export async function registerUser(req: Request, res: Response) {
    try {
        const { user, created } = await ensureUser(req.user!);
        return res.status(created ? 201 : 200).json({ registered: created, user });
    } catch (error) {
        log.error('registerUser failed', { user: req.user?.id, error: (error as Error)?.message });
        return res.status(500).json({ message: 'Failed to register user' });
    }
}

export async function getMe(req: Request, res: Response) {
    try {
        const { user } = await ensureUser(req.user!);
        return res.status(200).json({ user });
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
        const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
        if (taken && taken.id !== req.user!.id) return res.status(409).json({ message: 'That username is taken.' });

        const user = await prisma.user.update({ where: { id: req.user!.id }, data: { username } });
        userRows.set(user.id, user);
        games.invalidateProfile(user.id, { username: user.username, avatarUrl: user.avatarUrl });
        return res.status(200).json({ user, message: 'Username updated.' });
    } catch (error) {
        log.error('updateUsername failed', { user: req.user?.id, error: (error as Error)?.message });
        return res.status(500).json({ message: 'Failed to update username' });
    }
}
