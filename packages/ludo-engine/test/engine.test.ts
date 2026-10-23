import { describe, expect, test } from 'bun:test';

import {
    autoAction,
    chooseMove,
    createGame,
    diceProbabilities,
    legalMoves,
    MIN_FACE_P,
    reduce,
    type Action,
    type Color,
    type GameEvent,
    type GameState,
    type Rng,
} from '../src';

function seeded(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
    const r = reduce(state, action);
    if (!r.ok) throw new Error(`${action.type} failed: ${r.message}`);
    return r;
}

function withTokens(state: GameState, positions: Partial<Record<Color, number[]>>): GameState {
    return {
        ...state,
        players: state.players.map(p => (positions[p.color] ? { ...p, tokens: [...positions[p.color]!] } : p)),
    };
}

const fair = { balance: { enabled: false } };

describe('setup', () => {
    test('two-player games use opposite corners', () => {
        expect(createGame({ playerCount: 2 }).players.map(p => p.color)).toEqual(['RED', 'GREEN']);
    });

    test('turn order follows the board regardless of seat order', () => {
        const g = createGame({ colors: ['YELLOW', 'RED', 'BLUE'] });
        expect(g.players.map(p => p.color)).toEqual(['RED', 'BLUE', 'YELLOW']);
        expect(g.turn).toBe('RED');
    });
});

describe('rules', () => {
    test('needs a six to leave base', () => {
        let g = createGame({ playerCount: 2, ...fair });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 3 }).state;
        expect(legalMoves(g)).toEqual([]);
        expect(autoAction(g)).toEqual({ type: 'PASS', color: 'RED' });
        const r = apply(g, { type: 'PASS', color: 'RED' });
        expect(r.state.turn).toBe('GREEN');
        expect(r.events).toContainEqual({ type: 'TURN', color: 'GREEN', reason: 'no-moves' });
    });

    test('six brings a token out and grants another roll', () => {
        let g = createGame({ playerCount: 2, ...fair });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 6 }).state;
        expect(autoAction(g)).toEqual({ type: 'MOVE', color: 'RED', token: 0 }); // all 4 equivalent
        const r = apply(g, { type: 'MOVE', color: 'RED', token: 0 });
        expect(r.state.players[0]!.tokens).toEqual([1, 0, 0, 0]);
        expect(r.state.turn).toBe('RED');
        expect(r.state.phase).toBe('ROLL');
    });

    test('rejects out-of-turn and double actions', () => {
        let g = createGame({ playerCount: 2, ...fair });
        expect(reduce(g, { type: 'ROLL', color: 'GREEN', value: 6 }).ok).toBe(false);
        expect(reduce(g, { type: 'MOVE', color: 'RED', token: 0 }).ok).toBe(false);
        g = apply(g, { type: 'ROLL', color: 'RED', value: 6 }).state;
        expect(reduce(g, { type: 'ROLL', color: 'RED', value: 6 }).ok).toBe(false);
    });

    test('capture sends the victim home and grants another roll', () => {
        // GREEN pos 1 = abs cell 26. RED pos 27 = abs cell 26, but that's GREEN's safe entry.
        // Put GREEN on pos 3 (abs 28) and RED on pos 26 (abs 25), roll 3 → RED lands on abs 28.
        let g = withTokens(createGame({ playerCount: 2, ...fair }), { RED: [26, 0, 0, 0], GREEN: [3, 0, 0, 0] });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 3 }).state;
        const r = apply(g, { type: 'MOVE', color: 'RED', token: 0 });
        expect(r.state.players[1]!.tokens[0]).toBe(0);
        expect(r.events.map(e => e.type)).toEqual(['MOVED', 'CAPTURED', 'TURN']);
        expect(r.state.turn).toBe('RED');
    });

    test('no capture on safe cells', () => {
        // abs 8 is a star. GREEN pos 35 → abs (26+34)%52 = 8. RED pos 9 → abs 8.
        let g = withTokens(createGame({ playerCount: 2, ...fair }), { RED: [5, 0, 0, 0], GREEN: [35, 0, 0, 0] });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 4 }).state;
        const r = apply(g, { type: 'MOVE', color: 'RED', token: 0 });
        expect(r.state.players[1]!.tokens[0]).toBe(35);
        expect(r.state.turn).toBe('GREEN');
    });

    test('home column is never capturable and finish needs an exact roll', () => {
        let g = withTokens(createGame({ playerCount: 2, ...fair }), { RED: [55, 57, 57, 57] });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 5 }).state;
        expect(legalMoves(g)).toEqual([]);
    });

    test('third six forfeits the turn', () => {
        let g = withTokens(createGame({ playerCount: 2, ...fair }), { RED: [10, 0, 0, 0] });
        for (let i = 0; i < 2; i++) {
            g = apply(g, { type: 'ROLL', color: 'RED', value: 6 }).state;
            g = apply(g, { type: 'MOVE', color: 'RED', token: 0 }).state;
        }
        g = apply(g, { type: 'ROLL', color: 'RED', value: 6 }).state;
        expect(legalMoves(g)).toEqual([]);
        const r = apply(g, { type: 'PASS', color: 'RED' });
        expect(r.events).toContainEqual({ type: 'TURN', color: 'GREEN', reason: 'three-sixes' });
        expect(r.state.sixStreak).toBe(0);
    });

    test('finishing ends a two-player game', () => {
        let g = withTokens(createGame({ playerCount: 2, ...fair }), { RED: [54, 57, 57, 57], GREEN: [20, 0, 0, 0] });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 3 }).state;
        const r = apply(g, { type: 'MOVE', color: 'RED', token: 0 });
        expect(r.state.phase).toBe('OVER');
        expect(r.state.ranking).toEqual(['RED', 'GREEN']);
        expect(r.events.at(-1)).toEqual({ type: 'OVER', ranking: ['RED', 'GREEN'] });
    });

    test('a finished player is skipped and the race continues', () => {
        let g = withTokens(createGame({ playerCount: 4, ...fair }), { RED: [54, 57, 57, 57] });
        g = apply(g, { type: 'ROLL', color: 'RED', value: 3 }).state;
        const r = apply(g, { type: 'MOVE', color: 'RED', token: 0 });
        expect(r.state.players[0]!.rank).toBe(1);
        expect(r.state.phase).toBe('ROLL');
        expect(r.state.turn).toBe('BLUE'); // no extra roll once finished
    });

    test('leaving on your turn passes it; last player standing wins', () => {
        let g = createGame({ playerCount: 3, ...fair });
        const r1 = apply(g, { type: 'LEAVE', color: 'RED' });
        expect(r1.state.turn).toBe('BLUE');
        const r2 = apply(r1.state, { type: 'LEAVE', color: 'GREEN' });
        expect(r2.state.phase).toBe('OVER');
        expect(r2.state.ranking[0]).toBe('BLUE');
        expect(r2.state.ranking).toHaveLength(3);
    });
});

describe('dice balancing', () => {
    test('fair dice are uniform', () => {
        const p = diceProbabilities(createGame({ ...fair }), 'RED');
        for (const x of p) expect(x).toBeCloseTo(1 / 6, 10);
    });

    test('every face stays possible and probabilities sum to 1', () => {
        const g = withTokens(createGame({ playerCount: 2, balance: { strength: 1 } }), {
            RED: [50, 57, 57, 40],
            GREEN: [0, 0, 0, 2],
        });
        for (const c of ['RED', 'GREEN'] as const) {
            const p = diceProbabilities(g, c);
            expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
            for (const x of p) expect(x).toBeGreaterThanOrEqual(MIN_FACE_P - 1e-9);
        }
    });

    test('trailing player is more likely to roll the capture; leader less', () => {
        // RED far ahead. GREEN token at pos 20 (abs 45) is 3 behind RED's token at pos 49 (abs 48).
        const g = withTokens(createGame({ playerCount: 2 }), {
            RED: [49, 57, 57, 30],
            GREEN: [20, 0, 0, 0],
        });
        const trailing = diceProbabilities({ ...g, turn: 'GREEN' }, 'GREEN');
        expect(trailing[2]!).toBeGreaterThan(1 / 6); // face 3 captures the leader

        // Leader: RED pos 30 (abs 29) can capture GREEN pos 6 (abs 31) with a 2.
        const g2 = withTokens(g, { GREEN: [6, 0, 0, 0] });
        const leading = diceProbabilities(g2, 'RED');
        expect(leading[1]!).toBeLessThan(1 / 6);
    });

    test('pity raises the six after a dry spell in base', () => {
        const g = createGame({ playerCount: 2 });
        const dry = { ...g, players: g.players.map(p => (p.color === 'RED' ? { ...p, rollsWithoutSix: 8 } : p)) };
        expect(diceProbabilities(dry, 'RED')[5]!).toBeGreaterThan(diceProbabilities(g, 'RED')[5]!);
    });

    test('long-run distribution stays close to fair for even games', () => {
        const rng = seeded(7);
        const counts = [0, 0, 0, 0, 0, 0];
        let g = createGame({ playerCount: 4 });
        for (let i = 0; i < 6000; i++) {
            const r = reduce(g, { type: 'ROLL', color: g.turn }, rng);
            if (!r.ok) throw new Error(r.message);
            counts[r.state.dice! - 1]!++;
        }
        for (const c of counts) expect(c / 6000).toBeGreaterThan(0.1);
    });
});

describe('simulation', () => {
    function playOut(seed: number, playerCount: number, balance: boolean) {
        const rng = seeded(seed);
        let g = createGame({ playerCount, balance: { enabled: balance } });
        let steps = 0;
        while (g.phase !== 'OVER') {
            if (++steps > 5000) throw new Error(`game ${seed} did not finish`);
            let action: Action;
            if (g.phase === 'ROLL') action = { type: 'ROLL', color: g.turn };
            else {
                const auto = autoAction(g);
                const token = chooseMove(g, 'medium', rng);
                action = auto ?? { type: 'MOVE', color: g.turn, token: token! };
            }
            const r = reduce(g, action, rng);
            if (!r.ok) throw new Error(`${seed}: ${r.message}`);
            g = r.state;
            for (const p of g.players) {
                for (const t of p.tokens) {
                    if (t < 0 || t > 57) throw new Error('token out of range');
                }
            }
        }
        return { g, steps };
    }

    test('hundreds of bot games finish with a full ranking', () => {
        for (let seed = 1; seed <= 300; seed++) {
            const n = 2 + (seed % 3);
            const { g } = playOut(seed, n, seed % 2 === 0);
            expect(g.ranking.length).toBe(n);
            expect(new Set(g.ranking).size).toBe(n);
        }
    });

    test('balancing makes games closer', () => {
        // Average finished tokens of the last-place player when the winner finishes.
        const spread = (balance: boolean) => {
            let total = 0;
            const games = 150;
            for (let seed = 1; seed <= games; seed++) {
                const rng = seeded(seed * 31);
                let g = createGame({ playerCount: 2, balance: { enabled: balance, strength: 0.8 } });
                while (g.phase !== 'OVER') {
                    const action: Action =
                        g.phase === 'ROLL'
                            ? { type: 'ROLL', color: g.turn }
                            : autoAction(g) ?? { type: 'MOVE', color: g.turn, token: chooseMove(g, 'hard', rng)! };
                    const r = reduce(g, action, rng);
                    if (!r.ok) throw new Error(r.message);
                    g = r.state;
                }
                const loser = g.players.find(p => p.color === g.ranking[1])!;
                total += loser.tokens.reduce((a, b) => a + b, 0);
            }
            return total / games;
        };
        expect(spread(true)).toBeGreaterThan(spread(false));
    });
});
