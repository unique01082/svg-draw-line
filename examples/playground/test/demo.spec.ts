import { expect, test } from "@playwright/test";

const capturedErrors = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  capturedErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "SVG Motion Lab" }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  await expect.poll(() => capturedErrors.get(page) ?? []).toEqual([]);
});

async function readySequence(page: Parameters<typeof test>[0]["page"]) {
  return Number(
    await page.locator("[data-stage]").getAttribute("data-ready-sequence"),
  );
}

async function waitForReady(
  page: Parameters<typeof test>[0]["page"],
  previousSequence = -1,
) {
  await expect
    .poll(async () => readySequence(page))
    .toBeGreaterThan(previousSequence);
  await expect(page.locator("[data-motion-status]")).toHaveText(
    /idle|running|paused|finished|cancelled/,
  );
}

test("keeps autoplay disabled motion idle and starts it when enabled", async ({
  page,
}) => {
  await waitForReady(page);
  await expect(page.getByLabel("Autoplay")).not.toBeChecked();
  await expect(page.locator("[data-motion-status]")).toHaveText("idle");

  const beforeAutoplay = await readySequence(page);
  await page.getByLabel("Autoplay").check();
  await waitForReady(page, beforeAutoplay);
  await expect(page.locator("[data-motion-status]")).toHaveText("running");
});

test("remounts every preset and applies controller transport actions", async ({
  page,
}) => {
  await waitForReady(page);
  const beforeDuration = await readySequence(page);
  await page.getByLabel("Duration (ms)").fill("10000");
  await waitForReady(page, beforeDuration);

  // The initial ready signal covers draw; every other option must remount.
  for (const preset of ["fade", "scale", "stagger", "pulse", "draw"]) {
    const beforePreset = await readySequence(page);
    await page.getByLabel("Preset").selectOption(preset);
    await waitForReady(page, beforePreset);
    await expect(page.locator("[data-motion-status]")).toHaveText("idle");
  }

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("running");
  await expect
    .poll(async () => {
      return page.locator("[data-stage] svg").evaluate((svg) => {
        const animations = svg.getAnimations({ subtree: true });
        return (
          animations.length > 0 &&
          animations.every((animation) => animation.playState === "running")
        );
      });
    })
    .toBe(true);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("paused");
  await expect
    .poll(async () => {
      return page.locator("[data-stage] svg").evaluate((svg) => {
        const animations = svg.getAnimations({ subtree: true });
        return (
          animations.length > 0 &&
          animations.every((animation) => animation.playState === "paused")
        );
      });
    })
    .toBe(true);
  await page.getByLabel("Progress").fill("50");
  await expect
    .poll(async () => {
      return page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => Number(animation.currentTime) >= 4900),
        );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Reverse" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("running");
  await expect
    .poll(async () => {
      return page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some((animation) => animation.playbackRate < 0),
        );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("running");
  await expect
    .poll(async () => {
      return page
        .locator("[data-stage] svg")
        .evaluate((svg) =>
          svg
            .getAnimations({ subtree: true })
            .some(
              (animation) =>
                Number(animation.currentTime) < 250 &&
                animation.playbackRate > 0,
            ),
        );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("finished");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("cancelled");
});

test("reports invalid markup and can reset", async ({ page }) => {
  await waitForReady(page);
  await page.getByLabel("SVG markup").fill("<svg><script>");
  await expect(page.getByLabel("Progress")).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("INVALID_SVG");
  await expect(page.getByLabel("Progress")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset source" }).click();
  await waitForReady(page);
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toBeVisible();
  await expect(page.getByLabel("Progress")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
});

test("loads every gallery specimen into the lab", async ({ page }) => {
  await waitForReady(page);
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(5);
  for (const card of await cards.all()) {
    const title = await card.getByRole("heading").textContent();
    const beforeFixture = await readySequence(page);
    await card.getByRole("button").click();
    await waitForReady(page, beforeFixture);
    await expect(page.getByRole("img", { name: title ?? "" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Open ${title} in Lab` }),
    ).toBeVisible();
  }
});

test("loads URL and File sources", async ({ page }) => {
  await waitForReady(page);
  await page.route("**/remote.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"><title>Remote</title><circle cx="8" cy="8" r="6"/></svg>',
    }),
  );
  await page
    .getByLabel("SVG markup")
    .fill(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Pending</title></svg>',
    );
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

test("uses a custom accessible name after editing markup", async ({ page }) => {
  await waitForReady(page);
  const beforeMarkup = await readySequence(page);
  await page
    .getByLabel("SVG markup")
    .fill(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Custom</title><path d="M0 0H10"/></svg>',
    );
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toBeVisible();
  await expect(page.locator("[data-stage] svg title")).toHaveText(
    "Geometry atlas",
  );
  await waitForReady(page, beforeMarkup);
  await expect(
    page.getByRole("img", { name: "Custom SVG markup" }),
  ).toBeVisible();
  await expect(page.locator("[data-stage] svg title")).toHaveText("Custom");
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toHaveCount(
    0,
  );
});

test("disables transport until an option remount is ready", async ({
  page,
}) => {
  let requestCount = 0;
  let releaseOptionRemount: (() => void) | undefined;
  await page.route("**/option-remount.svg", async (route) => {
    requestCount += 1;
    if (requestCount === 2) {
      await new Promise<void>((resolve) => {
        releaseOptionRemount = resolve;
      });
    }
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"><title>Option remount</title><path d="M0 0H10"/></svg>',
    });
  });
  await waitForReady(page);
  await page.getByLabel("URL source").check();
  await page.getByLabel("SVG URL").fill("/option-remount.svg");
  await page.getByRole("button", { name: "Load URL" }).click();
  await waitForReady(page);
  const beforeEasing = await readySequence(page);
  await page.getByLabel("Easing").fill("linear");
  await expect.poll(() => requestCount).toBe(2);
  await expect(page.getByLabel("Progress")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Play" })).toBeDisabled();
  releaseOptionRemount?.();
  await waitForReady(page, beforeEasing);
  await expect(page.getByLabel("Progress")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
});

test("is keyboard labelled and mobile-safe", async ({ page }) => {
  await waitForReady(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const lifecycleStatus = page.getByRole("status");
  await expect(lifecycleStatus).toContainText(
    /idle|running|paused|finished|cancelled/,
  );
  await expect(lifecycleStatus).toHaveAttribute("role", "status");
  await expect(lifecycleStatus).toHaveAttribute("aria-live", "polite");

  for (const label of ["Markup source", "URL source", "File source"]) {
    const labelHeight = await page
      .getByLabel(label)
      .evaluate(
        (input) => input.closest("label")?.getBoundingClientRect().height,
      );
    expect(labelHeight).toBeGreaterThanOrEqual(44);
  }
});
