import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const expected = `v${packageJson.version}`;
const actual = process.env.GITHUB_REF_NAME;

assert.equal(
  actual,
  expected,
  `Release tag ${actual ?? "(missing)"} must equal package version ${expected}.`,
);
