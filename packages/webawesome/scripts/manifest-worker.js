// Runs the manifest analyzer for the dev server. Mirrors cli.js in @custom-elements-manifest/analyzer.
import { create, ts } from '@custom-elements-manifest/analyzer';
import {
  addFrameworkPlugins,
  DEFAULTS,
  getUserConfig,
  mergeGlobsAndExcludes,
} from '@custom-elements-manifest/analyzer/src/utils/cli-helpers.js';
import { findExternalManifests } from '@custom-elements-manifest/analyzer/src/utils/find-external-manifests.js';
import { mergeResolutionOptions } from '@custom-elements-manifest/analyzer/src/utils/resolver-config.js';
import { globby } from 'globby';
import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

// The framework plugins log every file they write
console.log = () => {};

const cwd = process.cwd();
const userConfig = await getUserConfig(workerData.configPath, cwd);
const options = { ...DEFAULTS, ...userConfig };
const patterns = mergeGlobsAndExcludes(DEFAULTS, userConfig, {});
const resolutionOptions = mergeResolutionOptions(userConfig?.resolutionOptions);

async function analyze() {
  const globs = await globby(patterns, { cwd });
  const modules = userConfig?.overrideModuleCreation
    ? userConfig.overrideModuleCreation({ ts, globs })
    : globs.map(glob =>
        ts.createSourceFile(glob, fs.readFileSync(path.resolve(cwd, glob), 'utf8'), ts.ScriptTarget.ES2015, true),
      );

  let thirdPartyCEMs = [];
  if (options.dependencies) {
    thirdPartyCEMs = await findExternalManifests(
      globs.map(glob => path.resolve(cwd, glob)),
      { basePath: cwd, resolutionOptions },
    ).catch(() => []);
  }

  const plugins = [...(await addFrameworkPlugins(options)), ...(userConfig?.plugins || [])];
  const manifest = create({ modules, plugins, context: { dev: options.dev, thirdPartyCEMs } });

  const outdir = path.join(cwd, options.outdir);
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, 'custom-elements.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

parentPort.on('message', async () => {
  try {
    await analyze();
    parentPort.postMessage({ ok: true });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error?.stack || String(error) });
  }
});
