import {
  type MountSvgMotionOptions,
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
        playbackRate: animation.playbackRate,
        playState: animation.playState,
      })),
  );
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
  finish() {
    instance?.controller.finish();
    return summary();
  },
  mount,
  mountMaliciousSource,
  mountPublicInstance,
  nativeAnimations,
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
      destroyController(): ReturnType<typeof artwork>;
      destroyInstance(): { connected: boolean; state: string | undefined };
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
      pause(): ReturnType<typeof summary>;
      play(): ReturnType<typeof summary>;
      references(): ReturnType<typeof referenceSummary>;
      renderUnanimated(fixture: FixtureName): Promise<void>;
      restart(): ReturnType<typeof summary>;
      reverse(): ReturnType<typeof summary>;
      seek(progress: number): ReturnType<typeof summary>;
      summary(): ReturnType<typeof summary>;
      waitForLoading(): Promise<void>;
    };
  }
}
