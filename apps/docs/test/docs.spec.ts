import { expect, test } from "@playwright/test";

const errors = new WeakMap<object, string[]>();
const externalRequests = new WeakMap<object, string[]>();
const docsRoutes = [
  "/",
  "/docs/0.1/getting-started",
  "/docs/0.1/core",
  "/docs/0.1/motion",
  "/docs/0.1/react",
  "/docs/0.1/guides",
  "/docs/0.1/reference",
  "/playground",
  "/changelog",
];

test.beforeEach(async ({ page }) => {
  const captured: string[] = [];
  const external: string[] = [];
  errors.set(page, captured);
  externalRequests.set(page, external);
  page.on("console", (message) => {
    if (message.type() === "error") captured.push(message.text());
  });
  page.on("pageerror", (error) => captured.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") external.push(request.url());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
  expect(externalRequests.get(page) ?? []).toEqual([]);
});

async function waitForReady(page: Parameters<typeof test>[0]["page"]) {
  await expect(page.locator("[data-motion-status]")).toHaveText(
    /idle|running|paused|finished|cancelled/,
  );
  await expect(page.locator("[data-stage] svg")).toBeVisible();
}

test("prerenderable route manifest has deep-link content and SEO", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium");
  for (const route of docsRoutes) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.+/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`^https://svg-motion\\.baole\\.space/`),
    );
  }
});

test("navigates versioned docs with keyboard-accessible landmarks", async ({
  page,
  browserName,
}) => {
  await page.goto("/docs/latest/getting-started");
  await expect(
    page.getByRole("heading", { name: "Getting started" }),
  ).toBeVisible();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page
    .getByRole("navigation", { name: "Documentation" })
    .getByRole("link", { name: /Core API/ })
    .click();
  await expect(page).toHaveURL(/\/docs\/0\.1\/core$/);
  await expect(
    page.getByRole("navigation", { name: "On this page" }),
  ).toBeVisible();
});

test("renders and animates every licensed specimen", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium");
  await page.goto("/playground?icon=bachelor-hat&preset=draw");
  await waitForReady(page);
  await expect(page.locator(".specimen-list > button")).toHaveCount(30);
  for (const button of await page.locator(".specimen-list > button").all()) {
    await button.click();
    await waitForReady(page);
    await expect(page.locator("[data-stage] svg path").first()).toBeAttached();
    await expect
      .poll(() =>
        page
          .locator("[data-stage] svg")
          .evaluate((svg) => svg.getAnimations({ subtree: true }).length),
      )
      .toBeGreaterThan(0);
  }
});

test("playground continuously replays motion without manual transport", async ({
  page,
}) => {
  await page.goto("/playground?icon=bachelor-hat&preset=draw");
  await waitForReady(page);
  await expect(page.getByLabel("Autoplay")).toBeChecked();
  await page.getByLabel("Duration (ms)").fill("180");
  await waitForReady(page);
  await expect
    .poll(() =>
      page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running"),
        ),
    )
    .toBe(true);
  await page.waitForTimeout(500);
  await expect
    .poll(() =>
      page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running"),
        ),
    )
    .toBe(true);
});

test("home page renders every visual specimen as live motion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-motion-preview]")).toHaveCount(4);
  for (const preview of await page.locator("[data-motion-preview]").all()) {
    await expect(preview.locator("svg")).toBeVisible();
    await expect
      .poll(() =>
        preview
          .locator("svg")
          .evaluate((svg) => svg.getAnimations({ subtree: true }).length),
      )
      .toBeGreaterThan(0);
  }
});

test("shares icon and preset and exposes native controller actions", async ({
  page,
}) => {
  await page.goto("/playground?icon=computer&preset=scale");
  await waitForReady(page);
  await expect(page.getByRole("button", { name: /Computer/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("Preset")).toHaveValue("scale");
  await page.getByLabel("Duration (ms)").fill("10000");
  await waitForReady(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === "running"),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("paused");
  await page.getByLabel("Progress").fill("50");
  await expect
    .poll(() =>
      page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => Number(animation.currentTime) >= 4900),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Reverse", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => animation.playbackRate < 0),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some(
              (animation) =>
                animation.playbackRate > 0 &&
                Number(animation.currentTime) < 500,
            ),
        ),
    )
    .toBe(true);
  await expect(page).toHaveURL(/icon=computer.*preset=scale/);
});

test("accepts markup, URL and File sources and disables controls on error", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium");
  await page.goto("/playground");
  await waitForReady(page);
  await page.getByLabel("markup").check();
  await page
    .getByLabel("SVG markup")
    .fill(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Markup</title><path d="M0 0H20"/></svg>',
    );
  await waitForReady(page);
  await expect(page.locator("[data-stage] svg title")).toHaveText("Markup");
  await page.route("**/remote.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"><title>Remote</title><circle cx="8" cy="8" r="6"/></svg>',
    }),
  );
  await page.getByLabel("url").check();
  await page.getByLabel("SVG URL").fill("/remote.svg");
  await page.getByRole("button", { name: "Load URL" }).click();
  await expect(page.locator("[data-stage] svg title")).toHaveText("Remote");
  await page.getByLabel("file").check();
  await page.getByLabel("SVG file").setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>File</title><rect width="20" height="20"/></svg>',
    ),
  });
  await expect(page.locator("[data-stage] svg title")).toHaveText("File");
  await page.getByLabel("markup").check();
  await page.getByLabel("SVG markup").fill("<svg><script>");
  await expect(page.getByRole("alert")).toContainText("INVALID_SVG");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
});

test("has no horizontal overflow at 375px and keeps stage first", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/playground");
  await waitForReady(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const orders = await page
    .locator(".playground-grid > *")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.className,
        top: element.getBoundingClientRect().top,
      })),
    );
  expect(
    orders.find(({ name }) => name.includes("playground-stage"))!.top,
  ).toBeLessThan(
    orders.find(({ name }) => name.includes("specimen-rail"))!.top,
  );
});

test("matches the locked Precision Lab Night Glass compositions", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-motion-preview] svg")).toHaveCount(4);
  await expect
    .poll(() =>
      page
        .locator("[data-motion-preview] svg")
        .evaluateAll((svgs) =>
          svgs.some((svg) => svg.getAnimations({ subtree: true }).length > 0),
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator("[data-motion-preview] svg")
        .evaluateAll((svgs) =>
          svgs.map((svg) => svg.getAnimations({ subtree: true }).length),
        ),
    )
    .toEqual([0, 0, 0, 0]);
  await expect(page).toHaveScreenshot("home-desktop.png", {
    animations: "allow",
    maxDiffPixelRatio: 0.04,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/playground");
  await waitForReady(page);
  await expect(page.locator("[data-motion-status]")).toHaveText("finished");
  await expect(page).toHaveScreenshot("playground-mobile.png", {
    animations: "allow",
    maxDiffPixelRatio: 0.04,
  });
});
