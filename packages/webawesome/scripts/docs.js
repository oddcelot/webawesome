import { join } from 'path';
import { build as astroBuild, dev as astroDev } from 'astro';
import chalk from 'chalk';
import { deleteAsync } from 'del';
import copy from 'recursive-copy';
import { formatError, getCdnDir, getDocsDir, getSiteDir } from './utils.js';

/**
 * Builds the docs site with Astro into the site directory, then copies the CDN build to `/dist` so the site is
 * self-contained.
 */
export async function generateDocs(options = {}) {
  const { spinner } = options;

  // Used by the webawesome-app to skip doc generation since it does its own.
  if (process.env.SKIP_DOCS === 'true') {
    return;
  }

  spinner?.start?.('Writing the docs');
  const start = Date.now();

  try {
    await deleteAsync(getSiteDir(), { force: true });
    await astroBuild({ root: getDocsDir(), outDir: getSiteDir(), mode: 'production', logLevel: 'warn' });
    await copy(getCdnDir(), join(getSiteDir(), 'dist'), { overwrite: true });

    const output = chalk.gray(`(${(Date.now() - start) / 1000}s)`);
    if (spinner) {
      spinner.succeed(`Writing the docs ${output}`);
    } else {
      console.log(`Writing the docs ${output}`);
    }
  } catch (error) {
    console.error('\n\n' + chalk.red(formatError(error)) + '\n');
    spinner?.fail?.(chalk.red('Error while writing the docs.'));
    process.exit(1);
  }
}

/**
 * Starts `astro dev` for the docs. Pages render on request, so docs edits only need the browser to reload; the
 * returned `reload()` is for changes Astro can't see, like a rebuilt `dist-cdn`.
 *
 * @param {Object} options
 * @param {number} options.port
 */
export async function startDocsDevServer({ port }) {
  const server = await astroDev({ root: getDocsDir(), server: { port }, logLevel: 'warn' });

  return {
    url: `http://localhost:${server.address.port}/`,
    reload() {
      globalThis.webawesomeDocsViteServer?.ws.send({ type: 'full-reload', path: '*' });
    },
    stop: () => server.stop(),
  };
}
