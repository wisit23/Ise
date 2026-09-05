const js = require("@eslint/js");
const globals = require("globals");
const reactPlugin = require("eslint-plugin-react");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/generated/**",
      "frontend/next-env.d.ts",
      // Local AI coding-assistant tooling (gitignored, never shipped). CI
      // never sees these because they aren't committed, but a developer
      // running `npm run lint` locally would otherwise drown in errors
      // from files that aren't part of the application.
      ".agent/**",
      ".claude/**",
      ".github/skills/**",
      ".github/agents/**",
      ".github/hooks/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["backend/**/*.js", "scripts/**/*.js", "*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["frontend/**/*.js"],
    ignores: ["frontend/*.config.js"],
    plugins: { react: reactPlugin },
    languageOptions: {
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: { react: { version: "detect" } },
  },
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
  },
  {
    files: ["frontend/*.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  eslintConfigPrettier,
];
