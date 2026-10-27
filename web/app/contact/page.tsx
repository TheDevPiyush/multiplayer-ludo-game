import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage } from '@/components/SiteChrome';
import { SITE } from '@/lib/site';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
    title: 'Contact',
    description: `Get in touch with the ${SITE.name} team.`,
};

export default function Contact() {
    return (
        <DocPage title="Contact us">
            <p>
                Found a bug, have an idea, or need help with your account? We read every message and usually reply
                within two working days.
            </p>

            <div className="contact-grid">
                <a className="contact-card" href={`mailto:${SITE.contactEmail}`}>
                    <strong>✉️ Email</strong>
                    <span>{SITE.contactEmail}</span>
                </a>
                <Link className="contact-card" href="/delete-account">
                    <strong>🗑️ Delete my account</strong>
                    <span>How to remove your account and data</span>
                </Link>
                <Link className="contact-card" href="/privacy">
                    <strong>🔒 Privacy</strong>
                    <span>What we collect and why</span>
                </Link>
            </div>

            <h2>Send a message</h2>
            <p>This opens your email app with the message filled in.</p>
            <ContactForm email={SITE.contactEmail} />

            <h2>Reporting a player</h2>
            <p>
                The quickest way is in the game: tap the player’s seat or name, then <strong>Report</strong>. That sends
                us their recent messages too. You can also block them from the same menu.
            </p>
        </DocPage>
    );
}
