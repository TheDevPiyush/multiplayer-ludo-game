import { describe, expect, test } from 'bun:test';

import { cleanHtml, parseInput, statusOf } from '../announcements/announcements';

const base = {
    title: 'Diwali tournament',
    html: '<h1>Play now</h1><p>Prizes all week.</p>',
    startsAt: '2026-11-01T10:00:00.000Z',
    endsAt: '2026-11-08T10:00:00.000Z',
    audience: 'all',
};

describe('announcement input', () => {
    test('accepts a complete notice, with defaults', () => {
        const r = parseInput(base);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value).toMatchObject({ title: 'Diwali tournament', audience: 'all', userIds: [], everyOpen: false, priority: 0, active: true });
        expect(r.value.startsAt.toISOString()).toBe(base.startsAt);
    });

    test('rejects bad dates, empty bodies and unknown audiences', () => {
        expect(parseInput({ ...base, endsAt: base.startsAt }).ok).toBe(false);
        expect(parseInput({ ...base, startsAt: 'tomorrow' }).ok).toBe(false);
        expect(parseInput({ ...base, endsAt: '2028-01-01T00:00:00.000Z' }).ok).toBe(false);
        expect(parseInput({ ...base, html: '<p> &nbsp; </p><br>' }).ok).toBe(false);
        expect(parseInput({ ...base, html: '<img src="https://x.test/a.png">' }).ok).toBe(true);
        expect(parseInput({ ...base, audience: 'everyone' }).ok).toBe(false);
        expect(parseInput({ ...base, title: ' ' }).ok).toBe(false);
    });

    test('a user list is required for "users" and dropped otherwise', () => {
        expect(parseInput({ ...base, audience: 'users' }).ok).toBe(false);
        const picked = parseInput({ ...base, audience: 'users', userIds: ['a', 'b', 'a', 7] });
        expect(picked.ok && picked.value.userIds).toEqual(['a', 'b']);
        const all = parseInput({ ...base, userIds: ['a'] });
        expect(all.ok && all.value.userIds).toEqual([]);
    });

    test('an update keeps the fields it leaves out', () => {
        const first = parseInput(base);
        if (!first.ok) throw new Error('setup');
        const paused = parseInput({ active: false }, first.value);
        expect(paused.ok && paused.value).toMatchObject({ title: base.title, active: false, audience: 'all' });
    });
});

describe('announcement html', () => {
    test('strips scripts, frames, handlers and javascript: links, keeps styling', () => {
        const out = cleanHtml(
            '<p style="color:red" onclick="steal()">Hi</p><script>alert(1)</script><iframe src="x"></iframe>'
            + '<a href="javascript:alert(1)">x</a><a href="https://ok.test">ok</a>',
        );
        expect(out).toBe('<p style="color:red">Hi</p><a href="#">x</a><a href="https://ok.test">ok</a>');
    });
});

describe('announcement status', () => {
    const now = new Date('2026-11-05T00:00:00Z');
    const at = (s: string) => new Date(s);
    test('live / scheduled / ended / paused', () => {
        expect(statusOf({ active: true, startsAt: at('2026-11-01'), endsAt: at('2026-11-08') }, now)).toBe('live');
        expect(statusOf({ active: true, startsAt: at('2026-11-06'), endsAt: at('2026-11-08') }, now)).toBe('scheduled');
        expect(statusOf({ active: true, startsAt: at('2026-11-01'), endsAt: at('2026-11-05') }, now)).toBe('ended');
        expect(statusOf({ active: false, startsAt: at('2026-11-01'), endsAt: at('2026-11-08') }, now)).toBe('paused');
    });
});
