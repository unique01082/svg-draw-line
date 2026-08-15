import { prepareSvg } from "@baolq/svg-motion";

const prepared = await prepareSvg(
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" /></svg>',
);
document.querySelector("#app")!.append(prepared.svg);
window.svgMotionTreeShakeConsumer = {
  diagnostics: prepared.diagnostics,
  ready: true,
  svgCount: document.querySelectorAll("svg").length,
};
document.documentElement.dataset.treeShakeReady = "true";

declare global {
  interface Window {
    svgMotionTreeShakeConsumer: {
      diagnostics: typeof prepared.diagnostics;
      ready: boolean;
      svgCount: number;
    };
  }
}
