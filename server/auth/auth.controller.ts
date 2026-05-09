import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/tokenVerify.middleware.ts';

import { prisma } from '../lib/prisma.ts';

export async function registerUser(
    req: AuthenticatedRequest,
    res: Response
) {
    try {
        const supabaseUser = req.user;

        if (!supabaseUser) {
            return res.status(401).json({
                message: 'Not authenticated',
            });
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                providerId: supabaseUser.id,
            },
        });

        if (existingUser) {
            return res.status(200).json({
                registered: false,
                user: existingUser,
            });
        }

        const meta = supabaseUser.user_metadata as Record<string, unknown>;

        const rawUsername =
            meta?.user_name ||
            meta?.preferred_username ||
            meta?.full_name ||
            meta?.name ||
            supabaseUser.email?.split('@')[0] ||
            'player';

        const baseUsername = String(rawUsername)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 20);

        const generateUsername = async (): Promise<string> => {
            const suffix = Math.floor(1000 + Math.random() * 9000);
            const username = `${baseUsername}_${suffix}`;
            const exists = await prisma.user.findUnique({ where: { username } });
            if (exists) return generateUsername();
            return username;
        };

        let username = await generateUsername();

        const avatarUrl =
            (typeof meta?.avatar_url === 'string' &&
                meta.avatar_url) ||
            (typeof meta?.picture === 'string' &&
                meta.picture) ||
            null;

        const provider =
            supabaseUser.identities?.[0]?.provider ||
            (supabaseUser.app_metadata as { provider?: string })
                ?.provider ||
            'oauth';

        const user = await prisma.user.create({
            data: {
                username,
                provider,
                providerId: supabaseUser.id,
                avatarUrl,
            },
        });

        return res.status(201).json({
            registered: true,
            user,
        });
    } catch (error) {
        console.error('registerUser:', error);

        return res.status(500).json({
            message: 'Failed to register user',
        });
    }
}