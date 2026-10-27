import type { Socket } from 'socket.io';

import { verifyAccessToken } from '../lib/auth';
import { log } from '../lib/logger';

export interface SocketUser {
    id: string;
    email?: string;
    /** Anonymous (guest) account: no social features or text chat. */
    isGuest?: boolean;
}

/**
 * The user lives in `socket.data`: Socket.IO connection-state recovery restores
 * `data` (and skips this middleware), whereas ad-hoc socket properties are lost.
 */
export function socketUser(socket: Socket): SocketUser | undefined {
    return (socket.data as { user?: SocketUser }).user;
}

export async function socketAuth(socket: Socket, next: (err?: Error) => void): Promise<void> {
    const token =
        (socket.handshake.auth?.token as string | undefined) ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
        log.warn('socket auth rejected: no token', { ip: socket.handshake.address });
        return next(new Error('Missing auth token.'));
    }

    const user = await verifyAccessToken(token);
    if (!user) {
        log.warn('socket auth rejected: invalid token', { ip: socket.handshake.address });
        return next(new Error('Invalid or expired token.'));
    }

    socket.data.user = { id: user.id, email: user.email, isGuest: user.isAnonymous } satisfies SocketUser;
    next();
}
