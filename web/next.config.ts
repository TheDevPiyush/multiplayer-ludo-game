import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // A self-contained server in .next/standalone, for the Docker image.
    output: 'standalone',
    poweredByHeader: false,
    async redirects() {
        // Older builds share /join/<code>; the invite page lives at /invite/<code>.
        return [{ source: '/join/:code', destination: '/invite/:code', permanent: true }];
    },
};

export default nextConfig;
