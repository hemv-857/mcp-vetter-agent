import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',

    /* Pinned, not inherited. Several layers here refuse to load at all under
       prefers-reduced-motion — by design — so a machine with it enabled would
       fail these for the right reason at the wrong time. */
    reducedMotion: 'no-preference',

    trace: 'on-first-retry',
  },

  /* Desktop is the product's scene; the phone viewport is here because the
     layer and overflow assertions are exactly what breaks at 390px. */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  /* Vite pins itself to 5173 via strictPort, so reuse the server that is
     almost certainly already running rather than fighting it for the port. */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
