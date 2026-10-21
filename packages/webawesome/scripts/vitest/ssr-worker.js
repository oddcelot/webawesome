/**
 * Worker thread that SSR-renders a Lit template using the built `dist` component modules. Ported from
 * @lit-labs/testing's `worker.js`. A fresh worker per render keeps each render isolated (own DOM shim + module cache).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { render } from '@lit-labs/ssr';

if (parentPort === null) {
  throw new Error('ssr-worker.js must only be run in a worker thread');
}

const { template, modules } = workerData;

await Promise.all(modules.map(module => import(module)));

// Spoof TemplateStringsArray by adding back the `raw` property that gets stripped during serialization.
const strings = template.strings;
strings.raw = strings;

let rendered = '';
for (const str of render({ ...template, strings }, { deferHydration: true })) {
  rendered += str;
}

parentPort.postMessage(rendered);
