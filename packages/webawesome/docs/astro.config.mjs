import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import { defineConfig } from 'astro/config';
import remarkDirective from 'remark-directive';
import { docsIntegration } from './src/integration.js';
import { rehypeHeadingIdPlaceholder } from './src/rehype/heading-ids.js';
import { remarkCdnUrls } from './src/remark/cdn-urls.js';
import { remarkCodeMeta } from './src/remark/code-meta.js';
import { remarkContainers } from './src/remark/containers.js';
import { remarkHtmlInlineParagraphs } from './src/remark/html-inline-paragraphs.js';
import { remarkHtmlParagraphs } from './src/remark/html-paragraphs.js';
import { remarkJsxBooleanAttributes } from './src/remark/jsx-boolean-attributes.js';

// Source modules get bundled, so file paths are resolved from here instead of `import.meta.url`.
process.env.WA_DOCS_ROOT = fileURLToPath(new URL('.', import.meta.url));
process.env.UNBUNDLED_DIST_DIRECTORY ??= fileURLToPath(new URL('../dist', import.meta.url));

export default defineConfig({
  srcDir: './src',
  publicDir: './public',
  outDir: process.env.SITE_DIR || '../_site',
  output: 'static',
  trailingSlash: 'ignore',
  compressHTML: false,
  devToolbar: { enabled: false },
  build: { format: 'directory' },
  markdown: {
    // Prism runs as an HTML transformer (see src/lib/html-pipeline.js), same as the Eleventy build did
    syntaxHighlight: false,
    processor: unified({
      // markdown-it ran without typographer, so keep straight quotes and dashes
      smartypants: false,
      remarkPlugins: [
        remarkDirective,
        remarkContainers,
        remarkCodeMeta,
        remarkCdnUrls,
        remarkJsxBooleanAttributes,
        remarkHtmlParagraphs,
        remarkHtmlInlineParagraphs,
      ],
      rehypePlugins: [rehypeHeadingIdPlaceholder],
    }),
  },
  cacheDir: process.env.ASTRO_CACHE_DIR || './node_modules/.astro',
  integrations: [mdx(), docsIntegration()],
});
