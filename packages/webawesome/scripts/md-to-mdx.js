/**
 * One-off codemod that converts the docs' Eleventy markdown (markdown-it + Nunjucks) to MDX.
 *
 *   node scripts/md-to-mdx.js [--dry] [files...]
 *
 * Fenced code is left alone except for `{% cdnUrl 'x' %}`, which becomes the `[cdn:x]` token. Everywhere else:
 *
 * - `{# #}` and `<!-- -->` comments become MDX comments
 * - `<style>` and `<script>` bodies are wrapped in template literals so CSS/JS braces survive
 * - void elements are self-closed, bare `{`, `}` and `<` in text are escaped
 * - `[[key]]` becomes `<kbd>`, `==text==` becomes `<mark>`, `<https://…>` autolinks become links
 * - `:::details Title` / `:::pro Title` become `:::details[Title]` / `:::pro[Title]` (remark-directive labels)
 * - `{{ site.* }}`, `{{ statusBadge() }}` and `{% include %}` become expressions and imported components
 * - the `layout` front matter key becomes `pageLayout` (Astro reserves `layout` in MDX)
 *
 * Remaining Nunjucks (loops, conditionals, `set`) is reported and has to be ported by hand.
 */
import { globSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VOID_ELEMENTS = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
];
const FENCE = /^(\s*)(`{3,}|~{3,})/;

const cdnToken = text =>
  text.replace(/\{%-?\s*cdnUrl\s+(['"])(.*?)\1\s*-?%\}/g, (_, _q, location) => `[cdn:${location}]`);

/** Escapes text for use inside a JS template literal. */
const templateLiteral = text => text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

/** `theming/color-palette-viewer.njk` → `ColorPaletteViewer` */
const componentName = include =>
  include
    .replace(/\.njk$/, '')
    .split('/')
    .at(-1)
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const componentPath = include => {
  const dir = include
    .replace(/\.njk$/, '')
    .split('/')
    .slice(0, -1)
    .join('/');
  return `@docs/components/${dir ? dir + '/' : ''}${componentName(include)}.astro`;
};

const sticky = pattern => new RegExp(pattern.source, 'y' + pattern.flags.replace(/[gy]/g, ''));

const PATTERNS = {
  codeSpan: sticky(/(`+)[\s\S]*?[^`]\1(?!`)/),
  htmlComment: sticky(/<!--([\s\S]*?)-->/),
  njkComment: sticky(/\{#([\s\S]*?)#\}/),
  cdn: sticky(/\{%-?\s*cdnUrl\s+(['"])(.*?)\1\s*-?%\}/),
  include: sticky(/\{%-?\s*include\s+(['"])(.*?)\1\s*(?:ignore missing\s*)?-?%\}/),
  importMacro: sticky(/\{%-?\s*from\s+(['"]).*?\1\s+import\s+[\w, ]+-?%\}\n?/),
  statusBadge: sticky(/\{\{-?\s*statusBadge\((['"])(\w+)\1\)\s*-?\}\}/),
  siteLink: sticky(/\[([^\]\n]+)\]\(\{\{\s*(site(?:\.\w+)+)\s*\}\}\)/),
  site: sticky(/\{\{-?\s*(site(?:\.\w+)+)\s*-?\}\}/),
  autolink: sticky(/<(https?:\/\/[^>\s]+)>/),
  rawText: sticky(/<(style|script)\b([^>]*)>([\s\S]*?)<\/\1>/i),
  tagStart: sticky(/<\/?([a-zA-Z][\w-]*)/),
  kbd: sticky(/\[\[([^\]\n]+?)\]\]/),
  mark: sticky(/==(?=\S)([^=\n]+?)(?<=\S)==/),
};

function matchAt(name, text, index) {
  const pattern = PATTERNS[name];
  pattern.lastIndex = index;
  return pattern.exec(text);
}

/**
 * Walks prose (non-fenced markdown) and rewrites it so tags, inline code, comments and raw-text elements are each
 * handled on their own terms. `imports` collects the components and modules the converted text needs.
 */
function convertProse(text, imports) {
  let out = '';
  let i = 0;

  while (i < text.length) {
    let m;

    if (text[i] === '`' && (m = matchAt('codeSpan', text, i))) {
      // Inline code spans are literal in both markdown-it and MDX
      out += cdnToken(m[0]);
    } else if (text[i] === '<' && (m = matchAt('htmlComment', text, i))) {
      out += `{/*${m[1].replace(/\*\//g, '* /')}*/}`;
    } else if (text[i] === '{' && (m = matchAt('njkComment', text, i))) {
      out += `{/*${m[1].replace(/\*\//g, '* /')}*/}`;
    } else if (text[i] === '{' && (m = matchAt('cdn', text, i))) {
      out += `[cdn:${m[2]}]`;
    } else if (text[i] === '{' && (m = matchAt('importMacro', text, i))) {
      // Macros are imported as components instead
    } else if (text[i] === '{' && (m = matchAt('include', text, i))) {
      const name = componentName(m[2]);
      imports.set(name, `import ${name} from '${componentPath(m[2])}';`);
      out += `<${name} />`;
    } else if (text[i] === '{' && (m = matchAt('statusBadge', text, i))) {
      imports.set('StatusBadge', `import StatusBadge from '@docs/components/macros/StatusBadge.astro';`);
      out += `<StatusBadge status="${m[2]}" />`;
    } else if (text[i] === '{' && (m = matchAt('site', text, i))) {
      imports.set('site', `import { site } from '@docs/lib/site.js';`);
      out += `{${m[1]}}`;
    } else if (text[i] === '[' && (m = matchAt('siteLink', text, i))) {
      imports.set('site', `import { site } from '@docs/lib/site.js';`);
      out += `<a href={${m[2]}}>${m[1]}</a>`;
    } else if (text[i] === '[' && (m = matchAt('kbd', text, i))) {
      out += `<kbd>${m[1]}</kbd>`;
    } else if (text[i] === '=' && (m = matchAt('mark', text, i))) {
      out += `<mark>${m[1]}</mark>`;
    } else if (text[i] === '<' && (m = matchAt('autolink', text, i))) {
      out += `[${m[1]}](${m[1]})`;
    } else if (text[i] === '<' && (m = matchAt('rawText', text, i))) {
      // Raw-text elements keep their bodies verbatim inside a template literal
      const [, tag, attrs, body] = m;
      out += body.trim() ? `<${tag}${attrs}>{\`${templateLiteral(body)}\`}</${tag}>` : `<${tag}${attrs}></${tag}>`;
    } else if (text[i] === '<' && (m = matchAt('tagStart', text, i))) {
      // Tags are copied through (quoted attribute values may contain `>`), with void elements self-closed
      let j = i + m[0].length;
      let quote = null;
      while (j < text.length) {
        const ch = text[j];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          break;
        }
        j++;
      }
      let tag = text.slice(i, j + 1);
      if (!tag.startsWith('</') && VOID_ELEMENTS.includes(m[1].toLowerCase()) && !/\/\s*>$/.test(tag)) {
        tag = tag.replace(/\s*>$/, ' />');
      }
      tag = cdnToken(tag).replace(/(["'])\{\{\s*(site(?:\.\w+)+)\s*\}\}\1/g, (_, _q, path) => {
        imports.set('site', `import { site } from '@docs/lib/site.js';`);
        return `{${path}}`;
      });
      out += tag;
      i = j + 1;
      continue;
    } else {
      const ch = text[i];
      out += ch === '{' || ch === '}' ? '\\' + ch : ch === '<' ? '&lt;' : ch;
      i++;
      continue;
    }

    i += m[0].length;
  }

  return out;
}

function convertDirectives(line) {
  return line.replace(/^(\s*:::)(details|pro)\s+(.+?)\s*$/, (_, colons, name, title) => `${colons}${name}[${title}]`);
}

/** Nunjucks the codemod doesn't handle. */
const nunjucksTags = text =>
  [...text.matchAll(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g)]
    .map(match => match[0])
    .filter(tag => !/^\{%-?\s*(cdnUrl|include|from)\b/.test(tag))
    .filter(tag => !/^\{\{-?\s*(site(\.\w+)+|statusBadge\(['"]\w+['"]\))\s*-?\}\}$/.test(tag))
    .map(tag => tag.replace(/\s+/g, ' ').slice(0, 80));

export function convert(source, leftovers = []) {
  const frontMatter = source.match(/^---\n[\s\S]*?\n---\n/);
  const header = frontMatter ? frontMatter[0].replace(/^layout:/m, 'pageLayout:') : '';
  const lines = source.slice(frontMatter ? frontMatter[0].length : 0).split('\n');
  const imports = new Map();

  const chunks = [];
  let prose = [];
  let fence = null;

  const flushProse = () => {
    if (prose.length) {
      leftovers.push(...nunjucksTags(prose.join('\n')));
      chunks.push(convertProse(prose.map(convertDirectives).join('\n'), imports));
    }
    prose = [];
  };

  for (const line of lines) {
    const match = line.match(FENCE);
    if (fence) {
      chunks.push(cdnToken(line));
      if (match && match[2][0] === fence[0] && match[2].length >= fence.length && line.trim() === match[2]) {
        fence = null;
      }
      continue;
    }
    if (match) {
      flushProse();
      fence = match[2];
      chunks.push(cdnToken(line));
      continue;
    }
    prose.push(line);
  }
  flushProse();

  const importBlock = imports.size ? `\n${[...imports.values()].sort((a, b) => a.localeCompare(b)).join('\n')}\n` : '';
  return header + importBlock + chunks.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dry = process.argv.includes('--dry');
  const docsDir = join(import.meta.dirname, '../docs');
  const explicit = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const files = explicit.length
    ? explicit
    : globSync('**/*.md', {
        cwd: docsDir,
        exclude: name => /^(node_modules|_transformers|src|public|assets)$/.test(name),
      }).map(file => join(docsDir, file));

  for (const file of files) {
    const remaining = [];
    const output = convert(readFileSync(file, 'utf-8'), remaining);
    if (remaining.length) {
      console.log(`${file}: ${remaining.length} Nunjucks tag(s) left to port by hand`);
      remaining.forEach(tag => console.log(`    ${tag}`));
    }
    if (!dry) {
      writeFileSync(file, output);
      renameSync(file, file.replace(/\.md$/, '.mdx'));
    }
  }
}
