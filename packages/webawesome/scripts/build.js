import { exec, execSync } from 'child_process';
import { mkdir, readFile } from 'fs/promises';
import * as fs from 'node:fs';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { deleteAsync } from 'del';
import getPort, { portNumbers } from 'get-port';
import open from 'open';
import ora from 'ora';
import copy from 'recursive-copy';
import { generateDocs, startDocsDevServer } from './docs.js';
import { generateLlmsTxtFile } from './llms.js';
import { bundleJs, emitDeclarations } from './pack.config.js';
import { formatError, getCdnDir, getDistDir, getRootDir } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

const spinner = ora();

const debugPerf = process.env.DEBUG_PERFORMANCE === '1';
const isDeveloping = process.argv.includes('--develop');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

/**
 * @typedef {Object} BuildOptions
 * @property {Array<string>} [watchedSrcDirectories]
 * @property {(eventName: "change" | "add" | "unlink", filePath: string) => unknown} [beforeWatchEvent]
 * @property {(eventName: "change" | "add" | "unlink", filePath: string) => unknown} [afterWatchEvent]
 * @property {(dir: string) => void} [transformTypes]
 */

/**
 * @param {BuildOptions} [options={}]
 */
export async function build(options = {}) {
  // packageData and version  need to be set within the `build()` function because this file gets imported by the app, which may not have generated its bundled directory yet, so this needs to be "lazily" evaluated.
  const packageData = JSON.parse(await readFile(join(getRootDir(), 'package.json'), 'utf-8'));
  const version = packageData.version;
  console.log(`${chalk.hex('#ef6741')('🦊 Web Awesome')} ${chalk.cyan(`v${version}\n`)}`);
  if (isDeveloping) {
    spinner.info('Development mode');
  }

  if (!options.watchedSrcDirectories) {
    options.watchedSrcDirectories = ['src'];
  }

  const transformTypes = options.transformTypes || (_dir => {});

  /**
   * Runs the full build.
   */
  async function buildAll() {
    const start = Date.now();

    try {
      const steps = [
        cleanup,
        generateManifest,
        generateAllComponentFile,
        generateReactWrappers,
        generateTypes,
        generateStyles,
      ];

      for (const step of steps) {
        if (debugPerf) {
          const stepStart = Date.now();
          await step();
          const elapsedTime = (Date.now() - stepStart) / 1000 + 's';
          spinner.succeed(`${step.name}: ${elapsedTime}`);
        } else {
          await step();
        }
      }

      // copy everything to unbundled before we generate bundles.
      await copy(getCdnDir(), getDistDir(), { overwrite: true });

      await generateBundle();

      // In development, `astro dev` renders the docs on request instead
      if (!isDeveloping) {
        await generateDocs({ spinner });
      }

      // Generate llms.txt (needs CEM, runs before docs)

      if (process.env.SKIP_SLOW_STEPS === 'true') {
        spinner.info('Skipping "llms.txt" generation');
      } else {
        spinner.start('Generating "llms.txt"');
        await generateLlmsTxtFile();
        spinner.succeed();
      }

      const time = (Date.now() - start) / 1000 + 's';
      spinner.succeed(`The build is complete ${chalk.gray(`(finished in ${time})`)}`);
    } catch (err) {
      spinner.fail();
      console.log(chalk.red(`\n${formatError(err)}`));
    }
  }

  /** Empties the dist directory. */
  async function cleanup() {
    spinner.start('Cleaning up dist');

    await deleteAsync(getDistDir());
    await deleteAsync(getCdnDir());
    await mkdir(getDistDir(), { recursive: true });
    await mkdir(getCdnDir(), { recursive: true });

    spinner.succeed();
  }

  /**
   * Analyzes components and generates the custom elements manifest file.
   */
  async function generateManifest() {
    spinner.start('Generating CEM');

    try {
      // Async so it doesn't block the event loop of the docs dev server running in this process
      await execAsync('cem analyze --config "custom-elements-manifest.js"');
    } catch (error) {
      spinner.fail();
      console.error(`\n\n${error.message}`);

      if (!isDeveloping) {
        process.exit(1);
      }
      return;
    }

    spinner.succeed();
  }

  /**
   * Generates React wrappers for all components.
   */
  function generateReactWrappers() {
    // Used by webawesome-app to make re-rendering not miserable with extra React file generation.
    if (process.env.SKIP_SLOW_STEPS === 'true') {
      spinner.info('Skipping React Wrapper generation.');
      return Promise.resolve();
    }

    spinner.start('Generating React wrappers');

    try {
      // need to run  make-react from this directories.
      execSync(`node ${join(__dirname, 'make-react.js')} --outdir "${getCdnDir()}"`, { stdio: 'inherit' });
    } catch (error) {
      console.error(`\n\n${error.message}`);

      if (!isDeveloping) {
        process.exit(1);
      }
    }
    spinner.succeed();

    return Promise.resolve();
  }

  async function generateAllComponentFile() {
    if (process.env.SKIP_SLOW_STEPS === 'true') {
      spinner.info('Skipping "ssr/all.js" file generation.');
      return;
    }

    spinner.start('Generating "ssr/all.js" file');

    try {
      // need to run make-all from this directory.
      await execAsync(`node ${join(__dirname, 'make-all.js')} --outdir "${getCdnDir()}"`);
    } catch (error) {
      spinner.fail();
      console.error(`\n\n${error.message}`);

      if (!isDeveloping) {
        process.exit(1);
      }
      return;
    }
    spinner.succeed();
  }

  /**
   * Copies theme stylesheets to the dist.
   */
  async function generateStyles() {
    spinner.start('Copying stylesheets');

    await copy(join(getRootDir(), 'src/styles'), join(getCdnDir(), 'styles'), { overwrite: true });

    spinner.succeed();

    return Promise.resolve();
  }

  /**
   * Runs TypeScript to generate types.
   */
  async function generateTypes() {
    // Used by webawesome-app to make re-rendering not miserable with extra TS compilations.
    if (process.env.SKIP_SLOW_STEPS === 'true') {
      spinner.info('Skipping type declarations.');
      return Promise.resolve();
    }

    spinner.start('Generating type declarations with Vite+ pack');

    const cwd = process.cwd();
    try {
      if (process.env.ROOT_DIR) {
        process.chdir(process.env.ROOT_DIR);
      }
      const cdnDir = getCdnDir();
      await emitDeclarations({ rootDir: '.', outDir: cdnDir });
      transformTypes(cdnDir);
      process.chdir(cwd);
    } catch (error) {
      process.chdir(cwd);
      if (!isDeveloping) {
        process.exit(1);
      }

      return Promise.reject(error);
    }

    spinner.succeed();

    return Promise.resolve();
  }

  /**
   * Runs Vite+ pack (tsdown) to generate the final dist-cdn (deps bundled) and dist (deps external).
   * Also used to re-bundle in development mode.
   */
  async function generateBundle() {
    spinner.start('Bundling with Vite+ pack');

    try {
      await bundleJs({
        rootDir: process.env.ROOT_DIR || '.',
        version,
        cdnDir: getCdnDir(),
        distDir: getDistDir(),
        isDeveloping,
      });
    } catch (error) {
      spinner.fail();
      console.log(chalk.red(`\n${formatError(error)}`));
      if (!isDeveloping) {
        process.exit(1);
      }
      return;
    }

    spinner.succeed();
  }

  /**
   * The parts of the build the docs dev server needs: the manifest (API tables), the SSR bundle and dist-cdn (served
   * as `/dist` to SSR pages). Type declarations and React wrappers are left out.
   */
  async function buildForDocsDev() {
    await generateManifest();
    await generateAllComponentFile();
    await generateStyles();
    // copy everything to unbundled before we generate bundles.
    await copy(getCdnDir(), getDistDir(), { overwrite: true });
    await generateBundle();
  }

  if (!isDeveloping) {
    await buildAll();
    console.log(); // just a newline for readability
  }

  // Launch the dev server
  if (isDeveloping) {
    const manifestPath = join(getDistDir(), 'custom-elements.json');
    const readManifest = () => (fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf-8') : '');
    const hasPreviousBuild = [
      manifestPath,
      join(getDistDir(), 'ssr/render-string.js'),
      join(getCdnDir(), 'webawesome.ssr-loader.js'),
    ].every(file => fs.existsSync(file));

    // The docs load the library from source, so a previous build is good enough to start with. Without one (a fresh
    // checkout, CI), build what the docs need first.
    if (!hasPreviousBuild) {
      await buildForDocsDev();
    }

    spinner.start('Launching the dev server');

    const preferredPort = Number(process.env.PORT) || 4000;
    const port = await getPort({ port: [preferredPort, ...portNumbers(4000, 4999)] });
    const devServer = await startDocsDevServer({ port });
    const url = devServer.url;

    spinner.succeed();
    console.log(`\nThe dev server is running at ${chalk.cyan(url)}\n`);
    if (!process.argv.includes('--no-open')) {
      void open(url);
    }

    /**
     * Brings the manifest, SSR bundle and dist-cdn up to date in the background. Component edits already reached the
     * browser through Vite HMR, so the page only reloads when the manifest changed (the API tables are built from it).
     */
    let refreshing = Promise.resolve();
    let pending = null;
    const refresh = (changedFiles = []) => {
      pending ??= new Set();
      changedFiles.forEach(file => pending.add(file));
      refreshing = refreshing.then(async () => {
        if (!pending) return;
        const files = [...pending];
        pending = null;

        const start = Date.now();
        const manifestBefore = readManifest();
        try {
          if (typeof options.beforeWatchEvent === 'function') {
            for (const file of files) await options.beforeWatchEvent('change', file);
          }

          const onlyStyles = files.length > 0 && files.every(file => file.endsWith('.css'));
          if (onlyStyles) {
            await generateStyles();
          } else {
            await buildForDocsDev();
          }

          if (typeof options.afterWatchEvent === 'function') {
            for (const file of files) await options.afterWatchEvent('change', file);
          }

          const changedApi = readManifest() !== manifestBefore;
          spinner.info(
            `Updated dist in the background ${chalk.gray(`(${(Date.now() - start) / 1000}s${changedApi ? ', component API changed' : ''})`)}`,
          );
          if (changedApi) {
            devServer.reload();
          }
        } catch (err) {
          console.error(chalk.red(formatError(err)));
        }
      });
      return refreshing;
    };

    if (hasPreviousBuild) {
      spinner.info('Refreshing dist in the background');
      void refresh();
    }

    let debounce;
    const watchEvents = ['change', 'unlink', 'add'];
    options.watchedSrcDirectories.forEach(dir => {
      // src/ssr/all.ts is generated by the refresh itself
      const watcher = chokidar.watch(join(dir, '**', '*.*'), {
        ignoreInitial: true,
        ignored: file => /\.test\.[^/]*$/.test(file) || file.endsWith(join('ssr', 'all.ts')),
      });

      watchEvents.forEach(evt => {
        watcher.on(evt, filename => {
          const changedFile = relative(getRootDir(), filename);
          spinner.info(
            `${{ change: 'File modified', unlink: 'File deleted', add: 'File added' }[evt]} ${chalk.gray(`(${changedFile})`)}`,
          );

          // Batch quick successive saves into one background rebuild
          pending ??= new Set();
          pending.add(filename);
          clearTimeout(debounce);
          debounce = setTimeout(() => void refresh(), 300);
        });
      });
    });
  }

  //
  // Cleanup everything when the process terminates
  //
  function terminate() {
    if (spinner) {
      spinner.stop();
    }

    process.exit();
  }

  process.on('SIGINT', terminate);
  process.on('SIGTERM', terminate);
}

// https://exploringjs.com/nodejs-shell-scripting/ch_nodejs-path.html#detecting-if-module-is-main
// Detects if this was called via node scripts/build.js
function isRunAsMain() {
  if (import.meta.url.startsWith('file:')) {
    // (A)
    const modulePath = fileURLToPath(import.meta.url);
    if (process.argv[1] === modulePath) {
      // (B)
      return true;
    }
  }

  return false;
}

if (isRunAsMain()) {
  await build();
}
