import {
  type MountSvgMotionOptions,
  type SvgMotionInstance,
  mountSvgMotion,
} from "../../src/index";

import advanced from "../fixtures/advanced.svg?raw";
import fallback from "../fixtures/fallback.svg?raw";
import noGeometry from "../fixtures/no-geometry.svg?raw";
import primitives from "../fixtures/primitives.svg?raw";

const fixtures = { advanced, fallback, noGeometry, primitives } as const;
type FixtureName = keyof typeof fixtures;

const stage = document.querySelector("#stage")!;
let instance: SvgMotionInstance | undefined;

function animationCount(svg: SVGSVGElement): number {
  return [svg, ...svg.querySelectorAll("*")].reduce(
    (count, element) => count + element.getAnimations().length,
    0,
  );
}

async function mount(
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

function summary() {
  if (!instance) throw new Error("Mount a fixture first.");
  const geometry = [
    ...instance.svg.querySelectorAll<SVGGeometryElement>(
      "path,line,polyline,polygon,circle,ellipse,rect",
    ),
  ];
  return {
    animationCount: animationCount(instance.svg),
    diagnostics: instance.diagnostics,
    geometry: geometry.map((element) => ({
      animations: element.getAnimations().length,
      length: element.getTotalLength(),
      name: element.localName,
    })),
    hasNativeAnimate: typeof Element.prototype.animate === "function",
    state: instance.controller.state,
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
  references: referenceSummary,
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
};

declare global {
  interface Window {
    svgMotionHarness: {
      cancel(): ReturnType<typeof summary>;
      destroyInstance(): { connected: boolean; state: string | undefined };
      finish(): ReturnType<typeof summary>;
      mount(
        fixture: FixtureName,
        options?: MountSvgMotionOptions,
      ): Promise<ReturnType<typeof summary>>;
      pause(): ReturnType<typeof summary>;
      play(): ReturnType<typeof summary>;
      references(): ReturnType<typeof referenceSummary>;
      restart(): ReturnType<typeof summary>;
      reverse(): ReturnType<typeof summary>;
      seek(progress: number): ReturnType<typeof summary>;
      summary(): ReturnType<typeof summary>;
    };
  }
}
