import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);

async function exists(path: string): Promise<boolean> {
  try {
    await access(new URL(path, ROOT));
    return true;
  } catch {
    return false;
  }
}

describe("release contract", () => {
  it("pins supported tooling and exposes the complete verification pipeline", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("package.json", ROOT), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: { node: string };
      files: string[];
      packageManager: string;
      scripts: Record<string, string>;
    };
    const allDependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(packageJson.packageManager).toBe("pnpm@10.33.0");
    expect(packageJson.engines.node).toBe(">=22");
    expect(packageJson.files).toEqual(["dist", "README.md", "LICENSE"]);
    expect(packageJson.devDependencies["@playwright/test"]).toBeDefined();
    expect(packageJson.scripts["test:browser"]).toMatch(/playwright test/);
    expect(packageJson.scripts["test:consumer"]).toMatch(/consumer-smoke/);
    expect(packageJson.scripts.verify).toMatch(
      /format.*lint.*typecheck.*test.*test:browser.*build.*test:consumer/,
    );
    expect(Object.keys(allDependencies)).not.toEqual(
      expect.arrayContaining(["animejs", "@ant-design/icons"]),
    );
  });

  it("removes the prototype and retains compact release fixtures", async () => {
    const removedPaths = [
      "index.html",
      "yarn.lock",
      "src/App.css",
      "src/App.jsx",
      "src/Icon.jsx",
      "src/index.css",
      "src/main.jsx",
      "src/assets/react.svg",
      "public",
    ];
    await Promise.all(
      removedPaths.map(async (path) => expect(await exists(path)).toBe(false)),
    );

    const fixtures = [
      "test/fixtures/primitives.svg",
      "test/fixtures/advanced.svg",
      "test/fixtures/fallback.svg",
      "test/fixtures/embedded-bitmap.svg",
      "test/fixtures/malicious.svg",
      "test/fixtures/malformed.svg",
      "test/fixtures/no-geometry.svg",
    ];
    await Promise.all(
      fixtures.map(async (path) => expect(await exists(path)).toBe(true)),
    );
  });

  it("ships CI and a guarded trusted-publishing workflow", async () => {
    const [ci, release, tagGuard] = await Promise.all([
      readFile(new URL(".github/workflows/ci.yml", ROOT), "utf8"),
      readFile(new URL(".github/workflows/publish.yml", ROOT), "utf8"),
      readFile(new URL("scripts/assert-release-tag.mjs", ROOT), "utf8"),
    ]);

    expect(ci).toMatch(/pull_request:/);
    expect(ci).toMatch(/push:/);
    expect(ci).toMatch(/pnpm verify/);
    expect(release).toMatch(/tags:\s*\n\s*- ["']v\*\.\*\.\*["']/);
    expect(release).toMatch(/id-token:\s*write/);
    expect(release).toMatch(/pnpm verify/);
    expect(release).toMatch(/assert-release-tag\.mjs/);
    expect(release).toMatch(/npm@11\.11\.1/);
    expect(tagGuard).toMatch(/package\.json/);
    expect(tagGuard).toMatch(/GITHUB_REF_NAME/);
    expect(release).toMatch(/npm publish --access public --provenance/);
  });
});
