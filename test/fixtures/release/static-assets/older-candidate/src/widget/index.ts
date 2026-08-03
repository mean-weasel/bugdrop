declare const __BUGDROP_VERSION__: string;
declare const __BUGDROP_ENABLE_TEST_HOOKS__: boolean;

globalThis.BugDropFixture = {
  hooks: __BUGDROP_ENABLE_TEST_HOOKS__,
  version: __BUGDROP_VERSION__,
};
