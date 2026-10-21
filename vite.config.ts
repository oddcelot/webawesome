import { defineConfig } from 'vite-plus';

const ignorePatterns = [
  '**/.cache/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-cdn/**',
  '**/_site/**',
  '**/_bundle_/**',
  'packages/*/docs/search.json',
  'packages/*/docs/public/assets/**',
  'packages/*/.astro/**',
  'packages/*/docs/.astro/**',
  'packages/*/src/components/icon/icons/**',
  'packages/*/src/react/**',
];

export default defineConfig({
  fmt: {
    ignorePatterns: [
      ...ignorePatterns,
      '**/*.hbs',
      '**/*.md',
      '**/*.mdx',
      '!packages/webawesome/docs/docs/patterns/**/*.md',
      '!packages/webawesome/scripts/agent-skill/**/*.md',
      '!packages/webawesome/scripts/design-skill/**/*.md',
      'packages/webawesome/docs/docs/patterns/blog-news/post-list.md',
      '.github/**',
      'cspell.json',
      '**/package.json',
      '**/package-lock.json',
      '**/pnpm-lock.yaml',
      '**/tsconfig.json',
      '**/tsconfig.prod.json',
    ],
    arrowParens: 'avoid',
    bracketSpacing: true,
    bracketSameLine: false,
    htmlWhitespaceSensitivity: 'css',
    printWidth: 120,
    proseWrap: 'preserve',
    quoteProps: 'as-needed',
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
    sortImports: { newlinesBetween: false },
  },
  lint: {
    ignorePatterns,
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        // Chai assertions like `expect(x).to.be.true` are expressions by design
        files: ['**/*.test.ts', '**/internal/test/**'],
        rules: { 'no-unused-expressions': 'off' },
      },
    ],
  },
  staged: {
    '*.{js,ts,json,html,xml,css,scss,sass,md}': 'cspell --no-must-find-files',
    '*': 'vp check --fix',
  },
});
