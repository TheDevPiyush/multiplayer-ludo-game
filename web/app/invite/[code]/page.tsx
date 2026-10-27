import type { Metadata } from 'next';
import Link from 'next/link';

import { ROOM_CODE_RE, SITE } from '@/lib/site';
import { InviteClient } from './InviteClient';

type Props = { params: Promise<{ code: string }> };

function parse(raw: string): string | null {
    const code = decodeURIComponent(raw).trim().toUpperCase();
    return ROOM_CODE_RE.test(code) ? code : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const code = parse((await params).code);
    const title = code ? `Join my Ludo game (${code})` : 'Invite link not valid';
    const description = code
        ? `You've been invited to a game of ${SITE.name}. Tap to join room ${code}.`
        : 'This invite link is broken.';
    return {
        title,
        description,
        openGraph: { title, description, siteName: SITE.name },
        // Invite pages are personal and short-lived.
        robots: { index: false, follow: false },
    };
}

/**
 * https://simple-ludo.thedevpiyush.com/invite/ABC123
 *
 * With the app installed and the domain verified, Android / iOS open the app
 * straight away and this page never loads. When it does load (app missing, an
 * in-app browser, or verification not set up), it hands off through the app's
 * custom scheme and offers a button and the store links.
 */
export default async function InvitePage({ params }: Props) {
    const code = parse((await params).code);

    return (
        <main className="invite-wrap">
            <div style={{ width: 'min(400px, 100%)' }}>
                {code ? (
                    <InviteClient code={code} />
                ) : (
                    <div className="invite-card">
                        <h1>Invite link not valid</h1>
                        <p className="sub">
                            This link is broken or incomplete. Ask your friend for the 6-character room code and enter
                            it under <strong>Join Private</strong> in the app.
                        </p>
                        <Link className="btn btn-primary btn-block" href="/">
                            Go to {SITE.name}
                        </Link>
                    </div>
                )}
                <p className="invite-foot">
                    <Link href="/">{SITE.name}</Link> · <Link href="/privacy">Privacy</Link> ·{' '}
                    <Link href="/terms">Terms</Link>
                </p>
            </div>
        </main>
    );
}
