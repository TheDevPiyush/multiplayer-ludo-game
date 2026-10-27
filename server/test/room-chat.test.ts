import { describe, expect, test } from 'bun:test';
import { CHAT_LOCK_MS, CHAT_MAX_LENGTH } from '@ludo/engine';

import { cleanChatText, isFoul, RoomChat } from '../game/room-chat';

describe('room chat', () => {
    test('foul words are caught, including disguised ones, without flagging innocent words', () => {
        for (const s of ['you fuck3r', 'b1tch', 'sh!t move', 'f​uck off']) expect(isFoul(cleanChatText(s)!)).toBe(true);
        for (const s of ['nice move', 'assassin', 'class act', 'Scunthorpe', 'cocktail', 'come on six']) expect(isFoul(s)).toBe(false);
    });

    test('text is trimmed, single-spaced and capped', () => {
        expect(cleanChatText('  hi \n\n there  ')).toBe('hi there');
        expect(cleanChatText('   ')).toBeNull();
        expect(cleanChatText(42)).toBeNull();
        expect([...cleanChatText('🎲'.repeat(CHAT_MAX_LENGTH + 10))!].length).toBe(CHAT_MAX_LENGTH);
    });

    test('a foul word locks chat for that player in every room, without delivering it', () => {
        const locked: string[] = [];
        const chat = new RoomChat(userId => locked.push(userId));
        expect(chat.say('room1', 'u1', 'good luck').ok).toBe(true);

        const bad = chat.say('room1', 'u1', 'you are shit');
        expect(bad).toMatchObject({ ok: false, code: 'chat_locked' });
        expect(locked).toEqual(['u1']);
        const until = chat.lockedUntil('u1')!;
        expect(until - Date.now()).toBeGreaterThan(CHAT_LOCK_MS - 1_000);

        expect(chat.say('room2', 'u1', 'hello')).toMatchObject({ ok: false, code: 'chat_locked', lockedUntil: until });
        expect(chat.say('room1', 'u2', 'hello').ok).toBe(true);
        expect(chat.historyFor('room1').map(m => m.text)).toEqual(['good luck', 'hello']);
    });

    test('only known reactions pass', () => {
        const chat = new RoomChat();
        expect(chat.react('u1', { kind: 'emote', id: 'fire' })).toEqual({ ok: true, reaction: { kind: 'emote', id: 'fire' } });
        expect(chat.react('u1', { kind: 'quick', id: 'gg' }).ok).toBe(true);
        expect(chat.react('u1', { kind: 'emote', id: 'gg' }).ok).toBe(false);
        expect(chat.react('u1', { kind: 'text', id: 'anything' }).ok).toBe(false);
    });
});
