import { closeVoiceRoom } from '../rtc/livekit';
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

// Each player's result screen shows what the game paid them.
games.onGameRewards = (room, rewards) => {
    for (const [userId, reward] of rewards) getIO()?.to(`user:${userId}`).emit('progress:reward', { roomId: room.id, ...reward });
};

/** Time to say "gg" on the results screen before a finished game's voice channel closes. */
const VOICE_AFTER_GAME_MS = 2 * 60_000;

games.onRoomClosed = room => {
    if (room.voiceEnabled) closeVoiceRoom(room.id, room.status === 'FINISHED' ? VOICE_AFTER_GAME_MS : 0);
};
