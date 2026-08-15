import { SvgMotion, type SvgMotionHandle } from "@baolq/svg-motion/react";
import { createRef } from "react";
import { createRoot } from "react-dom/client";

const handle = createRef<SvgMotionHandle>();

function exposeReady(ready: SvgMotionHandle) {
  if (!ready.svg || !ready.controller)
    throw new Error("React consumer was not ready.");
  const svg = ready.svg;
  const controller = ready.controller;

  function snapshot() {
    const elements = [svg, ...svg.querySelectorAll("*")];
    const animations = elements.flatMap((element) => element.getAnimations());
    const animation = animations[0];
    const geometry = svg.querySelector("circle") as SVGGeometryElement;
    return {
      animationCount: animations.length,
      ariaLabel: svg.getAttribute("aria-label"),
      controllerState: controller.state,
      currentTime:
        typeof animation?.currentTime === "number" ? animation.currentTime : 0,
      geometryLength: geometry.getTotalLength(),
      hasNativeAnimate: typeof Element.prototype.animate === "function",
      kind: "react",
      playState: animation?.playState ?? "idle",
      reactReady: true,
      svgCount: document.querySelectorAll("svg").length,
    } as const;
  }

  window.svgMotionConsumer = {
    ready: true,
    snapshot,
    async exercise() {
      controller.play();
      await Promise.all(
        [svg, ...svg.querySelectorAll("*")]
          .flatMap((element) => element.getAnimations())
          .map((animation) => animation.ready),
      );
      controller.pause();
      controller.seek(0.5);
      return snapshot();
    },
  };
  document.documentElement.dataset.consumerReady = "true";
}

createRoot(document.querySelector("#root")!).render(
  <SvgMotion
    ref={handle}
    autoplay={false}
    source='<svg xmlns="http://www.w3.org/2000/svg"><circle r="8" /></svg>'
    svgProps={{ "aria-label": "Consumer fixture" }}
    onReady={exposeReady}
  />,
);

declare global {
  interface Window {
    svgMotionConsumer: {
      ready: boolean;
      snapshot: () => {
        animationCount: number;
        ariaLabel: string | null;
        controllerState: string;
        currentTime: number;
        geometryLength: number;
        hasNativeAnimate: boolean;
        kind: "react";
        playState: AnimationPlayState;
        reactReady: true;
        svgCount: number;
      };
      exercise: () => Promise<
        ReturnType<Window["svgMotionConsumer"]["snapshot"]>
      >;
    };
  }
}
