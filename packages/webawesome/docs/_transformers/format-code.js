import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';
import { format } from 'vite-plus/fmt';

const rootConfigFile = fileURLToPath(new URL('../../../../vite.config.ts', import.meta.url));
let defaultOptions;

async function getDefaultOptions() {
  if (!defaultOptions) {
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, rootConfigFile);
    const { ignorePatterns, ...options } = loaded?.config.fmt ?? {};
    defaultOptions = options;
  }
  return defaultOptions;
}

/**
 * Formats a string of code using Oxfmt (the Vite+ formatter).
 *
 * @param {string} code - The code to format.
 * @param {*} options - Oxfmt options plus `parser` (a file extension such as `html`, `css`, or `ts`). Defaults are
 *   taken from the `fmt` block of the project's root vite.config.ts.
 */
export async function formatCode(string, options = {}) {
  const { parser = 'html', ...rest } = options;
  const result = await format(`code.${parser}`, string, { ...(await getDefaultOptions()), ...rest });
  if (result.errors.length > 0) {
    throw new Error(result.errors.map(error => error.message).join('\n'));
  }
  return result.code;
}

/**
 * Eleventy plugin to format page HTML using Oxfmt.
 */
export function formatCodePlugin(options = {}) {
  options = {
    parser: 'html',
    ...options,
  };

  return function (eleventyConfig) {
    eleventyConfig.addTransform('format-code', content => {
      return formatCode(content, options);
    });
  };
}
