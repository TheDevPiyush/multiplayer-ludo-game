import * as Sentry from '@sentry/bun';
import type { Express } from 'express';

import { setErrorSink } from './logger.ts';

const DSN = process.env.SENTRY_DSN?.trim();

// At module level, and imported first in index.ts, so errors during startup are caught too.
if (DSN) {
    Sentry.init({
        dsn: DSN,
        environment: process.env.NODE_ENV ?? 'development',
        // Errors only. Tracing adds work to every request and game event, and we don't use it.
        tracesSampleRate: 0,
    });
    // Route handlers catch their errors and log them, so log.error is where they surface.
    setErrorSink((message, fields) => {
        const { ip: _ip, ...extra } = fields ?? {};
        Sentry.captureMessage(message, { level: 'error', extra });
    });
}

/** For errors thrown outside the handlers that catch their own. Goes after all the routes. */
export function reportRouteErrors(app: Express) {
    if (DSN) Sentry.setupExpressErrorHandler(app);
}

/** Sends what's queued before the process exits. */
export async function flushErrorReports() {
    if (DSN) await Sentry.close(2_000);
}
