import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { SITE } from '@/lib/site';
import './globals.css';

// The app's font (app/assets/fonts), so the site and the game look like one product.
const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-sans' });

export const metadata: Metadata = {
    metadataBase: new URL(SITE.url),
    title: { default: `${SITE.name}: play Ludo with friends`, template: `%s · ${SITE.name}` },
    description: SITE.description,
    applicationName: SITE.name,
    openGraph: { type: 'website', siteName: SITE.name, title: SITE.name, description: SITE.description },
    twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
    themeColor: '#4B3BF2',
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={sans.variable}>
            <body>{children}</body>
        </html>
    );
}
