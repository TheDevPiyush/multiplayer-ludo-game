import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage } from '@/components/SiteChrome';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
    title: 'Delete your account',
    description: `How to delete your ${SITE.name} account and data.`,
};

/** Linked from the Play Console's "Delete account URL" (Data safety). */
export default function DeleteAccount() {
    const subject = encodeURIComponent('Delete my Simple Ludo account');
    const body = encodeURIComponent(
        'Please delete my Simple Ludo account.\n\nUsername: \nSign-in method (Google / email / guest): \n',
    );
    return (
        <DocPage title={`Delete your ${SITE.name} account`}>
            <p>You can ask us to delete your account and the data linked to it at any time.</p>

            <h2>How to ask</h2>
            <ol>
                <li>
                    Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> from the email address you
                    sign in with (for Google sign-in, your Google email).
                </li>
                <li>Include your username, which is shown on your Profile tab.</li>
                <li>We confirm the request and delete the account within 30 days, usually much sooner.</li>
            </ol>
            <p>
                <a className="btn btn-primary" href={`mailto:${SITE.contactEmail}?subject=${subject}&body=${body}`}>
                    Email a deletion request
                </a>
            </p>

            <h2>What is deleted</h2>
            <ul>
                <li>Your account, sign-in details, username and profile picture.</li>
                <li>Your stats, game history, friends, requests, notifications, blocks and reports.</li>
            </ul>

            <h2>What may be kept</h2>
            <ul>
                <li>Records we must keep by law, and short-lived server logs, which expire on their own.</li>
            </ul>

            <h2>Guest accounts</h2>
            <p>
                Guest accounts are deleted automatically with their data after 30 days without opening the app. You
                can also email us with your guest username to delete one sooner.
            </p>

            <p className="note">
                More about your data in our <Link href="/privacy">Privacy Policy</Link>.
            </p>
        </DocPage>
    );
}
