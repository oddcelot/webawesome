/**
 * @open-wc/testing's chai-dom-diff plugin imports snapshot helpers from @web/test-runner-commands. We don't use
 * `.dom.equal()` / `.equalSnapshot()` and no longer ship web-test-runner, so the test config aliases that package to
 * this stub just to keep the import resolvable.
 */
const unsupported = () => {
  throw new Error('Snapshot testing is not supported. Use explicit assertions instead.');
};

export const getSnapshot = unsupported;
export const getSnapshotConfig = unsupported;
export const saveSnapshot = unsupported;
