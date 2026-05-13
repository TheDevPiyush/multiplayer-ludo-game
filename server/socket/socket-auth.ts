import type { Socket } from 'socket.io';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseServiceRoleKey
        ? createClient(supabaseUrl, supabaseServiceRoleKey)
        : null;

export interface SocketUser {
    id: string;
    email?: string;
}

declare module 'socket.io' {
    interface Socket {
        user?: SocketUser;
    }
}

export async function socketAuth(
    socket: Socket,
    next: (err?: Error) => void
): Promise<void> {
    if (!supabase) {
        return next(new Error('Supabase not configured on server.'));
    }

    const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, ''));

    if (!token) return next(new Error('Missing auth token.'));

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return next(new Error('Invalid or expired token.'));

    socket.user = { id: data.user.id, email: data.user.email };
    next();
}
