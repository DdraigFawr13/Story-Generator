import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  // Two spec files at a time against the production build: 116 s to 82 s on 2026-10-16;
  // four workers made 2 of 17 tests flaky, so it stays at two.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
  // One Chromium smoke (REBOOT_PLAN §11). Add engines only for a concrete compatibility need.
  // PLAYWRIGHT_CHROMIUM_PATH (set by .claude/hooks/session-start.sh in cloud sessions) points at
  // a preinstalled Chromium when the pinned build is missing; CI leaves it unset.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
});
