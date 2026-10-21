import type { APIRoute } from 'astro';
import { getSitemapEntries } from '../lib/pages.js';
import { siteMetadata } from '../lib/site.js';

export const GET: APIRoute = async () => {
  const entries = await getSitemapEntries();
  const urls = entries
    .map(
      entry => `  <url>
    <loc>${new URL(entry.path, siteMetadata.url).href}</loc>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''}
  </url>`,
    )
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
