import { expect, test, type Page } from "@playwright/test";

type NativeAnimationSnapshot = ReturnType<
  Window["svgMotionHarness"]["nativeAnimations"]
>[number];

function expectNativeCheckpoint(
  animations: readonly NativeAnimationSnapshot[],
  predicate: (animation: NativeAnimationSnapshot) => boolean,
) {
  expect(animations).toHaveLength(7);
  expect(animations.every(predicate)).toBe(true);
}

type ArtworkSnapshot = ReturnType<Window["svgMotionHarness"]["artwork"]>;

function expectRestoredArtwork(snapshot: ArtworkSnapshot, state: string) {
  expect(snapshot.original).toContain("<svg");
  expect(snapshot.current).toBe(snapshot.original);
  expect(snapshot.matchesOriginal).toBe(true);
  expect(snapshot.animationCount).toBe(0);
  expect(snapshot.state).toBe(state);
}

async function installRequestInterception(page: Page) {
  const observed: string[] = [];
  const attackerRequests: string[] = [];
  const unexpectedRequests: string[] = [];
  const harnessOrigin = new URL(page.url()).origin;
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const parsed = new URL(url);
    observed.push(url);
    if (parsed.origin !== harnessOrigin) unexpectedRequests.push(url);
    if (parsed.hostname === "attacker.invalid") {
      attackerRequests.push(url);
      await route.abort("blockedbyclient");
    } else if (parsed.origin !== harnessOrigin) {
      await route.abort("blockedbyclient");
    } else if (parsed.pathname === "/__interception_probe__") {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
  await page.evaluate(() => fetch("/__interception_probe__"));
  expect(observed.some((url) => url.endsWith("/__interception_probe__"))).toBe(
    true,
  );
  return { attackerRequests, observed, unexpectedRequests };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("empty native animation checkpoints cannot pass", () => {
  expect(() =>
    expectNativeCheckpoint([], ({ playState }) => playState === "running"),
  ).toThrow();
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

test("resolves detached internal stylesheet paint without connecting the caller", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.detachedInternalStyle(),
  );

  expect(result.started).toEqual({
    animationCount: 1,
    connected: false,
    hasFillOpacityKeyframe: false,
    stroke: "",
    strokeOpacity: "0.75",
    strokeWidth: "",
  });
  expect(result.effective.fill).toBe("none");
  expect(result.effective.stroke).toBe("rgb(220, 38, 38)");
  expect(result.effective.strokeOpacity).toBe("0.75");
  expect(result.effective.strokeWidth).toBe("5px");
  expect(result.restored).toBe(true);
  expect(result.state).toBe("cancelled");
  expect(result.terminalAnimationCount).toBe(0);
  expect(result.probeCount).toBe(0);
});

test("detached style resolution cannot load or execute hostile probe content", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await installRequestInterception(page);

  const result = await page.evaluate(() =>
    window.svgMotionHarness.detachedHostileStyleProbe(),
  );
  await page.waitForTimeout(100);

  expect(result).toEqual({
    callerConnected: false,
    executed: 0,
    probeCount: 0,
    restored: true,
    state: "cancelled",
  });
  expect(requests.attackerRequests).toEqual([]);
  expect(requests.unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("stylesheet-hidden detached images do not shift visible stagger timing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await installRequestInterception(page);

  const result = await page.evaluate(() =>
    window.svgMotionHarness.detachedHiddenImageStagger(),
  );
  await page.waitForTimeout(100);

  expect(result).toEqual({
    callerConnected: false,
    created: [
      { delay: 0, target: "visible-path" },
      { delay: 100, target: "visible-successor" },
    ],
    probeCount: 0,
    restored: true,
    state: "cancelled",
  });
  expect(requests.attackerRequests).toEqual([]);
  expect(requests.unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
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
  expectNativeCheckpoint(
    idleAnimations,
    ({ currentTime, playbackRate, playState }) =>
      currentTime === 0 && playbackRate === 1 && playState === "paused",
  );

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
  expectNativeCheckpoint(
    runningAnimations,
    ({ currentTime, playbackRate, playState }) =>
      currentTime !== null &&
      currentTime > 0 &&
      playbackRate === 1 &&
      playState === "running",
  );

  await page.evaluate(() => window.svgMotionHarness.pause());
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.ready),
    );
  });
  const pausedAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expectNativeCheckpoint(
    pausedAnimations,
    ({ playState }) => playState === "paused",
  );
  await page.waitForTimeout(50);
  const stablePausedAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expectNativeCheckpoint(
    stablePausedAnimations,
    ({ playState }) => playState === "paused",
  );
  expect(stablePausedAnimations).toEqual(pausedAnimations);
  await page.evaluate(() => window.svgMotionHarness.seek(0.5));
  const soughtAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expectNativeCheckpoint(
    soughtAnimations,
    ({ currentTime, playState }) =>
      currentTime === 500 && playState === "paused",
  );

  await page.evaluate(() => window.svgMotionHarness.reverse());
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.ready),
    );
  });
  await page.waitForTimeout(50);
  const reversedAnimations = await page.evaluate(() =>
    window.svgMotionHarness.nativeAnimations(),
  );
  expectNativeCheckpoint(
    reversedAnimations,
    ({ currentTime, playbackRate, playState }) =>
      currentTime !== null &&
      currentTime < 500 &&
      playbackRate === -1 &&
      playState === "running",
  );

  const cancelled = await page.evaluate(() => window.svgMotionHarness.cancel());
  expect(cancelled.state).toBe("cancelled");
  expect(cancelled.animationCount).toBe(0);
  expect(
    await page.evaluate(() => window.svgMotionHarness.nativeAnimations()),
  ).toEqual([]);

  const restarted = await page.evaluate(() => {
    const controller = window.svgMotionHarness.restart();
    const nativeAnimations = window.svgMotionHarness.nativeAnimations();
    window.svgMotionHarness.pause();
    return { controller, nativeAnimations };
  });
  expect(restarted.controller.state).toBe("running");
  expect(restarted.controller.animationCount).toBe(7);
  expectNativeCheckpoint(
    restarted.nativeAnimations,
    ({ currentTime, playbackRate, playState }) =>
      currentTime !== null &&
      currentTime >= 0 &&
      playbackRate === 1 &&
      playState === "running",
  );

  const finished = await page.evaluate(() => window.svgMotionHarness.finish());
  expect(finished.state).toBe("finished");
  expect(finished.animationCount).toBe(0);

  const publicMount = await page.evaluate(() =>
    window.svgMotionHarness.mountPublicInstance("primitives"),
  );
  expect(publicMount.animationCount).toBe(7);
  const destroyed = await page.evaluate(() =>
    window.svgMotionHarness.destroyInstance(),
  );
  expect(destroyed).toEqual({ connected: false, state: "destroyed" });
});

test("restores exact prepared artwork after every native terminal path", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.svgMotionHarness.mount("primitives", { duration: 20 }),
  );
  expectRestoredArtwork(
    await page.evaluate(() => window.svgMotionHarness.completeNaturally()),
    "finished",
  );

  await page.evaluate(() => window.svgMotionHarness.mount("primitives"));
  await page.evaluate(() => window.svgMotionHarness.finish());
  expectRestoredArtwork(
    await page.evaluate(() => window.svgMotionHarness.artwork()),
    "finished",
  );

  await page.evaluate(() => window.svgMotionHarness.mount("primitives"));
  await page.evaluate(() => window.svgMotionHarness.cancel());
  expectRestoredArtwork(
    await page.evaluate(() => window.svgMotionHarness.artwork()),
    "cancelled",
  );

  await page.evaluate(() => window.svgMotionHarness.mount("primitives"));
  expectRestoredArtwork(
    await page.evaluate(() => window.svgMotionHarness.destroyController()),
    "destroyed",
  );
});

test("renders the safe embedded bitmap without errors or unexpected requests", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await installRequestInterception(page);

  const result = await page.evaluate(() =>
    window.svgMotionHarness.mount("embeddedBitmap"),
  );
  await page.evaluate(() => window.svgMotionHarness.waitForLoading());

  expect(result.svgCount).toBe(1);
  expect(result.embeddedBitmapCount).toBe(1);
  expect(result.dataBitmapCount).toBe(1);
  expect(result.diagnostics).toEqual([
    { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
  ]);
  expect(requests.attackerRequests).toEqual([]);
  expect(requests.unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("sanitizes hostile browser input before it can perform network requests", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await installRequestInterception(page);

  const result = await page.evaluate(() =>
    window.svgMotionHarness.mountMaliciousSource(),
  );
  await page.evaluate(() => window.svgMotionHarness.waitForLoading());

  expect(result.sourceDangerousElementCount).toBeGreaterThan(0);
  expect(result.sourceExternalReferenceCount).toBeGreaterThan(0);
  expect(result.originalUnchanged).toBe(true);
  expect(result.svgCount).toBe(1);
  expect(result.dangerousElementCount).toBe(0);
  expect(result.dangerousAttributeCount).toBe(0);
  expect(result.externalReferenceCount).toBe(0);
  expect(result.diagnostics.length).toBeGreaterThan(0);
  expect(
    result.diagnostics.every(
      (diagnostic) =>
        Object.keys(diagnostic).sort().join(",") === "code,count" &&
        typeof diagnostic.code === "string" &&
        typeof diagnostic.count === "number",
    ),
  ).toBe(true);
  expect(JSON.stringify(result.diagnostics)).not.toMatch(
    /attacker|hostile|constructor|ownerDocument/,
  );
  expect(requests.attackerRequests).toEqual([]);
  expect(requests.unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
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

test("native finish is visually identical to the unanimated artwork", async ({
  page,
}) => {
  const stage = page.locator("#stage");
  await page.evaluate(() =>
    window.svgMotionHarness.renderUnanimated("primitives"),
  );
  await expect(stage).toHaveScreenshot("draw-original.png", {
    animations: "allow",
    caret: "hide",
  });

  await page.evaluate(() => window.svgMotionHarness.mount("primitives"));
  await page.evaluate(() => window.svgMotionHarness.finish());
  await expect(stage).toHaveScreenshot("draw-original.png", {
    animations: "allow",
    caret: "hide",
  });
});
