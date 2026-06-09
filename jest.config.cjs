module.exports = {
  testEnvironment: 'jsdom',
  transform: {},
  // Shared test helpers live under __tests__/helpers/ and are imported by the
  // specs; they are support modules, not test suites of their own.
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/']
};
