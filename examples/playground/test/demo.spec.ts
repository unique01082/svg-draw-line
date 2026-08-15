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
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("running");
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

test("loads every gallery specimen into the lab", async ({ page }) => {
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(5);
  await page
    .getByRole("button", { name: "Open Layered signal in Lab" })
    .click();
  await expect(
    page.getByRole("img", { name: "Layered signal" }),
  ).toBeVisible();
  await expect(page.getByLabel("Preset")).toHaveValue("scale");
});

test("loads URL and File sources", async ({ page }) => {
  await page.route("**/remote.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"><title>Remote</title><circle cx="8" cy="8" r="6"/></svg>',
    }),
  );
  await page
    .getByLabel("SVG markup")
    .fill('<svg xmlns="http://www.w3.org/2000/svg"><title>Pending</title></svg>');
  await page.getByLabel("URL source").check();
  await page.waitForTimeout(300);
  await expect(page.locator("[data-stage] svg title")).toHaveText(
    "Geometry atlas",
  );
  await page.getByLabel("SVG URL").fill("/remote.svg");
  await page.getByRole("button", { name: "Load URL" }).click();
  await expect(page.locator("[data-stage] svg title")).toHaveText("Remote");

  await page.getByLabel("File source").check();
  await page.getByLabel("SVG file").setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Local</title><rect width="10" height="10"/></svg>',
    ),
  });
  await expect(page.locator("[data-stage] svg title")).toHaveText("Local");
});
