import Link from 'next/link';

import { PageShell } from '@/components/SiteChrome';

export default function NotFound() {
    return (
        <PageShell>
            <div className="center-page">
                <div>
                    <img src="/logo-art.svg" alt="" width={160} height={134} style={{ margin: '0 auto' }} />
                    <h1>Rolled off the board</h1>
                    <p className="muted">This page doesn’t exist.</p>
                    <Link className="btn btn-light" href="/" style={{ marginTop: 12 }}>
                        Back home
                    </Link>
                </div>
            </div>
        </PageShell>
    );
}
