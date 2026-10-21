/**
 * Front matter for the hand-written `.astro` pages in `src/pages/`. Ids follow the content collection's scheme
 * (path without extension), so URLs, directory defaults and the sitemap treat them like any other page.
 * `filePath` is relative to the docs root.
 */
export const STATIC_PAGES = [
  {
    id: 'support',
    filePath: 'src/pages/support.astro',
    data: {
      title: 'Help & Support',
      description: 'Answers to the questions we hear most, plus the fastest ways to reach a human when you need one.',
      pageLayout: 'page',
      hasOutline: true,
      hasProseContent: true,
      synonyms: ['help', 'faq', 'questions', 'answers', 'contact', 'refund', 'billing', 'license', 'seats'],
    },
  },
  {
    id: 'docs/color-palettes',
    filePath: 'src/pages/docs/color-palettes.astro',
    data: {
      title: 'Color Palettes',
      description: 'Color palettes give you a full spectrum of colors to add life to your project.',
      pageLayout: 'page',
      hasOutline: false,
    },
  },
  {
    id: 'docs/components/index',
    filePath: 'src/pages/docs/components/index.astro',
    data: {
      title: 'Browse Components',
      description: 'Browse the library of customizable, framework-friendly web components included in Web Awesome.',
      pageLayout: 'docs',
    },
  },
  {
    id: 'docs/layout',
    filePath: 'src/pages/docs/layout.astro',
    data: {
      title: 'Layout Utilities',
      description: 'Layout utilities have moved to the CSS Utilities page.',
      pageLayout: 'docs',
    },
  },
  {
    id: 'docs/resources/migration-checklist',
    filePath: 'src/pages/docs/resources/migration-checklist.astro',
    data: {
      title: 'Migration Checklist',
      description: 'Interactive checklist for migrating a project from Shoelace 2.x to Web Awesome.',
      pageLayout: 'page',
    },
  },
  {
    id: 'docs/themes',
    filePath: 'src/pages/docs/themes.astro',
    data: {
      title: 'Built-in Themes',
      description: "Style (and restyle) your website at will with any of Web Awesome's pre-built themes.",
      pageLayout: 'page',
    },
  },
  {
    id: 'docs/tokens/index',
    filePath: 'src/pages/docs/tokens/index.astro',
    data: {
      title: 'Design Tokens',
      description:
        'CSS custom properties that control the look and feel of every Web Awesome component, giving your theme a consistent, customizable appearance.',
      pageLayout: 'page-outline',
      hasBreadcrumbs: false,
      hasOutline: false,
      'override:tags': [],
    },
  },
  {
    id: 'docs/utilities/index',
    filePath: 'src/pages/docs/utilities/index.astro',
    data: {
      title: 'CSS Utilities',
      description:
        'Preset CSS utility classes that let you efficiently customize styles and layouts for components and native elements alike.',
      pageLayout: 'docs',
      hasBreadcrumbs: false,
      hasOutline: false,
    },
  },
  {
    id: 'examples/themes/showcase',
    filePath: 'src/pages/examples/themes/showcase.astro',
    data: {
      unlisted: true,
      pageLayout: false,
    },
  },
];
