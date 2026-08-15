import {
  animateSvg,
  mountSvgMotion,
  prepareSvg,
  type SvgMotionController,
} from "@baolq/svg-motion";

const source =
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" stroke="black" /></svg>';
const mounted = await mountSvgMotion(document.querySelector("#app")!, source, {
  autoplay: false,
});
const controller: SvgMotionController = mounted.controller;

function snapshot() {
  const elements = [mounted.svg, ...mounted.svg.querySelectorAll("*")];
  const animations = elements.flatMap((element) => element.getAnimations());
  const animation = animations[0];
  const geometry = mounted.svg.querySelector("path") as SVGGeometryElement;
  return {
    animationCount: animations.length,
    ariaLabel: mounted.svg.getAttribute("aria-label"),
    controllerState: controller.state,
    currentTime:
      typeof animation?.currentTime === "number" ? animation.currentTime : 0,
    geometryLength: geometry.getTotalLength(),
    hasNativeAnimate: typeof Element.prototype.animate === "function",
    kind: "vanilla",
    playState: animation?.playState ?? "idle",
    reactReady: false,
    svgCount: document.querySelectorAll("svg").length,
  } as const;
}

window.svgMotionConsumer = {
  ready: true,
  snapshot,
  async exercise() {
    controller.play();
    await Promise.all(
      [mounted.svg, ...mounted.svg.querySelectorAll("*")]
        .flatMap((element) => element.getAnimations())
        .map((animation) => animation.ready),
    );
    controller.pause();
    controller.seek(0.5);
    return snapshot();
  },
};
document.documentElement.dataset.consumerReady = "true";
void animateSvg;
void prepareSvg;

declare global {
  interface Window {
    svgMotionConsumer: {
      ready: boolean;
      snapshot: typeof snapshot;
      exercise: () => Promise<ReturnType<typeof snapshot>>;
    };
  }
}
