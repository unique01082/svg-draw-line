import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";

it("publishes an ESM-only core entry and reserves the future React entry", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    exports: Record<string, unknown>;
    packageManager: string;
    sideEffects: boolean;
  };

  expect(packageJson.packageManager).toBe("pnpm@10.33.0");
  expect(packageJson.sideEffects).toBe(false);
  expect(packageJson.exports["."]).toEqual({
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  });
  expect(packageJson.exports["./react"]).toBeNull();
});
