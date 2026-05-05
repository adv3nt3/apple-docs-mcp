import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'data/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        // Use a dedicated tsconfig.eslint.json that includes src/__tests__/
        // (which the production tsconfig excludes since TS 6 is stricter about
        // jest globals). Keeps eslint's project service happy without polluting
        // the production type-check.
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        // Node.js globals (equivalent to legacy `env: { node: true, es2022: true }`)
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // TypeScript rule customizations (preserved from .eslintrc.json)
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      // Project convention: tools throw `AppError` plain objects (see CLAUDE.md "Error
      // handling convention"). Allow that shape so the v8 only-throw-error rule
      // (newly added to recommendedTypeChecked) doesn't reject it.
      '@typescript-eslint/only-throw-error': ['error', {
        allow: [{ from: 'file', name: 'AppError' }],
        allowRethrowing: true,
        allowThrowingAny: true,
        allowThrowingUnknown: true,
      }],
      // Mirror only-throw-error's lenient defaults for Promise rejection reasons,
      // so re-rejecting a caught `unknown` value does not error.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', {
        allow: [{ from: 'file', name: 'AppError' }],
        allowThrowingAny: true,
        allowThrowingUnknown: true,
      }],

      // Core ESLint rules
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      // ESLint 10 added preserve-caught-error (require `cause` when rethrowing in
      // catch). Use `appError(..., { cause: error })` or `new Error(msg, { cause: error })`
      // when rethrowing inside a catch block so the original error stays attached.
      'preserve-caught-error': 'error',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'no-useless-escape': 'warn',

      // Complexity / size limits
      'complexity': ['warn', 15],
      'max-depth': ['warn', 6],
      'max-params': ['warn', 6],

      // Stylistic / formatting rules (moved out of @typescript-eslint and ESLint core in v8/v9)
      '@stylistic/brace-style': ['error', '1tbs'],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/max-len': ['warn', {
        code: 120,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreComments: true,
      }],
    },
  },
);
