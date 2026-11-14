import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

/**
 * Crash and error reports. Off without a DSN and in development. Sessions stay on, as they give the
 * crash-free rate. Tracing, replay and profiling stay off: they cost frames during a game and we don't use them.
 */
export function startMonitoring() {
    if (!DSN || __DEV__) return;
    Sentry.init({
        dsn: DSN,
        environment: Updates.channel || 'production',
        sendDefaultPii: false,
        enableAutoSessionTracking: true,
        tracesSampleRate: 0,
        // Console lines may quote server responses; network and navigation breadcrumbs are enough.
        beforeBreadcrumb: crumb => (crumb.category === 'console' ? null : crumb),
    });
}

/** Ties reports to our internal user id, nothing else about the player. */
export function setMonitoringUser(userId: string | null) {
    if (!DSN || __DEV__) return;
    Sentry.setUser(userId ? { id: userId } : null);
}

/** For errors a screen caught and handled, which wouldn't otherwise be reported. */
export function reportError(error: unknown) {
    if (!DSN || __DEV__) return;
    Sentry.captureException(error);
}
