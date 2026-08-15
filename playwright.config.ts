import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:42871",
    colorScheme: "light",
    contextOptions: { reducedMotion: "no-preference" },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    viewport: { width: 640, height: 480 },
  },
  webServer: {
    command:
      "pnpm exec vite --config test/browser/vite.config.ts --host 127.0.0.1 --port 42871",
    port: 42871,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
