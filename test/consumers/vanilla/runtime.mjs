import assert from "node:assert/strict";
import * as core from "@baole-space/svg-motion";

assert.equal(typeof core.prepareSvg, "function");
assert.equal(typeof core.animateSvg, "function");
assert.equal(typeof core.mountSvgMotion, "function");
