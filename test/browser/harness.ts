import {
  type MountSvgMotionOptions,
  type SvgSource,
  type SvgMotionInstance,
  animateSvg,
  mountSvgMotion,
  prepareSvg,
} from "../../src/index";

import advanced from "../fixtures/advanced.svg?raw";
import embeddedBitmap from "../fixtures/embedded-bitmap.svg?raw";
import fallback from "../fixtures/fallback.svg?raw";
import malicious from "../fixtures/malicious.svg?raw";
import noGeometry from "../fixtures/no-geometry.svg?raw";
import primitives from "../fixtures/primitives.svg?raw";

const fixtures = {
  advanced,
  embeddedBitmap,
  fallback,
  noGeometry,
  primitives,
} as const;
type FixtureName = keyof typeof fixtures;

const stage = document.querySelector("#stage")!;
let instance: SvgMotionInstance | undefined;
let originalArtwork = "";

function animationCount(svg: SVGSVGElement): number {
  return [svg, ...svg.querySelectorAll("*")].reduce(
    (count, element) => count + element.getAnimations().length,
    0,
  );
}

function nativeAnimations() {
  if (!instance) throw new Error("Mount a fixture first.");
  return [instance.svg, ...instance.svg.querySelectorAll("*")].flatMap(
    (element) =>
      element.getAnimations().map((animation) => ({
        currentTime:
          typeof animation.currentTime === "number"
            ? animation.currentTime
            : null,
        duration:
          typeof animation.effect?.getTiming().duration === "number"
            ? animation.effect.getTiming().duration
            : null,
        playbackRate: animation.playbackRate,
        playState: animation.playState,
      })),
  );
}

async function prepareRemoteSource(
  url: string,
  abortAfterMs?: number,
): Promise<{
  code: string | null;
  diagnostics: readonly { code: string; count: number }[];
  pathCount: number;
}> {
  const abortController =
    abortAfterMs === undefined ? undefined : new AbortController();
  const abortTimer =
    abortController === undefined
      ? undefined
      : window.setTimeout(() => abortController.abort(), abortAfterMs);
  try {
    const prepared = await prepareSvg(url, {
      ...(abortController === undefined
        ? {}
        : { signal: abortController.signal }),
    });
    return {
      code: null,
      diagnostics: prepared.diagnostics,
      pathCount: prepared.svg.querySelectorAll("path").length,
    };
  } catch (error) {
    return {
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNTYPED",
      diagnostics: [],
      pathCount: 0,
    };
  } finally {
    if (abortTimer !== undefined) window.clearTimeout(abortTimer);
  }
}

async function mount(
  fixture: FixtureName,
  options: MountSvgMotionOptions = {},
) {
  return mountSource(fixtures[fixture], options);
}

async function mountPublicInstance(
  fixture: FixtureName,
  options: MountSvgMotionOptions = {},
) {
  instance?.destroy();
  stage.replaceChildren();
  instance = await mountSvgMotion(stage, fixtures[fixture], {
    autoplay: false,
    duration: 1000,
    stagger: 0,
    trust: "sanitize",
    ...options,
  });
  return summary();
}

async function mountSource(
  source: string | SVGSVGElement,
  options: MountSvgMotionOptions = {},
) {
  instance?.destroy();
  stage.replaceChildren();
  const resolved = {
    autoplay: false,
    duration: 1000,
    stagger: 0,
    trust: "sanitize",
    ...options,
  } satisfies MountSvgMotionOptions;
  const { trust, maxBytes, signal, ...motionOptions } = resolved;
  const prepared = await prepareSvg(source, {
    trust,
    ...(maxBytes === undefined ? {} : { maxBytes }),
    ...(signal === undefined ? {} : { signal }),
  });
  stage.append(prepared.svg);
  originalArtwork = prepared.svg.outerHTML;
  const controller = animateSvg(prepared.svg, motionOptions);
  let destroyed = false;
  instance = {
    controller,
    diagnostics: [...prepared.diagnostics, ...controller.diagnostics],
    svg: prepared.svg,
    destroy() {
      if (destroyed) return;
      controller.destroy();
      destroyed = true;
      prepared.svg.remove();
    },
  };
  return summary();
}

function artwork() {
  if (!instance) throw new Error("Mount a fixture first.");
  const current = instance.svg.outerHTML;
  return {
    animationCount: animationCount(instance.svg),
    connected: instance.svg.isConnected,
    current,
    matchesOriginal: current === originalArtwork,
    original: originalArtwork,
    state: instance.controller.state,
  };
}

function summary() {
  if (!instance) throw new Error("Mount a fixture first.");
  const geometry = [
    ...instance.svg.querySelectorAll<SVGGeometryElement>(
      "path,line,polyline,polygon,circle,ellipse,rect",
    ),
  ];
  return {
    animationCount: animationCount(instance.svg),
    dataBitmapCount: instance.svg.querySelectorAll(
      'image[href^="data:image/png;base64,"]',
    ).length,
    diagnostics: instance.diagnostics,
    embeddedBitmapCount: instance.svg.querySelectorAll("image").length,
    geometry: geometry.map((element) => ({
      animations: element.getAnimations().length,
      length: element.getTotalLength(),
      name: element.localName,
    })),
    hasNativeAnimate: typeof Element.prototype.animate === "function",
    state: instance.controller.state,
    svgCount: stage.querySelectorAll("svg").length,
  };
}

async function renderUnanimated(fixture: FixtureName) {
  instance?.destroy();
  instance = undefined;
  stage.replaceChildren();
  const prepared = await prepareSvg(fixtures[fixture]);
  stage.append(prepared.svg);
  originalArtwork = prepared.svg.outerHTML;
}

function countMatchingElements(
  svg: SVGSVGElement,
  predicate: (element: Element) => boolean,
) {
  return [svg, ...svg.querySelectorAll("*")].filter(predicate).length;
}

function externalReferenceCount(svg: SVGSVGElement) {
  return countMatchingElements(svg, (element) =>
    [
      element.localName === "style" ? (element.textContent ?? "") : "",
      ...[...element.attributes].map(({ value }) => value),
    ].some((value) => /attacker\.invalid|javascript:/i.test(value)),
  );
}

async function mountMaliciousSource() {
  const source = new DOMParser().parseFromString(malicious, "image/svg+xml")
    .documentElement as unknown as SVGSVGElement;
  const original = source.outerHTML;
  const sourceDangerousElementCount = countMatchingElements(
    source,
    (element) =>
      element.namespaceURI !== "http://www.w3.org/2000/svg" ||
      ["script", "foreignObject", "animate", "set"].includes(element.localName),
  );
  const sourceExternalReferenceCount = externalReferenceCount(source);
  const mounted = await mountSource(source);
  if (!instance) throw new Error("Malicious fixture did not mount.");
  const svg = instance.svg;
  return {
    ...mounted,
    dangerousAttributeCount: [svg, ...svg.querySelectorAll("*")].reduce(
      (count, element) =>
        count +
        [...element.attributes].filter(
          ({ localName, value }) =>
            localName.toLowerCase().startsWith("on") ||
            /attacker\.invalid|javascript:/i.test(value),
        ).length,
      0,
    ),
    dangerousElementCount: countMatchingElements(
      svg,
      (element) =>
        element.namespaceURI !== "http://www.w3.org/2000/svg" ||
        ["script", "foreignObject", "animate", "set", "style"].includes(
          element.localName,
        ),
    ),
    externalReferenceCount: externalReferenceCount(svg),
    originalUnchanged: source.outerHTML === original,
    sourceDangerousElementCount,
    sourceExternalReferenceCount,
  };
}

function referenceSummary() {
  if (!instance) throw new Error("Mount a fixture first.");
  const values = [
    ...instance.svg.querySelectorAll(
      "[href], [fill], [clip-path], [mask], [filter]",
    ),
  ].flatMap((element) =>
    ["href", "fill", "clip-path", "mask", "filter"].flatMap((name) => {
      const value = element.getAttribute(name);
      return value &&
        ((name === "href" && value.startsWith("#")) || value.includes("url(#"))
        ? [value]
        : [];
    }),
  );
  const targets = values.map((value) => {
    const match = value.match(/#([^)'"\s]+)/);
    const id = match?.[1] ?? "";
    return {
      id,
      exists: Boolean(id && instance?.svg.querySelector(`#${CSS.escape(id)}`)),
    };
  });
  return { targets, values };
}

function detachedInternalStyle() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = `
    <style>
      svg { --ink: rgb(220, 38, 38); color: var(--ink) }
      .ink { fill: #00f; stroke: #00f; stroke-width: 2; stroke-opacity: .25 }
      g .ink { fill: none; stroke: currentColor; stroke-width: 5; stroke-opacity: .5 }
    </style>
    <g>
      <path class="ink" fill="#0f0" stroke="#000" stroke-width="1"
        style="stroke-opacity: .75" d="M10 10h80" />
    </g>
  `;
  const path = svg.querySelector("path")!;
  const original = svg.outerHTML;
  const nativeAnimate = Element.prototype.animate;
  const created: Array<{ animation: Animation; target: Element }> = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push({ animation, target: this });
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, {
      autoplay: false,
      duration: 1000,
      stagger: 0,
    });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const pathAnimation = created.find(
    ({ target }) => target === path,
  )?.animation;
  const keyframes =
    (pathAnimation?.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
  const started = {
    animationCount: created.length,
    connected: svg.isConnected,
    hasFillOpacityKeyframe: keyframes.some(
      (keyframe: ComputedKeyframe) => "fillOpacity" in keyframe,
    ),
    stroke: path.style.stroke,
    strokeOpacity: path.style.strokeOpacity,
    strokeWidth: path.style.strokeWidth,
  };

  stage.append(svg);
  const computed = getComputedStyle(path);
  const effective = {
    fill: computed.fill,
    stroke: computed.stroke,
    strokeOpacity: computed.strokeOpacity,
    strokeWidth: computed.strokeWidth,
  };
  svg.remove();
  controller.cancel();

  return {
    effective,
    probeCount: document.querySelectorAll("[data-svg-motion-style-probe]")
      .length,
    restored: svg.outerHTML === original,
    state: controller.state,
    started,
    terminalAnimationCount: created.filter(
      ({ animation }) => animation.playState !== "idle",
    ).length,
  };
}

function inheritedVisibilityOverride() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = `
    <g style="visibility: hidden">
      <path id="still-hidden" fill="none" stroke="#000" d="M0 5h80" />
      <path id="visible-override" style="visibility: visible" fill="none" stroke="#f00" d="M0 15h80" />
    </g>
  `;
  stage.append(svg);
  const original = svg.outerHTML;
  const hidden = svg.querySelector<SVGPathElement>("#still-hidden")!;
  const visible = svg.querySelector<SVGPathElement>("#visible-override")!;
  const effective = {
    hidden: getComputedStyle(hidden).visibility,
    visible: getComputedStyle(visible).visibility,
  };
  const nativeAnimate = Element.prototype.animate;
  const created: Array<{ animation: Animation; target: string }> = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push({
      animation,
      target: this.getAttribute("id") ?? this.localName,
    });
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, {
      autoplay: false,
      duration: 1000,
      stagger: 0,
    });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const diagnostics = controller.diagnostics;
  controller.cancel();
  const result = {
    created: created.map(({ target }) => target),
    diagnostics,
    effective,
    restored: svg.outerHTML === original,
    state: controller.state,
    terminalAnimationCount: created.filter(
      ({ animation }) => animation.playState !== "idle",
    ).length,
  };
  svg.remove();
  return result;
}

function zeroAreaFillGeometry() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 40");
  svg.innerHTML = `
    <path id="horizontal" fill="red" stroke="none" d="M10 10H90" />
    <path id="diagonal" fill="red" stroke="none" d="M10 20L90 30" />
    <rect id="flat-rect" fill="red" stroke="none" x="10" y="35" width="80" height="0" />
    <ellipse id="flat-ellipse" fill="red" stroke="none" cx="50" cy="35" rx="20" ry="0" />
  `;
  stage.append(svg);
  const original = svg.outerHTML;
  const nativeAnimate = Element.prototype.animate;
  const created: Array<{ animation: Animation; target: string }> = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push({
      animation,
      target: this.getAttribute("id") ?? this.localName,
    });
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const temporaryStrokes = [
    ...svg.querySelectorAll<SVGElement>("path,rect,ellipse"),
  ].map((element) => element.style.stroke);
  const diagnostics = controller.diagnostics;
  controller.destroy();
  const result = {
    created: created.map(({ target }) => target),
    diagnostics,
    restored: svg.outerHTML === original,
    state: controller.state,
    temporaryStrokes,
    terminalAnimationCount: created.filter(
      ({ animation }) => animation.playState !== "idle",
    ).length,
  };
  svg.remove();
  return result;
}

function renderedPathFillClassification() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "9999990 9999990 30 30");
  svg.innerHTML = `
    <path id="large-triangle" fill="red" stroke="none" d="M10000000 10000000 l5 0 l0 5 z" />
    <path id="line-retrace" fill="red" stroke="none" d="M10 10 L50 10 L10 10 L10 50 L10 10" />
    <path id="arc-retrace" fill="red" stroke="none" d="M10 30 A20 20 0 0 1 50 30 A20 20 0 0 0 10 30" />
    <path id="sparse-triangle" fill="red" stroke="none" d="M0 0 L1000000 0 L0 0 M0 0 L1 0 L0 1 Z" />
    <path id="css-to-retrace" fill="red" stroke="none" d="M10 10 L50 10 L10 50 Z" />
    <path id="css-to-area" fill="red" stroke="none" d="M10 10 L50 10 L10 10 L10 50 L10 10" />
    <path id="semicircle" fill="red" stroke="none" d="M20 50 A30 30 0 0 1 80 50" />
    <path id="arc-circle" fill="red" stroke="none" d="M50 20 A30 30 0 1 1 49.999 20 A30 30 0 1 1 50 20 Z" />
    <path id="cubic" fill="red" stroke="none" d="M10 50 C10 0 90 0 90 50" />
    <path id="translated-cubic" fill="red" stroke="none" d="M1000000000000 0 C1000000000033 0.01 1000000000066 0.01 1000000000100 0" />
    <path id="bowtie" fill="red" fill-rule="evenodd" stroke="none" d="M10 10 L90 90 L10 90 L90 10 Z" />
    <path id="many-segments" fill="red" stroke="none" />
    <polyline id="polyline-bowtie" fill="red" fill-rule="evenodd" stroke="none" points="10,10 90,90 10,90 90,10" />
    <polyline id="polyline-retrace" fill="red" stroke="none" points="0,0 10,0 0,0 0,10 0,0" />
    <polygon id="polygon-retrace" fill="red" stroke="none" points="0,0 10,0 0,0 0,10 0,0" />
  `;
  const manySegments = svg.querySelector<SVGPathElement>("#many-segments")!;
  manySegments.setAttribute(
    "d",
    Array.from({ length: 257 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 257;
      const point = `${50 + Math.cos(angle) * 30} ${50 + Math.sin(angle) * 30}`;
      return `${index === 0 ? "M" : "L"}${point}`;
    }).join(" ") + " Z",
  );
  const cssToRetrace = svg.querySelector<SVGPathElement>("#css-to-retrace")!;
  const cssToArea = svg.querySelector<SVGPathElement>("#css-to-area")!;
  cssToRetrace.style.setProperty(
    "d",
    'path("M10 10 L50 10 L10 10 L10 50 L10 10")',
  );
  cssToArea.style.setProperty("d", 'path("M10 10 L50 10 L10 50 Z")');
  const cssPathSupported = cssToRetrace.style.getPropertyValue("d") !== "";
  stage.append(svg);
  const original = svg.outerHTML;
  const nativeAnimate = Element.prototype.animate;
  const created: Array<{ animation: Animation; target: string }> = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push({
      animation,
      target: this.getAttribute("id") ?? this.localName,
    });
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const paths = [
    ...svg.querySelectorAll<SVGGeometryElement>(
      "path, line, polyline, polygon, circle, ellipse, rect",
    ),
  ];
  const result = {
    created: created.map(({ target }) => target),
    cssPathSupported,
    diagnostics: controller.diagnostics,
    restoredAfterDestroy: false,
    temporaryStrokeTargets: paths
      .filter((path) =>
        /(?:^|;)\s*stroke\s*:/.test(path.getAttribute("style") ?? ""),
      )
      .map((path) => path.id),
    terminalAnimationCount: 0,
  };
  controller.destroy();
  result.restoredAfterDestroy = svg.outerHTML === original;
  result.terminalAnimationCount = created.filter(
    ({ animation }) => animation.playState !== "idle",
  ).length;
  svg.remove();
  return result;
}

function thinTransformedFillClassification() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `
    <path id="thin-curve" fill="red" stroke="none" transform="scale(1 1000000)" d="M0 0 C99 0 100 0.000003 100 0 Z" />
  `;
  stage.append(svg);
  const path = svg.querySelector<SVGPathElement>("#thin-curve")!;
  const bounds = stage.getBoundingClientRect();
  let paintedPixels = 0;
  for (let y = Math.floor(bounds.top); y < Math.ceil(bounds.bottom); y++) {
    for (let x = Math.floor(bounds.left); x < Math.ceil(bounds.right); x++) {
      if (document.elementFromPoint(x + 0.5, y + 0.5) === path) paintedPixels++;
    }
  }

  const original = svg.outerHTML;
  const nativeAnimate = Element.prototype.animate;
  const created: string[] = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push(this.getAttribute("id") ?? this.localName);
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  controller.destroy();
  const restored = svg.outerHTML === original;
  svg.remove();
  return { created, paintedPixels, restored };
}

function shallowLensClassification() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 -0.012 1000000000000 0.024");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `
    <path id="shallow-lens" fill="red" stroke="none" d="M0 0 C330000000000 0.01 660000000000 0.01 1000000000000 0 C660000000000 -0.01 330000000000 -0.01 0 0" />
  `;
  stage.append(svg);
  const path = svg.querySelector<SVGPathElement>("#shallow-lens")!;
  const bounds = stage.getBoundingClientRect();
  let paintedPixels = 0;
  for (let y = Math.floor(bounds.top); y < Math.ceil(bounds.bottom); y += 2) {
    for (let x = Math.floor(bounds.left); x < Math.ceil(bounds.right); x += 2) {
      if (document.elementFromPoint(x + 0.5, y + 0.5) === path) paintedPixels++;
    }
  }

  const nativeAnimate = Element.prototype.animate;
  const created: string[] = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push(this.getAttribute("id") ?? this.localName);
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  controller.destroy();
  svg.remove();
  return { created, paintedPixels };
}

function largeRepeatedPolylineClassification(fillRule: "evenodd" | "nonzero") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const polyline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline",
  );
  polyline.setAttribute("fill", "red");
  polyline.setAttribute("fill-rule", fillRule);
  polyline.setAttribute("stroke", "none");
  polyline.setAttribute(
    "points",
    Array.from({ length: 500 }, () => "0,0 100,0 100,100 0,100 0,0").join(" "),
  );
  svg.append(polyline);
  stage.append(svg);

  const nativeAnimate = Element.prototype.animate;
  const created: string[] = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push(this.localName);
    return animation;
  };
  const started = performance.now();
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const elapsed = performance.now() - started;
  const diagnostics = controller.diagnostics;
  controller.destroy();
  svg.remove();
  return { created, diagnostics, elapsed };
}

function largeRepeatedCurvedPathClassification() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "red");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("stroke", "none");
  path.setAttribute(
    "d",
    Array.from({ length: 250 }, (_, index) => {
      const a = 10 + ((index + 1) / 251) * 20;
      const b = 90 - ((index + 1) / 251) * 20;
      return `M0 0 C${a} 0 ${b} 0 100 0 C100 ${a} 100 ${b} 100 100 C${b} 100 ${a} 100 0 100 C0 ${b} 0 ${a} 0 0`;
    }).join(" "),
  );
  svg.append(path);
  stage.append(svg);

  const nativeAnimate = Element.prototype.animate;
  const created: string[] = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push(this.localName);
    return animation;
  };
  const started = performance.now();
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const elapsed = performance.now() - started;
  const diagnostics = controller.diagnostics;
  controller.destroy();
  svg.remove();
  return { created, diagnostics, elapsed };
}

function largeSubdividedArcClassification() {
  const intermediates = [
    [63, 16],
    [60, 25],
    [56, 33],
    [52, 39],
    [39, 52],
    [33, 56],
    [25, 60],
    [16, 63],
  ] as const;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "red");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("stroke", "none");
  path.setAttribute(
    "d",
    Array.from({ length: 100 }, (_, mask) => {
      const points: ReadonlyArray<readonly [number, number]> = [
        ...intermediates.filter((_, bit) => (mask & (1 << bit)) !== 0),
        [0, 65],
        [-65, 0],
        [0, -65],
        [65, 0],
      ];
      return `M65 0 ${points
        .map(([x, y]) => `A65 65 0 0 1 ${x} ${y}`)
        .join(" ")}`;
    }).join(" "),
  );
  svg.append(path);
  stage.append(svg);

  const nativeAnimate = Element.prototype.animate;
  const created: string[] = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push(this.localName);
    return animation;
  };
  const started = performance.now();
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const elapsed = performance.now() - started;
  const diagnostics = controller.diagnostics;
  controller.destroy();
  svg.remove();
  return { created, diagnostics, elapsed };
}

function detachedCssPathClassification() {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">
      <style>
        .to-retrace { d: path("M10 10 L50 10 L10 10 L10 50 L10 10") }
        .to-area { d: path("M10 10 L50 10 L10 50 Z") }
      </style>
      <path id="css-to-retrace" class="to-retrace" fill="red" stroke="none" d="M10 10 L50 10 L10 50 Z" />
      <path id="css-to-area" class="to-area" fill="red" stroke="none" d="M10 10 L50 10 L10 10 L10 50 L10 10" />
    </svg>`,
    "image/svg+xml",
  ).documentElement as unknown as SVGSVGElement;
  const cssProbe = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  cssProbe.style.setProperty("d", 'path("M0 0h1v1z")');
  const cssPathSupported = cssProbe.style.getPropertyValue("d") !== "";
  const original = svg.outerHTML;
  const nativeAnimate = Element.prototype.animate;
  const created: Array<{ animation: Animation; target: string }> = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push({
      animation,
      target: this.getAttribute("id") ?? this.localName,
    });
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const result = {
    callerLiveConnected:
      svg.isConnected && svg.ownerDocument.defaultView !== null,
    created: created.map(({ target }) => target),
    cssPathSupported,
    restoredAfterDestroy: false,
    terminalAnimationCount: 0,
  };
  controller.destroy();
  result.restoredAfterDestroy = svg.outerHTML === original;
  result.terminalAnimationCount = created.filter(
    ({ animation }) => animation.playState !== "idle",
  ).length;
  return result;
}

function externalCssPathOverride() {
  const style = document.createElement("style");
  style.textContent = `#external-d { d: path("M0 0 L100 0 L0 0") }`;
  document.head.append(style);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = `
    <path id="external-d" fill="red" stroke="none" d="M50 0 A50 50 0 0 1 -50 0 A50 50 0 0 1 50 0 Z" />
  `;
  stage.append(svg);
  const path = svg.querySelector<SVGPathElement>("#external-d")!;
  const cssPathSupported = getComputedStyle(path)
    .getPropertyValue("d")
    .includes("L 100");
  const nativeAnimate = Element.prototype.animate;
  const created: string[] = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    created.push(this.getAttribute("id") ?? this.localName);
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, { autoplay: false });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const result = {
    created,
    cssPathSupported,
    diagnostics: controller.diagnostics,
    temporaryStroke: path.style.stroke,
  };
  controller.destroy();
  svg.remove();
  style.remove();
  return result;
}

function detachedHostileStyleProbe() {
  const marker = "__svgMotionDetachedProbeExecuted";
  Reflect.set(globalThis, marker, 0);
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">
    <style>
      @import url("https://attacker.invalid/probe.css");
      svg { --ink: rgb(220, 38, 38); color: var(--ink) }
      .ink { fill: none; stroke: currentColor; stroke-width: 5 }
      .load { fill: image-set(url("https://attacker.invalid/paint.png") 1x) }
    </style>
    <script>globalThis.${marker} += 1</script>
    <foreignObject><img xmlns="http://www.w3.org/1999/xhtml" src="https://attacker.invalid/foreign.png" onerror="globalThis.${marker} += 1" /></foreignObject>
    <image href="https://attacker.invalid/image.png" />
    <path class="ink load" d="M10 10h80" style="stroke-opacity: .75" onload="globalThis.${marker} += 1" />
  </svg>`,
    "image/svg+xml",
  ).documentElement as unknown as SVGSVGElement;
  const original = svg.outerHTML;
  const controller = animateSvg(svg, { autoplay: false });
  const callerConnected =
    svg.isConnected && svg.ownerDocument.defaultView !== null;
  controller.cancel();
  const executed = Reflect.get(globalThis, marker);
  Reflect.deleteProperty(globalThis, marker);
  return {
    callerConnected,
    executed,
    probeCount: document.querySelectorAll("[data-svg-motion-style-probe]")
      .length,
    restored: svg.outerHTML === original,
    state: controller.state,
  };
}

function detachedHiddenImageStagger() {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <style>.hidden-resource { display: none }</style>
      <defs><image id="local-image" href="https://attacker.invalid/defs.png" /></defs>
      <path id="visible-path" fill="none" stroke="#000" style="stroke-opacity: 1" d="M0 0h10" />
      <image id="hidden-external" class="hidden-resource" href="https://attacker.invalid/external.png" />
      <image id="hidden-data" class="hidden-resource" href="data:image/png;base64,iVBORw0KGgo=" />
      <image id="hidden-local" class="hidden-resource" xlink:href="#local-image" />
      <text id="visible-successor" x="4" y="14">Visible</text>
    </svg>`,
    "image/svg+xml",
  ).documentElement as unknown as SVGSVGElement;
  const original = svg.outerHTML;
  const nativeAnimate = Element.prototype.animate;
  const created: Array<{ delay: number; target: string }> = [];
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    const timing = (animation.effect as KeyframeEffect | null)?.getTiming();
    created.push({
      delay: Number(timing?.delay ?? 0),
      target: this.getAttribute("id") ?? "",
    });
    return animation;
  };
  let controller;
  try {
    controller = animateSvg(svg, {
      autoplay: false,
      duration: 1000,
      preset: "stagger",
      stagger: 100,
    });
  } finally {
    Element.prototype.animate = nativeAnimate;
  }
  const callerConnected =
    svg.isConnected && svg.ownerDocument.defaultView !== null;
  controller.cancel();

  return {
    callerConnected,
    created,
    probeCount: document.querySelectorAll("[data-svg-motion-style-probe]")
      .length,
    restored: svg.outerHTML === original,
    state: controller.state,
  };
}

async function crossRealmSources() {
  const frame = document.createElement("iframe");
  stage.append(frame);
  const realm = frame.contentWindow!;
  const realmGlobals = realm as unknown as Pick<
    typeof globalThis,
    "Blob" | "File" | "URL"
  >;
  const markup =
    '<svg xmlns="http://www.w3.org/2000/svg"><path id="shape" fill="none" stroke="#000" d="M0 0h10" /></svg>';
  const foreignSvg = realm.document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  ) as SVGSVGElement;
  foreignSvg.innerHTML =
    '<path id="shape" fill="none" stroke="#000" d="M0 0h10" />';
  const sources: Array<{ name: string; source: SvgSource }> = [
    {
      name: "URL",
      source: new realmGlobals.URL(
        `data:image/svg+xml,${encodeURIComponent(markup)}`,
      ) as URL,
    },
    { name: "Blob", source: new realmGlobals.Blob([markup]) as Blob },
    {
      name: "File",
      source: new realmGlobals.File([markup], "icon.svg") as File,
    },
    { name: "SVGSVGElement", source: foreignSvg },
  ];
  const results: Array<Record<string, unknown>> = [];
  for (const { name, source } of sources) {
    try {
      const prepared = await prepareSvg(source, { trust: "trusted" });
      stage.append(prepared.svg);
      const path = prepared.svg.querySelector("path")!;
      const controller = animateSvg(prepared.svg, { autoplay: false });
      results.push({
        diagnostics: controller.diagnostics,
        name,
        pathAnimations: path.getAnimations().length,
      });
      controller.destroy();
      prepared.svg.remove();
    } catch (error) {
      results.push({
        code:
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : undefined,
        name,
      });
    }
  }
  frame.remove();
  return results;
}

async function trustedNestedStylesheet() {
  const prepared = await prepareSvg(
    `<svg xmlns="http://www.w3.org/2000/svg">
      <style>.group { fill: #fff; &amp; #shape { stroke: rgb(255, 0, 0) } }</style>
      <path id="fff" d="M20 0h10v10" />
      <g class="group">
        <path id="shape" d="M0 0h10v10" />
        <path id="other" d="M10 0h10v10" />
      </g>
    </svg>`,
    { trust: "trusted" },
  );
  stage.append(prepared.svg);
  const path = prepared.svg.querySelector<SVGPathElement>(".group path")!;
  const other =
    prepared.svg.querySelector<SVGPathElement>(".group path + path")!;
  const stylesheet = prepared.svg.querySelector("style")?.textContent ?? "";
  const result = {
    fill: getComputedStyle(path).fill,
    otherFill: getComputedStyle(other).fill,
    stroke: getComputedStyle(path).stroke,
    namespaced: /^svg-motion-\d+-shape$/.test(path.id),
    colorPreserved: /fill:\s*#fff\b/.test(stylesheet),
    staleNestedSelector: /&\s*#shape\b/.test(stylesheet),
  };
  prepared.svg.remove();
  return result;
}

window.svgMotionHarness = {
  artwork,
  async completeNaturally() {
    if (!instance) throw new Error("Mount a fixture first.");
    instance.controller.play();
    await instance.controller.finished;
    return artwork();
  },
  destroyController() {
    instance?.controller.destroy();
    return artwork();
  },
  destroyInstance() {
    instance?.destroy();
    return {
      connected: instance?.svg.isConnected ?? false,
      state: instance?.controller.state,
    };
  },
  detachedHiddenImageStagger,
  detachedCssPathClassification,
  detachedHostileStyleProbe,
  detachedInternalStyle,
  crossRealmSources,
  trustedNestedStylesheet,
  inheritedVisibilityOverride,
  externalCssPathOverride,
  largeRepeatedCurvedPathClassification,
  largeRepeatedPolylineClassification,
  largeSubdividedArcClassification,
  renderedPathFillClassification,
  shallowLensClassification,
  thinTransformedFillClassification,
  zeroAreaFillGeometry,
  finish() {
    instance?.controller.finish();
    return summary();
  },
  mount,
  mountMaliciousSource,
  mountPublicInstance,
  nativeAnimations,
  prepareRemoteSource,
  references: referenceSummary,
  renderUnanimated,
  restart() {
    instance?.controller.restart();
    return summary();
  },
  cancel() {
    instance?.controller.cancel();
    return summary();
  },
  pause() {
    instance?.controller.pause();
    return summary();
  },
  play() {
    instance?.controller.play();
    return summary();
  },
  reverse() {
    instance?.controller.reverse();
    return summary();
  },
  seek(progress: number) {
    instance?.controller.seek(progress);
    return summary();
  },
  summary,
  async waitForLoading() {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  },
};

declare global {
  interface Window {
    svgMotionHarness: {
      artwork(): ReturnType<typeof artwork>;
      cancel(): ReturnType<typeof summary>;
      completeNaturally(): Promise<ReturnType<typeof artwork>>;
      crossRealmSources(): ReturnType<typeof crossRealmSources>;
      destroyController(): ReturnType<typeof artwork>;
      destroyInstance(): { connected: boolean; state: string | undefined };
      detachedHiddenImageStagger(): ReturnType<
        typeof detachedHiddenImageStagger
      >;
      detachedCssPathClassification(): ReturnType<
        typeof detachedCssPathClassification
      >;
      detachedHostileStyleProbe(): ReturnType<typeof detachedHostileStyleProbe>;
      detachedInternalStyle(): ReturnType<typeof detachedInternalStyle>;
      inheritedVisibilityOverride(): ReturnType<
        typeof inheritedVisibilityOverride
      >;
      externalCssPathOverride(): ReturnType<typeof externalCssPathOverride>;
      largeRepeatedCurvedPathClassification(): ReturnType<
        typeof largeRepeatedCurvedPathClassification
      >;
      largeRepeatedPolylineClassification(
        fillRule: "evenodd" | "nonzero",
      ): ReturnType<typeof largeRepeatedPolylineClassification>;
      largeSubdividedArcClassification(): ReturnType<
        typeof largeSubdividedArcClassification
      >;
      finish(): ReturnType<typeof summary>;
      mount(
        fixture: FixtureName,
        options?: MountSvgMotionOptions,
      ): Promise<ReturnType<typeof summary>>;
      mountMaliciousSource(): Promise<
        Awaited<ReturnType<typeof mountMaliciousSource>>
      >;
      mountPublicInstance(
        fixture: FixtureName,
        options?: MountSvgMotionOptions,
      ): Promise<ReturnType<typeof summary>>;
      nativeAnimations(): ReturnType<typeof nativeAnimations>;
      prepareRemoteSource(
        url: string,
        abortAfterMs?: number,
      ): ReturnType<typeof prepareRemoteSource>;
      pause(): ReturnType<typeof summary>;
      play(): ReturnType<typeof summary>;
      references(): ReturnType<typeof referenceSummary>;
      renderUnanimated(fixture: FixtureName): Promise<void>;
      renderedPathFillClassification(): ReturnType<
        typeof renderedPathFillClassification
      >;
      shallowLensClassification(): ReturnType<typeof shallowLensClassification>;
      thinTransformedFillClassification(): ReturnType<
        typeof thinTransformedFillClassification
      >;
      restart(): ReturnType<typeof summary>;
      reverse(): ReturnType<typeof summary>;
      seek(progress: number): ReturnType<typeof summary>;
      summary(): ReturnType<typeof summary>;
      trustedNestedStylesheet(): ReturnType<typeof trustedNestedStylesheet>;
      waitForLoading(): Promise<void>;
      zeroAreaFillGeometry(): ReturnType<typeof zeroAreaFillGeometry>;
    };
  }
}
