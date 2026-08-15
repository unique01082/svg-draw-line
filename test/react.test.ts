// @vitest-environment jsdom

import {
  StrictMode,
  act,
  createElement,
  createRef,
  type ReactElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SvgMotion,
  type SvgMotionHandle,
  type SvgMotionReadyHandle,
  type UseSvgMotionOptions,
  type UseSvgMotionResult,
  useSvgMotion,
} from "../src/react";
import {
  RecordedAnimation,
  allAnimations,
  animationsFor,
  installWaapi,
  uninstallWaapi,
} from "./waapi-test-support";
import { SVG_ANIMATION_ERROR_CODES, SvgAnimationError } from "../src/index";

const SVG_SOURCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#f00" d="M0 0h10" /></svg>';

let roots: Root[] = [];

async function render(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
}

function installGeometryLengths() {
  Object.defineProperty(SVGElement.prototype, "getTotalLength", {
    configurable: true,
    value: vi.fn(function (this: SVGElement) {
      switch (this.localName) {
        case "path":
        case "line":
        case "polyline":
        case "polygon":
          return 10;
        case "circle":
          return 2 * Math.PI * Number(this.getAttribute("r") ?? 0);
        case "ellipse":
          return (
            Math.PI *
            (Number(this.getAttribute("rx") ?? 0) +
              Number(this.getAttribute("ry") ?? 0))
          );
        case "rect":
          return (
            2 *
            (Number(this.getAttribute("width") ?? 0) +
              Number(this.getAttribute("height") ?? 0))
          );
        default:
          throw new TypeError("getTotalLength is only defined for geometry");
      }
    }),
  });
}

async function flushUnhandledRejections() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

type CleanupFailure = "transient" | "persistent";

function failNativeCancel(
  animation: RecordedAnimation,
  failure: CleanupFailure,
) {
  const cancel = vi.spyOn(animation, "cancel");
  const throwFailure = () => {
    throw new Error(`private ${failure} cancel failure`);
  };
  if (failure === "transient") cancel.mockImplementationOnce(throwFailure);
  else cancel.mockImplementation(throwFailure);
  return cancel;
}

async function captureCleanupDiagnostics(action: () => Promise<void>) {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  let thrown: unknown;
  try {
    try {
      await action();
    } catch (error) {
      thrown = error;
    }
    await flushUnhandledRejections();
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  return { consoleError, thrown, unhandled };
}

function expectSafeCleanupError(error: unknown) {
  expect(error).toEqual(
    expect.objectContaining({
      name: "SvgAnimationError",
      code: SVG_ANIMATION_ERROR_CODES.animationFailed,
      message: "The SVG animation did not complete.",
    }),
  );
}

beforeEach(() => {
  installWaapi();
  installGeometryLengths();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  for (const root of roots) {
    await act(async () => root.unmount());
  }
  roots = [];
  uninstallWaapi();
  Reflect.deleteProperty(SVGElement.prototype, "getTotalLength");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("SvgMotion", () => {
  it("loads through the core pipeline, autoplays by default, and exposes the current handle", async () => {
    const ref = createRef<SvgMotionHandle>();
    let ready: SvgMotionHandle | null = null;

    const { host } = await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        onReady(handle) {
          ready = handle;
        },
      }),
    );

    const container = host.firstElementChild;
    const svg = container?.querySelector("svg") as SVGSVGElement;
    expect(container?.localName).toBe("div");
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect(ref.current?.svg).toBe(svg);
    expect(ref.current?.controller?.state).toBe("running");
    expect(ready).toBe(ref.current);
    const drawAnimation = animationsFor(svg.querySelector("path")!)[0]!;
    expect(drawAnimation.keyframes).toEqual([
      expect.objectContaining({
        fillOpacity: 0,
        strokeDasharray: "10",
        strokeDashoffset: "10",
      }),
      expect.objectContaining({
        fillOpacity: 0,
        strokeDasharray: "10",
        strokeDashoffset: "0",
      }),
      expect.objectContaining({
        fillOpacity: 1,
        strokeDasharray: "10",
        strokeDashoffset: "0",
      }),
    ]);
    expect(drawAnimation.playState).toBe("running");
  });

  it("supports autoplay false and a span container with container presentation", async () => {
    const ref = createRef<SvgMotionHandle>();
    const { host } = await render(
      createElement(SvgMotion, {
        as: "span",
        autoplay: false,
        className: "motion-shell",
        ref,
        source: SVG_SOURCE,
        style: { display: "inline-block" },
        trust: "trusted",
      }),
    );

    const container = host.firstElementChild as HTMLElement;
    expect(container.localName).toBe("span");
    expect(container.className).toBe("motion-shell");
    expect(container.style.display).toBe("inline-block");
    expect(ref.current?.controller?.state).toBe("idle");
  });

  it("renders loading while preparation is pending and removes it when ready", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    act(() => {
      root.render(
        createElement(SvgMotion, {
          loading: createElement("span", null, "Preparing icon"),
          source: "/icon.svg",
        }),
      );
    });
    expect(host.textContent).toBe("Preparing icon");

    await act(async () => {
      resolveFetch(
        new Response(SVG_SOURCE, {
          headers: { "content-type": "image/svg+xml" },
          status: 200,
        }),
      );
    });

    expect(host.querySelector("svg")).toBeInstanceOf(SVGSVGElement);
    expect(host.textContent).not.toContain("Preparing icon");
  });

  it("reports natural finish and explicit cancel from the live controller", async () => {
    const ref = createRef<SvgMotionHandle>();
    const events: string[] = [];
    await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        onCancel() {
          events.push("cancel");
        },
        onFinish() {
          events.push("finish");
        },
      }),
    );

    const firstController = ref.current!.controller!;
    await act(async () => {
      for (const animation of allAnimations(ref.current!.svg!)) {
        animation.completeNaturally();
      }
      await firstController.finished;
    });
    expect(events).toEqual(["finish"]);

    await act(async () => {
      firstController.restart();
      firstController.cancel();
      await firstController.finished;
    });
    expect(events).toEqual(["finish", "cancel"]);
  });

  it("aborts pending preparation and mounts only the newest source", async () => {
    let pendingSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          pendingSignal = init?.signal ?? undefined;
          pendingSignal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const ref = createRef<SvgMotionHandle>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);

    act(() => {
      root.render(createElement(SvgMotion, { ref, source: "/slow.svg" }));
    });
    expect(pendingSignal?.aborted).toBe(false);

    await act(async () => {
      root.render(
        createElement(SvgMotion, {
          ref,
          source:
            '<svg xmlns="http://www.w3.org/2000/svg" data-source="new"><text>new</text></svg>',
          trust: "trusted",
        }),
      );
    });

    expect(pendingSignal?.aborted).toBe(true);
    expect(host.querySelectorAll("svg")).toHaveLength(1);
    expect(ref.current?.svg?.dataset.source).toBe("new");
  });

  it("destroys the live instance and removes its SVG on unmount", async () => {
    const ref = createRef<SvgMotionHandle>();
    let retained: SvgMotionHandle | null = null;
    const { root } = await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        onReady(handle) {
          retained = handle;
        },
      }),
    );
    const svg = ref.current!.svg!;
    const controller = ref.current!.controller!;

    await act(async () => root.unmount());
    roots = roots.filter((candidate) => candidate !== root);

    expect(svg.isConnected).toBe(false);
    expect(controller.state).toBe("destroyed");
    expect(allAnimations(svg)).toEqual([]);
    expect(retained).not.toBeNull();
    expect(retained!.svg).toBeNull();
    expect(retained!.controller).toBeNull();
  });

  it.each(["transient", "persistent"] as const)(
    "contains a %s native cleanup failure during unmount",
    async (failure) => {
      const errors: unknown[] = [];
      const ref = createRef<SvgMotionHandle>();
      let retained: SvgMotionHandle | null = null;
      const { root } = await render(
        createElement(SvgMotion, {
          ref,
          source: SVG_SOURCE,
          trust: "trusted",
          onError: (error) => errors.push(error),
          onReady: (handle) => {
            retained = handle;
          },
        }),
      );
      const svg = ref.current!.svg!;
      const controller = ref.current!.controller!;
      const animation = allAnimations(svg)[0]!;
      const cancel = failNativeCancel(animation, failure);

      const diagnostics = await captureCleanupDiagnostics(async () => {
        await act(async () => root.unmount());
      });
      roots = roots.filter((candidate) => candidate !== root);

      expect(diagnostics.thrown).toBeUndefined();
      expect(diagnostics.consoleError).not.toHaveBeenCalled();
      expect(diagnostics.unhandled).toEqual([]);
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(svg.isConnected).toBe(false);
      expect(retained).not.toBeNull();
      expect(retained!.svg).toBeNull();
      expect(retained!.controller).toBeNull();
      expect(errors).toEqual([]);
      if (failure === "transient") {
        expect(controller.state).toBe("destroyed");
        expect(allAnimations(svg)).toEqual([]);
      } else {
        expect(controller.state).toBe("failed");
        expect(allAnimations(svg)).toEqual([animation]);
      }
    },
  );

  it.each(["transient", "persistent"] as const)(
    "contains a %s native cleanup failure during source replacement",
    async (failure) => {
      const errors: unknown[] = [];
      const ready: SvgMotionHandle[] = [];
      const ref = createRef<SvgMotionHandle>();
      const { host, root } = await render(
        createElement(SvgMotion, {
          ref,
          source:
            '<svg xmlns="http://www.w3.org/2000/svg" data-source="old"><path fill="#f00" d="M0 0h10" /></svg>',
          trust: "trusted",
          onError: (error) => errors.push(error),
          onReady: (handle) => ready.push(handle),
        }),
      );
      const retained = ready[0]!;
      const oldSvg = retained.svg!;
      const oldController = retained.controller!;
      const oldAnimation = allAnimations(oldSvg)[0]!;
      const cancel = failNativeCancel(oldAnimation, failure);

      const diagnostics = await captureCleanupDiagnostics(async () => {
        await act(async () => {
          root.render(
            createElement(SvgMotion, {
              ref,
              source:
                '<svg xmlns="http://www.w3.org/2000/svg" data-source="new"><path fill="#0f0" d="M0 0h10" /></svg>',
              trust: "trusted",
              onError: (error) => errors.push(error),
              onReady: (handle) => ready.push(handle),
            }),
          );
        });
      });

      expect(diagnostics.thrown).toBeUndefined();
      expect(diagnostics.consoleError).not.toHaveBeenCalled();
      expect(diagnostics.unhandled).toEqual([]);
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(oldSvg.isConnected).toBe(false);
      expect(host.querySelectorAll("svg")).toHaveLength(1);
      expect(ready).toEqual([retained, retained]);
      expect(retained.svg?.dataset.source).toBe("new");
      expect(retained.controller?.state).toBe("running");
      if (failure === "transient") {
        expect(oldController.state).toBe("destroyed");
        expect(allAnimations(oldSvg)).toEqual([]);
        expect(errors).toEqual([]);
      } else {
        expect(oldController.state).toBe("failed");
        expect(allAnimations(oldSvg)).toEqual([oldAnimation]);
        expect(errors).toHaveLength(1);
        expectSafeCleanupError(errors[0]);
      }
    },
  );

  it("keeps a retained handle live through replacement and obsolete cleanup", async () => {
    let resolveSlow!: (response: Response) => void;
    let pendingSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          pendingSignal = init?.signal ?? undefined;
          resolveSlow = resolve;
        }),
    );
    const ref = createRef<SvgMotionHandle>();
    const readyHandles: SvgMotionHandle[] = [];
    const ready = (handle: SvgMotionHandle) => readyHandles.push(handle);
    const { root } = await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        onReady: ready,
      }),
    );
    const retained = readyHandles[0]!;
    const firstSvg = retained.svg!;
    const firstController = retained.controller!;

    await act(async () => {
      root.render(
        createElement(SvgMotion, {
          ref,
          source: "/slow.svg",
          trust: "trusted",
          onReady: ready,
        }),
      );
    });

    expect(pendingSignal?.aborted).toBe(false);
    expect(firstController.state).toBe("destroyed");
    expect(firstSvg.isConnected).toBe(false);
    expect(retained.svg).toBeNull();
    expect(retained.controller).toBeNull();

    await act(async () => {
      root.render(
        createElement(SvgMotion, {
          ref,
          source:
            '<svg xmlns="http://www.w3.org/2000/svg" data-source="new"><path fill="#0f0" d="M0 0h10" /></svg>',
          trust: "trusted",
          onReady: ready,
        }),
      );
    });
    const replacementSvg = retained.svg;
    const replacementController = retained.controller;
    expect(pendingSignal?.aborted).toBe(true);
    expect(readyHandles).toEqual([retained, retained]);
    expect(replacementSvg?.dataset.source).toBe("new");
    expect(replacementController?.state).toBe("running");

    await act(async () => {
      resolveSlow(
        new Response(SVG_SOURCE, {
          headers: { "content-type": "image/svg+xml" },
          status: 200,
        }),
      );
      await Promise.resolve();
    });

    expect(retained.svg).toBe(replacementSvg);
    expect(retained.controller).toBe(replacementController);
    expect(replacementSvg?.isConnected).toBe(true);
  });

  it.each(["transient", "persistent"] as const)(
    "contains a %s native cleanup failure from an obsolete mount resolution",
    async (failure) => {
      class NonAbortingController {
        readonly signal = { aborted: false } as AbortSignal;
        abort() {}
      }
      vi.stubGlobal("AbortController", NonAbortingController);
      let resolveObsolete!: (response: Response) => void;
      vi.stubGlobal(
        "fetch",
        () =>
          new Promise<Response>((resolve) => {
            resolveObsolete = resolve;
          }),
      );
      const errors: unknown[] = [];
      const ready: SvgMotionHandle[] = [];
      const ref = createRef<SvgMotionHandle>();
      const { host, root } = await render(
        createElement(SvgMotion, {
          ref,
          source: "/obsolete.svg",
          trust: "trusted",
          onError: (error) => errors.push(error),
          onReady: (handle) => ready.push(handle),
        }),
      );

      await act(async () => {
        root.render(
          createElement(SvgMotion, {
            ref,
            source:
              '<svg xmlns="http://www.w3.org/2000/svg" data-source="new"><path fill="#0f0" d="M0 0h10" /></svg>',
            trust: "trusted",
            onError: (error) => errors.push(error),
            onReady: (handle) => ready.push(handle),
          }),
        );
      });
      const retained = ready[0]!;
      const replacementSvg = retained.svg!;
      const replacementController = retained.controller!;
      const nativeCancel = RecordedAnimation.prototype.cancel;
      let obsoleteSvg: SVGSVGElement | undefined;
      let obsoleteAnimation: RecordedAnimation | undefined;
      let obsoleteCancelAttempts = 0;
      const recordObsoleteAnimation = (animation: RecordedAnimation) => {
        obsoleteAnimation = animation;
      };
      vi.spyOn(RecordedAnimation.prototype, "cancel").mockImplementation(
        function (this: RecordedAnimation) {
          const svg = this.target.closest("svg") as SVGSVGElement | null;
          if (svg?.dataset.source === "obsolete") {
            obsoleteSvg = svg;
            recordObsoleteAnimation(this);
            obsoleteCancelAttempts += 1;
            if (failure === "persistent" || obsoleteCancelAttempts === 1) {
              throw new Error(`private ${failure} obsolete cancel failure`);
            }
          }
          nativeCancel.call(this);
        },
      );

      const diagnostics = await captureCleanupDiagnostics(async () => {
        await act(async () => {
          resolveObsolete(
            new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" data-source="obsolete"><path fill="#f00" d="M0 0h10" /></svg>',
              {
                headers: { "content-type": "image/svg+xml" },
                status: 200,
              },
            ),
          );
        });
      });

      expect(diagnostics.thrown).toBeUndefined();
      expect(diagnostics.consoleError).not.toHaveBeenCalled();
      expect(diagnostics.unhandled).toEqual([]);
      expect(obsoleteCancelAttempts).toBe(2);
      expect(obsoleteSvg).toBeInstanceOf(SVGSVGElement);
      expect(obsoleteSvg?.isConnected).toBe(false);
      expect(host.querySelectorAll("svg")).toHaveLength(1);
      expect(ready).toEqual([retained]);
      expect(retained.svg).toBe(replacementSvg);
      expect(retained.controller).toBe(replacementController);
      expect(replacementSvg.isConnected).toBe(true);
      expect(replacementController.state).toBe("running");
      if (failure === "transient") {
        expect(allAnimations(obsoleteSvg!)).toEqual([]);
        expect(errors).toEqual([]);
      } else {
        expect(allAnimations(obsoleteSvg!)).toEqual([obsoleteAnimation]);
        expect(errors).toHaveLength(1);
        expectSafeCleanupError(errors[0]);
      }
    },
  );

  it("surfaces preparation errors and renders the fallback", async () => {
    const errors: unknown[] = [];
    const { host } = await render(
      createElement(SvgMotion, {
        fallback: createElement("span", null, "Icon unavailable"),
        source: "<svg><path></svg>",
        onError(error) {
          errors.push(error);
        },
      }),
    );

    expect(host.textContent).toBe("Icon unavailable");
    expect(host.querySelector("svg")).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("applies only the explicit SVG presentation and accessibility surface", async () => {
    const ref = createRef<SvgMotionHandle>();
    const { host } = await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        svgProps: {
          "aria-describedby": "icon-help",
          "aria-label": "Upload complete",
          className: "animated-icon",
          focusable: false,
          height: 32,
          preserveAspectRatio: "xMidYMid meet",
          style: { color: "red", strokeMiterlimit: 4, width: 24 },
          viewBox: "0 0 20 20",
          width: "2rem",
        },
      }),
    );

    const svg = ref.current!.svg!;
    expect(svg.getAttribute("aria-label")).toBe("Upload complete");
    expect(svg.getAttribute("aria-describedby")).toBe("icon-help");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
    expect(svg.getAttribute("class")).toBe("animated-icon");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("height")).toBe("32");
    expect(svg.getAttribute("width")).toBe("2rem");
    expect(svg.getAttribute("viewBox")).toBe("0 0 20 20");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.style.color).toBe("red");
    expect(svg.style.strokeMiterlimit).toBe("4");
    expect(svg.style.width).toBe("24px");
    expect(host.querySelector("button")).toBeNull();
    expect(svg.hasAttribute("tabindex")).toBe(false);
  });
});

describe("useSvgMotion", () => {
  let current: UseSvgMotionResult | null = null;

  function Harness({ options }: { options: UseSvgMotionOptions }) {
    current = useSvgMotion(options);
    return createElement("div", { ref: current.containerRef });
  }

  function DetachableHarness({
    attached,
    options,
  }: {
    attached: boolean;
    options: UseSvgMotionOptions;
  }) {
    current = useSvgMotion(options);
    return attached
      ? createElement("div", { ref: current.containerRef })
      : null;
  }

  afterEach(() => {
    current = null;
  });

  it("returns the live SVG, controller, status, error, and diagnostics", async () => {
    await render(
      createElement(Harness, {
        options: { source: SVG_SOURCE, trust: "trusted" },
      }),
    );

    expect(current?.svg).toBeInstanceOf(SVGSVGElement);
    expect(current?.controller?.state).toBe("running");
    expect(current?.status).toBe("running");
    expect(current?.error).toBeNull();
    expect(current?.diagnostics).toEqual([]);
    expect(animationsFor(current!.svg!.querySelector("path")!)).toHaveLength(1);
  });

  it("publishes an idle empty snapshot while detached and remounts cleanly in StrictMode", async () => {
    const ready: SvgMotionReadyHandle[] = [];
    const finishes: string[] = [];
    const options: UseSvgMotionOptions = {
      source: SVG_SOURCE,
      trust: "trusted",
      onFinish: () => finishes.push("finish"),
      onReady: (handle) => ready.push(handle),
    };
    const { root } = await render(
      createElement(
        StrictMode,
        null,
        createElement(DetachableHarness, { attached: true, options }),
      ),
    );
    const firstSvg = current!.svg!;
    const firstController = current!.controller!;

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(DetachableHarness, { attached: false, options }),
        ),
      );
    });

    expect(current).toEqual(
      expect.objectContaining({
        svg: null,
        controller: null,
        status: "idle",
        error: null,
        diagnostics: [],
      }),
    );
    expect(firstSvg.isConnected).toBe(false);
    expect(firstController.state).toBe("destroyed");
    expect(allAnimations(firstSvg)).toEqual([]);
    expect(finishes).toEqual([]);

    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(DetachableHarness, { attached: true, options }),
        ),
      );
    });

    expect(current?.svg).not.toBe(firstSvg);
    expect(current?.controller).not.toBe(firstController);
    expect(current?.status).toBe("running");
    expect(ready).toHaveLength(2);
    expect(finishes).toEqual([]);
  });

  it.each(["transient", "persistent"] as const)(
    "contains a %s native cleanup failure when the callback ref detaches",
    async (failure) => {
      const errors: unknown[] = [];
      const options: UseSvgMotionOptions = {
        source: SVG_SOURCE,
        trust: "trusted",
        onError: (error) => errors.push(error),
      };
      const { root } = await render(
        createElement(DetachableHarness, { attached: true, options }),
      );
      const oldSvg = current!.svg!;
      const oldController = current!.controller!;
      const oldAnimation = allAnimations(oldSvg)[0]!;
      const cancel = failNativeCancel(oldAnimation, failure);

      const diagnostics = await captureCleanupDiagnostics(async () => {
        await act(async () => {
          root.render(
            createElement(DetachableHarness, { attached: false, options }),
          );
        });
      });

      expect(diagnostics.thrown).toBeUndefined();
      expect(diagnostics.consoleError).not.toHaveBeenCalled();
      expect(diagnostics.unhandled).toEqual([]);
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(current).toEqual(
        expect.objectContaining({
          svg: null,
          controller: null,
          status: "idle",
          error: null,
          diagnostics: [],
        }),
      );
      expect(oldSvg.isConnected).toBe(false);
      if (failure === "transient") {
        expect(oldController.state).toBe("destroyed");
        expect(allAnimations(oldSvg)).toEqual([]);
        expect(errors).toEqual([]);
      } else {
        expect(oldController.state).toBe("failed");
        expect(allAnimations(oldSvg)).toEqual([oldAnimation]);
        expect(errors).toHaveLength(1);
        expectSafeCleanupError(errors[0]);
      }
    },
  );

  it("does not remount when only the options object identity changes", async () => {
    const { root } = await render(
      createElement(Harness, {
        options: { duration: 300, source: SVG_SOURCE, trust: "trusted" },
      }),
    );
    const svg = current!.svg;
    const controller = current!.controller!;

    await act(async () => {
      root.render(
        createElement(Harness, {
          options: { duration: 300, source: SVG_SOURCE, trust: "trusted" },
        }),
      );
    });

    expect(current?.svg).toBe(svg);
    expect(current?.controller).toBe(controller);

    await act(async () => {
      root.render(
        createElement(Harness, {
          options: { duration: 600, source: SVG_SOURCE, trust: "trusted" },
        }),
      );
    });

    expect(current?.svg).not.toBe(svg);
    expect(current?.controller).not.toBe(controller);
    expect(controller.state).toBe("destroyed");
  });

  it("tracks finished and cancelled statuses and calls the matching callbacks", async () => {
    const events: string[] = [];
    await render(
      createElement(Harness, {
        options: {
          source: SVG_SOURCE,
          trust: "trusted",
          onCancel: () => events.push("cancel"),
          onFinish: () => events.push("finish"),
        },
      }),
    );
    const controller = current!.controller!;

    await act(async () => {
      controller.finish();
      await controller.finished;
    });
    expect(current?.status).toBe("finished");
    expect(events).toEqual(["finish"]);

    await act(async () => {
      controller.restart();
      controller.cancel();
      await controller.finished;
    });
    expect(current?.status).toBe("cancelled");
    expect(events).toEqual(["finish", "cancel"]);
  });

  it("reports native animation failures without an internal unhandled rejection", async () => {
    const errors: unknown[] = [];
    await render(
      createElement(Harness, {
        options: {
          source: SVG_SOURCE,
          trust: "trusted",
          onError: (error) => errors.push(error),
        },
      }),
    );
    const svg = current!.svg!;
    const controller = current!.controller!;
    let rejected: unknown;

    await act(async () => {
      allAnimations(svg)[0]!.failNaturally(new Error("private native detail"));
      try {
        await controller.finished;
      } catch (error) {
        rejected = error;
      }
    });

    expect(rejected).toBeInstanceOf(SvgAnimationError);
    expect(current?.status).toBe("failed");
    expect(current?.error).toBe(rejected);
    expect(errors).toEqual([rejected]);
    expect(allAnimations(svg)).toEqual([]);
  });

  it("observes a rejected fresh run when a controller method throws", async () => {
    const errors: unknown[] = [];
    await render(
      createElement(Harness, {
        options: {
          autoplay: false,
          source: SVG_SOURCE,
          trust: "trusted",
          onError: (error) => errors.push(error),
        },
      }),
    );
    const controller = current!.controller!;
    await act(async () => {
      controller.cancel();
      await controller.finished;
    });
    vi.spyOn(Element.prototype, "animate").mockImplementationOnce(() => {
      throw new Error("private fresh-run setup detail");
    });
    let thrown: unknown;

    await act(async () => {
      try {
        controller.play();
      } catch (error) {
        thrown = error;
      }
      await expect(controller.finished).rejects.toBe(thrown);
    });

    expect(thrown).toEqual(
      expect.objectContaining({
        name: "SvgAnimationError",
        code: SVG_ANIMATION_ERROR_CODES.setupFailed,
        message: "The SVG animation could not be created.",
      }),
    );
    expect(current?.status).toBe("failed");
    expect(current?.error).toBe(thrown);
    expect(errors).toEqual([thrown]);
  });

  it.each(
    (["onReady", "onFinish", "onCancel", "onError"] as const).flatMap(
      (callbackName) =>
        (["throw", "reject"] as const).map(
          (failureMode) => [callbackName, failureMode] as const,
        ),
    ),
  )(
    "isolates a lifecycle callback that makes %s %s without an unhandled rejection",
    async (callbackName, failureMode) => {
      const failure = new Error(`${callbackName} ${failureMode}`);
      let callCount = 0;
      const callback = () => {
        callCount += 1;
        if (failureMode === "throw") throw failure;
        return Promise.reject(failure);
      };
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);

      try {
        if (callbackName === "onError") {
          await render(
            createElement(Harness, {
              options: {
                source: "<svg><path></svg>",
                onError: callback,
              },
            }),
          );
        } else {
          const options: UseSvgMotionOptions = {
            source: SVG_SOURCE,
            trust: "trusted",
          };
          Object.assign(options, { [callbackName]: callback });
          await render(createElement(Harness, { options }));
          const controller = current!.controller!;
          if (callbackName === "onFinish") {
            await act(async () => {
              controller.finish();
              await controller.finished;
            });
          } else if (callbackName === "onCancel") {
            await act(async () => {
              controller.cancel();
              await controller.finished;
            });
          }
        }
        await flushUnhandledRejections();
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(callCount).toBe(1);
      expect(unhandled).toEqual([]);
    },
  );

  it.each(["pause", "finite finish", "infinite finish", "seek"] as const)(
    "refreshes and observes a typed %s failure in finally",
    async (failurePoint) => {
      const errors: unknown[] = [];
      const options: UseSvgMotionOptions = {
        source: SVG_SOURCE,
        trust: "trusted",
        onError: (error) => errors.push(error),
      };
      if (failurePoint === "infinite finish") {
        options.preset = "pulse";
        options.iterations = Infinity;
      }
      await render(createElement(Harness, { options }));
      const svg = current!.svg!;
      const controller = current!.controller!;
      const finished = controller.finished;
      const animation = allAnimations(svg)[0]!;

      if (failurePoint === "pause") {
        vi.spyOn(animation, "pause").mockImplementationOnce(() => {
          throw new Error("private pause failure");
        });
      } else if (failurePoint === "finite finish") {
        vi.spyOn(animation, "finish").mockImplementationOnce(() => {
          throw new Error("private finish failure");
        });
      } else {
        const setCurrentTime = vi
          .fn<(value: CSSNumberish | null) => void>()
          .mockImplementationOnce(() => {
            throw new Error(`private ${failurePoint} failure`);
          });
        Object.defineProperty(animation, "currentTime", {
          configurable: true,
          get: () => 0,
          set: setCurrentTime,
        });
      }

      let thrown: unknown;
      act(() => {
        try {
          if (failurePoint === "pause") controller.pause();
          else if (failurePoint === "seek") controller.seek(0.5);
          else controller.finish();
        } catch (error) {
          thrown = error;
        }
      });

      expect(thrown).toEqual(
        expect.objectContaining({
          name: "SvgAnimationError",
          code: SVG_ANIMATION_ERROR_CODES.animationFailed,
          message: "The SVG animation did not complete.",
        }),
      );
      expect(current?.status).toBe("failed");
      await act(async () => {
        await expect(finished).rejects.toBe(thrown);
      });
      expect(current?.error).toBe(thrown);
      expect(errors).toEqual([thrown]);
      expect(allAnimations(svg)).toEqual([]);
      expect(svg.querySelector("path")?.hasAttribute("style")).toBe(false);
    },
  );

  it.each(
    (["pause", "finite finish", "infinite finish", "seek"] as const).flatMap(
      (failurePoint) =>
        (["play", "reverse", "restart"] as const).map(
          (recovery) => [failurePoint, recovery] as const,
        ),
    ),
  )(
    "delivers one %s failure when %s immediately starts a recovery run",
    async (failurePoint, recovery) => {
      const errors: unknown[] = [];
      const finishes: string[] = [];
      const cancels: string[] = [];
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      const options: UseSvgMotionOptions = {
        source: SVG_SOURCE,
        trust: "trusted",
        onCancel: () => cancels.push("cancel"),
        onError: (error) => errors.push(error),
        onFinish: () => finishes.push("finish"),
      };
      if (failurePoint === "infinite finish") {
        options.preset = "pulse";
        options.iterations = Infinity;
      }
      process.on("unhandledRejection", onUnhandled);

      try {
        await render(createElement(Harness, { options }));
        const svg = current!.svg!;
        const controller = current!.controller!;
        const failedRun = controller.finished;
        const animation = allAnimations(svg)[0]!;

        if (failurePoint === "pause") {
          vi.spyOn(animation, "pause").mockImplementationOnce(() => {
            throw new Error("private pause failure");
          });
        } else if (failurePoint === "finite finish") {
          vi.spyOn(animation, "finish").mockImplementationOnce(() => {
            throw new Error("private finish failure");
          });
        } else {
          const setCurrentTime = vi
            .fn<(value: CSSNumberish | null) => void>()
            .mockImplementationOnce(() => {
              throw new Error(`private ${failurePoint} failure`);
            });
          Object.defineProperty(animation, "currentTime", {
            configurable: true,
            get: () => 0,
            set: setCurrentTime,
          });
        }

        let thrown: unknown;
        let recoveredRun: Promise<void> | undefined;
        await act(async () => {
          try {
            if (failurePoint === "pause") controller.pause();
            else if (failurePoint === "seek") controller.seek(0.5);
            else controller.finish();
          } catch (error) {
            thrown = error;
          }
          controller[recovery]();
          recoveredRun = controller.finished;
          await expect(failedRun).rejects.toBe(thrown);
          await Promise.resolve();
        });
        await flushUnhandledRejections();

        expect(thrown).toEqual(
          expect.objectContaining({
            name: "SvgAnimationError",
            code: SVG_ANIMATION_ERROR_CODES.animationFailed,
            message: "The SVG animation did not complete.",
          }),
        );
        expect(recoveredRun).not.toBe(failedRun);
        expect(controller.finished).toBe(recoveredRun);
        expect(controller.state).toBe("running");
        expect(current?.status).toBe("running");
        expect(current?.error).toBeNull();
        expect(errors).toEqual([thrown]);
        expect(finishes).toEqual([]);
        expect(cancels).toEqual([]);
        expect(unhandled).toEqual([]);
        expect(allAnimations(svg)).toHaveLength(1);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    },
  );

  it.each(["play", "reverse", "restart"] as const)(
    "delivers one fresh %s setup failure before immediate recovery",
    async (failurePoint) => {
      const errors: unknown[] = [];
      await render(
        createElement(Harness, {
          options: {
            autoplay: false,
            source: SVG_SOURCE,
            trust: "trusted",
            onError: (error) => errors.push(error),
          },
        }),
      );
      const svg = current!.svg!;
      const controller = current!.controller!;
      await act(async () => {
        controller.cancel();
        await controller.finished;
      });
      vi.spyOn(Element.prototype, "animate").mockImplementationOnce(() => {
        throw new Error(`private fresh ${failurePoint} setup failure`);
      });

      let thrown: unknown;
      let failedRun: Promise<void> | undefined;
      let recoveredRun: Promise<void> | undefined;
      await act(async () => {
        try {
          controller[failurePoint]();
        } catch (error) {
          thrown = error;
        }
        failedRun = controller.finished;
        controller.play();
        recoveredRun = controller.finished;
        await expect(failedRun).rejects.toBe(thrown);
        await Promise.resolve();
      });

      expect(thrown).toEqual(
        expect.objectContaining({
          name: "SvgAnimationError",
          code: SVG_ANIMATION_ERROR_CODES.setupFailed,
          message: "The SVG animation could not be created.",
        }),
      );
      expect(recoveredRun).not.toBe(failedRun);
      expect(controller.finished).toBe(recoveredRun);
      expect(controller.state).toBe("running");
      expect(current?.status).toBe("running");
      expect(current?.error).toBeNull();
      expect(errors).toEqual([thrown]);
      expect(allAnimations(svg)).toHaveLength(1);
    },
  );

  it("emits finish once when restart and finish settle back-to-back", async () => {
    const events: string[] = [];
    await render(
      createElement(Harness, {
        options: {
          source: SVG_SOURCE,
          trust: "trusted",
          onFinish: () => events.push("finish"),
        },
      }),
    );
    const controller = current!.controller!;

    await act(async () => {
      controller.restart();
      controller.finish();
      await controller.finished;
    });

    expect(current?.status).toBe("finished");
    expect(events).toEqual(["finish"]);
  });

  it("emits cancel once when restart and cancel settle back-to-back", async () => {
    const events: string[] = [];
    await render(
      createElement(Harness, {
        options: {
          source: SVG_SOURCE,
          trust: "trusted",
          onCancel: () => events.push("cancel"),
        },
      }),
    );
    const controller = current!.controller!;

    await act(async () => {
      controller.restart();
      controller.cancel();
      await controller.finished;
    });

    expect(current?.status).toBe("cancelled");
    expect(events).toEqual(["cancel"]);
  });

  it("preserves a finished run callback when restart immediately begins a new run", async () => {
    const events: string[] = [];
    await render(
      createElement(Harness, {
        options: {
          source: SVG_SOURCE,
          trust: "trusted",
          onFinish: () => events.push("finish"),
        },
      }),
    );
    const controller = current!.controller!;
    const finishedRun = controller.finished;

    await act(async () => {
      controller.finish();
      controller.restart();
      await finishedRun;
    });

    expect(current?.status).toBe("running");
    expect(events).toEqual(["finish"]);
  });

  it("preserves a cancelled run callback when restart immediately begins a new run", async () => {
    const events: string[] = [];
    await render(
      createElement(Harness, {
        options: {
          source: SVG_SOURCE,
          trust: "trusted",
          onCancel: () => events.push("cancel"),
        },
      }),
    );
    const controller = current!.controller!;
    const cancelledRun = controller.finished;

    await act(async () => {
      controller.cancel();
      controller.restart();
      await cancelledRun;
    });

    expect(current?.status).toBe("running");
    expect(events).toEqual(["cancel"]);
  });
});

describe("SVG accessibility lifecycle", () => {
  it("uses caller aria-labelledby as the semantic image name", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        svgProps: { "aria-labelledby": "outside-title" },
      }),
    );

    expect(ref.current?.svg?.getAttribute("aria-labelledby")).toBe(
      "outside-title",
    );
    expect(ref.current?.svg?.getAttribute("role")).toBe("img");
    expect(ref.current?.svg?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("preserves a valid source title as the accessible image name", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source:
          '<svg xmlns="http://www.w3.org/2000/svg"><title>Source title</title><text>Hi</text></svg>',
        trust: "trusted",
      }),
    );

    expect(ref.current?.svg?.querySelector("title")?.textContent).toBe(
      "Source title",
    );
    expect(ref.current?.svg?.getAttribute("role")).toBe("img");
    expect(ref.current?.svg?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("preserves a valid source role when the caller omits role", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" role="img"><text>Chart</text></svg>',
        trust: "trusted",
      }),
    );

    expect(ref.current?.svg?.getAttribute("role")).toBe("img");
    expect(ref.current?.svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("lets a caller semantic role override a different source role", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" role="graphics-document"><text>Chart</text></svg>',
        trust: "trusted",
        svgProps: { role: "graphics-object" },
      }),
    );

    expect(ref.current?.svg?.getAttribute("role")).toBe("graphics-object");
    expect(ref.current?.svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("lets a caller presentation role override a source image role", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" role="img"><text>Chart</text></svg>',
        trust: "trusted",
        svgProps: { role: "presentation" },
      }),
    );

    expect(ref.current?.svg?.getAttribute("role")).toBe("presentation");
    expect(ref.current?.svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not let an unnamed caller role bypass the decorative fallback", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
        svgProps: { role: "img" },
      }),
    );

    expect(ref.current?.svg?.getAttribute("aria-hidden")).toBe("true");
    expect(ref.current?.svg?.getAttribute("role")).toBe("img");
  });

  it("does not use a nested title as the root SVG name", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        ref,
        source:
          '<svg xmlns="http://www.w3.org/2000/svg"><defs><symbol><title>Symbol title</title></symbol></defs><text>Hi</text></svg>',
        trust: "trusted",
      }),
    );

    expect(ref.current?.svg?.getAttribute("aria-hidden")).toBe("true");
    expect(ref.current?.svg?.hasAttribute("role")).toBe(false);
  });

  it("marks an unnamed SVG decorative without adding click replay behavior", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
        autoplay: false,
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
      }),
    );

    const svg = ref.current!.svg!;
    const controller = ref.current!.controller!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.hasAttribute("role")).toBe(false);
    expect(svg.hasAttribute("tabindex")).toBe(false);
    const run = controller.finished;
    const animations = allAnimations(svg);
    const animation = animations[0]!;
    const currentTime = animation.currentTime;
    const play = vi.spyOn(controller, "play");
    const restart = vi.spyOn(controller, "restart");
    const nativePlay = vi.spyOn(RecordedAnimation.prototype, "play");

    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(controller.state).toBe("idle");
    expect(controller.finished).toBe(run);
    expect(allAnimations(svg)).toEqual(animations);
    expect(animation.currentTime).toBe(currentTime);
    expect(play).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    expect(nativePlay).not.toHaveBeenCalled();
  });
});
