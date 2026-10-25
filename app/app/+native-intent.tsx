import { friendsTabFromPath, joinCodeFromUrl, routerPathFromUrl, setPendingLink } from '@/util/links';

/**
 * Every incoming link (custom scheme or verified https app link) passes through
 * here before the router sees it.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
    try {
        const code = joinCodeFromUrl(path);
        if (code) {
            // Remembered so the root layout can come back to it after sign-in.
            setPendingLink({ kind: 'join', code });
            return `/join/${code}`;
        }
        const routerPath = routerPathFromUrl(path).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/');
        const tab = friendsTabFromPath(routerPath);
        // Cold start: the root layout opens Home first, then the modal over it.
        if (tab && initial) setPendingLink({ kind: 'friends', tab });
        return routerPath;
    } catch {
        return '/';
    }
}
