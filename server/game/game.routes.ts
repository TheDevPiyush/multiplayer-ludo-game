import { Router } from 'express';

import { rateLimit } from '../lib/rate-limit';
import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { cancelRoom, createRoom, getHistory, joinRoom, leaveRoom, listPublicRooms, startGame } from './game.controller';

// Gameplay (roll / move / skip) is socket-only — see socket/socket-server.ts.
const gameRouter = Router();

gameRouter.post('/room/create', verifySupabaseToken, rateLimit('room-create', 5, 0.2), createRoom);
gameRouter.post('/room/join', verifySupabaseToken, rateLimit('room-join', 10, 1), joinRoom);
gameRouter.post('/room/leave', verifySupabaseToken, leaveRoom);
gameRouter.patch('/room/cancel', verifySupabaseToken, cancelRoom);
gameRouter.post('/room/start', verifySupabaseToken, startGame);
gameRouter.get('/rooms/public', verifySupabaseToken, listPublicRooms);
gameRouter.get('/history', verifySupabaseToken, getHistory);

export default gameRouter;
