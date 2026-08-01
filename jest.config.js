// Taken from ChatGPT
module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  testEnvironment: 'jsdom', // Use 'jsdom' for JSX rendering support
  transform: {
    '^.+\\.tsx?$': 'ts-jest', // Handles .ts and .tsx files
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'], // Ensure it recognizes .tsx files
  testPathIgnorePatterns: ['/cypress/'],
  moduleNameMapper: {
    // Mock CSS imports, suggested by ChatGPT
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Mock svg imports, which are handled by svgr in the app but not by jest
    '\\.svg$': '<rootDir>/src/__mocks__/svg-mock.tsx',
  },
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
};
