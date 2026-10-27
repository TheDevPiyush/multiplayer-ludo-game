/**
 * In-room reactions: emotes and quick replies are picked from these fixed
 * lists, so only an id travels and nothing needs moderating. The server
 * rejects ids that aren't here; the app renders them.
 */

export const EMOTES = [
    { id: 'laugh', emoji: '😂' },
    { id: 'fire', emoji: '🔥' },
    { id: 'clap', emoji: '👏' },
    { id: 'cool', emoji: '😎' },
    { id: 'angry', emoji: '😡' },
    { id: 'cry', emoji: '😭' },
    { id: 'shock', emoji: '😱' },
    { id: 'think', emoji: '🤔' },
    { id: 'pray', emoji: '🙏' },
    { id: 'sleep', emoji: '😴' },
    { id: 'heart', emoji: '❤️' },
    { id: 'dice', emoji: '🎲' },
] as const;

export const QUICK_REPLIES = [
    { id: 'hi', text: 'Hi all 👋' },
    { id: 'gl', text: 'Good luck!' },
    { id: 'nice', text: 'Nice move!' },
    { id: 'lucky', text: 'So lucky 🙄' },
    { id: 'hurry', text: 'Hurry up 😴' },
    { id: 'oops', text: 'Oops!' },
    { id: 'revenge', text: 'Revenge time 😈' },
    { id: 'six', text: 'Come on, six!' },
    { id: 'wp', text: 'Well played' },
    { id: 'gg', text: 'GG' },
] as const;

export type EmoteId = (typeof EMOTES)[number]['id'];
export type QuickReplyId = (typeof QUICK_REPLIES)[number]['id'];

export type Reaction =
    | { kind: 'emote'; id: EmoteId }
    | { kind: 'quick'; id: QuickReplyId };

const EMOTE_IDS = new Set<string>(EMOTES.map(e => e.id));
const QUICK_IDS = new Set<string>(QUICK_REPLIES.map(q => q.id));

/** A reaction from untrusted input, or null when it isn't one of ours. */
export function parseReaction(input: unknown): Reaction | null {
    if (!input || typeof input !== 'object') return null;
    const { kind, id } = input as { kind?: unknown; id?: unknown };
    if (typeof id !== 'string') return null;
    if (kind === 'emote' && EMOTE_IDS.has(id)) return { kind, id: id as EmoteId };
    if (kind === 'quick' && QUICK_IDS.has(id)) return { kind, id: id as QuickReplyId };
    return null;
}

/** In-game text chat. */
export const CHAT_MAX_LENGTH = 120;
/** How long a player's chat stays locked after a message with a foul word. */
export const CHAT_LOCK_MS = 2 * 60_000;
