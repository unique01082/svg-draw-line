import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";

it("publishes ESM-only core and optional external React entries", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    exports: Record<string, unknown>;
    packageManager: string;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional?: boolean }>;
    sideEffects: boolean;
  };
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  expect(packageJson.packageManager).toBe("pnpm@10.33.0");
  expect(packageJson.sideEffects).toBe(false);
  expect(packageJson.exports["."]).toEqual({
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  });
  expect(packageJson.exports["./react"]).toEqual({
    types: "./dist/react.d.ts",
    import: "./dist/react.js",
  });
  expect(packageJson.peerDependencies.react).toBe(">=18");
  expect(packageJson.peerDependenciesMeta.react).toEqual({ optional: true });
  expect(viteConfig).toMatch(/external:\s*\[[^\]]*"react"[^\]]*\]/s);
});
