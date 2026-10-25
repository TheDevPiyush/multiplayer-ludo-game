/** Small in-process TTL cache with LRU eviction (Map keeps insertion order). */
export class TtlCache<K, V> {
    private map = new Map<K, { value: V; expiresAt: number }>();

    constructor(private maxEntries: number, private defaultTtlMs: number) {}

    get(key: K): V | undefined {
        const hit = this.map.get(key);
        if (!hit) return undefined;
        if (hit.expiresAt <= Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        // Refresh recency.
        this.map.delete(key);
        this.map.set(key, hit);
        return hit.value;
    }

    set(key: K, value: V, ttlMs = this.defaultTtlMs) {
        this.map.delete(key);
        this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
        if (this.map.size > this.maxEntries) {
            const oldest = this.map.keys().next().value as K;
            this.map.delete(oldest);
        }
    }

    delete(key: K) {
        this.map.delete(key);
    }

    clear() {
        this.map.clear();
    }
}
