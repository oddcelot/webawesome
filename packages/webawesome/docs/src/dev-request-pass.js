import { statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let renderString;
let loadedVersion = 0;

/**
 * Loads `dist/ssr/render-string.js` and registers every component from `dist/ssr/all.js` (render-string installs
 * Lit's DOM shim, so it has to come first). Both reload whenever a rebuild replaces them.
 */
async function getRenderString(distDir) {
  const ssrDir = join(distDir, 'ssr');
  const version = statSync(join(ssrDir, 'render-string.js')).mtimeMs;
  if (!renderString || version !== loadedVersion) {
    const load = file => import(`${pathToFileURL(join(ssrDir, file)).href}?v=${version}`);
    const mod = await load('render-string.js');
    await load('all.js');
    renderString = mod.renderString;
    loadedVersion = version;
  }
  return renderString;
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim().split('='))
      .filter(([name]) => name)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join('='))]),
  );
}

/**
 * Stands in for the production app in `astro dev`: applies the theme cookies and, with `?ssr` or the
 * `webawesome_ssr` cookie (the header's SSR switch), server renders the components with Lit. Pages are
 * prerendered, so Astro hides the query string and cookies from them; this runs on the HTTP response instead.
 */
export function devRequestPass({ distDir }) {
  return (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const cookies = parseCookies(req.headers.cookie);
    const ssrParam = url.searchParams.get('ssr');
    const ssr = (ssrParam !== null && ssrParam !== 'false' && ssrParam !== '0') || cookies.webawesome_ssr === 'true';
    const theme = cookies.webawesome_theme;
    const hasThemeCookies = theme || cookies.webawesome_brand || cookies.webawesome_palette;
    if (!ssr && !hasThemeCookies) return next();

    // Buffer the response so the finished HTML can be rewritten
    const chunks = [];
    const end = res.end.bind(res);
    const writeHead = res.writeHead.bind(res);
    let head;
    res.writeHead = (...args) => {
      head = args;
      return res;
    };
    res.write = chunk => {
      chunks.push(Buffer.from(chunk));
      return true;
    };
    res.end = async chunk => {
      if (chunk) chunks.push(Buffer.from(chunk));
      let body = Buffer.concat(chunks);
      const headers = head?.find(arg => typeof arg === 'object') ?? {};
      const contentType = String(
        res.getHeader('content-type') ?? headers['content-type'] ?? headers['Content-Type'] ?? '',
      );

      if (contentType.includes('text/html')) {
        let html = body.toString('utf-8');
        html = html.replace(
          'wa-brand- wa-palette- wa-theme-',
          `wa-brand-${cookies.webawesome_brand ?? ''} wa-palette-${cookies.webawesome_palette ?? ''} wa-theme-${theme ?? ''}`,
        );
        if (theme) {
          html = html.replace('href="/dist/styles/themes/default.css"', `href="/dist/styles/themes/${theme}.css"`);
        }
        if (ssr) {
          html = html.replace('class="wa-cloak ', 'class="');
          html = (await getRenderString(distDir))(html);
        }
        body = Buffer.from(html, 'utf-8');
        res.removeHeader('content-length');
        delete headers['content-length'];
        delete headers['Content-Length'];
      }

      if (head) writeHead(...head);
      end(body);
    };
    next();
  };
}
