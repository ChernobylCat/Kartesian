const { defineConfig } = require('@playwright/test');

const browserName = process.env.PW_BROWSER || 'chromium';
const isCI = Boolean(process.env.CI);
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const useLocalEdge = browserName === 'chromium' && !isCI && !process.env.PW_BROWSER;
const reporters = [['line']];

if (isGitHubActions) {
  reporters.unshift(['github']);
}

if (isCI) {
  reporters.push(
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  );
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/support/global-setup'),
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  reporter: reporters,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName,
    ...(useLocalEdge ? { channel: 'msedge' } : {}),
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
