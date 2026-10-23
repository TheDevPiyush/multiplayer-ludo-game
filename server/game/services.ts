import { getIO } from '../socket/socket-server';
import { GameService } from './game-service';
import { prismaPersistence, redisSnapshots } from './persistence';
import { invalidateUsers } from './user-cache';

export const games = new GameService(prismaPersistence, redisSnapshots, {
    toRoom(roomId, event, payload) {
        getIO()?.to(`room:${roomId}`).emit(event, payload);
    },
});

games.onUsersChanged = invalidateUsers;
