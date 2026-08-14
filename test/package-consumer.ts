import {
  SvgMotion,
  type SvgMotionHandle,
  type UseSvgMotionOptions,
  useSvgMotion,
} from "@baole-space/svg-motion/react";
import {
  SVG_ANIMATION_ERROR_CODES,
  SvgAnimationError,
  type SvgAnimationErrorCode,
  type SvgMotionControllerState,
} from "@baole-space/svg-motion";

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
