import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: "http://127.0.0.1:4173/snow-letters/" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome HiDPI"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173/snow-letters/",
  },
});
