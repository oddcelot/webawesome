import { parse as HTMLParse } from 'node-html-parser';
import { anchorHeadingsTransformer } from '../../_transformers/anchor-headings.js';
import { changelogListIconsTransformer } from '../../_transformers/changelog-list-icons.js';
import { codeExamplesTransformer } from '../../_transformers/code-examples.js';
import { copyCodeTransformer } from '../../_transformers/copy-code.js';
import { currentLinkTransformer } from '../../_transformers/current-link.js';
import { dynamicSnippetsTransformer } from '../../_transformers/dynamic-snippets.js';
import { highlightCodeTransformer } from '../../_transformers/highlight-code.js';
import { linkifyComponentsTransformer } from '../../_transformers/linkify-components.js';
import { outlineTransformer } from '../../_transformers/outline.js';
import { getComponents } from '../../_utils/manifest.js';
import { HEADING_ID_PLACEHOLDER } from '../rehype/heading-ids.js';
import { packageData } from './site.js';

const githubBadge = (kind, icon) =>
  `<a class="ref-link ref-${kind}" href="https://github.com/shoelace-style/webawesome/${
    { pr: 'pull', issue: 'issues', discuss: 'discussions' }[kind]
  }/$1" target="_blank"><wa-badge variant="neutral" appearance="outlined"><wa-icon slot="start" name="${icon}" variant="regular" aria-hidden="true"></wa-icon>#$1</wa-badge></a>`;

const replacements = [
  { replace: /\[version\]/gs, replaceWith: packageData.version },
  // [pr:1234], [issue:1234] and [discuss:1234] become outlined badge links to GitHub
  { replace: /\[pr:([0-9]+)\]/gs, replaceWith: githubBadge('pr', 'code-pull-request') },
  { replace: /\[issue:([0-9]+)\]/gs, replaceWith: githubBadge('issue', 'circle-dot') },
  { replace: /\[discuss:([0-9]+)\]/gs, replaceWith: githubBadge('discuss', 'comments') },
];

let componentTagNames;

/**
 * Runs the docs' HTML post-processing on a fully rendered page: heading anchors, outlines, current links,
 * live code examples, syntax highlighting, copy buttons, changelog icons, component links, then text
 * replacements. `url` is the page's public path; some transformers mark links relative to it.
 */
export function transformPage(html, url) {
  componentTagNames ??= getComponents()
    .map(c => c.tagName)
    .filter(Boolean);

  html = html.replaceAll(` id="${HEADING_ID_PLACEHOLDER}"`, '');
  const doc = HTMLParse(html, { blockTextElements: { code: true }, comment: true });
  const context = { page: { url } };

  const transformers = [
    anchorHeadingsTransformer({ container: '#content' }),
    outlineTransformer({
      container: '#content',
      target: '#outline-standard',
      selector: 'h2, h3',
      ifEmpty: doc => {
        doc.querySelector('#outline')?.remove();
      },
    }),
    outlineTransformer({
      container: '#content',
      target: '#outline-expandable wa-details',
      selector: 'h2, h3',
      listClass: 'wa-grid wa-gap-xs wa-list-plain',
      linkIcon: 'hashtag',
    }),
    currentLinkTransformer(),
    codeExamplesTransformer(),
    highlightCodeTransformer(),
    dynamicSnippetsTransformer(),
    copyCodeTransformer(),
    changelogListIconsTransformer(),
    linkifyComponentsTransformer(componentTagNames),
  ];

  for (const transformer of transformers) {
    transformer.call(context, doc);
  }

  let output = doc.toString();
  for (const { replace, replaceWith } of replacements) {
    output = output.replace(replace, replaceWith);
  }
  return output;
}
