import {
  animateSvg,
  mountSvgMotion,
  prepareSvg,
  type SvgMotionController,
} from "@baole-space/svg-motion";

const source =
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" stroke="black" /></svg>';
const mounted = await mountSvgMotion(document.querySelector("#app")!, source, {
  autoplay: false,
});
const controller: SvgMotionController = mounted.controller;
controller.seek(0.5);
void animateSvg;
void prepareSvg;
