/** When match history was last fetched; reset when a game ends so the next visit refetches. */
let lastFetchedAt = 0;

export const historyFetchedAt = () => lastFetchedAt;
export const markHistoryFetched = () => { lastFetchedAt = Date.now(); };
export const markHistoryStale = () => { lastFetchedAt = 0; };
