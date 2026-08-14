import assert from "node:assert/strict";
import * as reactAdapter from "@baole-space/svg-motion/react";

assert.equal(typeof reactAdapter.SvgMotion, "object");
assert.equal(typeof reactAdapter.useSvgMotion, "function");
