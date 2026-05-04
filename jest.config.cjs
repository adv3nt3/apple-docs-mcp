/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testTimeout: 10000, // 10 seconds timeout for all tests
  maxWorkers: 1, // Run tests serially to avoid network conflicts
  forceExit: true, // Force Jest to exit after tests complete
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        // 'bundler' is the modern, version-agnostic resolver designed for tools
        // like Jest/Vite/esbuild. Pairs with module:commonjs without TS 6's
        // node10-deprecation warning, and unlike node16/nodenext doesn't force
        // strict ESM file-extension rules in test code.
        moduleResolution: 'bundler',
        // ts-jest has historically forced node10 when module:commonjs; until
        // that's resolved upstream, silence the TS 6 deprecation warning so
        // jest doesn't refuse to run.
        ignoreDeprecations: '6.0',
        experimentalDecorators: true,
        emitDecoratorMetadata: true
      }
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/utils/wwdc-data-source.ts',  // Exclude due to import.meta.url
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};