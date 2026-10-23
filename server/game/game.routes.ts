import { Router } from 'express';

import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';
import { cancelRoom, createRoom, getHistory, getRoom, joinRoom, leaveRoom, startGame } from './game.controller';

// Gameplay (roll / move / skip) is socket-only — see socket/socket-server.ts.
const gameRouter = Router();

gameRouter.post('/room/create', verifySupabaseToken, createRoom);
gameRouter.post('/room/join', verifySupabaseToken, joinRoom);
gameRouter.post('/room/leave', verifySupabaseToken, leaveRoom);
gameRouter.patch('/room/cancel', verifySupabaseToken, cancelRoom);
gameRouter.post('/room/start', verifySupabaseToken, startGame);
gameRouter.get('/room/:gameCode', verifySupabaseToken, getRoom);
gameRouter.get('/history', verifySupabaseToken, getHistory);

export default gameRouter;
