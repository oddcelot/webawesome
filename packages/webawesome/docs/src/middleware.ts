import { defineMiddleware } from 'astro:middleware';
import { transformPage } from './lib/html-pipeline.js';

/** Eleventy-style page URLs always end in a slash (or `.html` for flat files). */
function pageUrl(pathname: string) {
  return pathname.endsWith('/') || pathname.endsWith('.html') ? pathname : `${pathname}/`;
}

/**
 * Runs the HTML transformers on every rendered page, during prerendering and in `astro dev`. The dev-only theme
 * cookie and `?ssr` handling happens later, on the HTTP response (see src/dev-request-pass.js).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (!response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  const html = transformPage(await response.text(), pageUrl(context.url.pathname));
  return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
});
