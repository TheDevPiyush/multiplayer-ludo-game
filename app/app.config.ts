import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the static config; this adds what depends on the environment.
 *
 * EXPO_PUBLIC_LINK_URL is the one place the invite-link domain is set. It is used for:
 *   - the links the app shares (util/links.ts reads the same variable at runtime)
 *   - Android App Links / iOS universal links, so those links open the app directly
 * It falls back to EXPO_PUBLIC_API_URL, because the API server serves /join/<code>
 * and the /.well-known verification files.
 *
 * Changing the domain needs a new native build: Android and iOS read the list of
 * link hosts from the installed app.
 */
function linkHost(): string | null {
    const url = (process.env.EXPO_PUBLIC_LINK_URL || process.env.EXPO_PUBLIC_API_URL || '').trim();
    const m = /^https:\/\/([^/:]+)/i.exec(url);
    return m ? m[1]!.toLowerCase() : null;
}

export default ({ config }: ConfigContext): ExpoConfig => {
    const host = linkHost();
    if (!host) return config as ExpoConfig;

    return {
        ...(config as ExpoConfig),
        ios: {
            ...config.ios,
            associatedDomains: [`applinks:${host}`],
        },
        android: {
            ...config.android,
            intentFilters: [
                {
                    action: 'VIEW',
                    autoVerify: true,
                    data: [
                        { scheme: 'https', host, pathPrefix: '/join/' },
                        { scheme: 'https', host, pathPrefix: '/friends' },
                    ],
                    category: ['BROWSABLE', 'DEFAULT'],
                },
            ],
        },
    };
};
