import { defineConfig, devices } from '@playwright/test';

const MOCK = 'http://localhost:8787';
const APP = 'http://localhost:1420';

export default defineConfig({
  testDir: 'e2e',
  // The mock daemon is one shared in-memory state, so tests run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: APP, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node mock/server.js',
      url: `${MOCK}/tasks`,
      reuseExistingServer: !process.env.CI,
      // Slow enough that a test can watch a layer run; no random approvals.
      env: { MOCK_STEP_MS: '2500', MOCK_APPROVAL_MS: '600000' },
    },
    {
      command: 'node node_modules/vite/bin/vite.js --port 1420',
      url: APP,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: MOCK, VITE_DEMO: '1' },
    },
  ],
});
