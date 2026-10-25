import { useCallback, useRef, useState } from 'react';

import type { Result } from '@/apis/http';
import type { Page } from '@/apis/social-api';

/**
 * A cursor-paged list for a FlatList: `reload()` fetches the first page,
 * `loadMore()` (wire to onEndReached) appends the next one. A reload while a
 * page is in flight wins, so stale pages never land on top of fresh data.
 */
export function usePagedList<T>(
    fetchPage: (cursor?: string) => Promise<Result<Page<T>>>,
    keyOf: (item: T) => string,
) {
    const [items, setItems] = useState<T[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const cursor = useRef<string | null>(null);
    const generation = useRef(0);
    const busy = useRef(false);

    const reload = useCallback(async () => {
        const gen = ++generation.current;
        const res = await fetchPage();
        if (gen !== generation.current) return false;
        if (!res.ok) {
            setError(res.error);
            return false;
        }
        setError(null);
        cursor.current = res.data.nextCursor;
        setItems(res.data.data);
        return true;
    }, [fetchPage]);

    const loadMore = useCallback(async () => {
        if (!cursor.current || busy.current) return;
        const gen = generation.current;
        busy.current = true;
        setLoadingMore(true);
        const res = await fetchPage(cursor.current);
        busy.current = false;
        setLoadingMore(false);
        if (gen !== generation.current || !res.ok) return;
        cursor.current = res.data.nextCursor;
        setItems(prev => {
            const seen = new Set((prev ?? []).map(keyOf));
            return [...(prev ?? []), ...res.data.data.filter(item => !seen.has(keyOf(item)))];
        });
    }, [fetchPage, keyOf]);

    return { items, setItems, error, loadingMore, reload, loadMore };
}
