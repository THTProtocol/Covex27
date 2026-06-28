import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Build/tooling configs run under Node (they legitimately use __dirname, process, etc.).
  {
    files: ['vite.config.js', 'vitest.config.{js,ts}', 'eslint.config.js', 'scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Test files run under Node + the Vitest test harness (they legitimately use `global`).
  {
    files: ['**/__tests__/**/*.{js,jsx}', '**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
