import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const ignored = [
  "docs/superpowers/specs",
  "docs/superpowers/plans",
  "test/package-identity.test.ts",
  // Removed after the registry-backed lockfile is generated post-publication.
  "apps/docs/pnpm-lock.yaml",
];

async function textFiles(directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = resolve(directory, entry.name);
        const name = relative(root, path);
        if (
          [
            ".git",
            ".superpowers",
            ".worktrees",
            "node_modules",
            "dist",
            "dist-ssr",
            "playwright-report",
            "test-results",
          ].includes(entry.name)
        )
          return [];
        if (
          ignored.some(
            (prefix) => name === prefix || name.startsWith(`${prefix}/`),
          )
        )
          return [];
        if (entry.isDirectory()) return textFiles(path);
        return [
          ".json",
          ".md",
          ".mjs",
          ".ts",
          ".tsx",
          ".yaml",
          ".yml",
        ].includes(extname(path))
          ? [path]
          : [];
      }),
    )
  ).flat();
}

test("uses the canonical package identity in active files", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ) as { name: string; repository: { url: string } };
  expect(packageJson.name).toBe("@baolq/svg-motion");
  expect(packageJson.repository.url).toBe(
    "https://github.com/unique01082/svg-motion.git",
  );

  const oldScope = `@${"baole-space"}/svg-motion`;
  const retainedRuntimeKey = `${oldScope}.instance-sequence`;
  const migrationDeprecation = `npm deprecate ${oldScope}@0.1.0 "Moved to @baolq/svg-motion"`;
  const violations: string[] = [];
  for (const path of await textFiles()) {
    const name = relative(root, path);
    const text = (await readFile(path, "utf8"))
      .replace(name === "src/index.ts" ? retainedRuntimeKey : "", "")
      .replace(
        name === ".github/workflows/publish.yml" ? migrationDeprecation : "",
        "",
      );
    if (text.includes(oldScope)) violations.push(relative(root, path));
  }
  expect(violations).toEqual([]);
});
