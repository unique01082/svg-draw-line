import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "SVG Motion Lab" }),
  ).toBeVisible();
  await expect.poll(() => errors).toEqual([]);
});

test("exercises all presets and transport controls", async ({ page }) => {
  for (const preset of ["draw", "fade", "scale", "stagger", "pulse"]) {
    await page.getByLabel("Preset").selectOption(preset);
    await expect(page.locator("[data-motion-status]")).not.toHaveText("error");
  }
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("paused");
  await page.getByLabel("Progress").fill("50");
  await page.getByRole("button", { name: "Reverse" }).click();
  await page.getByRole("button", { name: "Restart" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("finished");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("cancelled");
});

test("reports invalid markup and can reset", async ({ page }) => {
  await page.getByLabel("SVG markup").fill("<svg><script>");
  await expect(page.getByRole("alert")).toContainText("INVALID_SVG");
  await page.getByRole("button", { name: "Reset source" }).click();
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toBeVisible();
});
