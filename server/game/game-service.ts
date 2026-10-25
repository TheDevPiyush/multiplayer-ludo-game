import { randomInt, randomUUID } from 'crypto';
import {
    autoAction,
    chooseMove,
    createGame,
    isColor,
    nextColor,
    pickColor,
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
    type MoveEntry,
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

/** Why a room can't be joined, in words players see. */
function closedMessage(status: LiveRoom['status']): string {
    switch (status) {
        case 'FINISHED': return 'This game has already finished.';
        case 'CANCELLED': return 'This room was closed by the host.';
        default: return 'This game has already started.';
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
    /** With nobody connected this long, autopilot stops and the game waits. */
    unwatchedPauseMs: number;
    /** With nobody connected this long, the game is ended as abandoned (no stats). */
    abandonMs: number;
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
    unwatchedPauseMs: Number(process.env.UNWATCHED_PAUSE_MS ?? 60_000),
    abandonMs: Number(process.env.ABANDON_MS ?? 10 * 60_000),
    balanceStrength: Number(process.env.DICE_BALANCE_STRENGTH ?? 0.6),
    rng: cryptoRng,
};

const AFK_AFTER_TIMEOUTS = 3;
const SNAPSHOT_DEBOUNCE_MS = 1_000;
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
    /** Lobby seat / color writes per room, run one at a time in the order they happened in memory. */
    private lobbyWrites = new Map<string, Promise<unknown>>();
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    private snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private dirty = new Set<string>();
    /** Finished rooms whose final write is in flight. */
    private finishing = new Set<string>();
    private lastActive = new Map<string, number>();
    /** Last time anyone had a socket in the room (playing rooms only). */
    private lastWatched = new Map<string, number>();
    /** Playing rooms whose turn timer is stopped because nobody is connected. */
    private paused = new Set<string>();
    /** Ids / codes that weren't found anywhere, so repeat lookups skip Redis and Postgres. */
    private misses = new TtlCache<string, true>(5_000, 30_000);
    private profiles = new TtlCache<string, Profile>(10_000, 10 * 60_000);
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private onlineCounter: (roomId: string) => number = () => 0;

    private opts: GameServiceOptions;

    /** Called with users whose stats/history changed (to drop their caches). */
    onUsersChanged: (userIds: string[]) => void = () => {};
    /** Called once when a room finishes or is cancelled (closes its voice channel). */
    onRoomClosed: (room: LiveRoom) => void = () => {};

    constructor(
        private db: Persistence,
        private snapshots: SnapshotStore | null,
        private out: Broadcaster,
        opts: Partial<GameServiceOptions> = {},
    ) {
        this.opts = { ...DEFAULT_OPTIONS, ...opts };
    }

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
        this.misses.delete(room.id);
        this.misses.delete(`code:${room.gameCode}`);
        this.touch(room.id);
        if (room.status === 'PLAYING') this.lastWatched.set(room.id, Date.now());
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
        if (this.misses.get(loadKey)) return null;
        let pending = this.loading.get(loadKey);
        if (!pending) {
            pending = (async () => {
                const fromSnapshot = await this.snapshots?.load(key).catch(() => null);
                const room = fromSnapshot ?? (await this.db.loadRoom(key));
                if (!room) {
                    this.misses.set(loadKey, true);
                    return null;
                }
                // Snapshots written before the move log existed.
                room.moveLog ??= [];
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
                color: nextColor(maxPlayers, [])!,
                status: 'DISCONNECTED',
                isReady: true,
                joinedAt: now,
                ...profile,
            }],
            game: null,
            version: 1,
            turnEndsAt: null,
            timeouts: {},
            moveLog: [],
        };
        await this.db.createRoom(room);
        this.cache(room);
        return room;
    }

    async joinRoom(userId: string, gameCode: string): Promise<{ room: LiveRoom; player: LivePlayer }> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        // Over for everyone — members included (a finished room can't be reopened).
        if (room.status === 'FINISHED' || room.status === 'CANCELLED') throw new ServiceError(410, closedMessage(room.status));
        const existing = room.players.find(p => p.userId === userId);
        if (existing) return { room, player: existing };
        if (room.status !== 'WAITING') throw new ServiceError(400, closedMessage(room.status));

        const profile = await this.getProfile(userId);

        // Re-check after the await, then claim the seat synchronously.
        if (room.players.some(p => p.userId === userId)) {
            return { room, player: room.players.find(p => p.userId === userId)! };
        }
        if (room.status !== 'WAITING') throw new ServiceError(400, closedMessage(room.status));
        if (room.players.length >= room.maxPlayers) throw new ServiceError(400, 'Room is full.');

        const takenSeats = new Set(room.players.map(p => p.seatNumber));
        const seatNumber = [0, 1, 2, 3].find(s => !takenSeats.has(s))!;
        const color = nextColor(room.maxPlayers, room.players);
        if (!color) throw new ServiceError(400, 'Room is full.');
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
            await this.lobbyWrite(room, () => this.db.addPlayer(room, player));
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
        await this.lobbyWrite(room, () => this.db.removePlayer(room, player));

        if (room.createdById === userId) {
            room.status = 'CANCELLED';
            room.endedAt = new Date().toISOString();
            await this.db.saveRoom(room);
            this.commit(room, [{ type: 'PLAYER_LEFT', userId }, { type: 'CANCELLED', reason: 'host-left' }], { persist: false });
            this.onRoomClosed(room);
            return 'Host left. Room cancelled.';
        }
        this.commit(room, [{ type: 'PLAYER_LEFT', userId }], { persist: false });
        return 'Left room.';
    }

    /**
     * Lobby color pick. The color is claimed in memory before any await, so two
     * players can never get the same one; everyone sees the change at once, and
     * the release of the old color in the same update.
     */
    async chooseColor(userId: string, gameCode: string, color: unknown): Promise<LiveRoom> {
        if (!isColor(color)) throw new ServiceError(400, 'Unknown color.');
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        if (room.status !== 'WAITING') throw new ServiceError(400, 'Colors are fixed once the game starts.');
        const me = room.players.find(p => p.userId === userId);
        if (!me) throw new ServiceError(403, 'You are not in this room.');

        const changes = pickColor(room.maxPlayers, room.players, me.id, color);
        if (!changes) throw new ServiceError(409, 'That color is taken.');
        if (changes.length === 0) return room;

        const byId = (id: string) => room.players.find(p => p.id === id);
        const event = (list: typeof changes) => ({
            type: 'COLORS_CHANGED' as const,
            byUserId: userId,
            changes: list.map(c => ({ userId: byId(c.id)!.userId, from: c.from, to: c.to })),
        });
        for (const c of changes) byId(c.id)!.color = c.to;
        this.commit(room, [event(changes)], { persist: false });

        try {
            await this.lobbyWrite(room, () => this.db.setPlayerColors(room, changes.map(c => ({ playerId: c.id, color: c.to }))));
        } catch (e) {
            log.error('saving color failed', { room: room.gameCode, user: userId, error: (e as Error)?.message });
            // Put it back, unless the room has moved on since (then memory stays the truth).
            const undo = changes.map(c => ({ id: c.id, from: c.to, to: c.from })).reverse();
            const undoable = room.status === 'WAITING'
                && undo.every(c => byId(c.id)?.color === c.from)
                && undo.every(c => !room.players.some(p => p.color === c.to && !undo.some(u => u.id === p.id)));
            if (undoable) {
                for (const c of undo) byId(c.id)!.color = c.to;
                this.commit(room, [event(undo)], { persist: false });
            }
            throw new ServiceError(503, "Couldn't save your color. Try again.");
        }
        return room;
    }

    /** Runs `write` after the room's earlier lobby writes, so Postgres sees changes in memory order. */
    private lobbyWrite<T>(room: LiveRoom, write: () => Promise<T>): Promise<T> {
        const prev = this.lobbyWrites.get(room.id) ?? Promise.resolve();
        const next = prev.catch(() => {}).then(write);
        this.lobbyWrites.set(room.id, next);
        void next.catch(() => {}).finally(() => {
            if (this.lobbyWrites.get(room.id) === next) this.lobbyWrites.delete(room.id);
        });
        return next;
    }

    async cancelRoom(userId: string, gameCode: string): Promise<LiveRoom> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);
        if (room.createdById !== userId) throw new ServiceError(403, 'Only host can cancel the room.');
        room.status = 'CANCELLED';
        room.endedAt = new Date().toISOString();
        await this.db.saveRoom(room);
        this.commit(room, [{ type: 'CANCELLED', reason: 'host-cancelled' }], { persist: false });
        this.onRoomClosed(room);
        return room;
    }

    async startGame(userId: string, gameCode: string): Promise<LiveRoom> {
        const room = await this.requireRoom({ gameCode: normalizeCode(gameCode) });
        if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);
        if (room.createdById !== userId) throw new ServiceError(403, 'Only host can start the game.');
        if (room.players.length < 2) throw new ServiceError(400, 'Need at least 2 players to start.');

        // Let in-flight seat / color writes land first, so the game starts on saved colors.
        const pending = this.lobbyWrites.get(room.id);
        if (pending) {
            await pending.catch(() => {});
            if (room.status !== 'WAITING') throw new ServiceError(400, `Room is already ${room.status}.`);
            if (room.players.length < 2) throw new ServiceError(400, 'Need at least 2 players to start.');
        }

        room.game = createGame({
            colors: room.players.map(p => p.color),
            balance: { enabled: this.opts.balanceStrength > 0, strength: this.opts.balanceStrength },
        });
        room.status = 'PLAYING';
        room.startedAt = new Date().toISOString();
        this.lastWatched.set(room.id, Date.now());
        this.scheduleTurn(room);
        void this.snapshots?.index(room).catch(e => log.error('snapshot index failed', { room: room.gameCode, error: (e as Error)?.message }));
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
        const startedAt = room.startedAt ? Date.parse(room.startedAt) : Date.now();
        for (const e of events) {
            if (e.type !== 'MOVED') continue;
            const entry: MoveEntry = [e.color, e.token, dice ?? 0, e.from, e.to, Math.round((Date.now() - startedAt) / 100)];
            room.moveLog.push(entry);
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
        this.paused.delete(room.id);
        this.lastWatched.delete(room.id);
        void this.persistFinish(room);
        this.onRoomClosed(room);
    }

    /** Nobody has been back for `abandonMs`: end the game without touching anyone's stats. */
    private async abandon(room: LiveRoom) {
        this.clearTimer(room.id);
        this.paused.delete(room.id);
        this.lastWatched.delete(room.id);
        room.status = 'CANCELLED';
        room.endedAt = new Date().toISOString();
        room.turnEndsAt = null;
        this.dirty.delete(room.id);
        this.commit(room, [{ type: 'CANCELLED', reason: 'abandoned' }], { persist: false });
        log.info('game abandoned', { room: room.gameCode });
        this.onRoomClosed(room);
        try {
            await this.db.saveRoom(room);
            await this.snapshots?.delete(room).catch(() => {});
        } catch (e) {
            log.error('saving abandoned room failed, will retry on flush', { room: room.gameCode, error: (e as Error)?.message });
            this.dirty.add(room.id);
        }
    }

    /** True while someone is connected; otherwise whether they've been gone long enough to stop playing for them. */
    private unwatched(roomId: string): boolean {
        const now = Date.now();
        if (this.onlineCounter(roomId) > 0) {
            this.lastWatched.set(roomId, now);
            return false;
        }
        return now - (this.lastWatched.get(roomId) ?? now) >= this.opts.unwatchedPauseMs;
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
        if (this.unwatched(roomId)) {
            // Don't play out a game nobody is watching; the next player to rejoin resumes it.
            this.paused.add(roomId);
            room.turnEndsAt = null;
            log.info('game paused, nobody connected', { room: room.gameCode });
            return;
        }

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
        if (status === 'CONNECTED') {
            room.timeouts[userId] = 0;
            this.lastWatched.set(room.id, Date.now());
            if (this.paused.delete(room.id) && room.status === 'PLAYING') {
                log.info('game resumed', { room: room.gameCode });
                this.scheduleTurn(room);
                this.commit(room, [], { persist: false });
                return;
            }
        }
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

    /**
     * Coalesce Redis writes — at most one per room per second, and only for games
     * in progress (lobbies are already in Postgres, ended rooms are deleted).
     */
    private saveSnapshotSoon(room: LiveRoom) {
        if (!this.snapshots || room.status !== 'PLAYING' || this.snapshotTimers.has(room.id)) return;
        this.snapshotTimers.set(room.id, setTimeout(() => {
            this.snapshotTimers.delete(room.id);
            if (room.status !== 'PLAYING') return;
            this.snapshots!.save(room).catch(e => log.error('snapshot save failed', { room: room.gameCode, error: (e as Error)?.message }));
        }, SNAPSHOT_DEBOUNCE_MS));
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
                await this.db.saveRoom(room);
                log.debug('db flush', { room: room.gameCode, version: room.version });
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
            if (room.status === 'PLAYING' && this.onlineCounter(id) === 0
                && now - (this.lastWatched.get(id) ?? now) >= this.opts.abandonMs) {
                void this.abandon(room);
                continue;
            }
            if (this.dirty.has(id) || this.finishing.has(id) || this.onlineCounter(id) > 0) continue;
            const idleFor = now - (this.lastActive.get(id) ?? 0);
            const ended = room.status === 'FINISHED' || room.status === 'CANCELLED';
            if (idleFor < (ended ? 5 * 60_000 : this.opts.idleEvictMs)) continue;
            this.clearTimer(id);
            this.rooms.delete(id);
            this.codeToId.delete(room.gameCode);
            this.lastActive.delete(id);
            this.lastWatched.delete(id);
            this.paused.delete(id);
        }
    }

    /** Public rooms still waiting for players, with a free seat. Live rooms only (memory). */
    openPublicRooms(): LiveRoom[] {
        return [...this.rooms.values()].filter(
            r => r.status === 'WAITING' && !r.isPrivate && r.players.length < r.maxPlayers,
        );
    }

    /** For tests / metrics. */
    stats() {
        return { rooms: this.rooms.size, dirty: this.dirty.size, timers: this.timers.size, paused: this.paused.size };
    }
}

function normalizeCode(code: string): string {
    return String(code ?? '').trim().toUpperCase();
}
