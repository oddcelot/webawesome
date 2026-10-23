import Eleventy from '@11ty/eleventy';

import copy from 'recursive-copy';

import chalk from 'chalk';
import { deleteAsync } from 'del';
import { existsSync } from 'fs';
import { join } from 'path';
import { getComponents } from '../docs/_utils/manifest.js';
import { formatError, getCdnDir, getDocsDir, getEleventyConfigPath, getSiteDir } from './utils.js';

let eleventyBuildResolver;
let eleventyBuildPromise;
let isEleventyBuilding = false;
let lastEleventyBuildStart = 0;

function startBuild() {
  if (isEleventyBuilding) return;
  isEleventyBuilding = true;
  lastEleventyBuildStart = Date.now();
  eleventyBuildPromise = new Promise(resolve => {
    eleventyBuildResolver = resolve;
  });
}

function finishBuild() {
  isEleventyBuilding = false;
  eleventyBuildResolver?.();
}

/**
 * Waits for an 11ty watch build that started after `since`. 11ty debounces file changes, so give it a moment to start
 * before assuming nothing needed rebuilding.
 */
async function waitForEleventyBuild(since, settleMs = 1000) {
  while (true) {
    if (isEleventyBuilding) {
      await eleventyBuildPromise;
      continue;
    }

    if (lastEleventyBuildStart >= since || Date.now() - since > settleMs) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

// Component fields that also show up on other pages, like the sidebar and the component index
const SHARED_COMPONENT_FIELDS = ['tagName', 'status', 'summary', 'since', 'title'];
let componentSnapshot;

function snapshotComponents() {
  return new Map(getComponents().map(component => [component.tagName, component]));
}

/** Returns the component page to rebuild when a manifest change only affects that page. */
function getScopedComponentPage() {
  const previous = componentSnapshot;
  componentSnapshot = snapshotComponents();

  if (!previous || previous.size !== componentSnapshot.size) return;

  const changed = [...componentSnapshot].filter(
    ([tagName, component]) => JSON.stringify(component) !== JSON.stringify(previous.get(tagName)),
  );
  if (changed.length !== 1) return;

  const [tagName, component] = changed[0];
  const before = previous.get(tagName);
  if (!before || SHARED_COMPONENT_FIELDS.some(field => component[field] !== before[field])) return;

  const page = join(getDocsDir(), 'docs/components', `${tagName.replace(/^wa-/, '')}.md`);
  return existsSync(page) ? page : undefined;
}

// 11ty
export async function createEleventy(options = {}) {
  let { isIncremental, isDeveloping, rootDir } = options;

  isDeveloping ??= process.argv.includes('--develop');
  isIncremental ??= isDeveloping && !process.argv.includes('--no-incremental');

  const eleventy = new Eleventy(rootDir || getDocsDir(), getSiteDir(), {
    quietMode: true,
    configPath: getEleventyConfigPath(),
    config: eleventyConfig => {
      if (isDeveloping || isIncremental) {
        eleventyConfig.setUseTemplateCache(false);

        eleventyConfig.on('eleventy.beforeWatch', async function (changedFiles) {
          startBuild();

          if (isIncremental && changedFiles.some(file => file.endsWith('custom-elements.json'))) {
            const page = getScopedComponentPage();
            if (page && changedFiles.length === 1) {
              eleventy.setIncrementalFile(page);
            }
          }
        });
      }
    },
    source: 'script',
    runMode: isIncremental ? 'watch' : 'build',
  });
  eleventy.setIncrementalBuild(isIncremental);

  // 11ty logs the build summary after the "eleventy.after" listeners, so track the whole build
  const executeBuild = eleventy.executeBuild.bind(eleventy);
  eleventy.executeBuild = async (...args) => {
    startBuild();
    try {
      return await executeBuild(...args);
    } finally {
      finishBuild();
    }
  };

  await eleventy.init();

  eleventy.logger.isChalkEnabled = false;
  eleventy.logger.overrideLogger(new CustomLogger());

  if (isIncremental) {
    componentSnapshot = snapshotComponents();

    // For some reason, removing the await here fixes incremental loading?
    eleventy.watch();

    process.on('SIGINT', async () => {
      await eleventy.stopWatch();
      process.exitCode = 0;
    });
  }

  return eleventy;
}

/**
 * Generates the documentation site.
 */
export async function generateDocs(options = {}) {
  let { spinner, isIncremental, isDeveloping, since = Date.now() } = options;

  isDeveloping ??= process.argv.includes('--develop');
  isIncremental ??= isDeveloping && !process.argv.includes('--no-incremental');

  /**
   * Used by the webawesome-app to skip doc generation since it will do its own.
   */
  if (process.env.SKIP_ELEVENTY === 'true') {
    return;
  }

  let eleventy = globalThis.eleventy;

  spinner?.start?.('Writing the docs');

  const outputs = {
    warn: [],
  };

  function stubConsole(key) {
    const originalFn = console[key];
    console[key] = function (...args) {
      outputs[key].push(args);
    };
    return originalFn;
  }

  // Works around a bug in 11ty where it still prints warnings despite the logger being overriden and in quietMode.
  const originalWarn = stubConsole('warn');
  const restoreConsole = () => {
    console.warn = originalWarn;
  };

  let output = '';

  try {
    if (isIncremental) {
      if (!globalThis.eleventy) {
        // First run
        globalThis.eleventy = await createEleventy(options);
        await waitForEleventyBuild(since, 30_000);
      } else {
        await waitForEleventyBuild(since);
      }

      eleventy = globalThis.eleventy;
      const info = eleventy.logger.logger.outputs.log.filter(line => !line.includes('Watching'));
      output = chalk.gray(info.length ? `(${info.join('')})` : '(no changes)');
      eleventy.logger.logger.reset();
    } else {
      // Cleanup
      await deleteAsync(getSiteDir());

      globalThis.eleventy = await createEleventy(options);
      eleventy = globalThis.eleventy;

      // Write it
      await eleventy.write();
      output = chalk.gray(`(${eleventy.logFinished()})`);
    }

    // Copy dist (production only)
    if (!isDeveloping) {
      await copy(getCdnDir(), join(getSiteDir(), 'dist'), { overwrite: true });
    }

    if (spinner) {
      spinner.succeed(`Writing the docs ${output}`);
    } else {
      console.log(`Writing the docs ${output}`);
    }
  } catch (error) {
    if (outputs.warn.length > 0) {
      console.error(chalk.yellow('\n11ty warnings captured during build:'));
      for (const args of outputs.warn) {
        console.error(chalk.yellow('  ' + args.map(a => a?.message || a?.stack || String(a)).join(' ')));
      }
    }

    console.error('\n\n' + chalk.red(formatError(error)) + '\n');

    if (spinner) {
      spinner.fail(chalk.red(`Error while writing the docs.`));
    } else {
      console.error(chalk.red(`Error while writing the docs.`));
    }

    if (!isDeveloping) {
      process.exit(1);
    }
  } finally {
    restoreConsole();
  }
}

/**
 * Much of this code is taken from 11ty's ConsoleLogger here:
 * https://github.com/11ty/eleventy/blob/main/src/Util/ConsoleLogger.js
 *
 * Patches 11ty logger so it doesnt log everything, but we can still use its output for our own build.
 * @typedef {'error'|'log'|'warn'|'info'} LogType
 */
class CustomLogger {
  #outputStream;

  constructor() {
    this.reset();
  }

  flush() {
    Object.keys(this.outputs).forEach(outputType => {
      console[outputType](this.outputs[outputType].join(''));
    });
    this.reset();
  }

  reset() {
    this.outputs = {
      log: [],
      info: [],
      warn: [],
      error: [],
    };
  }

  /** @param {string} msg */
  log(msg) {
    this.message(msg);
  }

  /**
   * @typedef LogOptions
   * @property {string} message
   * @property {string=} prefix
   * @property {LogType=} type
   * @property {string=} color
   * @property {boolean=} force
   * @param {LogOptions} options
   */
  logWithOptions({ message, type, prefix, color, force }) {
    this.message(message, type, color, force, prefix);
  }

  /** @param {string} msg */
  forceLog(msg) {
    this.message(msg, undefined, undefined, true);
  }

  /** @param {string} msg */
  info(msg) {
    this.message(msg, 'info', 'blue');
  }

  /** @param {string} msg */
  warn(msg) {
    this.message(msg, 'warn', 'yellow');
  }

  /** @param {string} msg */
  error(msg) {
    this.message(msg, 'error', 'red');
  }

  get outputStream() {
    if (!this.#outputStream) {
      this.#outputStream = new Readable({
        read() {},
      });
    }
    return this.#outputStream;
  }

  /** @param {string} msg */
  toStream(msg) {
    this.outputStream.push(msg);
  }

  closeStream() {
    this.outputStream.push(null);
    return this.outputStream;
  }

  /**
   * Formats the message to log.
   *
   * @param {string} message - The raw message to log.
   * @param {LogType} [type='log'] - The error level to log.
   * @param {string|undefined} [chalkColor=undefined] - Color name or falsy to disable
   * @param {boolean} [forceToConsole=false] - Enforce a log on console instead of specified target.
   */
  message(message, type = 'log', chalkColor = undefined, _forceToConsole = false, prefix = '') {
    // if (chalkColor && this.isChalkEnabled) {
    //   message = `${chalk.gray(prefix)} ${message.split("\n").join(`\n${chalk.gray(prefix)} `)}`;
    // 	this.outputs[type].push(chalk[chalkColor](message));
    // } else {
    message = `${prefix}${message.split('\n').join(`\n${prefix}`)}`;
    this.outputs[type].push(message);
    // }
  }
}
