import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseServiceRoleKey
        ? createClient(supabaseUrl, supabaseServiceRoleKey)
        : null;

export async function verifySupabaseToken(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    if (!supabase) {
        res.status(500).json({
            message:
                'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.',
        });
        return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ message: 'Missing or invalid Authorization header.' });
        return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
        res.status(401).json({ message: 'Access token is required.' });
        return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
        res.status(401).json({ message: 'Invalid or expired access token.' });
        return;
    }

    req.user = data.user;
    next();
}
