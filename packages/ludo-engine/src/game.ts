import { evaluateMove, getPlayer, legalMoves, racingPlayers } from './analysis';
import { absCell, HOME_POS, progress, seatColors, stepPath } from './board';
import { rollDice } from './dice';
import type {
    Action,
    BalanceConfig,
    Color,
    EngineErrorCode,
    GameEvent,
    GameState,
    PlayerState,
    ReduceResult,
    Rng,
    Rules,
    TurnReason,
} from './types';
import { COLORS } from './types';

export const DEFAULT_RULES: Rules = {
    extraRollOnSix: true,
    extraRollOnCapture: true,
    extraRollOnHome: true,
    threeSixesForfeit: true,
    autoMoveSingle: true,
};

export const DEFAULT_BALANCE: BalanceConfig = {
    enabled: true,
    strength: 0.6,
    pityAfter: 4,
};

export interface CreateGameOptions {
    /** Seated colors. Defaults to the standard seating for `playerCount`. */
    colors?: Color[];
    playerCount?: number;
    rules?: Partial<Rules>;
    balance?: Partial<BalanceConfig>;
}

export function createGame(opts: CreateGameOptions = {}): GameState {
    const seated = opts.colors ?? seatColors(opts.playerCount ?? 4);
    // Turn order always follows the board, whatever order seats were filled in.
    const order = COLORS.filter(c => seated.includes(c));
    if (order.length < 2) throw new Error('A game needs at least 2 colors.');

    return {
        players: order.map(color => ({
            color,
            tokens: [0, 0, 0, 0],
            rank: null,
            active: true,
            rollsWithoutSix: 0,
        })),
        turn: order[0]!,
        phase: 'ROLL',
        dice: null,
        sixStreak: 0,
        ranking: [],
        rules: { ...DEFAULT_RULES, ...opts.rules },
        balance: { ...DEFAULT_BALANCE, ...opts.balance },
    };
}

function fail(code: EngineErrorCode, message: string): ReduceResult {
    return { ok: false, code, message };
}

function clone(state: GameState): GameState {
    return {
        ...state,
        players: state.players.map(p => ({ ...p, tokens: [...p.tokens] })),
        ranking: [...state.ranking],
    };
}

/** Next racing player after `from` in turn order, or null if nobody is left. */
function nextRacer(state: GameState, from: Color): Color | null {
    const n = state.players.length;
    const start = state.players.findIndex(p => p.color === from);
    for (let step = 1; step <= n; step++) {
        const p = state.players[(start + step) % n]!;
        if (p.active && p.rank === null) return p.color;
    }
    return null;
}

function giveTurn(state: GameState, color: Color, reason: TurnReason, events: GameEvent[]) {
    if (color !== state.turn) state.sixStreak = 0;
    state.turn = color;
    state.phase = 'ROLL';
    state.dice = null;
    events.push({ type: 'TURN', color, reason });
}

function passTurn(state: GameState, reason: TurnReason, events: GameEvent[]) {
    const next = nextRacer(state, state.turn);
    if (next) giveTurn(state, next, reason, events);
}

/** Ends the game when at most one player is still racing. Returns true if over. */
function checkGameOver(state: GameState, events: GameEvent[]): boolean {
    const racing = racingPlayers(state);
    if (racing.length > 1) return false;

    const byProgress = (a: PlayerState, b: PlayerState) => progress(b) - progress(a);
    const rest = [
        ...racing,
        ...state.players.filter(p => !p.active && p.rank === null).sort(byProgress),
    ];
    for (const p of rest) {
        state.ranking.push(p.color);
        p.rank = state.ranking.length;
    }
    state.phase = 'OVER';
    state.dice = null;
    events.push({ type: 'OVER', ranking: [...state.ranking] });
    return true;
}

function guardTurn(state: GameState, color: Color): ReduceResult | null {
    if (state.phase === 'OVER') return fail('GAME_OVER', 'The game is over.');
    const player = getPlayer(state, color);
    if (!player || !player.active) return fail('NOT_IN_GAME', 'You are not in this game.');
    if (state.turn !== color) return fail('NOT_YOUR_TURN', "It's not your turn.");
    return null;
}

export function reduce(state: GameState, action: Action, rng: Rng = Math.random): ReduceResult {
    switch (action.type) {
        case 'ROLL': {
            const bad = guardTurn(state, action.color);
            if (bad) return bad;
            if (state.phase !== 'ROLL') return fail('ALREADY_ROLLED', 'Move a token before rolling again.');

            const value = action.value ?? rollDice(state, action.color, rng);
            if (!Number.isInteger(value) || value < 1 || value > 6) {
                return fail('ILLEGAL_MOVE', 'Dice value must be 1..6.');
            }

            const next = clone(state);
            const player = getPlayer(next, action.color)!;
            next.dice = value;
            next.phase = 'MOVE';
            next.sixStreak = value === 6 ? next.sixStreak + 1 : 0;
            player.rollsWithoutSix = value === 6 ? 0 : player.rollsWithoutSix + 1;
            return { ok: true, state: next, events: [{ type: 'ROLLED', color: action.color, value }] };
        }

        case 'MOVE': {
            const bad = guardTurn(state, action.color);
            if (bad) return bad;
            if (state.phase !== 'MOVE' || state.dice === null) return fail('ROLL_FIRST', 'Roll the dice first.');
            if (!legalMoves(state).includes(action.token)) {
                return fail('ILLEGAL_MOVE', 'That token cannot move.');
            }

            const dice = state.dice;
            const outcome = evaluateMove(state, action.color, action.token, dice)!;
            const next = clone(state);
            const events: GameEvent[] = [];
            const player = getPlayer(next, action.color)!;

            player.tokens[action.token] = outcome.to;
            events.push({
                type: 'MOVED',
                color: action.color,
                token: action.token,
                from: outcome.from,
                to: outcome.to,
                path: stepPath(outcome.from, outcome.to),
            });

            for (const victim of outcome.captures) {
                getPlayer(next, victim.color)!.tokens[victim.token] = 0;
                events.push({
                    type: 'CAPTURED',
                    color: victim.color,
                    token: victim.token,
                    by: action.color,
                    cell: absCell(action.color, outcome.to)!,
                });
            }

            if (outcome.reachesHome) events.push({ type: 'HOME', color: action.color, token: action.token });

            if (player.tokens.every(t => t === HOME_POS)) {
                next.ranking.push(player.color);
                player.rank = next.ranking.length;
                events.push({ type: 'FINISHED', color: player.color, rank: player.rank });
            }

            if (checkGameOver(next, events)) return { ok: true, state: next, events };

            const sixBonus = dice === 6 && next.rules.extraRollOnSix;
            const captureBonus = outcome.captures.length > 0 && next.rules.extraRollOnCapture;
            const homeBonus = outcome.reachesHome && next.rules.extraRollOnHome;

            if (player.rank === null && (sixBonus || captureBonus || homeBonus)) {
                giveTurn(next, player.color, 'extra-roll', events);
            } else {
                passTurn(next, 'next', events);
            }
            return { ok: true, state: next, events };
        }

        case 'PASS': {
            const bad = guardTurn(state, action.color);
            if (bad) return bad;
            const next = clone(state);
            const events: GameEvent[] = [];
            const reason: TurnReason =
                action.reason ??
                (state.rules.threeSixesForfeit && state.sixStreak >= 3
                    ? 'three-sixes'
                    : state.phase === 'MOVE' && legalMoves(state).length === 0
                        ? 'no-moves'
                        : 'timeout');
            passTurn(next, reason, events);
            return { ok: true, state: next, events };
        }

        case 'LEAVE': {
            if (state.phase === 'OVER') return fail('GAME_OVER', 'The game is over.');
            const player = getPlayer(state, action.color);
            if (!player || !player.active) return fail('NOT_IN_GAME', 'You are not in this game.');

            const next = clone(state);
            const events: GameEvent[] = [{ type: 'LEFT', color: action.color }];
            getPlayer(next, action.color)!.active = false;

            if (checkGameOver(next, events)) return { ok: true, state: next, events };
            if (next.turn === action.color) passTurn(next, 'left', events);
            return { ok: true, state: next, events };
        }
    }
}

