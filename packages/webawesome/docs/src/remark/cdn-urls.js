import { visit } from 'unist-util-visit';
import { cdnUrl } from '../lib/site.js';

const CDN_TOKEN = /\[cdn:([^\]\s]*)\]/g;

/**
 * Expands `[cdn:path]` tokens to versioned CDN URLs. Runs on code, inline code, text and JSX attribute values
 * before highlighting, so Prism only ever sees the final URL.
 */
export function remarkCdnUrls() {
  return tree => {
    const expand = value => value.replace(CDN_TOKEN, (_, location) => cdnUrl(location));

    visit(tree, node => {
      if (
        (node.type === 'code' || node.type === 'inlineCode' || node.type === 'text') &&
        node.value?.includes('[cdn:')
      ) {
        node.value = expand(node.value);
      }
      if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
        for (const attribute of node.attributes ?? []) {
          if (typeof attribute.value === 'string' && attribute.value.includes('[cdn:')) {
            attribute.value = expand(attribute.value);
          }
        }
      }
    });
  };
}
