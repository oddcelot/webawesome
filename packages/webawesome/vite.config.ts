import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { litPlugin } from '@oddsquad/vite-plugin-lit';
import { defineConfig, type Plugin } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import { getAllComponents } from './scripts/shared.js';
import { commands } from './scripts/vitest/commands.js';

const isCI = process.env.CI === 'true';

/** Lists every component's built module (unbundled "/dist" for SSR, bundled "/dist-cdn" for the client). */
function getComponentModules() {
  const server: string[] = [];
  const client: string[] = [];
  try {
    const metadata = JSON.parse(readFileSync('./dist/custom-elements.json', 'utf8'));
    getAllComponents(metadata).forEach((component: { tagName?: string }) => {
      if (!component.tagName) return;
      const name = component.tagName.replace(/^wa-/, '');
      server.push(`/dist/components/${name}/${name}.js`);
      client.push(`/dist-cdn/components/${name}/${name}.js`);
    });
  } catch {
    if (process.env.VITEST) {
      console.warn('Could not read ./dist/custom-elements.json. Run `npm run build` before running tests.');
    }
  }
  return { server, client };
}

const modules = getComponentModules();

const VIRTUAL_COMPONENTS_ID = 'virtual:wa-test-components';

/**
 * Exposes `loadClientComponents()`, which imports every bundled client component. The imports are literal (not
 * variable) specifiers so Vite resolves each module to a single URL; variable dynamic imports get an `?import` suffix,
 * which makes the browser evaluate the same component twice.
 */
function testComponentsPlugin(): Plugin {
  return {
    name: 'wa-test-components',
    resolveId: id => (id === VIRTUAL_COMPONENTS_ID ? `\0${VIRTUAL_COMPONENTS_ID}` : undefined),
    load(id) {
      if (id !== `\0${VIRTUAL_COMPONENTS_ID}`) return undefined;
      const imports = modules.client.map(path => `import(${JSON.stringify(path)})`).join(',\n  ');
      return `export const loadClientComponents = () => Promise.allSettled([\n  ${imports}\n]);`;
    },
  };
}

export default defineConfig({
  plugins: [litPlugin(), testComponentsPlugin()],
  define: {
    __WA_SERVER_COMPONENTS__: JSON.stringify(modules.server),
    __WA_CSR_ONLY__: JSON.stringify(process.env.CSR_ONLY === 'true'),
    __WA_SSR_ONLY__: JSON.stringify(process.env.SSR_ONLY === 'true'),
  },
  // tsconfig sets `verbatimModuleSyntax`, which would keep test files' type-only `import WaX from './x.js'` statements as
  // side-effect imports and load the *source* components on top of the built ones. Drop unused imports like esbuild did.
  oxc: { typescript: { onlyRemoveTypeImports: false } },
  // Pre-bundle everything the tests load up front. When Vite discovers a dependency mid-run it re-optimizes and reloads the
  // page, which kills in-flight test files ("iframe did not become ready").
  optimizeDeps: {
    include: [
      '@lit-labs/ssr-client',
      '@open-wc/testing',
      '@shoelace-style/localize',
      'lit',
      'lit/decorators.js',
      'lit/directive-helpers.js',
      'lit/directives/class-map.js',
      'lit/directives/if-defined.js',
      'lit/directives/live.js',
      'lit/directives/map.js',
      'lit/directives/range.js',
      'lit/static-html.js',
      'sinon',
    ],
  },
  resolve: {
    alias: {
      // Only used by @open-wc/testing's chai-dom-diff snapshot support, which we don't use.
      '@web/test-runner-commands': fileURLToPath(new URL('./src/internal/test/snapshot-stub.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/internal/test/setup.ts'],
    testTimeout: 3000,
    // Same concurrency as web-test-runner had: SSR renders are CPU-heavy, so more workers starve the timeouts.
    maxWorkers: Math.max(Math.floor(availableParallelism() / 3), 1),
    hookTimeout: 3000,
    // Fail the whole run on the first failure rather than letting every test run.
    bail: process.env.FAIL_FAST === 'true' ? 1 : 0,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      viewport: { width: 800, height: 600 },
      commands,
      // WebKit is skipped on CI, like it was with web-test-runner.
      instances: [
        { browser: 'chromium' as const, name: 'chromium' },
        { browser: 'firefox' as const, name: 'firefox' },
        ...(isCI ? [] : [{ browser: 'webkit' as const, name: 'webkit' }]),
      ],
    },
  },
});
