// Taken from ChatGPT
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // Use 'jsdom' for JSX rendering support
  transform: {
    '^.+\\.js$': 'babel-jest', // Transforms JavaScript files with babel-jest
    '^.+\\.tsx?$': 'ts-jest', // Handles .ts and .tsx files
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'], // Ensure it recognizes .tsx files
  testPathIgnorePatterns: ['/cypress/'],
  moduleNameMapper: {
    // Mock CSS imports, suggested by ChatGPT
    '\\.(css|less|scss|sass)$': '<rootDir>/src/test/style-mock.js',
  },
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
};
