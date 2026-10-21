import fs, { mkdirSync } from 'fs';
import path from 'path';
// Generates a /src/ssr/all.js endpoint for easily grabbing all components on a server for SSR
import commandLineArgs from 'command-line-args';
import { deleteSync } from 'del';
import { getAllComponents } from './shared.js';

const { outdir } = commandLineArgs({ name: 'outdir', type: String });

import { execFileSync } from 'child_process';

const allFile = path.join(process.env.ROOT_DIR || '.', 'src', 'ssr', 'all.ts');

// Clear build directory
deleteSync(allFile);
mkdirSync(path.dirname(allFile), { recursive: true });

// Fetch component metadata
const metadata = JSON.parse(fs.readFileSync(path.join(outdir, 'custom-elements.json'), 'utf8'));
const components = getAllComponents(metadata);

const index = [];
components.sort((a, b) => a.tagName.localeCompare(b.tagName));

for (const component of components) {
  if (!component.tagName) {
    continue;
  }
  const tagWithoutPrefix = component.tagName.replace(/^wa-/, '');

  index.push(
    `export { default as ${component.name} } from '../components/${tagWithoutPrefix}/${tagWithoutPrefix}.js';`,
  );
}

const preamble = `// This file is auto-generated. Do not edit it directly.`;
const text = preamble + '\n' + index.join('\n') + '\n';

fs.writeFileSync(allFile, text, 'utf8');

// Format with Vite+ (config comes from the root vite.config.ts `fmt` block)
execFileSync('vp', ['fmt', allFile], { stdio: 'inherit', env: process.env });
