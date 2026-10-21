import { visit } from 'unist-util-visit';

// CommonMark HTML block types 1 and 6: these tags start an HTML block wherever they appear on a line
const BLOCK_TAGS = new Set(
  (
    'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl ' +
    'dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend ' +
    'li link main menu menuitem nav noframes ol optgroup option p param pre script search section style summary ' +
    'table tbody td textarea tfoot th thead title tr track ul'
  ).split(' '),
);

const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem', 'containerDirective', 'mdxJsxFlowElement']);
const PHRASING = new Set([
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'link',
  'image',
  'break',
  'mdxJsxTextElement',
  'mdxTextExpression',
]);

/**
 * markdown-it only treats a line of HTML as an HTML block when it starts with a block-level tag, or when the line
 * is nothing but a single opening or closing tag. Anything else (`<small><time>…</time></small>`,
 * `<wa-divider></wa-divider>`) starts a paragraph. MDX treats every tag on its own line as a block, so this
 * rewraps those elements in a paragraph the way markdown-it rendered them.
 */
export function remarkHtmlInlineParagraphs() {
  return (tree, file) => {
    const source = String(file.value);
    const lines = source.split('\n');

    visit(tree, 'mdxJsxFlowElement', (node, index, parent) => {
      if (!parent || !FLOW_PARENTS.has(parent.type) || !node.name || !/^[a-z]/.test(node.name)) return;
      if (BLOCK_TAGS.has(node.name.toLowerCase())) return;

      // markdown-it only starts a new block after a blank line (or at the start of a container); otherwise the
      // line belongs to the preceding HTML block and stays raw
      const previousLine = lines[node.position.start.line - 2];
      const startsContainer = index === 0 && parent.type !== 'root' && parent.type !== 'mdxJsxFlowElement';
      if (previousLine !== undefined && previousLine.trim() !== '' && !startsContainer) return;

      // Type 7: the line holds only a complete opening (or closing) tag
      const start = node.position.start.offset;
      const lineEnd = source.indexOf('\n', start);
      const firstLine = source.slice(start, lineEnd === -1 ? undefined : lineEnd);
      if (/^<[a-zA-Z][\w-]*(\s+[^>]*)?>\s*$/.test(firstLine)) return;

      // Only phrasing content can move into a paragraph
      const children = node.children.flatMap(child => (child.type === 'paragraph' ? child.children : [child]));
      if (!children.every(child => PHRASING.has(child.type))) return;

      parent.children[index] = {
        type: 'paragraph',
        position: node.position,
        children: [{ ...node, type: 'mdxJsxTextElement', children }],
      };
    });
  };
}
