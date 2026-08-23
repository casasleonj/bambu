import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next/typescript sets no-unused-vars to 'warn' with no
    // ignore pattern, so params/vars already prefixed with `_` (the
    // established convention for "intentionally unused") still get flagged.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // screenshot-*.js son scripts sueltos de debug (Playwright standalone,
    // no forman parte de la app ni de CI) sin "type":"module" en
    // package.json -- son CommonJS real, require() es correcto ahí.
    // Convertir a import los rompería al correrlos con `node script.js`.
    files: ["screenshot-*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
