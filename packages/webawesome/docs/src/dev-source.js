import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';

/**
 * Whether a request belongs to a page rendered with Lit SSR (`?ssr` or the `webawesome_ssr` cookie). Those keep
 * loading the built `/dist` files, since the server render comes from the build too.
 */
function wantsBuiltFiles(req) {
  const isSsr = value => value !== null && value !== 'false' && value !== '0';
  if (/(^|;\s*)webawesome_ssr=true(;|$)/.test(req.headers.cookie ?? '')) return true;
  for (const url of [req.url, req.headers.referer]) {
    if (!url) continue;
    try {
      if (isSsr(new URL(url, 'http://localhost').searchParams.get('ssr'))) return true;
    } catch {
      // not a URL
    }
  }
  return false;
}

/**
 * Serves the library from source in `astro dev`, so component edits hot-reload through Vite (and the Lit HMR plugin)
 * instead of waiting for a rebuild of dist-cdn.
 *
 * - `/dist/**\/*.js` with a matching `src/**\/*.ts` gets a one-line module that re-exports the source file through
 *   Vite's `/@fs/` URL. The autoloader imports components by computed `.js` URLs while Vite rewrites static imports to
 *   the `.ts` file; re-exporting keeps both on one module instance. `/@fs/…/src/**\/*.js` gets the same treatment.
 * - `/dist/styles/**\/*.css` is served straight from `src/styles`.
 *
 * Anything without a source counterpart (and every request from an SSR page) falls through to the built files.
 */
export function devSourceMount({ srcDir }) {
  const root = normalize(srcDir + sep);
  const fsPrefix = `/@fs${root}`;

  return (req, res, next) => {
    const pathname = decodeURIComponent((req.url || '').split('?')[0]);
    let relative;
    if (pathname.startsWith('/dist/')) relative = pathname.slice('/dist/'.length);
    else if (pathname.startsWith(fsPrefix)) relative = pathname.slice(fsPrefix.length);
    else return next();

    if (wantsBuiltFiles(req)) return next();

    if (relative.endsWith('.js')) {
      const source = normalize(join(root, relative.replace(/\.js$/, '.ts')));
      if (!source.startsWith(root) || !existsSync(source)) return next();

      const target = JSON.stringify(`/@fs${source}`);
      const hasDefault = /^export default\b/m.test(readFileSync(source, 'utf-8'));
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(`export * from ${target};\n${hasDefault ? `export { default } from ${target};\n` : ''}`);
      return;
    }

    if (relative.startsWith('styles/') && relative.endsWith('.css') && pathname.startsWith('/dist/')) {
      const file = normalize(join(root, relative));
      if (!file.startsWith(root) || !existsSync(file)) return next();
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(file));
      return;
    }

    next();
  };
}
