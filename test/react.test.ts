// @vitest-environment jsdom

import { act, createElement, createRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SvgMotion,
  type SvgMotionHandle,
  type UseSvgMotionOptions,
  type UseSvgMotionResult,
  useSvgMotion,
} from "../src/react";
import {
  allAnimations,
  installWaapi,
  uninstallWaapi,
} from "./waapi-test-support";

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

beforeEach(() => {
  installWaapi();
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
    for (const animation of allAnimations(ref.current!.svg!)) {
      animation.completeNaturally();
    }
    await act(async () => firstController.finished);
    expect(events).toEqual(["finish"]);

    firstController.restart();
    await act(async () => {
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
    const { root } = await render(
      createElement(SvgMotion, {
        ref,
        source: SVG_SOURCE,
        trust: "trusted",
      }),
    );
    const svg = ref.current!.svg!;
    const controller = ref.current!.controller!;

    await act(async () => root.unmount());
    roots = roots.filter((candidate) => candidate !== root);

    expect(svg.isConnected).toBe(false);
    expect(controller.state).toBe("destroyed");
    expect(allAnimations(svg)).toEqual([]);
  });

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
    expect(current?.diagnostics).toEqual([
      { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
    ]);
  });

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

    controller.finish();
    await act(async () => controller.finished);
    expect(current?.status).toBe("finished");
    expect(events).toEqual(["finish"]);

    controller.restart();
    await act(async () => {
      controller.cancel();
      await controller.finished;
    });
    expect(current?.status).toBe("cancelled");
    expect(events).toEqual(["finish", "cancel"]);
  });

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

  it("marks an unnamed SVG decorative without adding interaction behavior", async () => {
    const ref = createRef<SvgMotionHandle>();
    await render(
      createElement(SvgMotion, {
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

    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(controller.state).toBe("running");
  });
});
