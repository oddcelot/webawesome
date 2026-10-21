/**
 * Vitest setup file, run in the browser before every test file. Replaces the custom `testRunnerHtml` that
 * web-test-runner used: theme CSS, Lit warning suppression, window globals, SSR hydration support, and all components.
 */
import { loadClientComponents } from 'virtual:wa-test-components';
import '/dist/styles/themes/default.css';
import { resetMouse } from './commands.js';

declare const __WA_SERVER_COMPONENTS__: string[];
declare const __WA_CSR_ONLY__: boolean;
declare const __WA_SSR_ONLY__: boolean;

// Vitest runs each test file in an iframe that doesn't have focus by default. Focus and blur events (and :focus-visible
// styling) are only delivered to a focused document, and web-test-runner's top-level pages always had focus.
window.focus();
await resetMouse();

const g = globalThis as any;

// The built components check `process.env.NODE_ENV`.
g.process ??= { env: {} };
g.process.env ??= {};
g.process.env.NODE_ENV = 'production';

g.litIssuedWarnings ??= new Set<string>();
g.litIssuedWarnings.add(
  'Lit is in dev mode. Not recommended for production! See https://lit.dev/msg/dev-mode for more information.',
);
// This is related to SSR: the tests use the bundled "/dist-cdn" client components and the unbundled "/dist" ones for SSR.
g.litIssuedWarnings.add(
  'Multiple versions of Lit loaded. Loading multiple versions is not recommended. See https://lit.dev/msg/multiple-versions for more information.',
);

window.serverComponents = __WA_SERVER_COMPONENTS__;
window.CSR_ONLY = __WA_CSR_ONLY__;
window.SSR_ONLY = __WA_SSR_ONLY__;

// @ts-ignore -- the built bundle may not ship type declarations
await import('../../../dist-cdn/utilities/ssr-hydration.js');
await loadClientComponents();
