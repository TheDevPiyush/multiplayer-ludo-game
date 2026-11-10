/**
 * Measures how the dice feel over many simulated games, for tuning `balance`.
 *
 *   bun scripts/dice-report.ts [--games=2000] [--engine=path/to/src/index.ts] [--strength=0.6] [--momentum=1] [--fade=0.8]
 *
 * --engine compares another version of the engine, such as an older commit's copy.
 * Only reads what every version has, so the numbers stay comparable.
 */
import { resolve } from 'node:path';

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];

const GAMES = Number(arg('games') ?? 2000);
const enginePath = arg('engine');
const engine = await import(enginePath ? resolve(enginePath) : '../src/index.ts');
const { autoAction, chooseMove, createGame, progress, reduce } = engine;

type Level = 'easy' | 'medium' | 'hard';
type Player = { color: string; tokens: number[]; rank: number | null; active: boolean };
type State = { phase: string; turn: string; dice: number | null; players: Player[]; ranking: string[] };

function seeded(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const balance: Record<string, number | boolean> = {};
if (arg('strength')) balance.strength = Number(arg('strength'));
if (arg('momentum')) balance.momentum = Number(arg('momentum'));
if (arg('fade')) balance.luckFade = Number(arg('fade'));
if (arg('fair')) balance.enabled = false;

interface Totals {
    faces: number[];
    rolls: number;
    leadChanges: number;
    games: number;
    trailingWins: number;
    trailingGames: number;
    closeFinish: number;
    afterHot: { sum: number; n: number };
    afterCold: { sum: number; n: number };
    /** Longest run of rolls without a six for one player, averaged across games. */
    drought: number;
    levelWins: Record<string, number>;
    firstWins: number;
}

function play(seed: number, playerCount: number, levels: Level[], t: Totals) {
    const rng = seeded(seed);
    let g: State = createGame({ playerCount, balance });
    const levelOf = new Map(g.players.map((p, i) => [p.color, levels[i % levels.length]!]));
    const first = g.turn;
    let leader: string | null = null;
    let trailingAtHalf: string | null = null;
    const recent = new Map<string, number[]>();
    const dry = new Map<string, number>();
    let longestDry = 0;

    for (let steps = 0; g.phase !== 'OVER'; steps++) {
        if (steps > 20_000) throw new Error(`game ${seed} did not finish`);
        let action;
        if (g.phase === 'ROLL') action = { type: 'ROLL', color: g.turn };
        else {
            action = autoAction(g) ?? { type: 'MOVE', color: g.turn, token: chooseMove(g, levelOf.get(g.turn), rng) };
        }
        const r = reduce(g, action, rng);
        if (!r.ok) throw new Error(r.message);
        g = r.state;

        for (const e of r.events) {
            if (e.type !== 'ROLLED') continue;
            t.faces[e.value - 1]!++;
            t.rolls++;
            const last = recent.get(e.color) ?? [];
            if (last.length === 3) {
                const avg = last.reduce((a, b) => a + b, 0) / 3;
                if (avg >= 5) { t.afterHot.sum += e.value; t.afterHot.n++; }
                if (avg <= 2) { t.afterCold.sum += e.value; t.afterCold.n++; }
            }
            recent.set(e.color, [...last, e.value].slice(-3));
            const d = e.value === 6 ? 0 : (dry.get(e.color) ?? 0) + 1;
            dry.set(e.color, d);
            longestDry = Math.max(longestDry, d);
        }

        const racing = g.players.filter(p => p.active && p.rank === null);
        const top = racing.reduce<Player | null>((b, p) => (!b || progress(p) > progress(b) ? p : b), null);
        if (top && leader !== null && top.color !== leader && progress(top) > progress(g.players.find(p => p.color === leader)!)) {
            t.leadChanges++;
        }
        if (top && (leader === null || progress(top) > progress(g.players.find(p => p.color === leader)!))) leader = top.color;

        if (!trailingAtHalf && top && progress(top) >= 0.5) {
            const last = racing.reduce((b, p) => (progress(p) < progress(b) ? p : b));
            if (last.color !== top.color) trailingAtHalf = last.color;
        }
    }

    t.games++;
    t.drought += longestDry;
    const winner = g.ranking[0]!;
    if (winner === first) t.firstWins++;
    t.levelWins[levelOf.get(winner)!] = (t.levelWins[levelOf.get(winner)!] ?? 0) + 1;
    if (trailingAtHalf) {
        t.trailingGames++;
        if (winner === trailingAtHalf) t.trailingWins++;
    }
    // Share of the race the last-place player covered: higher means a closer finish.
    t.closeFinish += progress(g.players.find(p => p.color === g.ranking.at(-1))!);
}

function run(playerCount: number, levels: Level[]): Totals {
    const t: Totals = {
        faces: [0, 0, 0, 0, 0, 0], rolls: 0, leadChanges: 0, games: 0, trailingWins: 0, trailingGames: 0, closeFinish: 0,
        afterHot: { sum: 0, n: 0 }, afterCold: { sum: 0, n: 0 }, drought: 0, levelWins: {}, firstWins: 0,
    };
    for (let seed = 1; seed <= GAMES; seed++) play(seed * 7919 + playerCount, playerCount, levels, t);
    return t;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

for (const players of [2, 4]) {
    const t = run(players, ['medium']);
    console.log(`\n── ${players} players, ${t.games} games, medium bots ──`);
    console.log(`faces 1-6              ${t.faces.map(f => pct(f / t.rolls)).join(' ')}`);
    console.log(`six rate               ${pct(t.faces[5]! / t.rolls)}`);
    console.log(`average face           ${(t.faces.reduce((s, f, i) => s + f * (i + 1), 0) / t.rolls).toFixed(2)}`);
    console.log(`rolls per game         ${(t.rolls / t.games).toFixed(0)}`);
    console.log(`lead changes per game  ${(t.leadChanges / t.games).toFixed(1)}`);
    console.log(`trailing at half wins  ${pct(t.trailingWins / t.trailingGames)} (even chance: ${pct(1 / players)})`);
    console.log(`last place covered     ${pct(t.closeFinish / t.games)}`);
    console.log(`first player wins      ${pct(t.firstWins / t.games)}`);
    console.log(`next roll after hot 3  ${(t.afterHot.sum / t.afterHot.n).toFixed(2)} (n=${t.afterHot.n})`);
    console.log(`next roll after cold 3 ${(t.afterCold.sum / t.afterCold.n).toFixed(2)} (n=${t.afterCold.n})`);
    console.log(`longest six drought    ${(t.drought / t.games).toFixed(1)} rolls`);
}

for (const [a, b] of [['hard', 'easy'], ['hard', 'medium']] as [Level, Level][]) {
    const t = run(2, [a, b]);
    console.log(`\nskill: ${a} beats ${b}      ${pct((t.levelWins[a] ?? 0) / t.games)}`);
}
