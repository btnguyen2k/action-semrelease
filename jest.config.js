export default {
  restoreMocks: true,
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    './src/**'
  ],
  coveragePathIgnorePatterns: [
    'app.js',
    'index.js',
    'index.cjs'
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 100,
      lines: 90,
      statements: 90
    }
  },
  testRegex: /\.test\.jsx?$/.source,
  transform: {},
}
