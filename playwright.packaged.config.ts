import { defineConfig,devices } from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  testMatch:'packaged.spec.ts',
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  reporter:process.env.CI?'github':'list',
  // Enrollment values are credentials. Never persist browser artifacts from this suite.
  use:{baseURL:process.env.PACKAGED_URL??'http://127.0.0.1:18042',trace:'off',screenshot:'off',video:'off'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'firefox',use:{...devices['Desktop Firefox']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'mobile-safari',use:{...devices['iPhone 13']}},
  ],
});
