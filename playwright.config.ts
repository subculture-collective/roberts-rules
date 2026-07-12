import { defineConfig, devices } from '@playwright/test';

const port = 4173;
const apiPort = 18080;
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://roberts_rules:change-me@127.0.0.1:55433/roberts_rules?sslmode=disable';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    { command:`pnpm --filter @subculture/roberts-rules-api dev`,url:`http://127.0.0.1:${apiPort}/ready`,reuseExistingServer:!process.env.CI,timeout:120_000,env:{DATABASE_URL:databaseUrl,PORT:String(apiPort),APP_ORIGIN:`http://127.0.0.1:${port}`} },
    { command:`pnpm --dir web exec vite --host 127.0.0.1 --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:!process.env.CI,timeout:120_000,env:{VITE_API_TARGET:`http://127.0.0.1:${apiPort}`} },
  ],
});
