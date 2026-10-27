import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage } from '@/components/SiteChrome';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
    title: 'Terms & Conditions',
    description: `The rules for using ${SITE.name}.`,
};

export default function Terms() {
    const mail = <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>;
    return (
        <DocPage title="Terms & Conditions" updated={SITE.legalUpdated}>
            <p>
                These terms are an agreement between you and {SITE.developer} (“we”, “us”) for the {SITE.name}{' '}
                mobile app and this website (the “Service”). By using the Service you agree to them. If you do not
                agree, please don’t use the Service.
            </p>

            <h2>1. Who can play</h2>
            <p>
                You must be at least 13 years old. If you are under the age of majority where you live, you need a
                parent’s or guardian’s permission, and they agree to these terms for you.
            </p>

            <h2>2. Your account</h2>
            <ul>
                <li>
                    You can play as a guest or sign in with Google or email. A guest account is tied to your device: if
                    you sign out, uninstall the app or don’t open it for 30 days, it may be lost for good. Save your
                    progress from your profile to keep it.
                </li>
                <li>Keep your sign-in secure. You are responsible for what happens on your account.</li>
                <li>
                    Pick a username that isn’t offensive, misleading or someone else’s identity. We may change
                    usernames that break these rules.
                </li>
            </ul>

            <h2>3. A game of skill and chance, for fun</h2>
            <p>
                {SITE.name} is a free game for entertainment. There is no betting, real-money play or prize of any
                kind. To keep games close and fun, casual games may use “dynamic dice”, which gently adjust the odds
                of each roll. Every number can always come up.
            </p>

            <h2>4. Play fair and be kind</h2>
            <p>You agree not to:</p>
            <ul>
                <li>harass, threaten, bully or use hate speech against other players;</li>
                <li>share sexual, violent or illegal content, or spam;</li>
                <li>cheat, use bots or scripts, exploit bugs, or interfere with other players’ games;</li>
                <li>reverse engineer, overload or attack the Service, or access it in ways we don’t provide;</li>
                <li>impersonate anyone, or create accounts in bulk;</li>
                <li>buy, sell or transfer accounts.</li>
            </ul>
            <p>
                Chat is filtered and players can mute, block and report each other. We review reports and may remove
                content, limit chat, or suspend or delete accounts that break these rules, with or without notice.
            </p>

            <h2>5. Your content</h2>
            <p>
                You keep ownership of what you write in chat. You give us permission to host, show and process it so
                the Service can work, and to keep it with a report when someone reports it.
            </p>

            <h2>6. Our content</h2>
            <p>
                The app, its design, artwork, sounds and code belong to us or our licensors. We give you a personal,
                non-transferable, revocable licence to use the app for your own non-commercial play. Ludo itself is a
                traditional game that nobody owns; our version of it is ours.
            </p>

            <h2>7. Paid features</h2>
            <p>
                The Service is free today. If we add optional paid features later, their price and terms will be shown
                before you buy, and purchases will also be subject to the app store’s terms.
            </p>

            <h2>8. Changes and availability</h2>
            <p>
                We are always improving the game, so features may change or be removed. We aim to keep the Service
                running but cannot promise it will always be available or error-free. Games can be interrupted, for
                example by a lost connection or a server update.
            </p>

            <h2>9. Ending your use</h2>
            <p>
                You can stop using the Service and{' '}
                <Link href="/delete-account">delete your account</Link> at any time. We may suspend or end your access
                if you break these terms or if we have to stop offering the Service.
            </p>

            <h2>10. Disclaimers and liability</h2>
            <p>
                The Service is provided “as is” and “as available”. To the extent the law allows, we disclaim all
                warranties, and we are not liable for indirect or consequential losses, lost data or lost progress.
                Nothing in these terms limits rights you have under consumer law that cannot be limited.
            </p>

            <h2>11. Governing law</h2>
            <p>
                These terms are governed by the laws of India. Disputes will be handled by the courts of India, unless
                the consumer law of your country gives you the right to bring them where you live.
            </p>

            <h2>12. Changes to these terms</h2>
            <p>
                We may update these terms. We will change the date above, and for important changes we will let you
                know in the app. If you keep playing after an update, you accept the new terms.
            </p>

            <h2>13. Contact</h2>
            <p>
                Questions about these terms: {mail}. Our <Link href="/privacy">Privacy Policy</Link> explains how we
                handle your data.
            </p>
        </DocPage>
    );
}
