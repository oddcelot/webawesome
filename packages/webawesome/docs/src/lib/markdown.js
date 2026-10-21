import { markdown } from './markdown-it.js';

/**
 * Renders markdown strings at build time: manifest text (JSDoc summaries and descriptions) and the snippets some
 * `.astro` pages assemble from data. MDX content goes through the remark pipeline instead.
 */
export const renderMarkdown = content => markdown.render(content || '');
export const renderInlineMarkdown = content => markdown.renderInline(content || '');
