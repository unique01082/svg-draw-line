import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

delete globalThis.window;
delete globalThis.document;
delete globalThis.DOMParser;
delete globalThis.XMLSerializer;

const reactEntry = await import("@baole-space/svg-motion/react");
assert.equal(typeof reactEntry.SvgMotion, "object");
assert.equal(typeof reactEntry.useSvgMotion, "function");

const reactBundle = await readFile(
  new URL("../dist/react.js", import.meta.url),
  "utf8",
);
const coreBundle = await readFile(
  new URL("../dist/index.js", import.meta.url),
  "utf8",
);
assert.match(reactBundle, /from\s*["']react["']/);
assert.doesNotMatch(coreBundle, /from\s*["']react["']/);
