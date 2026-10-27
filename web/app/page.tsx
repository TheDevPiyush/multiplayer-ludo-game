import { PageShell } from '@/components/SiteChrome';
import { StoreButtons } from '@/components/StoreButtons';
import { SITE } from '@/lib/site';

const FEATURES = [
    {
        icon: '🔗',
        tint: '#E6F0FF',
        title: 'Invite with a link',
        text: 'Create a room and share the link. Friends tap it and land straight in your lobby.',
    },
    {
        icon: '⚡',
        tint: '#FFF4D6',
        title: 'Quick Match',
        text: 'One tap finds you an open table and the game starts in seconds.',
    },
    {
        icon: '🤖',
        tint: '#E3F9EE',
        title: 'Offline too',
        text: 'Play the computer on Easy, Medium or Hard, or pass one phone around for 2–4 players.',
    },
    {
        icon: '😄',
        tint: '#FFE5E8',
        title: 'Emotes & chat',
        text: 'Quick emotes and replies pop over your seat. Mute or block anyone in a tap.',
    },
    {
        icon: '👥',
        tint: '#EFE8FF',
        title: 'Friends list',
        text: 'Add friends, see who is online and invite them to an empty seat.',
    },
    {
        icon: '🎲',
        tint: '#E6F0FF',
        title: 'Real 3D dice',
        text: 'Chunky pawns, a tumbling 3D die, sound and haptics on every hop and capture.',
    },
];

export default function Home() {
    return (
        <PageShell>
            <section className="hero">
                <div>
                    <span className="eyebrow">
                        <span className="dots" aria-hidden="true">
                            <i style={{ background: 'var(--red)' }} />
                            <i style={{ background: 'var(--blue)' }} />
                            <i style={{ background: 'var(--green)' }} />
                            <i style={{ background: 'var(--yellow)' }} />
                        </span>
                        Free to play
                    </span>
                    <h1>Ludo night, any night.</h1>
                    <p className="lead">{SITE.description}</p>
                    <StoreButtons />
                </div>
                <div className="hero-art">
                    <img src="/logo-art.svg" alt="A red dice with a yellow and a blue pawn" width={420} height={353} />
                </div>
            </section>

            <h2 className="section-title" id="features">
                Everything a good game night needs
            </h2>
            <div className="features">
                {FEATURES.map(f => (
                    <div className="feature" key={f.title}>
                        <div className="feature-icon" style={{ background: f.tint }} aria-hidden="true">
                            {f.icon}
                        </div>
                        <h3>{f.title}</h3>
                        <p>{f.text}</p>
                    </div>
                ))}
            </div>

            <h2 className="section-title">Start a game in three taps</h2>
            <div className="steps">
                <div className="step">
                    <h3>Create a room</h3>
                    <p>Pick 2, 3 or 4 players, then pick your colour.</p>
                </div>
                <div className="step">
                    <h3>Share the invite</h3>
                    <p>Send the link or the 6-letter code on any chat app.</p>
                </div>
                <div className="step">
                    <h3>Roll!</h3>
                    <p>Once everyone is in, the host starts the game and the dice are yours.</p>
                </div>
            </div>

            <section className="cta">
                <h2>Your squad is waiting</h2>
                <p>Play as a guest straight away, and save your progress whenever you like.</p>
                <StoreButtons />
            </section>
        </PageShell>
    );
}
