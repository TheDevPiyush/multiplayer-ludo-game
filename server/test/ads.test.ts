import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'crypto';

import { parseCustomData } from '../ads/rewards';
import { parseSsvQuery, setVerifierKeys, verifierKey, verifySsv } from '../ads/ssv';

describe('rewarded ad custom data', () => {
    test('known placements with well-formed refs only', () => {
        expect(parseCustomData('double:game:6f1c2a90-1111-4222-8333-944455556666')).toEqual({ placement: 'double', ref: 'game:6f1c2a90-1111-4222-8333-944455556666' });
        expect(parseCustomData('double:offline:abcd1234-xyz')).toEqual({ placement: 'double', ref: 'offline:abcd1234-xyz' });
        expect(parseCustomData('daily_missed:2026-11-09')).toEqual({ placement: 'daily_missed', ref: '2026-11-09' });
        expect(parseCustomData('daily_bonus:2026-11-10')).toEqual({ placement: 'daily_bonus', ref: '2026-11-10' });
        for (const bad of [null, '', 'double:game:x', 'double:room:abcdefgh', 'daily_missed:yesterday', 'coins:1000', 'double:game:../../etc']) {
            expect(parseCustomData(bad)).toBeNull();
        }
    });
});

describe('server-side verification', () => {
    // Google signs with ECDSA P-256 / SHA-256; this pair stands in for its published key.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const signed = (message: string, keyId = '42') => {
        const sig = sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'der' }).toString('base64url');
        return `${message}&signature=${sig}&key_id=${keyId}`;
    };
    const message = 'ad_network=5450213213286189855&ad_unit=1234567890&custom_data=daily_bonus%3A2026-11-10&reward_amount=1&reward_item=Reward&timestamp=1762761600000&transaction_id=123456789&user_id=user-1';

    test('a correctly signed call verifies; a changed one does not', async () => {
        setVerifierKeys(new Map([['42', publicKey]]));
        const call = parseSsvQuery(signed(message))!;
        expect(call.params.get('custom_data')).toBe('daily_bonus:2026-11-10');
        expect(call.params.get('user_id')).toBe('user-1');
        expect(verifySsv(call, (await verifierKey('42'))!)).toBe(true);

        const forged = parseSsvQuery(signed(message).replace('user_id=user-1', 'user_id=user-2'))!;
        expect(verifySsv(forged, publicKey)).toBe(false);
        expect(parseSsvQuery(message)).toBeNull();
    });

    test('an unknown key id refetches the list and finds nothing in it', async () => {
        setVerifierKeys(new Map([['42', publicKey]]));
        const fetchFn = (async () => new Response(JSON.stringify({ keys: [] }))) as unknown as typeof fetch;
        expect(await verifierKey('7', fetchFn)).toBeNull();
    });
});
