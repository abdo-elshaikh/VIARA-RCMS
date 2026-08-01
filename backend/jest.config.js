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
  reporters: [
    'default',
    '<rootDir>/tests/noSkippedTestsReporter.js'
  ],
  clearMocks: true,
  restoreMocks: true
};
