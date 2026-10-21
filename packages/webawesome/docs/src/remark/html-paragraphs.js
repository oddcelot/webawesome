import { visit } from 'unist-util-visit';

/**
 * markdown-it passes raw HTML blocks through untouched until the next blank line, but MDX parses the children of
 * an HTML element as markdown and wraps loose text in `<p>`. This unwraps paragraphs that sit directly against
 * their parent tag or sibling (no blank line between), which is the case markdown-it would have left alone.
 */
export function remarkHtmlParagraphs() {
  return (tree, file) => {
    const lines = String(file.value).split('\n');
    const isBlank = line => (lines[line - 1] ?? '').trim() === '';

    visit(tree, 'mdxJsxFlowElement', node => {
      if (!/^[a-z]/.test(node.name ?? '')) return;

      node.children = node.children.flatMap((child, index) => {
        if (child.type !== 'paragraph' || !child.position) return [child];

        const previousEnd = index === 0 ? node.position.start.line : node.children[index - 1].position?.end.line;
        const nextStart =
          index === node.children.length - 1 ? node.position.end.line : node.children[index + 1].position?.start.line;
        const separatedBefore =
          previousEnd !== undefined &&
          isBlank(child.position.start.line - 1) &&
          previousEnd < child.position.start.line - 1;
        const separatedAfter =
          nextStart !== undefined && isBlank(child.position.end.line + 1) && nextStart > child.position.end.line + 1;

        return separatedBefore || separatedAfter ? [child] : child.children;
      });
    });
  };
}
