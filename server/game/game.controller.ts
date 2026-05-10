import type { Request, Response } from 'express';
import { roomCodeGenerator } from '../util/room-code-generator';
import { prisma } from '../lib/prisma';

const COLOR_MAP: Record<number, 'RED' | 'BLUE' | 'GREEN' | 'YELLOW'> = {
    0: 'RED',
    1: 'BLUE',
    2: 'GREEN',
    3: 'YELLOW',
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
        });

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

        // If game is already playing, mark as disconnected instead of deleting
        if (room.status === 'PLAYING') {
            await prisma.gamePlayer.update({
                where: { id: player.id },
                data: { status: 'LEFT', leftAt: new Date() },
            });
            return res.status(200).json({ message: 'Left game.' });
        }

        // Delete player from waiting room
        await prisma.gamePlayer.delete({ where: { id: player.id } });

        // If host leaves → cancel room
        if (room.createdById === userId) {
            await prisma.gameRoom.update({
                where: { gameCode },
                data: { status: 'CANCELLED' },
            });
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

        const diceValue = Math.floor(Math.random() * 6) + 1;

        await prisma.gameRoom.update({
            where: { gameCode },
            data: {
                currentDice: diceValue,
                currentTurnUserId: userId,
            },
        });

        // Supabase Realtime broadcasts the update to all clients

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
        const { gameCode, tokenIndex, toPosition } = req.body;

        if (tokenIndex === undefined || toPosition === undefined) {
            return res.status(400).json({ message: 'tokenIndex and toPosition are required.' });
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

        const fromPosition = player.tokenPositions[tokenIndex] as number;
        const diceValue = room.currentDice!;
        const newPositions = [...player.tokenPositions];
        newPositions[tokenIndex] = toPosition;

        // Determine action type
        let actionType: 'MOVE' | 'CAPTURE' | 'ENTER_HOME' | 'SAFE' | 'WIN' = 'MOVE';
        if (toPosition === 57) actionType = 'WIN';      // position 57 = home center
        else if (toPosition === fromPosition) actionType = 'SAFE';

        // Check capture — any opponent on toPosition (not a safe cell)
        const SAFE_POSITIONS = [0, 8, 13, 21, 26, 34, 39, 47];
        const isSafe = SAFE_POSITIONS.includes(toPosition);

        if (!isSafe) {
            for (const opponent of room.players) {
                if (opponent.userId === userId) continue;
                const captured = opponent.tokenPositions.findIndex(pos => pos === toPosition);
                if (captured !== -1) {
                    actionType = 'CAPTURE';
                    const opponentPositions = [...opponent.tokenPositions];
                    opponentPositions[captured] = 0;
                    await prisma.gamePlayer.update({
                        where: { id: opponent.id },
                        data: { tokenPositions: opponentPositions },
                    });
                }
            }
        }

        // Update player token positions
        await prisma.gamePlayer.update({
            where: { id: player.id },
            data: { tokenPositions: newPositions },
        });

        // Log move
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

        // Check win condition — all 4 tokens at position 57
        const hasWon = newPositions.every(pos => pos === 57);

        if (hasWon) {
            // Count finished players to assign rank
            const finishedCount = room.players.filter(p => p.rank !== null).length;
            await prisma.gamePlayer.update({
                where: { id: player.id },
                data: { rank: finishedCount + 1 },
            });

            // Check if all players finished
            const allFinished = room.players.filter(p => p.userId !== userId).every(p => p.rank !== null);

            if (allFinished || room.players.length - 1 === finishedCount) {
                await prisma.gameRoom.update({
                    where: { gameCode },
                    data: { status: 'FINISHED', endedAt: new Date(), winnerId: userId },
                });

                // Update user stats
                await prisma.user.update({
                    where: { id: userId },
                    data: { totalWins: { increment: 1 }, totalGames: { increment: 1 } },
                });

                return res.status(200).json({ message: 'Game over! You win!', data: { actionType, won: true } });
            }
        }

        // Advance turn — skip to next active player
        const activeColors = room.players
            .filter(p => p.rank === null)   // not finished
            .sort((a, b) => a.seatNumber - b.seatNumber)
            .map(p => p.color);

        const currentIndex = activeColors.indexOf(player.color);
        // If rolled 6 and no win → same player rolls again
        const nextColor = diceValue === 6 && !hasWon
            ? player.color
            : activeColors[(currentIndex + 1) % activeColors.length];

        await prisma.gameRoom.update({
            where: { gameCode },
            data: { currentTurnColor: nextColor, currentDice: null },
        });

        return res.status(200).json({ message: 'Token moved.', data: { actionType, won: false, nextTurn: nextColor } });

    } catch (error: any) {
        console.error('moveToken:', error?.message);
        return res.status(500).json({ message: 'Something went wrong.' });
    }
}