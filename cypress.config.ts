import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  fixturesFolder: false,
  projectId: 'ez44c6',
  defaultCommandTimeout: 8000,
  env: {
    coverage: false,
  },
  e2e: {
    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    setupNodeEvents(on, config) {
      return require("@cypress/code-coverage/task")(on, config);
    },
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.{js,jsx,ts,tsx}',
  },
})
