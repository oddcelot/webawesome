import type { APIRoute } from 'astro';
import { getSearchablePages } from '../lib/pages.js';

/**
 * Front matter keywords for the search index. The integration reads this after the build, merges it with the
 * rendered HTML into `search.json`, then deletes it.
 */
export const GET: APIRoute = async () => new Response(JSON.stringify(await getSearchablePages()));
