import { statSync } from 'node:fs';
import { join } from 'node:path';
import { getCollection } from 'astro:content';
import { getComponents } from '../../_utils/manifest.js';
import { computePageData, docsRoot, isDev } from './site.js';
import { STATIC_PAGES as STATIC_PAGE_DEFINITIONS } from './static-pages.js';

/**
 * Directory-level front matter defaults (formerly `docs/docs/*.json` directory data files). The most specific
 * matching prefix wins for scalar keys; `tags` accumulate like Eleventy's data cascade.
 */
const DIRECTORY_DATA = [
  { prefix: 'docs/', data: { hasProseContent: true } },
  { prefix: 'docs/ai/', data: { hasBreadcrumbs: true } },
  { prefix: 'docs/utilities/', data: { hasBreadcrumbs: true } },
  { prefix: 'docs/tokens/', data: { hasBreadcrumbs: true, tags: ['tokens'] } },
];

const PERMALINKS = { 404: '/404.html', 503: '/503.html' };

/** The public URL for a content entry id, e.g. `docs/components/button` → `/docs/components/button/`. */
export function urlForId(id) {
  if (PERMALINKS[id]) return PERMALINKS[id];
  if (id === 'index') return '/';
  return '/' + id.replace(/\/index$/, '') + '/';
}

/** Eleventy's `page.fileSlug`: the file name, or the parent directory's name for index files. */
export function fileSlugForId(id) {
  if (id === 'index') return '';
  const parts = id.split('/');
  return parts.at(-1) === 'index' ? parts.at(-2) : parts.at(-1);
}

function applyDirectoryData(id, data) {
  const merged = {};
  const tags = [];
  for (const { prefix, data: defaults } of DIRECTORY_DATA) {
    if (!id.startsWith(prefix)) continue;
    const { tags: defaultTags, ...rest } = defaults;
    Object.assign(merged, rest);
    if (defaultTags) tags.push(...defaultTags);
  }

  const { 'override:tags': overrideTags, tags: ownTags, ...own } = data;
  return {
    ...merged,
    ...own,
    tags: overrideTags ?? [...tags, ...(ownTags ?? [])],
  };
}

function resolvePage({ id, filePath, data: rawData }, components) {
  const url = urlForId(id);
  const fileSlug = fileSlugForId(id);
  const data = applyDirectoryData(id, rawData);
  const isComponentPage = id.startsWith('docs/components/') && !data.eleventyExcludeFromCollections;
  const component = isComponentPage ? components.find(c => c.tagName === `wa-${fileSlug}`) : undefined;

  return {
    id,
    url,
    fileSlug,
    inputPath: `./${filePath}`,
    date: statSync(join(docsRoot, filePath)).birthtime,
    data: { ...data, ...computePageData(data, url), ...(component ? { component } : {}) },
  };
}

let cache;
let staticCache;

/**
 * All docs pages with their resolved data: front matter merged with directory defaults, URLs, the Eleventy-style
 * `page` object, computed Open Graph fields and (for component pages) the component's manifest entry.
 */
export async function getPages() {
  if (cache && !isDev) return cache;

  const components = getComponents();
  const entries = await getCollection('pages');

  cache = entries
    .filter(entry => isDev || !entry.data.unpublished)
    .map(entry => ({
      entry,
      ...resolvePage({ id: entry.id, filePath: entry.filePath, data: entry.data }, components),
    }));

  return cache;
}

/** The hand-written `.astro` pages (see `static-pages.js`), resolved like content pages. */
export function getStaticPages() {
  if (staticCache && !isDev) return staticCache;
  const components = getComponents();
  staticCache = STATIC_PAGE_DEFINITIONS.map(definition => resolvePage(definition, components));
  return staticCache;
}

/** Looks up a hand-written page by its content-style id, e.g. `docs/themes`. */
export function getStaticPage(id) {
  const page = getStaticPages().find(page => page.id === id);
  if (!page) throw new Error(`No static page "${id}" in src/lib/static-pages.js`);
  return page;
}

/** Content pages plus hand-written pages, like Eleventy's `collections.all`. */
export async function getAllPages() {
  return [...(await getPages()), ...getStaticPages()];
}

/** Pages that take part in collections (Eleventy skipped those with `eleventyExcludeFromCollections`). */
export async function getCollectionPages() {
  return (await getAllPages()).filter(page => !page.data.eleventyExcludeFromCollections);
}

export async function getComponentPages() {
  return (await getPages()).filter(
    page => page.id.startsWith('docs/components/') && !page.data.eleventyExcludeFromCollections,
  );
}

export async function getTaggedPages(tag) {
  return (await getCollectionPages()).filter(page => page.data.tags?.includes(tag));
}

const SITEMAP_EXCLUDE_PATTERNS = [
  /^\/admin(\/|$)/,
  /^\/workspaces(\/|$)/,
  /^\/projects(\/|$)/,
  /^\/purchase(\/|$)/,
  /^\/invitations(\/|$)/,
  /^\/patterns(\/|$)/,
  /^\/dev-emails/,
  /\.html$/i,
];

/**
 * Public, indexable URLs in Eleventy's `getAllSorted()` order (date, then input path).
 */
export async function getSitemapEntries() {
  const pages = await getCollectionPages();
  return pages
    .sort((a, b) => a.date - b.date || a.inputPath.localeCompare(b.inputPath))
    .map(page => ({ page, urlPath: String(page.data.ogUrl || page.url || '').replace(/^https?:\/\/[^/]+/, '') }))
    .filter(({ page, urlPath }) => {
      if (!urlPath) return false;
      if (page.data.noindex) return false;
      return !SITEMAP_EXCLUDE_PATTERNS.some(re => re.test(urlPath));
    })
    .map(({ page, urlPath }) => ({
      path: urlPath,
      lastmod: page.date ? page.date.toISOString().split('T')[0] : null,
    }));
}

/**
 * Pages to index for search, with the front matter keywords the HTML doesn't carry.
 */
export async function getSearchablePages() {
  const pages = await getAllPages();
  return pages
    .filter(page => !page.data.unlisted)
    .map(page => {
      const publicUrl = String(page.data.ogUrl || '').replace(/^https?:\/\/[^/]+/, '') || page.url;
      return {
        url: publicUrl,
        outputPath: page.url.endsWith('.html') ? page.url : `${page.url}index.html`,
        synonyms: page.data.synonyms || [],
        useCases: page.data['use-cases'] || [],
        category: page.data.category || '',
      };
    });
}
