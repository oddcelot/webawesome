import { visit } from 'unist-util-visit';

/**
 * MDX treats `<wa-button disabled>` as `disabled={true}`, which Astro renders as `disabled="true"`. HTML-style
 * boolean attributes are what the docs mean, so give them an empty value instead.
 */
export function remarkJsxBooleanAttributes() {
  return tree => {
    visit(tree, ['mdxJsxFlowElement', 'mdxJsxTextElement'], node => {
      for (const attribute of node.attributes ?? []) {
        if (attribute.type === 'mdxJsxAttribute' && attribute.value === null && /[a-z]/.test(node.name?.[0] ?? '')) {
          attribute.value = '';
        }
      }
    });
  };
}
