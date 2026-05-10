import { Router } from 'express';

import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';

import {
    createRoom,
    joinRoom,
    leaveRoom,
    cancelRoom,
    startGame,
    getRoom,
} from './game.controller';

import {
    rollDice,
    moveToken,
} from './game.controller';

const gameRouter = Router();


// ---------------- ROOM ROUTES ----------------

// create room
gameRouter.post(
    '/room/create',
    verifySupabaseToken,
    createRoom
);

// join room
gameRouter.post(
    '/room/join',
    verifySupabaseToken,
    joinRoom
);

// leave room
gameRouter.post(
    '/room/leave',
    verifySupabaseToken,
    leaveRoom
);

// cancel room
gameRouter.patch(
    '/room/cancel',
    verifySupabaseToken,
    cancelRoom
);

// start game
gameRouter.post(
    '/room/start',
    verifySupabaseToken,
    startGame
);

// get room details
gameRouter.get(
    '/room/:gameCode',
    verifySupabaseToken,
    getRoom
);


// ---------------- GAME ROUTES ----------------

// roll dice
gameRouter.post(
    '/game/roll-dice',
    verifySupabaseToken,
    rollDice
);

// move token
gameRouter.post(
    '/game/move-token',
    verifySupabaseToken,
    moveToken
);

export default gameRouter;