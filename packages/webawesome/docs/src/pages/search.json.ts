import type { APIRoute } from 'astro';
import MiniSearch from 'minisearch';
import { getAllPages, getSearchablePages } from '../lib/pages.js';

/**
 * In `astro dev` pages render on request, so there's no finished site to index. This serves an index of titles,
 * descriptions and keywords instead, so search works while developing. Production builds replace the file with
 * the full-text index from src/integration.js.
 */
export const GET: APIRoute = async () => {
  const pages = await getAllPages();
  const searchable = await getSearchablePages();
  const searchIndex = new MiniSearch({ fields: ['t', 'h', 's', 'u', 'c'], storeFields: [] });
  const map = [];

  for (const [id, entry] of searchable.entries()) {
    const page = pages.find(page => page.url === entry.outputPath.replace(/index\.html$/, ''));
    const title = page?.data.title ?? entry.url;
    searchIndex.add({
      id,
      t: title,
      h: [],
      s: entry.synonyms.join(' '),
      u: entry.useCases.join(' '),
      c: page?.data.description ?? '',
    });
    map[id] = {
      title,
      description: page?.data.description ?? '',
      url: entry.url === '/' ? '/' : entry.url.replace(/\/$/, ''),
      category: entry.category,
    };
  }

  return new Response(JSON.stringify({ searchIndex: searchIndex.toJSON(), map }));
};
