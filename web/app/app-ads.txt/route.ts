/**
 * app-ads.txt (IAB): tells ad buyers which AdMob account may sell this app's ad space. AdMob checks it
 * on the developer website listed in the Play Store. Served only once ADMOB_PUBLISHER_ID ("pub-…",
 * from AdMob → Settings → Account) is set; a wrong file is worse than none.
 */
export function GET() {
    const pub = process.env.ADMOB_PUBLISHER_ID?.trim();
    if (!pub || !/^pub-\d+$/.test(pub)) return new Response('Not found', { status: 404 });
    return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
}
