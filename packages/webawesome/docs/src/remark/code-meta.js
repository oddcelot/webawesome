import { visit } from 'unist-util-visit';

/**
 * Applies `{.example .no-edit}`-style fence metadata as classes on the rendered `<code>`, matching what
 * markdown-it-attrs did. The code-examples transformer keys off these classes.
 */
export function remarkCodeMeta() {
  return tree => {
    visit(tree, 'code', node => {
      const match = node.meta?.match(/\{([^}]*)\}/);
      if (!match) return;

      const classes = match[1]
        .split(/\s+/)
        .filter(token => token.startsWith('.'))
        .map(token => token.slice(1));

      if (classes.length === 0) return;

      const language = node.lang ? [`language-${node.lang}`] : [];
      node.data = { ...node.data, hProperties: { className: [...classes, ...language] } };
      // Astro would otherwise copy the raw meta onto the element as a `metastring` attribute
      node.meta = null;
    });
  };
}
