import { execSync } from 'child_process';
import { mkdir, readFile } from 'fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dirname, join, posix, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { deleteAsync } from 'del';
import getPort, { portNumbers } from 'get-port';
import open from 'open';
import ora from 'ora';
import copy from 'recursive-copy';
import { SimulateWebAwesomeApp } from '../docs/_utils/simulate-webawesome-app.js';
import { startDevServer } from './dev-server.js';
import { generateDocs } from './docs.js';
import { generateLlmsTxtFile } from './llms.js';
import { bundleJs, emitDeclarations } from './pack.config.js';
import { formatError, getCdnDir, getDistDir, getDocsDir, getRootDir, getSiteDir } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let litRenderString = str => str;

const currentYear = new Date().getFullYear();
const spinner = ora();

const debugPerf = process.env.DEBUG_PERFORMANCE === '1';
const isDeveloping = process.argv.includes('--develop');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

/**
 * @typedef {Object} BuildOptions
 * @property {Array<string>} [watchedSrcDirectories]
 * @property {Array<string>} [watchedDocsDirectories]
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

  if (!options.watchedDocsDirectories) {
    options.watchedDocsDirectories = [getDocsDir()];
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
      await generateDocs({ spinner });

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

      // update the lit-render-string in case it changed
      const mod = await import(path.join(getDistDir(), `ssr/render-string.js?cachebust=${new Date().getTime()}`));
      litRenderString = mod.renderString;
    } catch (err) {
      spinner.fail();
      console.log(chalk.red(`\n${err}`));
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
  function generateManifest() {
    spinner.start('Generating CEM');

    try {
      execSync('cem analyze --config "custom-elements-manifest.js"');
    } catch (error) {
      console.error(`\n\n${error.message}`);

      if (!isDeveloping) {
        process.exit(1);
      }
    }

    spinner.succeed();
    return Promise.resolve();
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

  function generateAllComponentFile() {
    if (process.env.SKIP_SLOW_STEPS === 'true') {
      spinner.info('Skipping "ssr/all.js" file generation.');
      return Promise.resolve();
    }

    spinner.start('Generating "ssr/all.js" file');

    try {
      // need to run make-all from this directory.
      execSync(`node ${join(__dirname, 'make-all.js')} --outdir "${getCdnDir()}"`, { stdio: 'inherit' });
    } catch (error) {
      console.error(`\n\n${error.message}`);

      if (!isDeveloping) {
        process.exit(1);
      }
    }
    spinner.succeed();

    return Promise.resolve();
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
      console.log(chalk.red(`\n${error}`));
      if (!isDeveloping) {
        process.exit(1);
      }
      return;
    }

    spinner.succeed();
  }

  /**
   * Rebuilds the source files in development mode.
   */
  const regenerateBundle = generateBundle;

  // Initial build
  await buildAll();

  if (!isDeveloping) {
    console.log(); // just a newline for readability
  }

  // Launch the dev server
  if (isDeveloping) {
    spinner.start('Launching the dev server');

    const port = await getPort({ port: portNumbers(4000, 4999) });

    await initLitSsr();

    const devServer = await startDevServer({
      port,
      siteDir: getSiteDir(),
      cdnDir: getCdnDir(),
      // A second nunjucks pass (simulating the webawesome-app), then optional SSR
      transformHtml: (html, req) => {
        const ssr = req?.query?.ssr || req?.cookies?.webawesome_ssr === 'true';
        let transformedStr = SimulateWebAwesomeApp(html, {
          isDev: process.env.NODE_ENV === 'development',
          NODE_ENV: process.env.NODE_ENV,
          ssr,
          req,
        });

        if (ssr) {
          transformedStr = litRenderString(transformedStr);
        }

        return transformedStr;
      },
    });
    const url = devServer.url;
    const reload = () => {
      spinner.start('Reloading browser');
      devServer.reload();
      spinner.succeed();
    };

    spinner.succeed();
    console.log(`\nThe dev server is running at ${chalk.cyan(url)}\n`);
    open(url);

    const watchEvents = ['change', 'unlink', 'add'];
    // Rebuild and reload when source files change
    options.watchedSrcDirectories.forEach(dir => {
      const watcher = devServer.watch(join(dir, '**', '*.*'), { ignored: /\.test\.[^/]*$/ });

      watchEvents.forEach(evt => {
        watcher.on(evt, handleWatchEvent(evt));
      });
      function handleWatchEvent(evt) {
        return async filename => {
          const changedFile = relative(getRootDir(), filename);

          if (evt === 'change') {
            spinner.info(`File modified ${chalk.gray(`(${changedFile})`)}`);
          } else if (evt === 'unlink') {
            spinner.info(`File deleted ${chalk.gray(`(${changedFile})`)}`);
          } else if (evt === 'add') {
            spinner.info(`File added ${chalk.gray(`(${changedFile})`)}`);
          }

          try {
            const isTestFile = filename.includes('.test.ts');
            const isCssStylesheet = filename.includes('.css');
            const isComponent =
              filename.includes('components/') && filename.includes('.ts') && !isCssStylesheet && !isTestFile;

            // Re-bundle when relevant files change
            if (isTestFile) {
              return;
            }

            if (typeof options.beforeWatchEvent === 'function') {
              await options.beforeWatchEvent(evt, filename);
            }

            // Copy stylesheets when CSS files change
            if (isCssStylesheet) {
              await generateStyles();
            }

            // Regenerate metadata when components change
            if (isComponent) {
              await generateManifest();
            }

            // copy everything to unbundled before we generate bundles.
            // this may cause watcher events to break. if things are broken with file watching, comment this out.
            await copy(getCdnDir(), getDistDir(), { overwrite: true });
            await regenerateBundle();
            await initLitSsr(); // Reload components SSR definitions.

            // This needs to be outside of "isComponent" check because SSR needs to run on CSS files too.
            await generateDocs({ spinner });

            if (typeof options.afterWatchEvent === 'function') {
              await options.afterWatchEvent(evt, filename);
            }

            reload();
          } catch (err) {
            console.error(chalk.red(formatError(err)));

            if (!isDeveloping) {
              process.exit(1);
            }
          }
        };
      }
    });

    // Rebuild the docs and reload when the docs change
    options.watchedDocsDirectories.forEach(dir => {
      const watcher = devServer.watch(join(dir, '**', '*.*'));

      watchEvents.forEach(evt => {
        watcher.on(evt, handleWatchEvent(evt));
      });

      function handleWatchEvent(evt) {
        return async filename => {
          const changedFile = relative(getRootDir(), filename);

          let message = '';
          if (evt === 'change') {
            message = chalk.blue(`File modified ${chalk.gray(`(${changedFile})`)}`);
          } else if (evt === 'unlink') {
            message = chalk.red(`File deleted ${chalk.gray(`(${changedFile})`)}`);
          } else if (evt === 'add') {
            message = chalk.green(`File added ${chalk.gray(`(${changedFile})`)}`);
          }

          if (message) {
            if (spinner) {
              spinner.info(message);
            } else {
              console.log(message);
            }
          }

          if (typeof options.beforeWatchEvent === 'function') {
            await options.beforeWatchEvent(evt, filename);
          }
          await generateDocs({ spinner });

          if (typeof options.afterWatchEvent === 'function') {
            await options.afterWatchEvent(evt, filename);
          }
          reload();
        };
      }
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

async function loadComponents() {
  const baseDir = path.join(getDistDir(), 'components');
  await Promise.allSettled(
    fs.readdirSync(baseDir, { recursive: false, encoding: 'utf8' }).map(dir => {
      const component = path.basename(dir);

      const modulePath = path.join(baseDir, component, component + '.js');

      return import(modulePath + `?cachebust=${new Date().getTime()}`);
    }),
  );
}

export async function initLitSsr() {
  await loadComponents();
}

if (isRunAsMain()) {
  await build();
}
