import type { NextFunction, Request, Response } from 'express';

import { isAuthConfigured, verifyAccessToken } from '../lib/auth';

export async function verifySupabaseToken(req: Request, res: Response, next: NextFunction) {
    if (!isAuthConfigured()) {
        res.status(500).json({
            message: 'Auth is not configured. Set SUPABASE_URL (and SUPABASE_SERVICE_ROLE_KEY) on the server.',
        });
        return;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) {
        res.status(401).json({ message: 'Missing or invalid Authorization header.' });
        return;
    }

    const user = await verifyAccessToken(token);
    if (!user) {
        res.status(401).json({ message: 'Invalid or expired access token.' });
        return;
    }

    req.user = user;
    next();
}
