/**
 * The server's clock as seen from this device (NTP-style). Each heartbeat gives
 * one sample: send time, server time, receive time. The sample with the
 * shortest round trip has the least error, so we keep the best of the recent
 * ones. Server deadlines (turn start / end) are then converted to local time,
 * which is right even when the phone's clock is off or the network is slow.
 */

type Sample = { offset: number; rtt: number; at: number };

/** Samples older than this are dropped (clocks drift, networks change). */
const SAMPLE_TTL_MS = 60_000;
const MAX_SAMPLES = 8;

let samples: Sample[] = [];
let best: Sample | null = null;
let lastRtt: number | null = null;
const listeners = new Set<(rtt: number | null) => void>();

function pickBest(now: number) {
    samples = samples.filter(s => now - s.at < SAMPLE_TTL_MS);
    best = samples.reduce<Sample | null>((b, s) => (!b || s.rtt < b.rtt ? s : b), null);
}

export const serverClock = {
    /** One round trip: `sentAt` / `receivedAt` local ms, `serverNow` server ms. */
    sample(sentAt: number, serverNow: number, receivedAt: number) {
        const rtt = Math.max(0, receivedAt - sentAt);
        // The server stamped its time somewhere in the middle of the round trip.
        samples.push({ offset: serverNow - (sentAt + rtt / 2), rtt, at: receivedAt });
        if (samples.length > MAX_SAMPLES) samples.shift();
        pickBest(receivedAt);
        lastRtt = rtt;
        listeners.forEach(l => l(rtt));
    },

    /** Server ms → local ms. `null` while there is no sample yet. */
    toLocal(serverMs: number): number | null {
        return best ? serverMs - best.offset : null;
    },

    /** Latest round trip, for the connection badge. */
    rtt(): number | null {
        return lastRtt;
    },

    subscribe(listener: (rtt: number | null) => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};
