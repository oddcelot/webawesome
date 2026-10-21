// Loads pro components from the CDN when a page uses them. Only needed when running the free repo locally.
// Head.astro fills in the package version for the CDN URL below.
document.addEventListener('wa-discovery-complete', loadLayout);
function loadLayout() {
  const proComponents = ['combobox'];

  const kitCode = 'f4ea8aaaeb9d4f12';

  // This is really hacky and only for running the free repo locally. Its not perfect, but its better than nothing.
  // This will break singletons, and cause things to load twice
  const toLoad = proComponents.filter(tagName => {
    // Make sure the pro component is actually being used on the page.
    return !customElements.get('wa-' + tagName) && document.querySelector('wa-' + tagName);
  });

  if (toLoad.length > 0) {
    // The pro bundles re-register shared components (popover, button, etc.), so ignore duplicate registrations while
    // they load. This is scoped to the load so it doesn't swallow the re-registrations Lit HMR relies on in dev.
    const registry = window.customElements;
    const define = registry.define.bind(registry);
    registry.define = (tagName, ctor, options) => {
      if (registry.get(tagName)) {
        return;
      }
      return define(tagName, ctor, options);
    };

    // The CDN bundle ships its own copy of Lit. Our local SSR loader installs a
    // global `litElementHydrateSupport` hook that lit-element invokes at module
    // eval time — if it's still present when the CDN bundle evaluates, it patches
    // the CDN's LitElement to hydrate through OUR lit-html copy, mixing two Lit
    // instances and throwing `_$initialize is not a function`. These pro
    // components are client-only (never SSR'd locally), so suppress the hook while
    // the CDN bundles evaluate, then restore it.
    const savedHydrateSupport = globalThis.litElementHydrateSupport;
    delete globalThis.litElementHydrateSupport;

    const imports = toLoad.map(tagName =>
      import(
        `https://ka-p.webawesome.com/kit/${kitCode}/webawesome@__VERSION__/components/${tagName}/${tagName}.js`
      ).catch(() => {
        // known errors with dual registration. This is only a thing in the free repo.
      }),
    );

    void Promise.allSettled(imports).finally(() => {
      // Drop the own property so the registry's prototype method shows through again
      delete registry.define;
      if (savedHydrateSupport) globalThis.litElementHydrateSupport = savedHydrateSupport;
    });
  }
}
