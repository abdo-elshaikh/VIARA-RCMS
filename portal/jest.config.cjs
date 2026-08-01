module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\.(ts|tsx|js|jsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['./setup-tests.ts'],
};
