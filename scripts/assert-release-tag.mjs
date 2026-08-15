import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const expected = `v${packageJson.version}`;
const actual = process.env.GITHUB_REF_NAME;
const migration =
  actual === "npm-baolq-v0.1.0" &&
  packageJson.name === "@baolq/svg-motion" &&
  packageJson.version === "0.1.0";

assert.ok(
  actual === expected || migration,
  `Release tag ${actual ?? "(missing)"} must equal ${expected} or the guarded package-migration tag.`,
);
