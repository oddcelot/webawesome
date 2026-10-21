/**
 * This is the intended way of using fixtures since it has some nice ways of catching hydration errors.
 * These fixtures will also auto-load all of our components.
 */

import { hydrate } from '@lit-labs/ssr-client';
import { aTimeout, expect, fixture } from '@open-wc/testing';
import type { LitElement, TemplateResult } from 'lit';
import type WebAwesomeElement from '../webawesome-element.js';
import { litSsrRender, resetMouseIfMoved } from './commands.js';

declare global {
  interface Window {
    serverComponents: string[];
    SSR_ONLY: boolean;
    CSR_ONLY: boolean;
  }
}

/**
 * This will hopefully move to a library or be built into Lit. Right now this does nothing.
 */
function handleHydrationError(e: Event) {
  const element = e.target as WebAwesomeElement;
  const str = `Expected <${element.localName}> to not have hydration error.`;

  expect(true).to.equal(false, str);
}

// This is a non-standard event I have added to the WebAwesomeElement base class.
// https://github.com/lit/lit/discussions/4703
document.addEventListener('lit-hydration-error', handleHydrationError);

/**
 * Loads up a fixture and loads all client components
 */
export async function clientFixture<T extends HTMLElement = HTMLElement>(template: TemplateResult | string) {
  // Load all component definitions "customElements.define()"
  return await fixture<T>(template);
}

// Make it easy to register describe blocks and tell what type of test failed.
clientFixture.type = 'client-only' as const;

let ssrContainers: HTMLElement[] = [];

function cleanupFixtures() {
  ssrContainers.forEach(container => container.remove());
  ssrContainers = [];
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/**
 * SSR-renders a template in Node (see `litSsrRender` in scripts/vitest/commands.ts), inserts the resulting declarative
 * shadow DOM into the document, and hydrates it. Ported from @lit-labs/testing's `ssrFixture`.
 */
async function ssrFixture<T extends HTMLElement>(template: TemplateResult): Promise<T> {
  const rendered = await litSsrRender({
    template,
    modules: window.serverComponents,
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  ssrContainers.push(container);

  // Declarative Shadow DOM is only attached by parsers that opt in, so use `setHTMLUnsafe()`.
  container.setHTMLUnsafe(rendered);

  const el = container.firstElementChild as T;

  if (el?.hasAttribute('defer-hydration')) {
    el.removeAttribute('defer-hydration');
    await (el as unknown as LitElement).updateComplete;
  } else {
    hydrate(template, container);
    const litEl = container.querySelector<LitElement>('[defer-hydration]');
    if (litEl) {
      litEl.removeAttribute('defer-hydration');
      await litEl.updateComplete;
    } else {
      await nextFrame();
    }
  }

  return el;
}

/**
 * Loads up a fixture with SSR, using all unbundled modules, then when it finishes, calls hydration scripts, and then when hydration completes, returns the element.
 */
export async function hydratedFixture<T extends HTMLElement = HTMLElement>(template: TemplateResult) {
  const hydratedElement = await ssrFixture<T>(template);

  // @ts-expect-error Assume its a lit element.
  await hydratedElement.updateComplete;

  // This can be removed when this is fixed: https://github.com/lit/lit/issues/4709
  // This forces every element to "hydrate" and then wait for an update to complete (hydration)
  await Promise.allSettled(
    [...hydratedElement.querySelectorAll<LitElement>('*')].map(async el => {
      el.removeAttribute('defer-hydration');
      return el.updateComplete;
    }),
  );

  return hydratedElement;
}

hydratedFixture.type = 'ssr-client-hydrated' as const;

export const fixtures = [clientFixture, hydratedFixture].filter(fix => {
  if (window.SSR_ONLY && fix.type === 'client-only') {
    return false;
  }

  if (window.CSR_ONLY && fix.type === 'ssr-client-hydrated') {
    return false;
  }

  return true;
});

/**
 * This registers the fixture cleanup as a side effect
 */
try {
  // Vitest globals are enabled (`test.globals`), so this just makes it so every test file doesn't need to call beforeEach and afterEach to cleanup fixtures.
  if (typeof beforeEach !== 'undefined') {
    beforeEach(async () => {
      cleanupFixtures();
      await aTimeout(1);
    });
  }
  if (typeof afterEach !== 'undefined') {
    afterEach(async () => {
      cleanupFixtures();
      await resetMouseIfMoved();
      await aTimeout(1);
    });
  }
} catch (error) {
  // We really don't care if there's an error in these.
}
