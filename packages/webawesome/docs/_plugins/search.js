import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import MiniSearch from 'minisearch';
import { parse } from 'node-html-parser';

function collapseWhitespace(string) {
  return string.replace(/\s+/g, ' ');
}

/** Strips trailing slashes so search results show clean URLs (`/docs/components/button/` → `/docs/components/button`). */
function normalizeDisplayUrl(url) {
  if (!url || url === '/') return '/';
  return (
    url
      .replace(/\/index\.html$/i, '')
      .replace(/\.html$/i, '')
      .replace(/\/$/, '') || '/'
  );
}

/**
 * Builds the MiniSearch index (`search.json`) from the rendered pages in `siteDir`.
 *
 * @param {Object} options
 * @param {string} options.siteDir - The built site.
 * @param {Array<{ url: string, outputPath: string, synonyms?: string[], useCases?: string[], category?: string }>} options.pages
 *   The pages to index, with the front matter keywords that aren't in the HTML.
 * @param {string[]} [options.selectorsToIgnore] - Elements to drop before indexing.
 * @param {(doc: any) => string} [options.getTitle]
 * @param {(doc: any) => string} [options.getContent]
 */
export async function buildSearchIndex(options) {
  const {
    siteDir,
    pages,
    selectorsToIgnore = [],
    getTitle = doc => doc.querySelector('title')?.textContent ?? '',
    getDescription = doc => doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    getHeadings = doc => [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(heading => heading.textContent ?? ''),
    getContent = doc => doc.querySelector('body')?.textContent ?? '',
  } = options;

  const searchIndex = new MiniSearch({
    fields: ['t', 'h', 's', 'u', 'c'],
    storeFields: [],
  });
  const map = [];

  for (const [index, page] of pages.entries()) {
    const html = await readFile(join(siteDir, page.outputPath), 'utf-8');
    const doc = parse(html, {
      blockTextElements: { script: false, noscript: false, style: false, pre: false, code: false },
    });

    // Remove content that shouldn't be searchable to reduce the index size
    selectorsToIgnore.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });

    const title = collapseWhitespace(getTitle(doc));
    searchIndex.add({
      id: index,
      t: title,
      h: getHeadings(doc).map(collapseWhitespace),
      s: (page.synonyms || []).join(' '),
      u: (page.useCases || []).join(' '),
      c: collapseWhitespace(getContent(doc)),
    });
    map[index] = {
      title,
      description: collapseWhitespace(getDescription(doc)),
      url: normalizeDisplayUrl(page.url),
      category: page.category || '',
    };
  }

  await writeFile(join(siteDir, 'search.json'), JSON.stringify({ searchIndex: searchIndex.toJSON(), map }), 'utf-8');
}
