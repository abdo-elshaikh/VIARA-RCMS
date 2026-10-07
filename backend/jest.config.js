module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/controllers/**/*.js',
    'src/services/**/*.js',
    'src/middleware/**/*.js',
    '!src/server.js'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  reporters: [
    'default',
    '<rootDir>/tests/noSkippedTestsReporter.js'
  ],
  clearMocks: true,
  coverageThreshold: {
    global: { branches: 40, functions: 60, lines: 50, statements: 50 }
  },
  restoreMocks: true
};
