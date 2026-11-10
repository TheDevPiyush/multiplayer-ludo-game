import { existsSync } from 'fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the static config; this adds what depends on the environment.
 *
 * EXPO_PUBLIC_LINK_URL is the one place the invite-link domain is set. It is used for:
 *   - the links the app shares (util/links.ts reads the same variable at runtime)
 *   - Android App Links / iOS universal links, so those links open the app directly
 * In production it is the website (https://simple-ludo.thedevpiyush.com), which serves
 * /invite/<code> and proxies /.well-known/* to the API. It falls back to
 * EXPO_PUBLIC_API_URL, because the API server also serves both.
 *
 * Changing the domain needs a new native build: Android and iOS read the list of
 * link hosts from the installed app.
 */
function linkHost(): string | null {
    const url = (process.env.EXPO_PUBLIC_LINK_URL || process.env.EXPO_PUBLIC_API_URL || '').trim();
    const m = /^https:\/\/([^/:]+)/i.exec(url);
    return m ? m[1]!.toLowerCase() : null;
}

/**
 * Firebase config for Android push (FCM). Locally: app/google-services.json. On EAS:
 * a file environment variable named GOOGLE_SERVICES_JSON (its value is the file's path).
 * Without it the app still builds, but can't get a push token.
 */
function googleServicesFile(): string | undefined {
    const file = process.env.GOOGLE_SERVICES_JSON || './google-services.json';
    return existsSync(file) ? file : undefined;
}

/**
 * Uploads source maps to Sentry during release builds. Needs SENTRY_AUTH_TOKEN, SENTRY_ORG and
 * SENTRY_PROJECT (EAS environment variables). Without the token the plugin stays off, so builds
 * never fail on it: crashes are still reported, just with minified stack traces.
 */
function sentryPlugin(): NonNullable<ExpoConfig['plugins']> {
    if (!process.env.SENTRY_AUTH_TOKEN) return [];
    return [['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }]];
}

/**
 * AdMob (react-native-google-mobile-ads). The app IDs are build-time: ADMOB_ANDROID_APP_ID and
 * ADMOB_IOS_APP_ID (EAS environment variables). Without them, Google's sample app IDs, which
 * only ever serve test ads. Ad unit IDs are runtime (EXPO_PUBLIC_ADMOB_*, see util/ads.ts).
 * The SDK starts only after consent is settled (util/ads.ts), so measurement waits for it too.
 */
function adsPlugin(): NonNullable<ExpoConfig['plugins']> {
    return [[
        'react-native-google-mobile-ads',
        {
            androidAppId: process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
            iosAppId: process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511',
            delayAppMeasurementInit: true,
        },
    ]];
}

export default ({ config }: ConfigContext): ExpoConfig => {
    const host = linkHost();
    const android = { ...config.android, googleServicesFile: googleServicesFile() };
    const plugins = [...(config.plugins ?? []), ...adsPlugin(), ...sentryPlugin()];
    if (!host) return { ...(config as ExpoConfig), android, plugins };

    return {
        ...(config as ExpoConfig),
        plugins,
        ios: {
            ...config.ios,
            associatedDomains: [`applinks:${host}`],
        },
        android: {
            ...android,
            intentFilters: [
                {
                    action: 'VIEW',
                    autoVerify: true,
                    data: [
                        { scheme: 'https', host, pathPrefix: '/invite/' },
                        // Links shared by older builds.
                        { scheme: 'https', host, pathPrefix: '/join/' },
                        { scheme: 'https', host, pathPrefix: '/friends' },
                    ],
                    category: ['BROWSABLE', 'DEFAULT'],
                },
            ],
        },
    };
};
