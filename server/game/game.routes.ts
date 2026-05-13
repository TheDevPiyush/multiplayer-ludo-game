import { Router } from 'express';

import { verifySupabaseToken } from '../middleware/tokenVerify.middleware';

import {
    createRoom,
    joinRoom,
    leaveRoom,
    cancelRoom,
    startGame,
    getRoom,
    skipTurn,
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

// roll dice (mount is /game → POST /game/roll-dice)
gameRouter.post(
    '/roll-dice',
    verifySupabaseToken,
    rollDice
);

// move token → POST /game/move-token
gameRouter.post(
    '/move-token',
    verifySupabaseToken,
    moveToken
);

// skip turn → POST /game/skip-turn
gameRouter.post(
    '/skip-turn',
    verifySupabaseToken,
    skipTurn
);

export default gameRouter;