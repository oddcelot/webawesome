import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import { litPlugin } from '@oddsquad/vite-plugin-lit';
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

/**
 * The library's runtime dependencies, so Vite pre-bundles them up front. Otherwise it discovers them while a page
 * loads the components from source, re-optimizes and reloads mid-flight.
 */
function getLibraryDependencies() {
  const srcDir = fileURLToPath(new URL('../src', import.meta.url));
  const files = globSync('**/*.ts', {
    cwd: srcDir,
    exclude: name => /^(ssr|react|test)$|\.test\.ts$|\.d\.ts$/.test(name),
  });
  const require = createRequire(import.meta.url);
  const specifiers = new Set();
  for (const file of files) {
    const source = readFileSync(`${srcDir}/${file}`, 'utf-8');
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"./][^'"]*)['"]/g)) {
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      // The regex also matches words in comments, so keep only installed packages
      if (!/^(@[\w-]+\/)?[\w][\w.-]*$/.test(name)) continue;
      try {
        require.resolve(specifier);
        specifiers.add(specifier);
      } catch {
        // not an installed package (or not importable from Node, which Vite can't pre-bundle either)
      }
    }
  }
  return [...specifiers].sort((a, b) => a.localeCompare(b));
}

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
  // In dev the library is served from source (src/dev-source.js); this gives its components Lit HMR
  vite: { plugins: [litPlugin()], optimizeDeps: { include: getLibraryDependencies() } },
  cacheDir: process.env.ASTRO_CACHE_DIR || './node_modules/.astro',
  integrations: [mdx(), docsIntegration()],
});
