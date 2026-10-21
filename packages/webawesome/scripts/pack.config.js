import { posix, resolve } from 'node:path';
import { globby } from 'globby';
// Vite+ pack (tsdown) configuration for the JS bundles in dist-cdn (everything bundled) and dist (dependencies external).
import { build as pack } from 'vite-plus/pack';

/**
 * Maps entry files to output names so that `src/components/button/button.ts` => `components/button/button.js`.
 * @param {string} rootDir
 */
async function getEntries(rootDir) {
  const src = posix.join(rootDir, 'src');
  const files = [
    //
    // IMPORTANT: Entry points MUST be mapped in package.json => exports
    //
    posix.join(src, 'webawesome.ts'),
    posix.join(src, 'webawesome.loader.ts'),
    posix.join(src, 'webawesome.ssr-loader.ts'),
    ...(await globby(posix.join(src, 'components/**/!(*.(style|test)).ts'))),
    ...(await globby(posix.join(src, 'translations/**/*.ts'))),
    ...(await globby(posix.join(src, 'utilities/**/*.ts'))),
    ...(await globby(posix.join(src, 'events/**/*.ts'))),
    ...(await globby(posix.join(src, 'ssr/**/*.ts'))),
    ...(await globby(posix.join(src, 'react/**/*.ts'))),
  ];
  const entries = {};
  for (const file of files) {
    entries[posix.relative(src, file).replace(/\.ts$/, '')] = file;
  }
  return entries;
}

/** Replaces the `__WEBAWESOME_VERSION__` placeholder anywhere in the source text. */
function replaceVersion(version) {
  return {
    name: 'webawesome-replace-version',
    transform: {
      filter: { code: '__WEBAWESOME_VERSION__' },
      handler(code) {
        return { code: code.replaceAll('__WEBAWESOME_VERSION__', version), map: null };
      },
    },
  };
}

/**
 * Emits one `.d.ts` per source file (tests excluded) into `outDir`, mirroring `src/`, the way `tsc` would.
 * The `tsc` resolver keeps package imports such as `lit` as bare specifiers instead of paths into node_modules.
 * @param {{ rootDir: string, outDir: string }} options
 */
export async function emitDeclarations({ rootDir, outDir }) {
  const files = await globby(['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.d.ts'], { cwd: rootDir });
  const entry = Object.fromEntries(files.map(file => [file.replace(/^src\//, '').replace(/\.ts$/, ''), file]));

  await pack({
    config: false,
    cwd: resolve(rootDir),
    entry,
    unbundle: true,
    format: 'esm',
    platform: 'browser',
    clean: false,
    logLevel: 'warn',
    outDir,
    deps: { neverBundle: [/^[^./]/] },
    dts: { emitDtsOnly: true, resolver: 'tsc', tsconfig: 'tsconfig.prod.json' },
  });
}

/**
 * Builds both bundles.
 * @param {{ rootDir: string, version: string, cdnDir: string, distDir: string, isDeveloping?: boolean }} options
 */
export async function bundleJs({ rootDir, version, cdnDir, distDir, isDeveloping = false }) {
  const entry = await getEntries(rootDir);
  const base = {
    config: false,
    cwd: resolve(rootDir),
    entry,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    dts: false,
    clean: false,
    minify: false,
    sourcemap: false,
    hash: false, // chunk names are set below
    fixedExtension: false,
    outExtensions: () => ({ js: '.js' }),
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' }, // required by Floating UI
    banner: `/*! Copyright ${new Date().getFullYear()} Fonticons, Inc. - https://webawesome.com/license */`,
    plugins: [replaceVersion(version)],
    inputOptions: isDeveloping
      ? { resolve: { conditionNames: ['development', 'browser', 'import', 'module', 'default'] } }
      : {},
    outputOptions: {
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name].[hash].js',
      codeSplitting: true,
    },
  };

  // Dependencies bundled in
  await pack({ ...base, outDir: cdnDir, deps: { alwaysBundle: [/.*/] } });
  // Dependencies external (lit etc.)
  await pack({ ...base, outDir: distDir, deps: { neverBundle: [/^[^./]/] } });
}
