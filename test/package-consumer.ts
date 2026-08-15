import {
  SvgMotion,
  type SvgMotionHandle,
  type UseSvgMotionOptions,
  useSvgMotion,
} from "@baolq/svg-motion/react";
import {
  SVG_ANIMATION_ERROR_CODES,
  SvgAnimationError,
  animateSvg,
  mountSvgMotion,
  prepareSvg,
  type MountSvgMotionOptions,
  type PrepareSvgOptions,
  type SvgAnimationErrorCode,
  type SvgMotionController,
  type SvgMotionControllerState,
  type SvgMotionOptions,
  type SvgMotionPreset,
  type SvgSource,
  type SvgTrustMode,
} from "@baolq/svg-motion";

const options = {
  source: '<svg xmlns="http://www.w3.org/2000/svg" />',
} satisfies UseSvgMotionOptions;

void SvgMotion;
void useSvgMotion;
void options;
void (null as SvgMotionHandle | null);
const animationCode: SvgAnimationErrorCode =
  SVG_ANIMATION_ERROR_CODES.animationFailed;
const failedState: SvgMotionControllerState = "failed";
void new SvgAnimationError(animationCode, "safe consumer message");
void failedState;

const sourceForms: SvgSource[] = [
  '<svg xmlns="http://www.w3.org/2000/svg"/>',
  new URL("https://example.test/icon.svg"),
  new Blob([]),
  new File([], "icon.svg"),
  document.createElementNS("http://www.w3.org/2000/svg", "svg"),
];
const trustModes: SvgTrustMode[] = ["sanitize", "trusted"];
const presets: SvgMotionPreset[] = [
  "draw",
  "fade",
  "scale",
  "stagger",
  "pulse",
];
const prepareOptions: PrepareSvgOptions = {
  maxBytes: 5 * 1024 * 1024,
  signal: new AbortController().signal,
  trust: trustModes[0]!,
};
const motionOptions: SvgMotionOptions = {
  autoplay: true,
  delay: 0,
  direction: "alternate",
  duration: 1200,
  easing: "ease-in-out",
  iterations: 1,
  order: "reverse",
  preset: presets[0]!,
  selector: "path",
  stagger: "auto",
};
const mountOptions: MountSvgMotionOptions = {
  ...prepareOptions,
  ...motionOptions,
};

void prepareSvg(sourceForms[0]!, prepareOptions);
void mountSvgMotion(document.body, sourceForms[0]!, mountOptions);
const controller: SvgMotionController = animateSvg(
  sourceForms[4] as SVGSVGElement,
  motionOptions,
);
controller.play();
controller.pause();
controller.reverse();
controller.restart();
controller.finish();
controller.cancel();
controller.seek(0.5);
controller.destroy();
void controller.finished;
void controller.state;
