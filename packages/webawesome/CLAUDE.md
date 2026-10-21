# CLAUDE.md

Web Awesome — free/open-source Lit-based web component library (`@awesome.me/webawesome`). Part of a monorepo; the pro package (`webawesome-pro`) extends this one.

## Commands

```bash
npm start                  # Vite+ dev server (vp dev) with Lit HMR, serves index.html
npm run start:docs         # Docs dev server: astro dev on :4000, rebuilds dist-cdn when src/ changes
npm run build              # Production build (scripts/build.js, bundles with Vite+ pack)
npm test                   # Run all component tests (vp test, Vitest browser mode)
npm run test:component -- button  # Watch single component tests
npm run create             # Create new component (interactive Plop prompt)
npm run verify             # vp check + build + test (full check)
npm run check              # vp check: format, lint, and type check
npm run fmt                # vp fmt: format code
```

## Component Anatomy

Each component lives in `src/components/<name>/` with three files:

- `<name>.ts` — Component class (Lit web component)
- `<name>.styles.ts` — Styles using Lit `css` tagged template
- `<name>.test.ts` — Tests (Vitest + @open-wc/testing)

Create new components with `npm run create` (Plop templates in `scripts/plop/`). Names must start with `wa-`.

## Base Classes

**Never extend `LitElement` directly.** Use these base classes from `src/internal/`:

- **`WebAwesomeElement`** (`webawesome-element.ts`) — Base for all components. Use `static css` (not Lit's `static styles`) — host styles are auto-prepended. Supports SSR, ElementInternals, custom states.
- **`WebAwesomeFormAssociatedElement`** (`webawesome-form-associated-element.ts`) — For form controls. Adds form association, constraint validation, `ElementInternals`. Override `static get validators()` to return an array of validation rules.

## Decorators & Reactivity

- `@customElement('wa-name')` — Registers the custom element.
- `@property({ reflect: true })` — Reactive public property, reflects to HTML attribute.
- `@state()` — Reactive internal state (no attribute reflection).
- `@query('.selector')` — Cached shadow DOM query.
- `@watch('propertyName')` — Runs handler when a property changes. Use `{ waitUntilFirstUpdate: true }` to skip the initial value.

## Controllers

Instantiate in the class body (not constructor):

- `HasSlotController(this, 'slot-name')` — Tracks whether named slots have content. Used for conditional rendering.
- `LocalizeController(this)` — i18n/l10n for component strings. Translations in `src/translations/`.

## Code Conventions

The published [contributing guide](docs/docs/resources/contributing.md) is the canonical convention doc (component structure, BEM class names, `with-*`/`without-*` boolean props, event naming). The rules below are the mechanical ones most often gotten wrong:

- Event handler parameters are named `event`, not `e`. Read from it directly (`event.key`, `event.target`, `event.preventDefault()`).
- Event handlers are named `handle<Subject>` (`handleInput`, `handleClearClick`), not `onX`.
- Relative imports end in `.js` (NodeNext ESM), e.g. `import styles from './button.styles.js'`.
- Custom events are one class per file in `src/events/`: `class Wa<Name>Event extends Event`, dispatched via `super('wa-<kebab>', { bubbles, cancelable, composed: true })`, augmenting `GlobalEventHandlersEventMap`. Fire them with `this.dispatchEvent(new Wa<Name>Event(...))`. There is no `emit()` helper.
- Multi-word properties declare an explicit kebab `attribute:`. Lit lowercases attribute names, so `passwordToggle` needs `attribute: 'password-toggle'`.

## Style Conventions

- Export default `css` tagged template literal from `component.styles.ts`.
- Wrap component styles in `@layer wa-component { ... }`.
- Use CSS custom properties with `--wa-*` prefix.
- Import shared styles: `variantStyles` (neutral/brand/success/warning/danger), `sizeStyles` (small/medium/large) from `src/styles/component/`.
- Combine via `static css = [styles, variantStyles, sizeStyles]`.
- Style host states via `:host(:state(loading))`, variants via `:host([variant='brand'])`.

## JSDoc Requirements (Critical)

Every component class **must** have these JSDoc tags — they drive Custom Elements Manifest (CEM) generation and documentation:

```
@summary       — One-line description
@documentation — URL to docs page (https://webawesome.com/docs/components/...)
@status        — stable | experimental | deprecated
@since         — Version number (e.g., 1.0)
@dependency    — Each wa-* sub-component used (one tag per dependency)
@slot          — Each slot (use `@slot -` for the default slot)
@event         — Each custom event emitted (e.g., `wa-change`)
@csspart       — Each shadow DOM part exposed
@cssstate      — Each CSS custom state (e.g., disabled, loading)
@cssproperty   — Each CSS custom property exposed
```

Missing tags will cause missing documentation and incomplete CEM output.

## Testing

- **Framework**: Vitest browser mode via Vite+ (`vp test`), Playwright projects `chromium`, `firefox`, `webkit` (WebKit is skipped when `CI=true`). Config is the `test` block in `vite.config.ts`; tests need a built `dist/` and `dist-cdn/` (`npm run build`).
- **Assertions/fixtures**: `@open-wc/testing` (`expect`, `fixture`, `html`, `aTimeout`, `waitUntil`, `oneEvent`) and Sinon. `describe`/`it`/`beforeEach` are Vitest globals (`beforeAll`/`afterAll`, not Mocha's `before`/`after`; use `({ skip }) => skip()` instead of `this.skip()`).
- **Fixtures**: Import `{ fixtures }` from `src/internal/test/fixture.js` — an array of CSR/SSR-aware fixture functions (`clientFixture`, `hydratedFixture`). For simple CSR-only tests, `fixture` from `@open-wc/testing` also works.
- **Real input**: `sendKeys`, `sendMouse`, `resetMouse`, `setViewport`, `emulateMedia`, `readFile` come from `src/internal/test/commands.js` (Node-side commands live in `scripts/vitest/commands.ts`).
- **Accessibility**: `await expect(el).to.be.accessible();`
- **Form controls**: `runFormControlBaseTests({ tagName: 'wa-input' })` from `src/internal/test/form-control-base-tests.js` — runs standard form behavior tests.
- **Run everything**: `npm test` (`test:client` = CSR only, `test:server` = SSR/hydration only). One browser: `npx vp test run --project chromium`.
- **Run a single file**: `npx vp test run src/components/button/button.test.ts --project chromium`. Watch mode: `npm run test:component -- button` (filter by path substring). Set `FAIL_FAST=true` to stop at the first failure.

## Build System

Custom build (`scripts/build.js`); JS bundles and `.d.ts` declarations both come from Vite+ pack (tsdown, `scripts/pack.config.js`). Type checking is `vp check`. Generates:

- `dist/` — ES modules with dependencies external + TypeScript declarations
- `dist-cdn/` — Bundled for CDN use
- Custom Elements Manifest (`custom-elements.json`)
- React wrappers (`src/react/`)
- Agent skill (`dist/skills/webawesome/`) and `dist/llms.txt` — AI-ready component API docs

## Key Directories

- `src/components/` — All components
- `src/internal/` — Base classes, decorators (`watch.ts`), controllers (`slot.ts`), validators
- `src/styles/` — Shared styles, themes, color palettes, CSS utilities
- `src/events/` — Custom event class definitions
- `src/translations/` — i18n message files (30+ locales)
- `docs/` — Documentation site (Astro + MDX). Content in `docs/docs/**/*.mdx`; layouts, components and the build glue in `docs/src/`

## Common Tasks

- **New component**: Run `npm run create`, enter `wa-component-name`. Generates three files in `src/components/<name>/`. Add JSDoc tags (see above), implement `render()`, add styles.
- **Add a property**: `@property({ reflect: true }) propName: Type = default;` — use `reflect: true` if it should be settable via HTML attribute.
- **Add a slot**: Add `<slot name="name"></slot>` in `render()`, add `@slot name` JSDoc tag, optionally track with `HasSlotController`.
- **Add a CSS part**: Add `part="name"` to element in `render()`, add `@csspart name` JSDoc tag.
- **Add a custom event**: Create event class in `src/events/`, dispatch with `this.dispatchEvent(new WaEventClass())`, add `@event wa-event-name` JSDoc tag.
- **Add a test**: Import `{ fixtures }` from `src/internal/test/fixture.js`, loop `for (const fixture of fixtures)`, use `await fixture<Type>(html`...`)`.
- **Doc page**: Create `docs/docs/components/name.mdx` with front matter (`title`, `description`, `pageLayout: component`, `category`). Use ` ```html {.example} ` for live code blocks. Pages are MDX, so HTML outside code blocks must be valid JSX (self-close void elements, `{/* */}` comments, escape literal `{` `}`).
- **Update the changelog**: Add entries to the "Unreleased" section in `docs/docs/resources/changelog.mdx`. Create the section if it doesn't exist. Group entries under `:::added`, `:::fixed`, `:::changed`, `:::deprecated`, `:::removed`, `:::breaking` containers in that order; omit any category with no entries. **Keep entries clear and succinct** — announce what changed at a glance, trim redundant prose, and nest closely related additions as sub-bullets so the parent reads as a topic and children carry the detail.
