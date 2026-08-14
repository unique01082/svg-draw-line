// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SVG_ANIMATION_ERROR_CODES,
  SvgAnimationError,
  animateSvg,
  type SvgMotionController,
  type SvgMotionOptions,
  type SvgMotionPreset,
} from "../src/index";
import {
  allAnimations,
  animationsFor,
  installWaapi,
  setLength,
  uninstallWaapi,
} from "./waapi-test-support";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svg(markup: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="${SVG_NAMESPACE}">${markup}</svg>`;
  return document.querySelector("svg") as SVGSVGElement;
}

function geometry(markup = '<path fill="#f00" d="M0 0h10" />') {
  const root = svg(markup);
  for (const element of root.querySelectorAll(
    "path,line,polyline,polygon,circle,ellipse,rect",
  )) {
    setLength(element, Number(element.getAttribute("data-length") ?? 40));
  }
  return root;
}

beforeEach(() => {
  installWaapi();
});

afterEach(() => {
  uninstallWaapi();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.head
    .querySelectorAll("[data-svg-motion-test]")
    .forEach((element) => element.remove());
});

function addStyles(css: string) {
  const style = document.createElement("style");
  style.dataset.svgMotionTest = "";
  style.textContent = css;
  document.head.append(style);
}

describe("animateSvg presets and options", () => {
  it("draws every supported geometry with defaults and fades fallback leaves", () => {
    const root = geometry(`
      <path fill="#f00" data-length="10" d="M0 0h10" />
      <line style="stroke: #0f0" data-length="20" x1="0" y1="0" x2="10" y2="0" />
      <polyline fill="#00f" data-length="30" points="0,0 10,0 10,10" />
      <polygon fill="#ff0" data-length="40" points="0,0 10,0 10,10" />
      <circle fill="#0ff" data-length="50" r="5" />
      <ellipse fill="#f0f" data-length="60" rx="5" ry="3" />
      <rect fill="#333" data-length="70" width="10" height="10" />
      <text>Label</text>
    `);
    const original = root.outerHTML;
    const path = root.querySelector("path")!;
    const computedFill = getComputedStyle(path).fill;

    const controller = animateSvg(root);

    expect(controller.state).toBe("running");
    expect(controller.diagnostics).toEqual([]);
    const running = allAnimations(root);
    expect(running).toHaveLength(8);
    const pathAnimation = animationsFor(path)[0]!;
    expect(pathAnimation.keyframes[0]).toEqual(
      expect.objectContaining({ fillOpacity: 0, strokeDashoffset: "10" }),
    );
    expect(pathAnimation.keyframes.at(-1)).toEqual(
      expect.objectContaining({ fillOpacity: 1, strokeDashoffset: "0" }),
    );
    expect(pathAnimation.timing).toMatchObject({
      delay: 0,
      direction: "normal",
      duration: 1200,
      easing: "ease-in-out",
      fill: "both",
      iterations: 1,
    });
    expect(path.getAttribute("stroke")).toBeNull();
    expect(path.getAttribute("fill")).toBe("#f00");
    expect(path.style.stroke).toBe(computedFill);
    expect(path.style.strokeDasharray).toBe("10");
    expect(path.style.strokeDashoffset).toBe("10");
    expect(animationsFor(root.querySelector("text")!)[0]?.keyframes).toEqual([
      expect.objectContaining({ opacity: 0 }),
      expect.objectContaining({ opacity: 1 }),
    ]);

    controller.finish();

    expect(controller.state).toBe("finished");
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("supports selector, reverse order, numeric stagger, and custom timing", () => {
    const root = geometry(`
      <path class="pick" data-name="first" d="M0 0h10" />
      <path data-name="ignored" d="M0 0h10" />
      <path class="pick" data-name="last" d="M0 0h10" />
    `);

    const controller = animateSvg(root, {
      autoplay: false,
      delay: 25,
      direction: "alternate",
      duration: 300,
      easing: "linear",
      iterations: 2,
      order: "reverse",
      selector: ".pick",
      stagger: 75,
    });
    const first = root.querySelector('[data-name="first"]')!;
    const last = root.querySelector('[data-name="last"]')!;

    expect(controller.state).toBe("idle");
    expect(animationsFor(root.querySelector('[data-name="ignored"]')!)).toEqual(
      [],
    );
    expect(animationsFor(last)[0]?.timing).toMatchObject({
      delay: 25,
      direction: "alternate",
      duration: 300,
      easing: "linear",
      iterations: 2,
    });
    expect(animationsFor(first)[0]?.timing.delay).toBe(100);
  });

  it("caps automatic staggering to a 600 ms start window", () => {
    const root = geometry(
      Array.from(
        { length: 7 },
        (_, index) => `<path data-index="${index}" d="M0 0h10" />`,
      ).join(""),
    );

    animateSvg(root, { delay: 40, stagger: "auto" });

    const delays = [...root.querySelectorAll("path")].map(
      (element) => animationsFor(element)[0]!.timing.delay,
    );
    expect(delays).toEqual([40, 140, 240, 340, 440, 540, 640]);
  });

  it("uses computed CSS presentation instead of conflicting paint attributes", () => {
    addStyles(`
      .css-drawn { fill: rgb(0, 128, 0); stroke: none }
      .css-hidden { fill: none; stroke: none }
    `);
    const root = geometry(`
      <path id="drawn" class="css-drawn" fill="none" stroke="#f00" d="M0 0h10" />
      <path id="hidden" class="css-hidden" fill="#f00" stroke="#00f" d="M0 0h10" />
    `);
    const drawn = root.querySelector<SVGElement>("#drawn")!;
    const hidden = root.querySelector<SVGElement>("#hidden")!;
    expect(getComputedStyle(drawn).fill).toBe("rgb(0, 128, 0)");
    expect(getComputedStyle(hidden).fill).toBe("rgba(0, 0, 0, 0)");

    const controller = animateSvg(root, { stagger: 0 });

    expect(controller.diagnostics).toEqual([]);
    expect(animationsFor(drawn)).toHaveLength(1);
    expect(drawn.style.stroke).toBe("rgb(0, 128, 0)");
    expect(animationsFor(hidden)).toEqual([]);
    expect(allAnimations(root)).toHaveLength(1);
  });

  it("does not treat CSS-hidden paint as drawable geometry", () => {
    addStyles(".no-paint { fill: none; stroke: none }");
    const root = geometry(`
      <path class="no-paint" fill="#f00" stroke="#00f" d="M0 0h10" />
    `);

    const controller = animateSvg(root);

    expect(controller.diagnostics).toEqual([
      { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
    ]);
    expect(animationsFor(root)).toHaveLength(1);
    expect(allAnimations(root)).toHaveLength(1);
  });

  it("does not treat an unstyled stroke-less line as visible from default fill", () => {
    const root = geometry('<line id="line" x1="0" y1="0" x2="10" y2="0" />');

    const controller = animateSvg(root);

    expect(controller.diagnostics).toEqual([
      { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
    ]);
    expect(animationsFor(root.querySelector("#line")!)).toEqual([]);
    expect(animationsFor(root)).toHaveLength(1);
  });

  it("derives a visible temporary stroke for zero-width fill-only geometry and restores on finish", () => {
    const root = geometry(
      '<rect id="shape" style="fill: #f00; stroke: none; stroke-width: 0" width="10" height="10" />',
    );
    const shape = root.querySelector<SVGElement>("#shape")!;
    const original = root.outerHTML;

    const controller = animateSvg(root);

    expect(shape.style.stroke).toBe("rgb(255, 0, 0)");
    expect(shape.style.strokeWidth).toBe("1");
    expect(shape.style.strokeOpacity).toBe("1");
    controller.finish();
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("derives a visible temporary stroke for zero-opacity stroke and restores on cancel", () => {
    const root = geometry(
      '<circle id="shape" style="fill: #0f0; stroke: #00f; stroke-opacity: 0" r="5" />',
    );
    const shape = root.querySelector<SVGElement>("#shape")!;
    const original = root.outerHTML;

    const controller = animateSvg(root);

    expect(shape.style.stroke).toBe("rgb(0, 255, 0)");
    expect(shape.style.strokeWidth).toBe("1");
    expect(shape.style.strokeOpacity).toBe("1");
    controller.cancel();
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("restores all temporary stroke repairs on destroy", () => {
    const root = geometry(
      '<ellipse id="shape" style="fill: #ff0; stroke: #00f; stroke-width: 0; stroke-opacity: 0" rx="5" ry="3" />',
    );
    const shape = root.querySelector<SVGElement>("#shape")!;
    const original = root.outerHTML;

    const controller = animateSvg(root);

    expect(shape.style.stroke).toBe("rgb(255, 255, 0)");
    expect(shape.style.strokeWidth).toBe("1");
    expect(shape.style.strokeOpacity).toBe("1");
    controller.destroy();
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("does not reveal geometry whose only paint has zero fill opacity", () => {
    const root = geometry(
      '<path id="shape" style="fill: #f00; fill-opacity: 0; stroke: none" d="M0 0h10" />',
    );
    const original = root.outerHTML;

    const controller = animateSvg(root);

    expect(controller.diagnostics).toEqual([
      { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
    ]);
    expect(animationsFor(root.querySelector("#shape")!)).toEqual([]);
    expect(animationsFor(root)).toHaveLength(1);
    controller.destroy();
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("draws a visible stroke without revealing its zero-opacity fill", () => {
    const root = geometry(
      '<path id="shape" style="fill: #f00; fill-opacity: 0; stroke: #00f; stroke-width: 2" d="M0 0h10" />',
    );
    const shape = root.querySelector<SVGElement>("#shape")!;
    const original = root.outerHTML;

    const controller = animateSvg(root);
    const animation = animationsFor(shape)[0]!;

    expect(
      animation.keyframes.every((frame) => !("fillOpacity" in frame)),
    ).toBe(true);
    expect(shape.style.fillOpacity).toBe("0");
    controller.finish();
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("fills open and self-intersecting polylines with area but ignores two points", () => {
    const root = geometry(`
      <polyline id="area" style="fill: #f00; stroke: none" points="0,0 10,0 10,10" />
      <polyline id="self-intersecting" style="fill: #f00; stroke: none" points="0,0 10,10 0,10 10,0" />
      <polyline id="line" style="fill: #f00; stroke: none" points="0,0 10,0" />
    `);

    animateSvg(root, { stagger: 0 });

    expect(animationsFor(root.querySelector("#area")!)).toHaveLength(1);
    expect(
      animationsFor(root.querySelector("#self-intersecting")!),
    ).toHaveLength(1);
    expect(animationsFor(root.querySelector("#line")!)).toEqual([]);
    expect(allAnimations(root)).toHaveLength(2);
  });

  it("falls back to root fade when every geometry has a hidden ancestor", () => {
    const root = geometry(`
      <g style="display: none"><path id="display-hidden" d="M0 0h10" /></g>
      <g style="opacity: 0"><path id="opacity-hidden" d="M0 0h10" /></g>
    `);

    const controller = animateSvg(root);

    expect(controller.diagnostics).toEqual([
      { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
    ]);
    expect(animationsFor(root.querySelector("#display-hidden")!)).toEqual([]);
    expect(animationsFor(root.querySelector("#opacity-hidden")!)).toEqual([]);
    expect(animationsFor(root)).toHaveLength(1);
    expect(allAnimations(root)).toHaveLength(1);
  });

  it.each<{
    preset: SvgMotionPreset;
    expected: Array<Record<string, unknown>>;
  }>([
    {
      preset: "fade",
      expected: [{ opacity: 0 }, { opacity: 1 }],
    },
    {
      preset: "scale",
      expected: [
        { opacity: 0, transform: "scale(0.92)" },
        { opacity: 1, transform: "scale(1)" },
      ],
    },
    {
      preset: "pulse",
      expected: [
        { transform: "scale(1)" },
        { transform: "scale(1.05)" },
        { transform: "scale(1)" },
      ],
    },
  ])("applies the $preset root preset", ({ preset, expected }) => {
    const root = geometry();

    animateSvg(root, { preset, iterations: 4 });

    const animation = animationsFor(root)[0]!;
    expect(animation.keyframes).toEqual(
      expected.map((frame) => expect.objectContaining(frame)),
    );
    expect(animation.timing.iterations).toBe(4);
  });

  it("allows an explicitly infinite pulse", () => {
    const root = geometry();

    animateSvg(root, { preset: "pulse", iterations: Infinity });

    expect(animationsFor(root)[0]?.timing.iterations).toBe(Infinity);
  });

  it("staggers visible leaf elements in document order while excluding defs", () => {
    const root = svg(`
      <defs><path id="definition" /></defs>
      <title id="title">Title</title>
      <desc id="description">Description</desc>
      <mask id="mask"><rect id="masked" /></mask>
      <g><path id="one" /><text id="two">Two</text></g>
      <image id="hidden" style="opacity: 0.0" />
      <use id="three" href="#definition" />
    `);

    animateSvg(root, { preset: "stagger", delay: 10, stagger: 30 });

    expect(animationsFor(root.querySelector("defs path")!)).toEqual([]);
    expect(animationsFor(root.querySelector("#title")!)).toEqual([]);
    expect(animationsFor(root.querySelector("#description")!)).toEqual([]);
    expect(animationsFor(root.querySelector("#masked")!)).toEqual([]);
    expect(animationsFor(root.querySelector("g")!)).toEqual([]);
    expect(animationsFor(root.querySelector("#hidden")!)).toEqual([]);
    expect(
      ["#one", "#two", "#three"].map(
        (selector) =>
          animationsFor(root.querySelector(selector)!)[0]?.timing.delay,
      ),
    ).toEqual([10, 40, 70]);
  });

  it("excludes stagger leaves under display-none and transparent ancestors", () => {
    const root = svg(`
      <g style="display: none"><path id="display-hidden" /></g>
      <g style="opacity: 0"><text id="opacity-hidden">Hidden</text></g>
      <g><path id="visible" /></g>
    `);

    animateSvg(root, { preset: "stagger", delay: 15, stagger: 30 });

    expect(animationsFor(root.querySelector("#display-hidden")!)).toEqual([]);
    expect(animationsFor(root.querySelector("#opacity-hidden")!)).toEqual([]);
    expect(
      animationsFor(root.querySelector("#visible")!)[0]?.timing.delay,
    ).toBe(15);
    expect(allAnimations(root)).toHaveLength(1);
  });

  it("falls back to a whole-root fade and emits a stable diagnostic", () => {
    const root = svg(
      "<g><text>Only text</text><image href='data:image/png;base64,AAAA' /></g>",
    );

    const controller = animateSvg(root);

    expect(controller.diagnostics).toEqual([
      { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
    ]);
    expect(animationsFor(root)).toHaveLength(1);
    expect(allAnimations(root)).toHaveLength(1);
    expect(animationsFor(root)[0]?.keyframes).toEqual([
      expect.objectContaining({ opacity: 0 }),
      expect.objectContaining({ opacity: 1 }),
    ]);
  });
});

describe("SvgMotionController", () => {
  function pausedController(): {
    root: SVGSVGElement;
    controller: SvgMotionController;
    original: string;
  } {
    const root = geometry(
      '<path style="opacity: .8" stroke-dasharray="3" fill="#f00" d="M0 0h10" />',
    );
    const original = root.outerHTML;
    return {
      root,
      controller: animateSvg(root, { autoplay: false }),
      original,
    };
  }

  it("supports play, pause, reverse, seek, restart, finish, and current-run finished", async () => {
    const { root, controller } = pausedController();
    const firstRun = controller.finished;

    controller.play();
    expect(controller.state).toBe("running");
    controller.pause();
    expect(controller.state).toBe("paused");
    controller.seek(0.5);
    expect(animationsFor(root.querySelector("path")!)[0]?.currentTime).toBe(
      600,
    );
    controller.reverse();
    expect(controller.state).toBe("running");
    expect(animationsFor(root.querySelector("path")!)[0]?.playbackRate).toBe(
      -1,
    );

    controller.restart();
    const secondRun = controller.finished;
    expect(secondRun).not.toBe(firstRun);
    expect(controller.state).toBe("running");
    expect(animationsFor(root.querySelector("path")!)[0]?.currentTime).toBe(0);
    await firstRun;

    controller.finish();
    await secondRun;
    expect(controller.state).toBe("finished");
  });

  it("restores exact source appearance and removes animations on cancel", async () => {
    const { root, controller, original } = pausedController();
    const finished = controller.finished;

    controller.play();
    controller.cancel();

    await finished;
    expect(controller.state).toBe("cancelled");
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("settles and cleans up after all native animations finish naturally", async () => {
    const root = geometry(`
      <path fill="#f00" d="M0 0h10" />
      <path stroke="#0f0" d="M0 0h10" />
    `);
    const original = root.outerHTML;
    const controller = animateSvg(root, { stagger: 25 });
    const finished = controller.finished;
    const owned = allAnimations(root);

    for (const animation of owned) animation.completeNaturally();
    await finished;

    expect(controller.state).toBe("finished");
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("destroys permanently and makes later controls inert", () => {
    const { root, controller, original } = pausedController();

    controller.destroy();
    controller.play();
    controller.reverse();
    controller.restart();
    controller.finish();
    controller.cancel();
    controller.seek(0.5);

    expect(controller.state).toBe("destroyed");
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("finishes an infinite pulse and restores the source", async () => {
    const root = geometry();
    const original = root.outerHTML;
    const controller = animateSvg(root, {
      preset: "pulse",
      iterations: Infinity,
    });
    const finished = controller.finished;

    controller.finish();

    await finished;
    expect(controller.state).toBe("finished");
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it.each([
    [{ duration: -1 }, "duration"],
    [{ iterations: 0 }, "iterations"],
    [{ stagger: -1 }, "stagger"],
  ] satisfies Array<[SvgMotionOptions, string]>)(
    "rejects invalid options %j",
    (options, field) => {
      const root = geometry();
      expect(() => animateSvg(root, options)).toThrow(field);
      expect(allAnimations(root)).toEqual([]);
    },
  );

  it("rejects invalid seek positions", () => {
    const { controller } = pausedController();

    expect(() => controller.seek(-0.1)).toThrow(RangeError);
    expect(() => controller.seek(1.1)).toThrow(RangeError);
  });

  it("rejects invalid selectors before changing presentation", () => {
    const root = geometry();
    const original = root.outerHTML;

    expect(() => animateSvg(root, { selector: "[" })).toThrow();
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("requires an SVG root and native WAAPI", () => {
    for (const invalid of [
      null,
      document.createElement("div"),
      document.createElement("svg"),
    ]) {
      expect(() => animateSvg(invalid as never)).toThrow(
        expect.objectContaining({
          name: "SvgAnimationError",
          code: SVG_ANIMATION_ERROR_CODES.invalidSvg,
          message: "animateSvg requires an SVG root element.",
        }),
      );
    }

    uninstallWaapi();
    const root = geometry();
    expect(() => animateSvg(root, { preset: "fade" })).toThrow(
      expect.objectContaining({
        name: "SvgAnimationError",
        code: SVG_ANIMATION_ERROR_CODES.unsupportedEnvironment,
        message: "SVG animation requires the Web Animations API.",
      }),
    );
  });

  it("wraps synchronous native setup failures without leaking details", () => {
    const root = geometry();
    const original = root.outerHTML;
    vi.spyOn(Element.prototype, "animate").mockImplementationOnce(() => {
      throw new Error('<svg onload="attacker()">internal renderer detail');
    });

    expect(() => animateSvg(root)).toThrow(
      expect.objectContaining({
        name: "SvgAnimationError",
        code: SVG_ANIMATION_ERROR_CODES.setupFailed,
        message: "The SVG animation could not be created.",
      }),
    );
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("rejects unexpected native completion failures with a typed error and cleans up", async () => {
    const root = geometry();
    const original = root.outerHTML;
    const controller = animateSvg(root);
    const finished = controller.finished;
    const animation = allAnimations(root)[0]!;

    animation.failNaturally(
      new Error("<script>attacker()</script> internal renderer detail"),
    );

    await expect(finished).rejects.toEqual(
      expect.objectContaining({
        name: "SvgAnimationError",
        code: SVG_ANIMATION_ERROR_CODES.animationFailed,
        message: "The SVG animation did not complete.",
      }),
    );
    expect(controller.state).toBe("failed");
    expect(root.outerHTML).toBe(original);
    expect(allAnimations(root)).toEqual([]);
  });

  it("exports a stable typed animation error class", () => {
    const error = new SvgAnimationError(
      SVG_ANIMATION_ERROR_CODES.animationFailed,
      "safe",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SvgAnimationError");
    expect(error.code).toBe("ANIMATION_FAILED");
  });
});
