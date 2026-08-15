import { createServer } from "node:http";

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

async function startCorsFixtureServer() {
  const requests: Array<{ origin: string | undefined; path: string }> = [];
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" stroke="black"/></svg>';
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    requests.push({ origin: request.headers.origin, path });
    const respond = () => {
      if (path !== "/denied.svg") {
        response.setHeader("access-control-allow-origin", "*");
      }
      response.setHeader("content-type", "image/svg+xml");
      response.end(svg);
    };
    if (path === "/slow.svg") {
      const timer = setTimeout(respond, 250);
      request.once("close", () => clearTimeout(timer));
    } else {
      respond();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("CORS fixture server did not bind to a TCP port.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
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

test("accepts every supported source type from another browser realm", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.crossRealmSources(),
  );

  expect(result).toEqual(
    ["URL", "Blob", "File", "SVGSVGElement"].map((name) => ({
      diagnostics: [],
      name,
      pathAnimations: 1,
    })),
  );
});

test("loads CORS-enabled URLs and types denied or aborted fetches", async ({
  page,
}) => {
  const fixtureServer = await startCorsFixtureServer();
  try {
    const allowed = await page.evaluate(
      (url) => window.svgMotionHarness.prepareRemoteSource(url),
      `${fixtureServer.origin}/allowed.svg`,
    );
    const denied = await page.evaluate(
      (url) => window.svgMotionHarness.prepareRemoteSource(url),
      `${fixtureServer.origin}/denied.svg`,
    );
    const aborted = await page.evaluate(
      (url) => window.svgMotionHarness.prepareRemoteSource(url, 10),
      `${fixtureServer.origin}/slow.svg`,
    );

    expect(allowed).toEqual({ code: null, diagnostics: [], pathCount: 1 });
    expect(denied).toEqual({
      code: "FETCH_FAILED",
      diagnostics: [],
      pathCount: 0,
    });
    expect(aborted).toEqual({
      code: "ABORTED",
      diagnostics: [],
      pathCount: 0,
    });
    expect(fixtureServer.requests.map(({ path }) => path)).toEqual([
      "/allowed.svg",
      "/denied.svg",
      "/slow.svg",
    ]);
    const pageOrigin = new URL(page.url()).origin;
    expect(
      fixtureServer.requests.every(({ origin }) => origin === pageOrigin),
    ).toBe(true);
  } finally {
    await fixtureServer.close();
  }
});

test("leaves reduced-motion policy to the consumer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const result = await page.evaluate(async () => {
    const mounted = await window.svgMotionHarness.mount("primitives");
    return {
      animationDurations: window.svgMotionHarness
        .nativeAnimations()
        .map(({ duration }) => duration),
      animationCount: mounted.animationCount,
      mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      state: mounted.state,
    };
  });

  expect(result).toEqual({
    animationCount: 7,
    animationDurations: Array.from({ length: 7 }, () => 1000),
    mediaMatches: true,
    state: "idle",
  });
});

test("keeps trusted nested stylesheet selectors bound after namespacing", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.trustedNestedStylesheet(),
  );

  expect(result).toEqual({
    colorPreserved: true,
    fill: "rgb(255, 255, 255)",
    namespaced: true,
    otherFill: "rgb(255, 255, 255)",
    staleNestedSelector: false,
    stroke: "rgb(255, 0, 0)",
  });
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

test("honors a descendant visibility override under a hidden ancestor", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.inheritedVisibilityOverride(),
  );

  expect(result).toEqual({
    created: ["visible-override"],
    diagnostics: [],
    effective: { hidden: "hidden", visible: "visible" },
    restored: true,
    state: "cancelled",
    terminalAnimationCount: 0,
  });
});

test("does not reveal zero-area fill-only geometry", async ({ page }) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.zeroAreaFillGeometry(),
  );

  expect(result).toEqual({
    created: ["svg"],
    diagnostics: [{ code: "NO_DRAWABLE_GEOMETRY", count: 1 }],
    restored: true,
    state: "destroyed",
    temporaryStrokes: ["", "", "", ""],
    terminalAnimationCount: 0,
  });
});

test("classifies rendered path fill without revealing retraced geometry", async ({
  browserName,
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.renderedPathFillClassification(),
  );

  expect(result).toEqual({
    created:
      browserName === "webkit"
        ? [
            "large-triangle",
            "sparse-triangle",
            "css-to-retrace",
            "semicircle",
            "arc-circle",
            "cubic",
            "translated-cubic",
            "bowtie",
            "many-segments",
            "polyline-bowtie",
          ]
        : [
            "large-triangle",
            "sparse-triangle",
            "css-to-area",
            "semicircle",
            "arc-circle",
            "cubic",
            "translated-cubic",
            "bowtie",
            "many-segments",
            "polyline-bowtie",
          ],
    cssPathSupported: browserName !== "webkit",
    diagnostics: [],
    restoredAfterDestroy: true,
    temporaryStrokeTargets:
      browserName === "webkit"
        ? [
            "large-triangle",
            "sparse-triangle",
            "css-to-retrace",
            "semicircle",
            "arc-circle",
            "cubic",
            "translated-cubic",
            "bowtie",
            "many-segments",
            "polyline-bowtie",
          ]
        : [
            "large-triangle",
            "sparse-triangle",
            "css-to-area",
            "semicircle",
            "arc-circle",
            "cubic",
            "translated-cubic",
            "bowtie",
            "many-segments",
            "polyline-bowtie",
          ],
    terminalAnimationCount: 0,
  });
});

test("classifies thin fill that is visibly enlarged by a transform", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.thinTransformedFillClassification(),
  );

  expect(result.paintedPixels).toBeGreaterThan(0);
  expect(result).toMatchObject({
    created: ["thin-curve"],
    restored: true,
  });
});

test("does not collapse a shallow lens under a nonuniform viewBox", async ({
  browserName,
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.shallowLensClassification(),
  );

  if (browserName !== "firefox")
    expect(result.paintedPixels).toBeGreaterThan(0);
  expect(result.created).toEqual(["shallow-lens"]);
});

test("bounds work for large repeated polylines", async ({ page }) => {
  const empty = await page.evaluate(() =>
    window.svgMotionHarness.largeRepeatedPolylineClassification("evenodd"),
  );
  const visible = await page.evaluate(() =>
    window.svgMotionHarness.largeRepeatedPolylineClassification("nonzero"),
  );

  expect(empty).toMatchObject({
    created: ["svg"],
    diagnostics: [{ code: "NO_DRAWABLE_GEOMETRY", count: 1 }],
  });
  expect(empty.elapsed).toBeLessThan(1000);
  expect(visible).toMatchObject({
    created: ["polyline"],
    diagnostics: [],
  });
  expect(visible.elapsed).toBeLessThan(1000);
});

test("bounds work for equivalent curved even-odd contours", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.largeRepeatedCurvedPathClassification(),
  );

  expect(result).toMatchObject({
    created: ["svg"],
    diagnostics: [{ code: "NO_DRAWABLE_GEOMETRY", count: 1 }],
  });
  expect(result.elapsed).toBeLessThan(1000);
});

test("bounds work for differently subdivided circular contours", async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.largeSubdividedArcClassification(),
  );

  expect(result).toMatchObject({
    created: ["svg"],
    diagnostics: [{ code: "NO_DRAWABLE_GEOMETRY", count: 1 }],
  });
  expect(result.elapsed).toBeLessThan(1000);
});

test("classifies stylesheet-overridden paths without connecting the caller", async ({
  browserName,
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.detachedCssPathClassification(),
  );

  expect(result).toEqual({
    callerLiveConnected: false,
    created: browserName === "webkit" ? ["css-to-retrace"] : ["css-to-area"],
    cssPathSupported: browserName !== "webkit",
    restoredAfterDestroy: true,
    terminalAnimationCount: 0,
  });
});

test("honors a document stylesheet d override", async ({
  browserName,
  page,
}) => {
  const result = await page.evaluate(() =>
    window.svgMotionHarness.externalCssPathOverride(),
  );

  expect(result).toEqual(
    browserName === "webkit"
      ? {
          created: ["external-d"],
          cssPathSupported: false,
          diagnostics: [],
          temporaryStroke: "rgb(255, 0, 0)",
        }
      : {
          created: ["svg"],
          cssPathSupported: true,
          diagnostics: [{ code: "NO_DRAWABLE_GEOMETRY", count: 1 }],
          temporaryStroke: "",
        },
  );
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
