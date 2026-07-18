import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '.npm-cache/**']
  },
  js.configs.recommended,
  {
    files: ['apps/api/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['apps/web/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z]' }]
    }
  }
]
