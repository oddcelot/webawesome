import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import chokidar from 'chokidar';
// @ts-expect-error used for SSR cookies
import cookieParser from 'cookie-parser';
import { createServer } from 'vite';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
};

const VITE_CLIENT_TAG = '<script type="module" src="/@vite/client"></script>';

/** Resolves a request path to a file inside one of the roots, or null. */
async function resolveFile(roots, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  for (const { prefix, dir } of roots) {
    if (!decoded.startsWith(prefix)) continue;
    const rel = normalize(decoded.slice(prefix.length));
    const base = normalize(dir + sep);
    let candidate = join(dir, rel);
    if (!(candidate + sep).startsWith(base)) continue; // path traversal guard
    try {
      let info = await stat(candidate);
      if (info.isDirectory()) {
        candidate = join(candidate, 'index.html');
        info = await stat(candidate);
      }
      if (info.isFile()) return { file: candidate, size: info.size };
    } catch {
      // try next root
    }
  }
  return null;
}

/**
 * Starts a Vite dev server that serves the prebuilt static site.
 * Vite is only used as the HTTP server / websocket layer (for full-page reloads); the site files are served untouched
 * by the middleware below, so Vite never transforms them.
 *
 * @param {Object} options
 * @param {number} options.port
 * @param {string} options.siteDir Directory with the generated site.
 * @param {string} options.cdnDir Directory served under /dist/.
 * @param {(html: string, req: any) => string} options.transformHtml Runs on every HTML response.
 * @param {boolean} [options.open]
 */
export async function startDevServer({ port, siteDir, cdnDir, transformHtml, open = true }) {
  const roots = [
    { prefix: '/dist/', dir: cdnDir },
    { prefix: '/', dir: siteDir },
  ];
  const watchers = [];

  const staticSite = {
    name: 'webawesome-static-site',
    configureServer(server) {
      // Registered directly (not returned) so it runs before Vite's own transform / fallback middlewares.
      server.middlewares.use(cookieParser());
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          if (
            url.pathname.startsWith('/@vite/') ||
            url.pathname.startsWith('/@id/') ||
            url.pathname.startsWith('/@fs/')
          ) {
            next(); // Vite's client
            return;
          }

          req.query = Object.fromEntries(url.searchParams);
          const found = await resolveFile(roots, url.pathname);

          if (!found) {
            res.statusCode = 404;
            if (url.pathname.toLowerCase().endsWith('.svg')) {
              // Make sure SVGs error out in dev instead of serving the 404 page
              res.end();
              return;
            }
            try {
              const notFound = await readFile(join(siteDir, '404.html'), 'utf-8');
              res.setHeader('Content-Type', MIME_TYPES['.html']);
              res.end(transformHtml(notFound, req) || 'Page Not Found');
            } catch {
              res.end('Page Not Found');
            }
            return;
          }

          const ext = extname(found.file).toLowerCase();
          res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-cache');

          if (ext === '.html') {
            let html = await readFile(found.file, 'utf-8');
            html = transformHtml(html, req);
            // The prebuilt HTML has no Vite client, so inject it to get full-reload messages.
            html = html.includes('</body>')
              ? html.replace('</body>', `${VITE_CLIENT_TAG}</body>`)
              : html + VITE_CLIENT_TAG;
            res.end(html);
            return;
          }

          res.setHeader('Content-Length', found.size);
          createReadStream(found.file)
            .on('error', () => res.end())
            .pipe(res);
        } catch (err) {
          next(err);
        }
      });
    },
  };

  const server = await createServer({
    root: siteDir,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    clearScreen: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      port,
      strictPort: true,
      open: false, // opened by the caller once the banner is printed
      watch: null, // we run our own watchers; don't let Vite react to _site / dist changes
      hmr: { overlay: false },
    },
    plugins: [staticSite],
  });

  await server.listen();
  const url = `http://localhost:${port}/`;

  return {
    url,
    /** Full-page reload in every connected browser. */
    reload() {
      server.ws.send({ type: 'full-reload', path: '*' });
    },
    /** Watches a glob (or directory glob) and returns the chokidar watcher. */
    watch(glob, opts = {}) {
      const watcher = chokidar.watch(glob, { ignoreInitial: true, ...opts });
      watchers.push(watcher);
      return watcher;
    },
    async close() {
      await Promise.all(watchers.map(w => w.close()));
      await server.close();
    },
  };
}
