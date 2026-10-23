export const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
export type Color = (typeof COLORS)[number];

/** Returns a float in [0, 1). Server injects a crypto RNG, tests a seeded one. */
export type Rng = () => number;

export interface Rules {
    extraRollOnSix: boolean;
    extraRollOnCapture: boolean;
    extraRollOnHome: boolean;
    /** Third consecutive six forfeits the turn. */
    threeSixesForfeit: boolean;
    /** Drivers auto-play the move when only one distinct move exists. */
    autoMoveSingle: boolean;
}

export interface BalanceConfig {
    enabled: boolean;
    /** 0 = fair dice, 1 = strongest rubber-banding. */
    strength: number;
    /** Rolls without a six (all tokens in base) before the pity boost kicks in. */
    pityAfter: number;
}

export interface PlayerState {
    color: Color;
    /** 0 = base, 1..51 = shared track, 52..56 = home column, 57 = home. */
    tokens: number[];
    rank: number | null;
    /** False once the player has left the game. */
    active: boolean;
    rollsWithoutSix: number;
}

export type Phase = 'ROLL' | 'MOVE' | 'OVER';

export interface GameState {
    /** In turn order (clockwise around the board). */
    players: PlayerState[];
    turn: Color;
    phase: Phase;
    dice: number | null;
    sixStreak: number;
    /** Colors in finishing order. */
    ranking: Color[];
    rules: Rules;
    balance: BalanceConfig;
}

export type PassReason = 'no-moves' | 'three-sixes' | 'timeout';

export type Action =
    | { type: 'ROLL'; color: Color; /** Forced value (tests / replays). */ value?: number }
    | { type: 'MOVE'; color: Color; token: number }
    | { type: 'PASS'; color: Color; reason?: PassReason }
    | { type: 'LEAVE'; color: Color };

export type TurnReason = 'extra-roll' | 'next' | 'left' | PassReason;

export type GameEvent =
    | { type: 'ROLLED'; color: Color; value: number }
    | { type: 'MOVED'; color: Color; token: number; from: number; to: number; path: number[] }
    | { type: 'CAPTURED'; color: Color; token: number; by: Color; cell: number }
    | { type: 'HOME'; color: Color; token: number }
    | { type: 'FINISHED'; color: Color; rank: number }
    | { type: 'LEFT'; color: Color }
    | { type: 'TURN'; color: Color; reason: TurnReason }
    | { type: 'OVER'; ranking: Color[] };

export type EngineErrorCode =
    | 'GAME_OVER'
    | 'NOT_YOUR_TURN'
    | 'NOT_IN_GAME'
    | 'ROLL_FIRST'
    | 'ALREADY_ROLLED'
    | 'ILLEGAL_MOVE';

export type ReduceResult =
    | { ok: true; state: GameState; events: GameEvent[] }
    | { ok: false; code: EngineErrorCode; message: string };
