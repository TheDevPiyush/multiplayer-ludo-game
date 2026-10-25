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

/** Same pacing as the server so local and online games feel identical. */
export const ROLL_ANIM_MS = 800;
const AUTO_DELAY_MS = 650;
const BOT_ROLL_DELAY_MS = 550;
const BOT_MOVE_DELAY_MS = 450;

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
    const stateRef = useRef(state);
    const rollingRef = useRef(false);
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
    /** When the last move's hop / capture animation finishes. */
    const animatingUntil = useRef(0);
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
        stateRef.current = r.state;
        setState(r.state);
        onEventsRef.current?.(r.events, r.state);
        return true;
    }, []);

    /** Rolls for whoever's turn it is; the result lands after the dice animation. */
    const doRoll = useCallback(() => {
        const s = stateRef.current;
        if (s.phase !== 'ROLL' || rollingRef.current) return;
        // Decide the value now (from the current position) and reveal it after the tumble.
        const r = reduce(s, { type: 'ROLL', color: s.turn });
        if (!r.ok) return;
        const value = r.state.dice!;
        rollingRef.current = true;
        setRolling(true);
        later(ROLL_ANIM_MS, () => {
            rollingRef.current = false;
            setRolling(false);
            commit({ type: 'ROLL', color: s.turn, value });
        });
    }, [commit, later]);

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
            delay = BOT_ROLL_DELAY_MS;
        } else if (seat?.kind === 'bot') {
            step = () => {
                const token = chooseMove(stateRef.current, seat.level);
                if (token !== null) commit({ type: 'MOVE', color: stateRef.current.turn, token });
            };
            delay = BOT_MOVE_DELAY_MS;
        }
        if (!step) return;
        // Let the previous move finish hopping before the next action starts.
        const wait = Math.max(delay, animatingUntil.current - Date.now() + 120);
        const t = setTimeout(step, wait);
        return () => clearTimeout(t);
    }, [state, rolling, seatOf, commit, doRoll]);

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
        setRolling(false);
        const fresh = newGame(config);
        stateRef.current = fresh;
        setState(fresh);
    }, [clearTimers, config]);

    return {
        state,
        rolling,
        currentSeat,
        isHumanTurn,
        canRoll: isHumanTurn && state.phase === 'ROLL' && !rolling,
        movable,
        roll,
        move,
        restart,
        seatOf,
    };
}
