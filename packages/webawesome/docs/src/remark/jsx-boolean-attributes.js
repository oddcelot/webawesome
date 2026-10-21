import { visit } from 'unist-util-visit';

// On native elements Astro renders `true` for these as a bare attribute (and drops them when the value is an empty
// string). Custom elements get `="true"` for everything.
const HTML_BOOLEAN_ATTRIBUTES = new Set(
  (
    'allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ' +
    'ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'
  ).split(' '),
);

/**
 * MDX treats `<wa-button pill>` as `pill={true}`, which Astro renders as `pill="true"`. HTML-style boolean
 * attributes are what the docs mean, so give them an empty value instead. Boolean attributes of native elements
 * already render bare and are left alone.
 */
export function remarkJsxBooleanAttributes() {
  return tree => {
    visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], node => {
      if (!/^[a-z]/.test(node.name ?? '')) return;
      const isCustomElement = node.name.includes('-');
      for (const attribute of node.attributes ?? []) {
        if (
          attribute.type === 'mdxJsxAttribute' &&
          attribute.value === null &&
          (isCustomElement || !HTML_BOOLEAN_ATTRIBUTES.has(attribute.name.toLowerCase()))
        ) {
          attribute.value = '';
        }
      }
    });
  };
}
