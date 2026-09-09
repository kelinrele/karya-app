import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  js.configs.recommended,
  tseslint.configs.recommended,
  // The top-level "recommended-latest" key is still eslintrc-shaped in v7.
  // The flat namespace is the one ESLint 10 accepts.
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The migration must not reintroduce a browser-held model credential.
      'no-restricted-globals': ['error', { name: 'event', message: 'Use the handler argument.' }],
    },
  },

  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },

  // Must stay last so formatting rules are switched off.
  prettier,
);
