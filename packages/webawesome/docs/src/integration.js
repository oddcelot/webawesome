import { createReadStream, existsSync, readFileSync, renameSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAgentSkill } from '../../scripts/agent-skill.js';
import { generateDesignSkill } from '../../scripts/design-skill.js';
import { getCdnDir } from '../../scripts/utils.js';
import { buildSearchIndex } from '../_plugins/search.js';
import { devRequestPass } from './dev-request-pass.js';
import { stripSiteTitleSuffix } from './lib/site.js';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Serves `/dist/*` from `dist-cdn` in dev, the same mount the production build copies into the site. */
function serveDist(server) {
  server.middlewares.use((req, res, next) => {
    const pathname = decodeURIComponent((req.url || '').split('?')[0]);
    if (!pathname.startsWith('/dist/')) return next();

    const root = normalize(getCdnDir() + sep);
    const file = normalize(join(root, pathname.slice('/dist/'.length)));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next();

    res.setHeader('Content-Type', MIME_TYPES[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(file).pipe(res);
  });
}

/**
 * Docs build glue: the `/dist` mount in dev, and the steps that need the finished site (search index, agent and
 * design skills).
 */
export function docsIntegration() {
  return {
    name: 'webawesome-docs',
    hooks: {
      'astro:server:setup': ({ server }) => {
        serveDist(server);
        server.middlewares.use(devRequestPass({ distDir: process.env.UNBUNDLED_DIST_DIRECTORY }));
        // scripts/build.js reloads the browser through this after rebuilding the components
        globalThis.webawesomeDocsViteServer = server;
      },
      'astro:build:done': async ({ dir, logger }) => {
        const siteDir = fileURLToPath(dir);

        // `build.format: 'directory'` turns `503.html.astro` into `503.html/index.html`; the host expects a flat file
        renameSync(join(siteDir, '503.html/index.html'), join(siteDir, '503.html.tmp'));
        rmdirSync(join(siteDir, '503.html'));
        renameSync(join(siteDir, '503.html.tmp'), join(siteDir, '503.html'));

        const metaFile = join(siteDir, 'search-pages.json');
        const pages = JSON.parse(readFileSync(metaFile, 'utf-8'));
        rmSync(metaFile);

        await buildSearchIndex({
          siteDir,
          pages,
          selectorsToIgnore: ['code.example'],
          // Use <title> but strip a trailing site name suffix for cleaner search results
          getTitle: doc => stripSiteTitleSuffix(doc.querySelector('title')?.textContent ?? ''),
          getContent: doc => doc.querySelector('#content')?.textContent ?? '',
        });
        logger.info(`Indexed ${pages.length} pages for search`);

        if (process.env.SKIP_SLOW_STEPS !== 'true') {
          await generateAgentSkill({ siteDir });
          await generateDesignSkill();
        }
      },
    },
  };
}
