import type { Metadata } from 'next';
import Link from 'next/link';

import { DocPage } from '@/components/SiteChrome';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description: `How ${SITE.name} collects, uses and protects your information.`,
};

export default function Privacy() {
    const mail = <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>;
    return (
        <DocPage title="Privacy Policy" updated={SITE.legalUpdated}>
            <p>
                This policy explains what information the {SITE.name} mobile app and this website (together, the
                “Service”) collect, why, and the choices you have. The Service is made by {SITE.developer} (“we”,
                “us”). We collect only what we need to run the game, and we do not sell your data.
            </p>

            <h2>1. Information we collect</h2>
            <h3>Account information</h3>
            <ul>
                <li>
                    <strong>Guest play:</strong> when you tap “Play as guest” we create an anonymous account with an
                    internal ID and a random username (for example, <em>guest_1234</em>). No name, email or phone
                    number is needed.
                </li>
                <li>
                    <strong>Google sign-in:</strong> your name, email address, profile picture and Google account ID.
                </li>
                <li>
                    <strong>Email sign-in:</strong> your email address, used to send you a one-time login code.
                </li>
                <li>Your username, which you can change, and the date you last changed it.</li>
            </ul>

            <h3>Game and social information</h3>
            <ul>
                <li>Rooms you create or join, your colour, moves, results, wins and games played.</li>
                <li>
                    Your coins and every change to them, your XP and level, daily rewards and missions, and the shop
                    items you own and use. Coins are only earned in the game; they are not bought and have no money
                    value.
                </li>
                <li>Friends, friend requests, room invites and in-app notifications.</li>
                <li>
                    Players you block, and reports you make or that are made about you, including the reason, any note
                    and the reported player’s recent chat messages in that room, kept as evidence.
                </li>
                <li>
                    Chat messages, emotes and quick replies. Room chat is kept only in our server’s memory: the last 40
                    messages per room, gone when the room ends. It is not written to our database unless it is
                    attached to a report.
                </li>
                <li>Whether you are online, so your friends can see it.</li>
            </ul>

            <h3>Technical information</h3>
            <ul>
                <li>
                    Your IP address and basic request details (time, the address requested, the response), used for
                    security and rate limiting and kept in short-lived server logs.
                </li>
                <li>
                    Settings stored on your device only: sound, music and vibration preferences, your sign-in session,
                    whether you told us you are 18 or older (for ads, below), and how many full-screen ads you have
                    seen recently (so we can limit them).
                </li>
            </ul>
            <h3>How the app is used, and when it crashes</h3>
            <ul>
                <li>
                    Usage analytics on Android: events such as a game starting or finishing, its mode and length, the
                    number of players, whether you won, whether an invite was shared or used, rewards collected, shop
                    visits and purchases with coins, and whether an ad was offered, watched or shown, together with your
                    internal player ID, whether you are a guest, and basic device and app details. We use these to see
                    what works and which features people come back for. They never include your username, chat or room
                    codes.
                </li>
                <li>
                    Crash and error reports: what went wrong, the app version, device details, recent screens and network
                    requests, and your internal player ID, so we can fix the problem.
                </li>
            </ul>
            <h3>Ads</h3>
            <ul>
                <li>
                    The app shows ads from Google AdMob: rewarded ads, which you choose to watch for coins, and an
                    occasional full-screen ad after a finished game. Never during a game.
                </li>
                <li>
                    To show ads, limit how often you see them, measure them and prevent fraud, Google’s ads software
                    collects your device’s advertising ID, IP address, device and app details, and how you interact
                    with ads. When you watch a rewarded ad, Google tells our server your internal player ID and what the
                    reward was for, so we can pay it.
                </li>
                <li>
                    Where the law requires it (for example the EEA and the UK), we ask for your consent first, using
                    Google’s consent form. If you tell us you are under 18, or have not told us your age, you only get
                    ads that are not based on your activity (non-personalised ads).
                </li>
                <li>
                    You can reset or delete your advertising ID, or opt out of personalised ads, in your device’s
                    settings.
                </li>
            </ul>
            <p>We do not collect your location, contacts, photos or microphone audio, and we do not sell your data.</p>

            <h2>2. How we use it</h2>
            <ul>
                <li>To create your account, sign you in and keep you signed in.</li>
                <li>To run games in real time, match you with other players and keep your stats and history.</li>
                <li>To power friends, invites and notifications.</li>
                <li>
                    To keep the community safe: filtering offensive chat, enforcing blocks, reviewing reports and
                    preventing abuse.
                </li>
                <li>To fix bugs, prevent fraud and keep the Service running.</li>
            </ul>
            <p>
                Where a legal basis is needed, we rely on performing our agreement with you (running the game), our
                legitimate interest in keeping the Service safe and working, and your consent where we ask for it.
            </p>

            <h2>3. What other players can see</h2>
            <p>
                Your username, profile picture, colour, game results and online status (to friends) are visible to
                other players. Chat and emotes are visible to the players in your room. Blocked players cannot see
                your chat or emotes, cannot find you in search and cannot send you requests or invites.
            </p>

            <h2>4. Service providers</h2>
            <p>We share data only with providers that help us run the Service, under their own privacy terms:</p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Provider</th>
                            <th>What for</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Supabase</td>
                            <td>Sign-in (accounts and login codes) and our database</td>
                        </tr>
                        <tr>
                            <td>Google</td>
                            <td>
                                “Sign in with Google”, if you choose it; usage analytics (Firebase Analytics); ads and the
                                ad consent form (Google AdMob)
                            </td>
                        </tr>
                        <tr>
                            <td>Sentry</td>
                            <td>Crash and error reports</td>
                        </tr>
                        <tr>
                            <td>DigitalOcean</td>
                            <td>Hosting our game servers and this website</td>
                        </tr>
                        <tr>
                            <td>Expo (650 Industries)</td>
                            <td>Delivering app updates</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                We may also disclose information if the law requires it, or to protect the rights and safety of our
                players or others.
            </p>

            <h2>5. How long we keep it</h2>
            <ul>
                <li>Saved accounts: until you delete your account.</li>
                <li>
                    Guest accounts: deleted automatically, with their data, after 30 days without opening the app.
                </li>
                <li>Room chat: only while the room is open (see above).</li>
                <li>Reports: as long as needed to review them and handle repeated abuse.</li>
                <li>Server logs: a short time, for security and debugging.</li>
            </ul>

            <h2 id="your-choices">6. Your choices and rights</h2>
            <ul>
                <li>Change your username, and block or mute other players, inside the app.</li>
                <li>
                    Ask for a copy of your data, a correction, or deletion of your account by writing to {mail}. See{' '}
                    <Link href="/delete-account">how to delete your account</Link>.
                </li>
                <li>
                    Depending on where you live (for example, India’s Digital Personal Data Protection Act, the EU/UK
                    GDPR or Californian law), you may have further rights, such as objecting to processing or
                    complaining to a data protection authority. Contact us and we will help.
                </li>
            </ul>

            <h2>7. Children</h2>
            <p>
                {SITE.name} is meant for players aged 13 and over. We do not knowingly collect personal information
                from children under 13. If you believe a child has given us information, contact us and we will
                delete it. Players under 18 only get non-personalised ads, and the app does not ask them for anything
                beyond what is described above.
            </p>

            <h2>8. Security</h2>
            <p>
                Data is encrypted in transit (HTTPS), access to our systems is restricted, and sign-in tokens are
                verified on every connection. No system is perfectly secure, but we work to protect your information.
            </p>

            <h2>9. International transfers</h2>
            <p>
                Our providers may process data in countries other than yours. Where they do, they use the protections
                their privacy terms describe.
            </p>

            <h2>10. Changes</h2>
            <p>
                If we change this policy, we will update the date above, and for important changes we will let you
                know in the app.
            </p>

            <h2>11. Contact</h2>
            <p>Questions or requests: {mail}.</p>
        </DocPage>
    );
}
