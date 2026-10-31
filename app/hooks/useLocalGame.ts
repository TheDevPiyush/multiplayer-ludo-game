import { useCallback, useEffect, useRef, useState } from 'react';
import {
    autoAction,
    chooseMove,
    createGame,
    legalMoves,
    reduce,
    type Action,
    type BotLevel,
    type Color,
    type GameEvent,
    type GameState,
} from '@ludo/engine';

import { DICE_ROLL_MS } from '@/components/ludo/Dice';
import { CAPTURE_RETURN_DELAY_MS, CAPTURE_RETURN_MS, HOP_MS } from '@/components/ludo/geometry';

export type SeatKind = 'human' | 'bot';

export type LocalSeat = {
    color: Color;
    kind: SeatKind;
    name: string;
    level: BotLevel;
};

export type LocalGameConfig = {
    seats: LocalSeat[];
    /** Engagement dice (rubber-banding) on/off. */
    dynamicDice: boolean;
};

/** The roll is applied when the die reports it has come to rest, or after this long at the latest. */
const ROLL_FALLBACK_MS = DICE_ROLL_MS + 700;
/** A forced move (or pass) waits this long after the die lands, so the number is seen first. */
const AUTO_DELAY_MS = 500;
/** A bot "looks at" its roll for a moment before moving (random in range). */
const BOT_MOVE_DELAY_MS: [number, number] = [350, 800];
/** A bot rolls this long after its turn starts. */
const BOT_ROLL_DELAY_MS: [number, number] = [350, 700];
/** After a move, the dice passes to the next player only after this pause. */
const HANDOFF_MS = 600;
/** Same player again (six, capture, home): a shorter breath before the next roll. */
const SAME_PLAYER_PAUSE_MS = 250;

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

function newGame(config: LocalGameConfig): GameState {
    return createGame({
        colors: config.seats.map(s => s.color),
        balance: { enabled: config.dynamicDice },
    });
}

/**
 * Runs a full game on-device with the shared engine: humans act through
 * `roll` / `move`, bots and forced moves are played by timers.
 */
export function useLocalGame(config: LocalGameConfig, onEvents?: (events: GameEvent[], state: GameState) => void) {
    const [state, setState] = useState<GameState>(() => newGame(config));
    const [rolling, setRolling] = useState(false);
    /** The value the die is landing on (known from the start of the roll). */
    const [rollResult, setRollResult] = useState<number | null>(null);
    /** The roll in the air, applied to the game once the die is at rest. */
    const pendingRoll = useRef<{ id: number; color: Color; value: number } | null>(null);
    const rollSeq = useRef(0);
    const stateRef = useRef(state);
    const rollingRef = useRef(false);
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
    /** When the last move's hop / capture animation finishes. */
    const animatingUntil = useRef(0);
    /** When the current turn may start (move finished + handoff pause). */
    const readyAt = useRef(0);
    /** Re-renders when a handoff pause ends. */
    const [, setTurnTick] = useState(0);
    /** The turn players see: the previous player's until their move has finished and the pause is over. */
    const shownTurnRef = useRef<Color | null>(null);
    const onEventsRef = useRef(onEvents);
    onEventsRef.current = onEvents;

    const seatOf = useCallback(
        (color: Color) => config.seats.find(s => s.color === color),
        [config.seats],
    );

    const later = useCallback((ms: number, fn: () => void) => {
        const t = setTimeout(() => {
            timers.current.delete(t);
            fn();
        }, ms);
        timers.current.add(t);
    }, []);

    const clearTimers = useCallback(() => {
        for (const t of timers.current) clearTimeout(t);
        timers.current.clear();
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const commit = useCallback((action: Action): boolean => {
        const r = reduce(stateRef.current, action);
        if (!r.ok) return false;
        let animMs = 0;
        for (const e of r.events) {
            if (e.type === 'MOVED') animMs = Math.max(animMs, e.path.length * HOP_MS);
            if (e.type === 'CAPTURED') animMs = Math.max(animMs, CAPTURE_RETURN_DELAY_MS + CAPTURE_RETURN_MS);
        }
        animatingUntil.current = Date.now() + animMs;
        const turn = r.events.find(e => e.type === 'TURN');
        if (turn?.type === 'TURN') {
            readyAt.current = animatingUntil.current + (turn.reason === 'extra-roll' ? SAME_PLAYER_PAUSE_MS : HANDOFF_MS);
        }
        stateRef.current = r.state;
        setState(r.state);
        onEventsRef.current?.(r.events, r.state);
        return true;
    }, []);

    /** The die is at rest on the roll in the air (or that roll took too long): apply it. */
    const finishRoll = useCallback((id?: number) => {
        const p = pendingRoll.current;
        if (!p || (id !== undefined && id !== p.id)) return;
        pendingRoll.current = null;
        rollingRef.current = false;
        setRolling(false);
        setRollResult(null);
        commit({ type: 'ROLL', color: p.color, value: p.value });
    }, [commit]);

    /** Rolls for whoever's turn it is; the result is applied once the die has landed. */
    const doRoll = useCallback(() => {
        const s = stateRef.current;
        if (s.phase !== 'ROLL' || rollingRef.current) return;
        // Decide the value now (from the current position) and reveal it after the tumble.
        const r = reduce(s, { type: 'ROLL', color: s.turn });
        if (!r.ok) return;
        const value = r.state.dice!;
        rollingRef.current = true;
        const id = ++rollSeq.current;
        pendingRoll.current = { id, color: s.turn, value };
        // The die gets the result now and lands by itself; the board updates only once
        // it is at rest (a re-render mid-air makes it stutter).
        setRollResult(value);
        setRolling(true);
        later(ROLL_FALLBACK_MS, () => finishRoll(id));
    }, [later, finishRoll]);

    // Drive bots, auto-passes and single-option moves. Each step is scheduled for
    // exactly this state and cancelled if the state changes first.
    useEffect(() => {
        if (state.phase === 'OVER' || rolling) return;
        let step: (() => void) | null = null;
        let delay = 0;

        const auto = autoAction(state);
        const seat = seatOf(state.turn);
        if (auto) {
            step = () => commit(auto);
            delay = AUTO_DELAY_MS;
        } else if (seat?.kind === 'bot' && state.phase === 'ROLL') {
            step = doRoll;
            delay = between(BOT_ROLL_DELAY_MS);
        } else if (seat?.kind === 'bot') {
            step = () => {
                const token = chooseMove(stateRef.current, seat.level);
                if (token !== null) commit({ type: 'MOVE', color: stateRef.current.turn, token });
            };
            delay = between(BOT_MOVE_DELAY_MS);
        }
        if (!step) return;
        // A new turn waits for the last move to finish hopping and the handoff pause;
        // a move waits for the die to have been seen.
        const startsIn = state.phase === 'ROLL' ? readyAt.current - Date.now() : animatingUntil.current - Date.now() + 120;
        const wait = Math.max(0, startsIn) + delay;
        const t = setTimeout(step, wait);
        return () => clearTimeout(t);
    }, [state, rolling, seatOf, commit, doRoll]);

    // Worked out during render, so the new turn never shows for a frame before its time.
    const turnLive = state.phase !== 'ROLL' || readyAt.current <= Date.now();
    if (turnLive || shownTurnRef.current === null) shownTurnRef.current = state.turn;
    const shownTurn = shownTurnRef.current;
    useEffect(() => {
        const wait = readyAt.current - Date.now();
        if (wait <= 0) return;
        const t = setTimeout(() => setTurnTick(n => n + 1), wait);
        return () => clearTimeout(t);
    }, [state]);

    const currentSeat = seatOf(state.turn);
    const isHumanTurn = state.phase !== 'OVER' && currentSeat?.kind === 'human';
    const movable = isHumanTurn && !rolling && !autoAction(state) ? legalMoves(state) : [];

    const roll = useCallback(() => {
        if (seatOf(stateRef.current.turn)?.kind !== 'human') return;
        doRoll();
    }, [doRoll, seatOf]);

    const move = useCallback((token: number) => {
        const s = stateRef.current;
        if (seatOf(s.turn)?.kind !== 'human') return;
        commit({ type: 'MOVE', color: s.turn, token });
    }, [commit, seatOf]);

    const restart = useCallback(() => {
        clearTimers();
        rollingRef.current = false;
        pendingRoll.current = null;
        setRolling(false);
        setRollResult(null);
        readyAt.current = 0;
        animatingUntil.current = 0;
        shownTurnRef.current = null;
        const fresh = newGame(config);
        stateRef.current = fresh;
        setState(fresh);
    }, [clearTimers, config]);

    return {
        state,
        rolling,
        currentSeat,
        isHumanTurn,
        canRoll: isHumanTurn && state.phase === 'ROLL' && !rolling && turnLive,
        /** False during the pause between turns. */
        turnLive,
        /** While rolling: the value the die lands on. */
        rollResult,
        /** For the die's `onSettled`: it is at rest, so the roll can be applied. */
        diceSettled: () => finishRoll(),
        /** Whose turn to show (pill, strip, dice colour): lags `state.turn` through the handoff pause. */
        shownTurn,
        shownSeat: seatOf(shownTurn),
        movable,
        roll,
        move,
        restart,
        seatOf,
    };
}
