import { EmailCodeScreen } from './(login)/otp';

/** A guest saving their progress with an email (same screen as email sign-in, in link mode). */
export default function SaveProgressScreen() {
    return <EmailCodeScreen mode="link" />;
}
