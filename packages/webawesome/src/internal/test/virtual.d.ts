declare module 'virtual:wa-test-components' {
  /** Imports every bundled client component from "/dist-cdn". Provided by the test config. */
  export const loadClientComponents: () => Promise<PromiseSettledResult<unknown>[]>;
}
