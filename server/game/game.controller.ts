import type { Request, Response } from 'express';
import { roomCodeGenerator } from '../util/room-code-generator';
import { prisma } from '../lib/prisma';
import { rollDiceValue } from '../util/dice-value-generator';
import { broadcastToRoom } from '../socket/socket-server';

const COLOR_MAP: Record<number, 'RED' | 'BLUE' | 'GREEN' | 'YELLOW'> = {
    0: 'RED',
    1: 'BLUE',
    2: 'GREEN',
    3: 'YELLOW',
};

const COLOR_ENTRY: Record<string, number> = {
    RED: 0,
    BLUE: 13,
    GREEN: 26,
    YELLOW: 39,
};

// ─── Create Room ──────────────────────────────────────────────────────────────

export async function createRoom(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { maxPlayers, isPrivate, voiceEnabled } = req.body;

        if (!maxPlayers || maxPlayers < 2 || maxPlayers > 4) {
            return res.status(400).json({ message: 'maxPlayers must be between 2 and 4.' });
        }

        const roomCode = await roomCodeGenerator();

        const room = await prisma.gameRoom.create({
            data: {
                gameCode: roomCode,
                createdById: userId,
                maxPlayers,
                isPrivate: isPrivate || false,
                voiceEnabled: Boolean(voiceEnabled),
                status: 'WAITING',
                currentTurnColor: 'RED',
            },
        });

        await prisma.gamePlayer.create({
            data: {
                gameRoomId: room.id,
                userId,
                seatNumber: 0,
                color: 'RED',
                isReady: true,
            },
        });

        broadcastToRoom(room.id, 'room:created', { roomId: room.id, gameCode: room.gameCode });

        return res.status(201).json({ message: 'Room created.', data: room });

    } catch (error: any) {
        console.error('createRoom:', error?.message);
        return res.status(500).json({ message: 'Something went wrong creating room.' });
    }
}

// ─── Join Room ────────────────────────────────────────────────────────────────

export async function joinRoom(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { gameCode } = req.body;

        if (!gameCode) return res.status(400).json({ message: 'Game code is required.' });

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode },
            include: { players: true },
        });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });
        if (room.status !== 'WAITING') return res.status(400).json({ message: `Room is already ${room.status}.` });
        if (room.players.length >= room.maxPlayers) return res.status(400).json({ message: 'Room is full.' });

        // Check if already in room
        const alreadyJoined = room.players.find(p => p.userId === userId);
        if (alreadyJoined) return res.status(200).json({ message: 'Already in room.', data: alreadyJoined });

        const seatNumber = room.players.length;
        const color = COLOR_MAP[seatNumber];

        if (color === undefined) return res.status(404).json({ message: "Color couldn't be determined" })

        const player = await prisma.gamePlayer.create({
            data: {
                gameRoomId: room.id,
                userId,
                seatNumber,
                color,
                isReady: false,
            },
            include: { user: { select: { username: true, avatarUrl: true } } },
        });

        broadcastToRoom(room.id, 'player:joined', { player });

        return res.status(201).json({ message: 'Joined room.', data: { room, player } });

    } catch (error: any) {
        console.error('joinRoom:', error?.message);
        return res.status(500).json({ message: 'Something went wrong joining room.' });
    }
}

// ─── Leave Room ───────────────────────────────────────────────────────────────

export async function leaveRoom(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { gameCode } = req.body;

        if (!gameCode) return res.status(400).json({ message: 'Game code is required.' });

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode },
            include: { players: true },
        });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });

        const player = room.players.find(p => p.userId === userId);
        if (!player) return res.status(404).json({ message: 'You are not in this room.' });

        // If game is already playing, mark as LEFT instead of deleting
        if (room.status === 'PLAYING') {
            await prisma.gamePlayer.update({
                where: { id: player.id },
                data: { status: 'LEFT', leftAt: new Date() },
            });
            broadcastToRoom(room.id, 'player:left', { userId, permanent: true });

            // If their turn → auto advance
            if (room.currentTurnColor === player.color) {
                const activeColors = room.players
                    .filter(p => p.rank === null && p.userId !== userId)
                    .sort((a, b) => a.seatNumber - b.seatNumber)
                    .map(p => p.color);
                const idx = activeColors.indexOf(player.color);
                const next = activeColors[(idx + 1 + activeColors.length) % activeColors.length] ?? null;
                await prisma.gameRoom.update({
                    where: { gameCode },
                    data: { currentTurnColor: next, currentDice: null },
                });
                broadcastToRoom(room.id, 'turn:changed', {
                    currentTurnColor: next,
                    currentDice: null,
                    reason: 'left-skip',
                });
            }
            return res.status(200).json({ message: 'Left game.' });
        }

        await prisma.gamePlayer.delete({ where: { id: player.id } });
        broadcastToRoom(room.id, 'player:left', { userId, permanent: true });

        if (room.createdById === userId) {
            await prisma.gameRoom.update({
                where: { gameCode },
                data: { status: 'CANCELLED' },
            });
            broadcastToRoom(room.id, 'room:cancelled', { reason: 'host-left' });
            return res.status(200).json({ message: 'Host left. Room cancelled.' });
        }

        return res.status(200).json({ message: 'Left room.' });

    } catch (error: any) {
        console.error('leaveRoom:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}

// ─── Cancel Room (host only) ──────────────────────────────────────────────────

export async function cancelRoom(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { gameCode } = req.body;

        if (!gameCode) return res.status(400).json({ message: 'Game code is required.' });

        const room = await prisma.gameRoom.findUnique({ where: { gameCode } });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });
        if (room.status !== 'WAITING') return res.status(400).json({ message: `Room is already ${room.status}.` });
        if (room.createdById !== userId) return res.status(403).json({ message: 'Only host can cancel the room.' });

        const updated = await prisma.gameRoom.update({
            where: { gameCode },
            data: { status: 'CANCELLED' },
        });

        broadcastToRoom(updated.id, 'room:cancelled', { reason: 'host-cancelled' });

        return res.status(200).json({ message: 'Room cancelled.', data: updated });

    } catch (error: any) {
        console.error('cancelRoom:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}

// ─── Start Game (host only) ───────────────────────────────────────────────────

export async function startGame(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { gameCode } = req.body;

        if (!gameCode) return res.status(400).json({ message: 'Game code is required.' });

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode },
            include: { players: true },
        });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });
        if (room.status !== 'WAITING') return res.status(400).json({ message: `Room is already ${room.status}.` });
        if (room.createdById !== userId) return res.status(403).json({ message: 'Only host can start the game.' });
        if (room.players.length < 2) return res.status(400).json({ message: 'Need at least 2 players to start.' });

        const updated = await prisma.gameRoom.update({
            where: { gameCode },
            data: {
                status: 'PLAYING',
                startedAt: new Date(),
                currentTurnColor: 'RED',      // RED always starts
            },
        });

        broadcastToRoom(updated.id, 'game:started', {
            roomId: updated.id,
            gameCode: updated.gameCode,
            currentTurnColor: 'RED',
        });

        return res.status(200).json({ message: 'Game started.', data: updated });

    } catch (error: any) {
        console.error('startGame:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}

// ─── Get Room ─────────────────────────────────────────────────────────────────

export async function getRoom(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const { gameCode } = req.params;

        if (!gameCode) return res.status(400).json({ message: "Game Room Code is required." })

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode: String(gameCode) },
            include: {
                players: {
                    include: { user: { select: { username: true, avatarUrl: true } } },
                    orderBy: { seatNumber: 'asc' },
                },
            },
        });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });

        return res.status(200).json({ data: room });

    } catch (error: any) {
        console.error('getRoom:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}

// ─── Roll Dice ────────────────────────────────────────────────────────────────

export async function rollDice(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { gameCode } = req.body;

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode },
            include: { players: true },
        });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });
        if (room.status !== 'PLAYING') return res.status(400).json({ message: 'Game is not active.' });

        const player = room.players.find(p => p.userId === userId);
        if (!player) return res.status(403).json({ message: 'You are not in this game.' });

        // Validate it's this player's turn
        if (room.currentTurnColor !== player.color) {
            return res.status(400).json({ message: "It's not your turn." });
        }

        // Block re-rolls while a previous dice is still pending a move
        if (room.currentDice !== null && room.currentDice !== undefined) {
            return res.status(400).json({ message: 'Move your token before rolling again.' });
        }

        const diceValue = rollDiceValue();

        await prisma.gameRoom.update({
            where: { gameCode },
            data: {
                currentDice: diceValue,
                currentTurnUserId: userId,
            },
        });

        broadcastToRoom(room.id, 'dice:rolled', {
            diceValue,
            byUserId: userId,
            color: player.color,
        });

        return res.status(200).json({ message: 'Dice rolled.', data: { diceValue } });

    } catch (error: any) {
        console.error('rollDice:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}

// ─── Move Token ───────────────────────────────────────────────────────────────

export async function moveToken(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user.id;
        const { gameCode, tokenIndex } = req.body as {
            gameCode?: string;
            tokenIndex?: number;
        };

        if (typeof tokenIndex !== 'number' || tokenIndex < 0 || tokenIndex > 3) {
            return res.status(400).json({ message: 'tokenIndex must be 0..3.' });
        }

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode },
            include: { players: true },
        });

        if (!room) return res.status(404).json({ message: "Room doesn't exist." });
        if (room.status !== 'PLAYING') return res.status(400).json({ message: 'Game is not active.' });

        const player = room.players.find(p => p.userId === userId);
        if (!player) return res.status(403).json({ message: 'You are not in this game.' });

        if (room.currentTurnColor !== player.color) {
            return res.status(400).json({ message: "It's not your turn." });
        }

        // ── Authoritative dice — server is the source of truth ───────────────
        if (room.currentDice === null || room.currentDice === undefined) {
            return res.status(400).json({ message: 'Roll the dice first.' });
        }

        const diceValue = room.currentDice;

        const fromPosition = (player.tokenPositions[tokenIndex] ?? 0) as number;

        // ── Compute toPosition server-side. Ignore any client value. ─────────
        let toPosition: number;
        if (fromPosition === 0) {
            if (diceValue !== 6) {
                return res.status(400).json({ message: 'Need a 6 to bring a token out.' });
            }
            toPosition = 1;
        } else if (fromPosition === 57) {
            return res.status(400).json({ message: 'Token already home.' });
        } else if (fromPosition + diceValue > 57) {
            return res.status(400).json({ message: 'Move would overshoot the center.' });
        } else {
            toPosition = fromPosition + diceValue;
        }

        const newPositions = [...player.tokenPositions];
        newPositions[tokenIndex] = toPosition;

        // ─── Capture logic ────────────────────────────────────────────────────

        let actionType: 'MOVE' | 'CAPTURE' | 'ENTER_HOME' | 'SAFE' | 'WIN' = 'MOVE';

        if (toPosition === 57) {
            actionType = 'WIN';
        }

        // Safe board cells (1-indexed on the absolute 52-cell loop):
        //   star tiles + each color's entry cell
        const SAFE_BOARD_INDICES = new Set([1, 9, 14, 22, 27, 35, 40, 48]);

        const noCaptureZone =
            toPosition === 0 ||      // home base
            toPosition >= 52;        // private home stretch

        if (!noCaptureZone) {
            const entry = COLOR_ENTRY[player.color] ?? 0;
            const myBoardIndex = (entry + toPosition - 1) % 52;        // 0..51
            const myBoardIndex1 = myBoardIndex + 1;                    // 1..52

            const isStarSafe = SAFE_BOARD_INDICES.has(myBoardIndex1);

            for (const opponent of room.players) {
                if (opponent.userId === userId) continue;

                const opponentEntry = COLOR_ENTRY[opponent.color] ?? 0;

                const capturedIndex = opponent.tokenPositions.findIndex(opponentPos => {
                    if (opponentPos === 0 || opponentPos >= 52) return false;
                    const opponentBoardIndex = (opponentEntry + opponentPos - 1) % 52;
                    return opponentBoardIndex === myBoardIndex;
                });

                if (capturedIndex !== -1 && !isStarSafe) {
                    actionType = 'CAPTURE';
                    const opponentPositions = [...opponent.tokenPositions];
                    opponentPositions[capturedIndex] = 0; // send back home
                    await prisma.gamePlayer.update({
                        where: { id: opponent.id },
                        data: { tokenPositions: opponentPositions },
                    });
                    broadcastToRoom(room.id, 'token:captured', {
                        byUserId: userId,
                        capturedUserId: opponent.userId,
                        capturedColor: opponent.color,
                        capturedTokenIndex: capturedIndex,
                    });
                }
            }
        }

        // ─── Update moving player positions ───────────────────────────────────

        await prisma.gamePlayer.update({
            where: { id: player.id },
            data: { tokenPositions: newPositions },
        });

        // Pre-emit token move so clients animate immediately
        broadcastToRoom(room.id, 'token:moved', {
            byUserId: userId,
            color: player.color,
            tokenIndex,
            fromPosition,
            toPosition,
            diceValue,
        });

        // ─── Log move ─────────────────────────────────────────────────────────

        await prisma.gameMove.create({
            data: {
                gameRoomId: room.id,
                userId,
                tokenIndex,
                diceValue,
                fromPosition,
                toPosition,
                actionType,
            },
        });

        // ─── Win check ────────────────────────────────────────────────────────

        const hasWon = newPositions.every(pos => pos === 57);
        let winnerId: string | null = null;

        if (hasWon) {
            actionType = 'WIN';
            const alreadyRanked = room.players.filter(p => p.rank !== null).length;
            await prisma.gamePlayer.update({
                where: { id: player.id },
                data: { rank: alreadyRanked + 1 },
            });

            // First finisher = winner
            if (alreadyRanked === 0) winnerId = userId;
        }

        // How many players are still unranked AFTER this potential win?
        const stillPlaying = room.players.filter(p =>
            p.rank === null && p.userId !== (hasWon ? userId : '__none__')
        );

        // Ends when: 2-player game first finish, OR <=1 unranked left in 3-4p
        const totalPlayers = room.players.length;
        const gameOver = hasWon && (totalPlayers === 2 || stillPlaying.length <= 1);

        if (gameOver) {
            // Auto-rank any leftover unranked players by current progress
            const leftover = room.players
                .filter(p => p.rank === null && p.userId !== userId)
                .sort((a, b) => {
                    const aSum = (a.tokenPositions as number[]).reduce((x, y) => x + y, 0);
                    const bSum = (b.tokenPositions as number[]).reduce((x, y) => x + y, 0);
                    return bSum - aSum;
                });
            const startRank = room.players.filter(p => p.rank !== null).length + 1;
            for (let i = 0; i < leftover.length; i++) {
                const lp = leftover[i];
                if (!lp) continue;
                await prisma.gamePlayer.update({
                    where: { id: lp.id },
                    data: { rank: startRank + i },
                });
            }

            await prisma.gameRoom.update({
                where: { gameCode },
                data: {
                    status: 'FINISHED',
                    endedAt: new Date(),
                    winnerId: winnerId ?? userId,
                    currentDice: null,
                },
            });

            await prisma.user.update({
                where: { id: winnerId ?? userId },
                data: { totalWins: { increment: 1 }, totalGames: { increment: 1 } },
            });

            // Increment totalGames for everyone else
            for (const p of room.players) {
                if (p.userId === (winnerId ?? userId)) continue;
                await prisma.user.update({
                    where: { id: p.userId },
                    data: { totalGames: { increment: 1 } },
                });
            }

            broadcastToRoom(room.id, 'game:over', {
                winnerId: winnerId ?? userId,
                winnerColor: player.color,
            });

            return res.status(200).json({
                message: 'Game over!',
                data: { actionType, won: true, winnerId: winnerId ?? userId },
            });
        }

        // ─── Advance turn ─────────────────────────────────────────────────────

        const activeColors = room.players
            .filter(p => p.rank === null && p.userId !== (hasWon ? userId : '__none__'))
            .sort((a, b) => a.seatNumber - b.seatNumber)
            .map(p => p.color);

        const currentIndex = activeColors.indexOf(player.color);

        // Rolled 6 and didn't win → same player rolls again
        const nextColor = (diceValue === 6 && !hasWon)
            ? player.color
            : (activeColors.length > 0
                ? activeColors[(currentIndex + 1 + activeColors.length) % activeColors.length]
                : null);

        await prisma.gameRoom.update({
            where: { gameCode },
            data: { currentTurnColor: nextColor, currentDice: null },
        });

        broadcastToRoom(room.id, 'turn:changed', {
            currentTurnColor: nextColor,
            currentDice: null,
            reason: hasWon ? 'finished' : diceValue === 6 ? 'extra-roll' : 'normal',
        });

        return res.status(200).json({
            message: hasWon ? 'You finished!' : 'Token moved.',
            data: { actionType, won: hasWon, nextTurn: nextColor },
        });

    } catch (error: any) {
        console.error('moveToken:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}

// POST /game/skip-turn
export async function skipTurn(req: Request, res: Response) {
    try {
        if (!req.user) return res.status(401).json({ message: 'Please log in first.' });

        const userId = req.user?.id;
        const { gameCode } = req.body;

        const room = await prisma.gameRoom.findUnique({
            where: { gameCode },
            include: { players: true }
        });

        if (!room) return res.status(404).json({ message: "Room not found." });

        const player = room.players.find(p => p.userId === userId);
        if (!player) return res.status(403).json({ message: 'Not in this game.' });

        if (room.currentTurnColor !== player.color) {
            return res.status(400).json({ message: 'Not your turn.' });
        }

        const activeColors = room.players
            .filter(p => p.rank === null)
            .sort((a, b) => a.seatNumber - b.seatNumber)
            .map(p => p.color);

        const currentIndex = activeColors.indexOf(player.color);
        const nextColor = activeColors[(currentIndex + 1) % activeColors.length];

        await prisma.gameRoom.update({
            where: { gameCode },
            data: { currentTurnColor: nextColor, currentDice: null }
        });

        broadcastToRoom(room.id, 'turn:changed', {
            currentTurnColor: nextColor,
            currentDice: null,
            reason: 'skip',
        });

        return res.status(200).json({ message: 'Turn skipped.' });

    } catch (error: any) {
        console.error('skipTurn:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}