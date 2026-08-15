import { readFile } from "node:fs/promises";

import { expect, it } from "vitest";

it("publishes ESM-only core and optional external React entries", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies: Record<string, string>;
    engines: { node: string };
    exports: Record<string, unknown>;
    files: string[];
    license: string;
    main: string;
    module: string;
    name: string;
    packageManager: string;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional?: boolean }>;
    publishConfig: { access: string };
    scripts: Record<string, string>;
    sideEffects: boolean;
    type: string;
    types: string;
    version: string;
  };
  const [viteConfig, tsconfig] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
  ]);

  expect(packageJson.name).toBe("@baole-space/svg-motion");
  expect(packageJson.version).toBe("0.1.0");
  expect(packageJson.type).toBe("module");
  expect(packageJson.license).toBe("MIT");
  expect(packageJson.engines.node).toBe(">=22");
  expect(packageJson.packageManager).toBe("pnpm@10.33.0");
  expect(packageJson.sideEffects).toBe(false);
  expect(packageJson.files).toEqual(["dist", "README.md", "LICENSE"]);
  expect(packageJson.publishConfig).toEqual({ access: "public" });
  expect(packageJson.main).toBe("./dist/index.js");
  expect(packageJson.module).toBe("./dist/index.js");
  expect(packageJson.types).toBe("./dist/index.d.ts");
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
  expect(packageJson.dependencies.dompurify).toBeDefined();
  expect(viteConfig).toMatch(/external:\s*\[[^\]]*"react"[^\]]*\]/s);
  expect(viteConfig).toMatch(/formats:\s*\["es"\]/);
  expect(viteConfig).toMatch(/sourcemap:\s*true/);
  expect(viteConfig).toMatch(/index:\s*resolve\([^)]*src\/index\.ts/);
  expect(viteConfig).toMatch(/react:\s*resolve\([^)]*src\/react\.ts/);
  expect(tsconfig).toMatch(/"strict":\s*true/);
  expect(tsconfig).toMatch(/"exactOptionalPropertyTypes":\s*true/);
  expect(tsconfig).toMatch(/"noUncheckedIndexedAccess":\s*true/);
  expect(packageJson.scripts["verify:package"]).toMatch(
    /package-runtime\.mjs.*tsconfig\.package\.json/,
  );
});
