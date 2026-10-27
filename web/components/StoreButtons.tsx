import { APP } from '@/lib/site';

function PlayIcon() {
    return (
        <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true">
            <path d="M1 1.2 11.4 11 1 20.8a1.6 1.6 0 0 1-.5-1.2V2.4c0-.5.2-.9.5-1.2Z" fill="#2E86FF" />
            <path d="m14.8 7.6-3.4 3.4L1 1.2c.3-.3.9-.4 1.5-.1l12.3 6.5Z" fill="#14C46B" />
            <path d="M14.8 14.4 2.5 20.9c-.6.3-1.2.2-1.5-.1L11.4 11l3.4 3.4Z" fill="#FF3B4E" />
            <path d="m18.6 9.6-3.8-2-3.4 3.4 3.4 3.4 3.8-2c1.2-.7 1.2-2.1 0-2.8Z" fill="#FFC21A" />
        </svg>
    );
}

function AppleIcon() {
    return (
        <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
            <path
                fill="currentColor"
                d="M14.9 11.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1ZM12.4 4.1c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5Z"
            />
        </svg>
    );
}

/** Store buttons; the App Store one appears once APP.appStore is set. */
export function StoreButtons({ variant = 'light' }: { variant?: 'light' | 'ghost' }) {
    return (
        <div className="store-row">
            <a className={`btn btn-${variant}`} href={APP.playStore} target="_blank" rel="noopener">
                <PlayIcon /> Get it on Google Play
            </a>
            {APP.appStore ? (
                <a className={`btn btn-${variant}`} href={APP.appStore} target="_blank" rel="noopener">
                    <AppleIcon /> Download on the App Store
                </a>
            ) : null}
        </div>
    );
}
