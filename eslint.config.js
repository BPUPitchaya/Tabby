// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // An accepted house pattern across this codebase: a modal's
      // visible-triggered reset effect, and a screen's own load-on-mount
      // effect, both call setState synchronously inside a useEffect.
      // Downgraded from error (eslint-config-expo's default) to warn so
      // CI gates on real regressions instead of ~20 pre-existing,
      // deliberately-kept instances of this one pattern.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
