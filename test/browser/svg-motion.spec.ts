import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("uses native geometry lengths and WAAPI for every drawable primitive", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.mount("primitives"),
  );

  expect(result.hasNativeAnimate).toBe(true);
  expect(result.geometry.map(({ name }) => name)).toEqual([
    "path",
    "line",
    "polyline",
    "polygon",
    "circle",
    "ellipse",
    "rect",
  ]);
  expect(result.geometry.every(({ length }) => length > 0)).toBe(true);
  expect(result.geometry.every(({ animations }) => animations === 1)).toBe(
    true,
  );
  expect(result.animationCount).toBe(7);
  expect(result.diagnostics).toEqual([]);
});

test("keeps gradient, mask, clip, filter, and use references local", async ({
  page,
}) => {
  await page.evaluate(() => window.svgMotionHarness.mount("advanced"));
  const references = await page.evaluate(() =>
    window.svgMotionHarness.references(),
  );

  expect(references.values).toHaveLength(5);
  expect(references.targets.every(({ exists }) => exists)).toBe(true);
  expect(
    references.targets.every(({ id }) => id.startsWith("svg-motion-")),
  ).toBe(true);
});

test("fades visible text, image, and use leaves and diagnoses no geometry", async ({
  page,
}) => {
  const fallback = await page.evaluate(() =>
    window.svgMotionHarness.mount("fallback"),
  );
  expect(fallback.geometry.filter(({ animations }) => animations > 0)).toEqual([
    expect.objectContaining({ name: "path" }),
  ]);
  expect(fallback.animationCount).toBe(4);
  expect(fallback.diagnostics).toEqual([]);

  const textOnly = await page.evaluate(() =>
    window.svgMotionHarness.mount("noGeometry"),
  );
  expect(textOnly.animationCount).toBe(1);
  expect(textOnly.diagnostics).toEqual([
    { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
  ]);
});

test("controller operations and instance destroy clean up", async ({
  page,
}) => {
  await page.evaluate(() => window.svgMotionHarness.mount("primitives"));

  const idleAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expect(idleAnimations).toHaveLength(7);
  expect(
    idleAnimations.every(
      ({ currentTime, playbackRate, playState }) =>
        currentTime === 0 && playbackRate === 1 && playState === "paused",
    ),
  ).toBe(true);

  await page.evaluate(() => window.svgMotionHarness.play());
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.ready),
    );
  });
  await page.waitForTimeout(50);
  const runningAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expect(
    runningAnimations.every(
      ({ currentTime, playbackRate, playState }) =>
        currentTime !== null &&
        currentTime > 0 &&
        playbackRate === 1 &&
        playState === "running",
    ),
  ).toBe(true);

  await page.evaluate(() => window.svgMotionHarness.pause());
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.ready),
    );
  });
  const pausedAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expect(
    pausedAnimations.every(({ playState }) => playState === "paused"),
  ).toBe(true);
  await page.waitForTimeout(50);
  expect(
    await page.evaluate(() => window.svgMotionHarness.nativeAnimations()),
  ).toEqual(pausedAnimations);
  await page.evaluate(() => window.svgMotionHarness.seek(0.5));
  expect(
    (
      await page.evaluate(() => window.svgMotionHarness.nativeAnimations())
    ).every(
      ({ currentTime, playState }) =>
        currentTime === 500 && playState === "paused",
    ),
  ).toBe(true);

  await page.evaluate(() => window.svgMotionHarness.reverse());
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.ready),
    );
  });
  await page.waitForTimeout(50);
  expect(
    (
      await page.evaluate(() => window.svgMotionHarness.nativeAnimations())
    ).every(
      ({ currentTime, playbackRate, playState }) =>
        currentTime !== null &&
        currentTime < 500 &&
        playbackRate === -1 &&
        playState === "running",
    ),
  ).toBe(true);

  const cancelled = await page.evaluate(() => window.svgMotionHarness.cancel());
  expect(cancelled.state).toBe("cancelled");
  expect(cancelled.animationCount).toBe(0);
  expect(
    await page.evaluate(() => window.svgMotionHarness.nativeAnimations()),
  ).toEqual([]);

  const restarted = await page.evaluate(() =>
    window.svgMotionHarness.restart(),
  );
  expect(restarted.state).toBe("running");
  expect(restarted.animationCount).toBe(7);
  expect(
    (
      await page.evaluate(() => window.svgMotionHarness.nativeAnimations())
    ).every(
      ({ currentTime, playbackRate, playState }) =>
        currentTime !== null &&
        currentTime < 100 &&
        playbackRate === 1 &&
        playState === "running",
    ),
  ).toBe(true);

  const finished = await page.evaluate(() => window.svgMotionHarness.finish());
  expect(finished.state).toBe("finished");
  expect(finished.animationCount).toBe(0);

  const destroyed = await page.evaluate(() =>
    window.svgMotionHarness.destroyInstance(),
  );
  expect(destroyed).toEqual({ connected: false, state: "destroyed" });
});

test("draw progress has deterministic visual snapshots", async ({ page }) => {
  const stage = page.locator("#stage");
  await page.evaluate(() => window.svgMotionHarness.mount("primitives"));

  for (const progress of [0, 0.5, 1]) {
    await page.evaluate(
      (value) => window.svgMotionHarness.seek(value),
      progress,
    );
    await expect(stage).toHaveScreenshot(`draw-${progress * 100}.png`, {
      animations: "allow",
      caret: "hide",
    });
  }
});
