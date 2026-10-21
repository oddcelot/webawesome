import { markdown } from '../../_utils/markdown.js';

/** Renders markdown authored in the custom elements manifest (JSDoc summaries and descriptions). */
export const renderMarkdown = content => markdown.render(content || '');
export const renderInlineMarkdown = content => markdown.renderInline(content || '');
