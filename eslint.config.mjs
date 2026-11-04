import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/release/**', '.yarn/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // ESLint is also the formatter: no Prettier in this repo.
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: false,
    jsx: true,
    braceStyle: '1tbs',
  }),
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@stylistic/max-len': ['warn', { code: 140, ignoreStrings: true, ignoreTemplateLiterals: true }],
      '@stylistic/jsx-one-expression-per-line': 'off',
      // Regex groups and indexed access under noUncheckedIndexedAccess are checked by hand.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Core is plain Node with no app dependencies, so the collectors stay testable on their own.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['electron', 'electron/*', 'react', 'react/*', 'react-dom', 'react-dom/*'], message: 'Core must stay plain Node.' },
          { group: ['../*'], message: 'Core must not import the app; keep it self-contained.' },
        ],
      }],
    },
  },
)
