const { defineConfig } = require('@playwright/test');

const local = !process.env.CI;
const port = process.env.KARTESIAN_TEST_PORT || '4174';
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  projects: process.env.PW_BROWSER
    ? [
        {
          name: process.env.PW_BROWSER,
          use: {
            browserName: process.env.PW_BROWSER,
            ...(local && process.env.PW_BROWSER === 'chromium' ? { channel: 'msedge' } : {}),
          },
        },
      ]
    : [
        {
          name: 'chromium',
          use: { browserName: 'chromium', ...(local ? { channel: 'msedge' } : {}) },
        },
        { name: 'firefox', use: { browserName: 'firefox' } },
        { name: 'webkit', use: { browserName: 'webkit' } },
      ],
  webServer: {
    command: 'node scripts/build/serve-next.cjs',
    url: baseURL,
    env: { PORT: port },
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
