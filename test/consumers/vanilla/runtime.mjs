import assert from "node:assert/strict";
import * as core from "@baole-space/svg-motion";

assert.equal(typeof core.prepareSvg, "function");
assert.equal(typeof core.animateSvg, "function");
assert.equal(typeof core.mountSvgMotion, "function");
assert.equal(typeof core.SvgAnimationError, "function");
assert.equal(
  core.SVG_ANIMATION_ERROR_CODES.animationFailed,
  "ANIMATION_FAILED",
);
