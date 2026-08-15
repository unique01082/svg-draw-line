import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.DOCS_TEST_PORT ?? 4317);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test",
  use: {
    baseURL: origin,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: false,
  },
});
