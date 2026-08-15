import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  use: {
    baseURL: "http://127.0.0.1:4317",
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
    command:
      "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4317",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: false,
  },
});
