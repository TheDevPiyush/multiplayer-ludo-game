import type { MetadataRoute } from 'next';

import { SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
    return ['', '/privacy', '/terms', '/contact', '/delete-account'].map(path => ({ url: `${SITE.url}${path}` }));
}
