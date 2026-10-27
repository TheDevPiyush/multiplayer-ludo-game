import { randomUUID } from 'crypto';

import {
    CHAT_LOCK_MS,
    CHAT_MAX_LENGTH,
    parseReaction,
    type Reaction,
} from '@ludo/engine';
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

import { RateLimiter } from '../lib/rate-limit';
import { TtlCache } from '../lib/ttl-cache';

export interface ChatMessage {
    id: string;
    userId: string;
    text: string;
    /** Epoch ms. */
    at: number;
}

export type ChatResult =
    | { ok: true; message: ChatMessage }
    | { ok: false; error: string; code?: 'chat_locked'; lockedUntil?: number };

/** Messages kept per room, so the board shows what was said in the lobby. */
const HISTORY_SIZE = 40;
/** Rooms are evicted from memory after a few hours at most; their chat goes earlier if quiet. */
const HISTORY_TTL_MS = 3 * 60 * 60_000;

/** Leetspeak, spacing and repeated letters are folded before matching ("sh!t", "fuuuck"). */
const profanity = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** Whether text contains a foul word. */
export function isFoul(text: string): boolean {
    return profanity.hasMatch(text);
}

/** Trimmed, single-spaced, without control characters; null when nothing is left. */
export function cleanChatText(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const text = input
        // Zero-width and direction marks would hide a word from the filter (the emoji joiner U+200D stays).
        .replace(/[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
        .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return null;
    return [...text].slice(0, CHAT_MAX_LENGTH).join('');
}

/**
 * Reactions and text chat in rooms. Nothing is stored in the database: a short
 * history per room and the chat locks live in memory. A foul word locks that
 * player's chat everywhere for CHAT_LOCK_MS, and the message is not delivered.
 */
export class RoomChat {
    private history = new TtlCache<string, ChatMessage[]>(5_000, HISTORY_TTL_MS);
    private locks = new TtlCache<string, number>(50_000, CHAT_LOCK_MS);
    /** Bubbles stay up ~2.5 s: about one every 2 s, a few in a burst. */
    private reactLimiter = new RateLimiter(4, 0.5);
    private chatLimiter = new RateLimiter(5, 0.5);

    /** `onLocked` tells all of a player's devices (their chat input shows the countdown). */
    constructor(private onLocked: (userId: string, lockedUntil: number) => void = () => {}) {}

    lockedUntil(userId: string): number | null {
        return this.locks.get(userId) ?? null;
    }

    react(userId: string, input: unknown): { ok: true; reaction: Reaction } | { ok: false; error: string } {
        const reaction = parseReaction(input);
        if (!reaction) return { ok: false, error: 'Unknown reaction.' };
        if (!this.reactLimiter.take(userId)) return { ok: false, error: 'Slow down.' };
        return { ok: true, reaction };
    }

    say(roomId: string, userId: string, input: unknown): ChatResult {
        const locked = this.lockedUntil(userId);
        if (locked) return { ok: false, error: 'Chat is locked for using a foul word.', code: 'chat_locked', lockedUntil: locked };
        const text = cleanChatText(input);
        if (!text) return { ok: false, error: 'Message is empty.' };
        if (!this.chatLimiter.take(userId)) return { ok: false, error: 'Slow down.' };
        if (isFoul(text)) {
            const until = Date.now() + CHAT_LOCK_MS;
            this.locks.set(userId, until);
            this.onLocked(userId, until);
            return { ok: false, error: 'Chat is locked for using a foul word.', code: 'chat_locked', lockedUntil: until };
        }
        const message: ChatMessage = { id: randomUUID(), userId, text, at: Date.now() };
        const list = this.history.get(roomId) ?? [];
        list.push(message);
        if (list.length > HISTORY_SIZE) list.splice(0, list.length - HISTORY_SIZE);
        this.history.set(roomId, list);
        return { ok: true, message };
    }

    historyFor(roomId: string): ChatMessage[] {
        return this.history.get(roomId) ?? [];
    }
}
