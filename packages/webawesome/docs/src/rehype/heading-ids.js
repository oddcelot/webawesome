import { visit } from 'unist-util-visit';

/** Placeholder id stripped again by the HTML pipeline (src/lib/html-pipeline.js). */
export const HEADING_ID_PLACEHOLDER = '__wa-heading-id__';

/**
 * Astro gives every markdown heading a github-slugger id, but the docs' anchor transformer generates its own
 * (e.g. "Start & End" → `start-and-end`) and keeps whatever id is already there. Astro skips headings that
 * already have an id, so headings without an authored id get a placeholder the pipeline removes.
 */
export function rehypeHeadingIdPlaceholder() {
  return tree => {
    visit(tree, 'element', node => {
      if (/^h[1-6]$/.test(node.tagName) && !node.properties?.id) {
        node.properties = { ...node.properties, id: HEADING_ID_PLACEHOLDER };
      }
    });
  };
}
