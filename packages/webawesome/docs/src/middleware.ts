import { statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineMiddleware } from 'astro:middleware';
import { transformPage } from './lib/html-pipeline.js';

/** Eleventy-style page URLs always end in a slash (or `.html` for flat files). */
function pageUrl(pathname: string) {
  return pathname.endsWith('/') || pathname.endsWith('.html') ? pathname : `${pathname}/`;
}

let litRenderString: ((html: string) => string) | undefined;
let litRenderStringVersion = 0;

/** Loads `dist/ssr/render-string.js`, reloading it whenever a rebuild replaces it. */
async function getLitRenderString() {
  const file = join(process.env.UNBUNDLED_DIST_DIRECTORY!, 'ssr/render-string.js');
  const version = statSync(file).mtimeMs;
  if (!litRenderString || version !== litRenderStringVersion) {
    const mod = await import(/* @vite-ignore */ `${pathToFileURL(file).href}?v=${version}`);
    litRenderString = mod.renderString;
    litRenderStringVersion = version;
  }
  return litRenderString!;
}

/**
 * Dev-only request pass that stands in for the production app: applies the theme cookies and, when requested
 * with `?ssr` or the `webawesome_ssr` cookie (the header's SSR switch), server renders the components with Lit.
 */
async function devRequestPass(
  html: string,
  request: Request,
  cookies: { get(name: string): { value: string } | undefined },
) {
  const url = new URL(request.url);
  const brand = cookies.get('webawesome_brand')?.value ?? '';
  const palette = cookies.get('webawesome_palette')?.value ?? '';
  const theme = cookies.get('webawesome_theme')?.value;

  html = html.replace(
    'wa-brand- wa-palette- wa-theme-',
    `wa-brand-${brand} wa-palette-${palette} wa-theme-${theme ?? ''}`,
  );
  if (theme) {
    html = html.replace('href="/dist/styles/themes/default.css"', `href="/dist/styles/themes/${theme}.css"`);
  }

  const ssr = url.searchParams.get('ssr') || cookies.get('webawesome_ssr')?.value === 'true';
  if (ssr) {
    html = html.replace('class="wa-cloak ', 'class="');
    html = (await getLitRenderString())(html);
  }

  return html;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  let html = transformPage(await response.text(), pageUrl(context.url.pathname));
  if (import.meta.env.DEV) {
    html = await devRequestPass(html, context.request, context.cookies);
  }

  return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
});
