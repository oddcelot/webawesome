import packageData from '../../../package.json' with { type: 'json' };
import componentCategories from '../../_data/componentCategories.json' with { type: 'json' };
import faqTopics from '../../_data/faqTopics.json' with { type: 'json' };
import site from '../../_data/site.json' with { type: 'json' };

export { componentCategories, faqTopics, packageData, site };

/** The docs project root (where astro.config.mjs lives). */
export const docsRoot = process.env.WA_DOCS_ROOT;

/** True under `astro dev`. Also imported from astro.config.mjs (remark plugins), where `import.meta.env` isn't set. */
export const isDev = Boolean(import.meta.env?.DEV);

/** Site metadata for social sharing (Open Graph, canonical URLs, etc.) */
export const siteMetadata = {
  url: 'https://webawesome.com',
  name: 'Web Awesome',
  description: 'Build better with Web Awesome, the open source library of web components from Font Awesome.',
  image: 'https://webawesome.com/assets/images/open-graph/default.png',
  imageWidth: 2400,
  imageHeight: 1260,
};

const SITE_TITLE_SUFFIX = new RegExp(`\\s*[|]\\s*${siteMetadata.name}$`);

/** Removes a trailing " | Web Awesome" so search titles stay clean. Keep in sync with `composePageTitle()`. */
export const stripSiteTitleSuffix = title => (title || '').replace(SITE_TITLE_SUFFIX, '');

/** Appends " | Web Awesome" to every title except the site name itself. */
export const composePageTitle = baseTitle => {
  const title = baseTitle || siteMetadata.name;
  return title !== siteMetadata.name ? `${title} | ${siteMetadata.name}` : title;
};

/** The CDN URL for a file in the current release. CodePen examples use the free CDN. */
export const cdnUrl = location =>
  `https://ka-f.webawesome.com/webawesome@${packageData.version}/` + (location || '').replace(/^\//, '');

/** Derives the computed page data (titles, Open Graph) the old `eleventyComputed` block produced. */
export function computePageData(data, url) {
  const ogImage = data.ogImage || siteMetadata.image;
  const raw = data.ogUrl || url || '';
  let ogUrl = siteMetadata.url;
  if (raw) {
    ogUrl = /^https?:\/\//.test(raw) ? raw : `${siteMetadata.url}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }

  return {
    pageTitle: composePageTitle(data.title),
    ogTitle: composePageTitle(data.ogTitle || data.title),
    ogDescription: data.ogDescription || data.description,
    ogImage,
    ogImageWidth: data.ogImageWidth || (ogImage === siteMetadata.image ? siteMetadata.imageWidth : null),
    ogImageHeight: data.ogImageHeight || (ogImage === siteMetadata.image ? siteMetadata.imageHeight : null),
    ogUrl,
    ogType: data.ogType || 'website',
  };
}
