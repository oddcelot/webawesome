import type { APIRoute } from 'astro';
import { siteMetadata } from '../lib/site.js';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', siteMetadata.url).href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
