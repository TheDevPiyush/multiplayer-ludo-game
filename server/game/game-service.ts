import { randomInt, randomUUID } from 'crypto';
import {
    autoAction,
    chooseMove,
    createGame,
    seatColors,
    reduce,
    type Action,
    type Color,
    type GameEvent,
    type Rng,
} from '@ludo/engine';

import { TtlCache } from '../lib/ttl-cache';
import {
    toRoomDto,
    userIdOf,
    type LivePlayer,
    type LiveRoom,
    type MoveRecord,
    type RoomDto,
    type RoomSync,
    type SyncEvent,
} from './live-room';
import type { Persistence, Profile, SnapshotStore } from './persistence';
import { log } from '../lib/logger';

export class ServiceError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export interface Broadcaster {
    toRoom(roomId: string, event: string, payload: unknown): void;
}

export interface GameServiceOptions {
    /** Time a player has to roll or move before autopilot plays for them. */
    turnMs: number;
    /** Turn time for disconnected / repeatedly idle players. */
    afkTurnMs: number;
    /** Pause before auto-pass / auto-move so clients can show the dice. */
    autoDelayMs: number;
    /** How often dirty rooms are written to Postgres. */
    flushMs: number;
    /** How long ended rooms (or rooms nobody is connected to) stay in memory. */
    idleEvictMs: number;
    balanceStrength: number;
    rng: Rng;
}

/** Crypto-backed uniform float in [0, 1) with 53 bits of precision. */
export const cryptoRng: Rng = () => {
    const [hi, lo] = crypto.getRandomValues(new Uint32Array(2)) as unknown as [number, number];
    return ((hi >>> 5) * 67108864 + (lo >>> 6)) / 9007199254740992;
};

export const DEFAULT_OPTIONS: GameServiceOptions = {
    turnMs: Number(process.env.TURN_MS ?? 15_000),
    afkTurnMs: Number(process.env.AFK_TURN_MS ?? 2_500),
    autoDelayMs: Number(process.env.AUTO_DELAY_MS ?? 900),
    flushMs: Number(process.env.FLUSH_MS ?? 10_000),
    idleEvictMs: Number(process.env.IDLE_EVICT_MS ?? 30 * 60_000),
    balanceStrength: Number(process.env.DICE_BALANCE_STRENGTH ?? 0.6),
    rng: cryptoRng,
};

const AFK_AFTER_TIMEOUTS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I lookalikes

/**
 * Authoritative game rooms. Live state is in memory; every action is applied
 * synchronously (no awaits between read and write) so actions in a room can
 * never interleave. Postgres is written at lifecycle moments and by a periodic
 * flush of dirty rooms.
 */
export class GameService {
    private rooms = new Map<string, LiveRoom>();
    private codeToId = new Map<string, string>();
    private loading = new Map<string, Promise<LiveRoom | null>>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    private snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private dirty = new Set<string>();
    /** Finished rooms whose final write is in flight. */
    private finishing = new Set<string>();
    private lastActive = new Map<string, number>();
    private profiles = new TtlCache<string, Profile>(10_000, 10 * 60_000);
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private onlineCounter: (roomId: string) => number = () => 0;

    /** Called with users whose stats/history changed (to drop their caches). */
    onUsersChanged: (userIds: string[]) => void = () => {};

    constructor(
        private db: Persistence,
        private snapshots: SnapshotStore | null,
        private out: Broadcaster,
        private opts: GameServiceOptions = DEFAULT_OPTIONS,
    ) {}

    start(onlineCounter: (roomId: string) => number) {
        this.onlineCounter = onlineCounter;
        this.flushTimer = setInterval(() => void this.flush(), this.opts.flushMs);
    }

    async stop() {
        if (this.flushTimer) clearInterval(this.flushTimer);
        for (const t of this.timers.values()) clearTimeout(t);
        this.timers.clear();
        await this.flush(true);
    }

    // ─── Lookup / hydration ──────────────────────────────────────────────────

    private cache(room: LiveRoom) {
        this.rooms.set(room.id, room);
        this.codeToId.set(room.gameCode, room.id);
        this.touch(room.id);
    }

    private touch(roomId: string) {
        this.lastActive.set(roomId, Date.now());
    }

    /** Memory → Redis → Postgres. Concurrent callers share one load. */
    async getRoom(key: { id?: string; gameCode?: string }): Promise<LiveRoom | null> {
        const id = key.id ?? (key.gameCode ? this.codeToId.get(key.gameCode) : undefined);
        const hit = id ? this.rooms.get(id) : undefined;
        if (hit) return hit;

        const loadKey = key.id ?? `code:${key.gameCode}`;
        let pending = this.loading.get(loadKey);
        if (!pending) {
            pending = (async () => {
                const fromSnapshot = await this.snapshots?.load(key).catch(() => null);
                const room = fromSnapshot ?? (await this.db.loadRoom(key));
                if (!room) return null;
                // Another load may have won the race.
                const existing = this.rooms.get(room.id);
                if (existing) return existing;
                room.turnEndsAt = null;
                // Presence is live-only; players reappear as their sockets rejoin.
                for (const p of room.players) if (p.status !== 'LEFT') p.status = 'DISCONNECTED';
                this.cache(room);
                if (room.status === 'PLAYING') this.scheduleTurn(room);
                return room;
            })().finally(() => this.loading.delete(loadKey));
            this.loading.set(loadKey, pending);
        }
        return pending;
    }

    private async requireRoom(key: { id?: string; gameCode?: string }): Promise<LiveRoom> {
        const room = await this.getRoom(key);
        if (!room) throw new ServiceError(404, "Room doesn't exist.");
        return room;
    }

    async getProfile(userId: string): Promise<Profile> {
        const cached = this.profiles.get(userId);
        if (cached) return cached;
        const profile = await this.db.getProfile(userId);
        if (!profile) throw new ServiceError(403, 'Finish registering before playing.');
        this.profiles.set(userId, profile);
        return profile;
    }

    invalidateProfile(userId: string, next?: Profile) {
        this.profiles.delete(userId);
        if (!next) return;
        for (const room of this.rooms.values()) {
            const p = room.players.find(x => x.userId === userId);
            if (p) {
                p.username = next.username;
                p.avatarUrl = next.avatarUrl;
            }
        }
    }

    dto(room: LiveRoom): RoomDto {
        return toRoomDto(room);
    }

    isMember(room: LiveRoom, userId: string): boolean {
        return room.players.some(p => p.userId === userId);
    }

    // ─── Lobby ───────────────────────────────────────────────────────────────

    private async newCode(): Promise<string> {
        for (let attempt = 0; attempt < 20; attempt++) {
            let code = '';
            for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
            if (this.codeToId.has(code)) continue;
            if (!(await this.db.codeExists(code))) return code;
        }
        throw new ServiceError(503, 'Could not allocate a room code, try again.');
    }

    async createRoom(
        userId: string,
        input: { maxPlayers: number; isPrivate?: boolean; voiceEnabled?: boolean },
    ): Promise<LiveRoom> {
        const maxPlayers = Number(input.maxPlayers);
        if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
            throw new ServiceError(400, 'maxPlayers must be between 2 and 4.');
        }
        const [profile, gameCode] = await Promise.all([this.getProfile(userId), this.newCode()]);
        const now = new Date().toISOString();
        const room: LiveRoom = {
            id: randomUUID(),
            gameCode,
            maxPlayers,
            isPrivate: !!input.isPrivate,
            voiceEnabled: !!input.voiceEnabled,
            createdById: userId,
            createdAt: now,
            startedAt: null,
            endedAt: null,
            status: 'WAITING',
            winnerId: null,
            players: [{
                id: randomUUID(),
                userId,
                seatNumber: 0,
                color: seatColors(maxPlayers)[0]!,
                status: 'DISCONNECTED',
                isReady: true,
                joinedAt: now,
                ...profile,
            }],
            game: null,
            version: 1,
            turnEndsAt: null,
            timeouts: {},
            pendingMoves: [],
        };
        await this.db.createRoom(room);
        this.cache(room);
        return room;
    }

    async joinRoom(userId: string, gameCode: string): Promise<{ room: LiveRoom; player: LivePlayer }> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        const existing = room.players.find(p => p.userId === userId);
        if (existing) return { room, player: existing };
        if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);

        const profile = await this.getProfile(userId);

        // Re-check after the await, then claim the seat synchronously.
        if (room.players.some(p => p.userId === userId)) {
            return { room, player: room.players.find(p => p.userId === userId)! };
        }
        if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);
        if (room.players.length >= room.maxPlayers) throw new ServiceError(400, 'Room is full.');

        const takenSeats = new Set(room.players.map(p => p.seatNumber));
        const takenColors = new Set(room.players.map(p => p.color));
        const seatNumber = [0, 1, 2, 3].find(s => !takenSeats.has(s))!;
        const color = seatColors(room.maxPlayers).find(c => !takenColors.has(c))!;
        const player: LivePlayer = {
            id: randomUUID(),
            userId,
            seatNumber,
            color,
            status: 'DISCONNECTED',
            isReady: false,
            joinedAt: new Date().toISOString(),
            ...profile,
        };
        room.players.push(player);
        room.players.sort((a, b) => a.seatNumber - b.seatNumber);

        try {
            await this.db.addPlayer(room, player);
        } catch (e) {
            room.players = room.players.filter(p => p.id !== player.id);
            throw e;
        }
        this.commit(room, [{ type: 'PLAYER_JOINED', userId }], { persist: false });
        return { room, player };
    }

    async leaveRoom(userId: string, gameCode: string): Promise<string> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        const player = room.players.find(p => p.userId === userId);
        if (!player) throw new ServiceError(404, 'You are not in this room.');

        if (room.status === 'PLAYING') {
            if (player.status !== 'LEFT') {
                player.status = 'LEFT';
                this.apply(room, { type: 'LEAVE', color: player.color }, 'player');
            }
            return 'Left game.';
        }

        if (room.status !== 'WAITING') return 'Left room.';

        room.players = room.players.filter(p => p.id !== player.id);
        await this.db.removePlayer(room, player);

        if (room.createdById === userId) {
            room.status = 'CANCELLED';
            room.endedAt = new Date().toISOString();
            await this.db.saveRoom(room);
            this.commit(room, [{ type: 'PLAYER_LEFT', userId }, { type: 'CANCELLED', reason: 'host-left' }], { persist: false });
            return 'Host left. Room cancelled.';
        }
        this.commit(room, [{ type: 'PLAYER_LEFT', userId }], { persist: false });
        return 'Left room.';
    }

    async cancelRoom(userId: string, gameCode: string): Promise<LiveRoom> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);
        if (room.createdById !== userId) throw new ServiceError(403, 'Only host can cancel the room.');
        room.status = 'CANCELLED';
        room.endedAt = new Date().toISOString();
        await this.db.saveRoom(room);
        this.commit(room, [{ type: 'CANCELLED', reason: 'host-cancelled' }], { persist: false });
        return room;
    }

    async startGame(userId: string, gameCode: string): Promise<LiveRoom> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);
        if (room.createdById !== userId) throw new ServiceError(403, 'Only host can start the game.');
        if (room.players.length < 2) throw new ServiceError(400, 'Need at least 2 players to start.');

        room.game = createGame({
            colors: room.players.map(p => p.color),
            balance: { enabled: this.opts.balanceStrength > 0, strength: this.opts.balanceStrength },
        });
        room.status = 'PLAYING';
        room.startedAt = new Date().toISOString();
        this.scheduleTurn(room);
        await this.db.saveRoom(room);
        this.commit(room, [{ type: 'STARTED' }, { type: 'TURN', color: room.game.turn, reason: 'next' }], { persist: false });
        return room;
    }

    // ─── Gameplay ────────────────────────────────────────────────────────────

    async act(userId: string, gameCode: string, input: { kind: 'ROLL' } | { kind: 'MOVE'; token: number } | { kind: 'SKIP' }) {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        if (room.status !== 'PLAYING' || !room.game) throw new ServiceError(400, 'Game is not active.');
        const player = room.players.find(p => p.userId === userId);
        if (!player || player.status === 'LEFT') throw new ServiceError(403, 'You are not in this game.');

        let action: Action;
        if (input.kind === 'ROLL') action = { type: 'ROLL', color: player.color };
        else if (input.kind === 'MOVE') action = { type: 'MOVE', color: player.color, token: input.token };
        else {
            // Skipping is only allowed when nothing can move; the server usually beats the client to it.
            const auto = autoAction(room.game);
            if (auto?.type !== 'PASS' || room.game.turn !== player.color) return { ok: true as const };
            action = auto;
        }

        const events = this.apply(room, action, 'player');
        const rolled = events.find(e => e.type === 'ROLLED');
        return { ok: true as const, diceValue: rolled?.type === 'ROLLED' ? rolled.value : undefined };
    }

    /** Applies an engine action and broadcasts. Synchronous by design. */
    private apply(room: LiveRoom, action: Action, by: 'player' | 'auto' | 'timeout'): GameEvent[] {
        const game = room.game!;
        const r = reduce(game, action, this.opts.rng);
        if (!r.ok) throw new ServiceError(400, r.message);

        const actor = userIdOf(room, action.color);
        if (actor && action.type !== 'LEAVE') {
            if (by === 'player') room.timeouts[actor] = 0;
            else if (by === 'timeout') room.timeouts[actor] = (room.timeouts[actor] ?? 0) + 1;
        }

        this.recordMoves(room, game.dice, r.events);
        room.game = r.state;

        if (r.state.phase === 'OVER') {
            this.endGame(room, r.events);
        } else {
            this.scheduleTurn(room);
            this.commit(room, r.events);
        }
        return r.events;
    }

    private recordMoves(room: LiveRoom, dice: number | null, events: GameEvent[]) {
        const captured = events.some(e => e.type === 'CAPTURED');
        const finished = events.some(e => e.type === 'FINISHED');
        for (const e of events) {
            if (e.type !== 'MOVED') continue;
            const record: MoveRecord = {
                userId: userIdOf(room, e.color)!,
                tokenIndex: e.token,
                diceValue: dice ?? 0,
                fromPosition: e.from,
                toPosition: e.to,
                actionType: finished ? 'WIN' : captured ? 'CAPTURE' : e.to >= 52 ? 'ENTER_HOME' : 'MOVE',
                createdAt: new Date().toISOString(),
            };
            room.pendingMoves.push(record);
        }
    }

    private endGame(room: LiveRoom, events: SyncEvent[]) {
        const g = room.game!;
        this.clearTimer(room.id);
        room.status = 'FINISHED';
        room.endedAt = new Date().toISOString();
        room.winnerId = userIdOf(room, g.ranking[0]!) ?? null;
        room.turnEndsAt = null;
        this.commit(room, events, { persist: false });
        this.dirty.delete(room.id);
        void this.persistFinish(room);
    }

    /** Final write for a finished room; retried by the flush loop on failure. */
    private async persistFinish(room: LiveRoom) {
        if (this.finishing.has(room.id)) return;
        this.finishing.add(room.id);
        try {
            await this.db.finishGame(room);
            log.info('game finished', { room: room.gameCode, winner: room.winnerId });
            this.onUsersChanged(room.players.map(p => p.userId));
            await this.snapshots?.delete(room).catch(() => {});
        } catch (e) {
            log.error('finishGame failed, will retry on flush', { room: room.gameCode, error: (e as Error)?.message });
            this.dirty.add(room.id);
        } finally {
            this.finishing.delete(room.id);
        }
    }

    // ─── Turn timer / autopilot ──────────────────────────────────────────────

    private clearTimer(roomId: string) {
        const t = this.timers.get(roomId);
        if (t) clearTimeout(t);
        this.timers.delete(roomId);
    }

    private scheduleTurn(room: LiveRoom) {
        this.clearTimer(room.id);
        const g = room.game;
        if (!g || g.phase === 'OVER' || room.status !== 'PLAYING') {
            room.turnEndsAt = null;
            return;
        }

        const auto = autoAction(g);
        if (auto) {
            room.turnEndsAt = null;
            this.timers.set(room.id, setTimeout(() => this.runTimer(room.id, auto, 'auto'), this.opts.autoDelayMs));
            return;
        }

        const userId = userIdOf(room, g.turn);
        const player = room.players.find(p => p.userId === userId);
        const afk = !player || player.status !== 'CONNECTED' || (room.timeouts[player.userId] ?? 0) >= AFK_AFTER_TIMEOUTS;
        const ms = afk ? this.opts.afkTurnMs : this.opts.turnMs;
        room.turnEndsAt = Date.now() + ms;
        this.timers.set(room.id, setTimeout(() => this.runTimer(room.id, null, 'timeout'), ms));
    }

    private runTimer(roomId: string, auto: Action | null, by: 'auto' | 'timeout') {
        this.timers.delete(roomId);
        const room = this.rooms.get(roomId);
        const g = room?.game;
        if (!room || !g || room.status !== 'PLAYING') return;

        let action = auto;
        if (!action) {
            if (g.phase === 'ROLL') action = { type: 'ROLL', color: g.turn };
            else {
                const token = chooseMove(g, 'hard', this.opts.rng);
                action = token === null ? { type: 'PASS', color: g.turn, reason: 'timeout' } : { type: 'MOVE', color: g.turn, token };
            }
        }
        try {
            this.apply(room, action, by);
        } catch (e) {
            log.error('autopilot failed', { room: room.gameCode, error: (e as Error)?.message });
        }
    }

    /** Presence changed — a disconnected player's turn switches to the short timer. */
    setPresence(room: LiveRoom, userId: string, status: 'CONNECTED' | 'DISCONNECTED') {
        const p = room.players.find(x => x.userId === userId);
        if (!p || p.status === 'LEFT' || p.status === status) return;
        p.status = status;
        this.touch(room.id);
        if (status === 'CONNECTED') room.timeouts[userId] = 0;
        if (room.status === 'PLAYING' && room.game && userIdOf(room, room.game.turn) === userId && !autoAction(room.game)) {
            this.scheduleTurn(room);
            this.commit(room, [], { persist: false });
        }
    }

    // ─── Sync + persistence ──────────────────────────────────────────────────

    /** Bump version, broadcast the full snapshot + events, mark for flush. */
    private commit(room: LiveRoom, events: SyncEvent[], { persist = true } = {}) {
        room.version += 1;
        this.touch(room.id);
        const payload: RoomSync = { version: room.version, room: toRoomDto(room), events };
        this.out.toRoom(room.id, 'room:sync', payload);
        if (persist) this.dirty.add(room.id);
        this.saveSnapshotSoon(room);
    }

    /** Coalesce Redis writes — at most one per room every 200ms. */
    private saveSnapshotSoon(room: LiveRoom) {
        if (!this.snapshots || this.snapshotTimers.has(room.id)) return;
        this.snapshotTimers.set(room.id, setTimeout(() => {
            this.snapshotTimers.delete(room.id);
            this.snapshots!.save(room).catch(e => log.error('snapshot save failed', { room: room.gameCode, error: (e as Error)?.message }));
        }, 200));
    }

    /** Write dirty rooms to Postgres and evict idle ones. */
    async flush(all = false) {
        const ids = [...this.dirty];
        this.dirty.clear();
        await Promise.all(ids.map(async id => {
            const room = this.rooms.get(id);
            if (!room) return;
            if (room.status === 'FINISHED') return this.persistFinish(room);
            try {
                const moves = room.pendingMoves.length;
                await this.db.saveRoom(room);
                log.debug('db flush', { room: room.gameCode, version: room.version, moves });
            } catch (e) {
                log.error('db flush failed', { room: room.gameCode, error: (e as Error)?.message });
                this.dirty.add(id);
            }
        }));
        if (!all) this.evictIdle();
    }

    private evictIdle() {
        const now = Date.now();
        for (const [id, room] of this.rooms) {
            if (this.dirty.has(id) || this.finishing.has(id) || this.onlineCounter(id) > 0) continue;
            const idleFor = now - (this.lastActive.get(id) ?? 0);
            const ended = room.status === 'FINISHED' || room.status === 'CANCELLED';
            if (idleFor < (ended ? 5 * 60_000 : this.opts.idleEvictMs)) continue;
            this.clearTimer(id);
            this.rooms.delete(id);
            this.codeToId.delete(room.gameCode);
            this.lastActive.delete(id);
        }
    }

    /** For tests / metrics. */
    stats() {
        return { rooms: this.rooms.size, dirty: this.dirty.size, timers: this.timers.size };
    }
}

function normalizeCode(code: string): string {
    return String(code ?? '').trim().toUpperCase();
}
