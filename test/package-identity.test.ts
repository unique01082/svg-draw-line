import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const ignored = ["test/package-identity.test.ts"];

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
          ".conf",
          ".css",
          ".html",
          ".json",
          ".md",
          ".mdx",
          ".mjs",
          ".sh",
          ".svg",
          ".toml",
          ".ts",
          ".tsx",
          ".txt",
          ".yaml",
          ".yml",
        ].includes(extname(path)) ||
          ["Dockerfile", "LICENSE"].includes(entry.name)
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

  const retiredScope = `@${"baole-space"}/svg-motion`;
  const violations: string[] = [];
  for (const path of await textFiles()) {
    const text = await readFile(path, "utf8");
    if (text.includes(retiredScope)) violations.push(relative(root, path));
  }
  expect(violations).toEqual([]);
});

test("contains no reference to the retired repository name", async () => {
  const retiredRepositoryName = ["svg", "draw", "line"].join("-");
  const violations: string[] = [];

  for (const path of await textFiles()) {
    const text = await readFile(path, "utf8");
    if (text.includes(retiredRepositoryName)) {
      violations.push(relative(root, path));
    }
  }

  expect(violations).toEqual([]);
});
