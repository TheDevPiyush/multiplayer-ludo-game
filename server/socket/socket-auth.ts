import type { Socket } from 'socket.io';

import { verifyAccessToken } from '../lib/auth';
import { log } from '../lib/logger';

export interface SocketUser {
    id: string;
    email?: string;
}

declare module 'socket.io' {
    interface Socket {
        user?: SocketUser;
    }
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

    socket.user = { id: user.id, email: user.email };
    next();
}
