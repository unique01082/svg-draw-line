import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
    const [ci, release, tagGuard, playwrightConfig] = await Promise.all([
      readFile(new URL(".github/workflows/ci.yml", ROOT), "utf8"),
      readFile(new URL(".github/workflows/publish.yml", ROOT), "utf8"),
      readFile(new URL("scripts/assert-release-tag.mjs", ROOT), "utf8"),
      readFile(new URL("playwright.config.ts", ROOT), "utf8"),
    ]);

    expect(ci).toMatch(/pull_request:/);
    expect(ci).toMatch(/push:/);
    expect(ci).toMatch(/pnpm verify/);
    expect(release).toMatch(/tags:\s*\n\s*- ["']v\*\.\*\.\*["']/);
    expect(release).not.toMatch(/npm-baolq-v\*\.\*\.\*/);
    expect(release).toMatch(/id-token:\s*write/);
    expect(release).toMatch(/pnpm verify/);
    expect(release).toMatch(/assert-release-tag\.mjs/);
    expect(release).toMatch(/npm@11\.11\.1/);
    expect(tagGuard).toMatch(/package\.json/);
    expect(tagGuard).toMatch(/GITHUB_REF_NAME/);
    expect(tagGuard).toContain("@baolq/svg-motion");
    expect(release).toMatch(/npm publish --access public --provenance/);
    expect(release).not.toContain("secrets.NPM_TOKEN");
    expect(release).toContain("for attempt in $(seq 1 18)");
    expect(release).toContain("sleep 10");
    const publishIndex = release.indexOf(
      "npm publish --access public --provenance",
    );
    const registrySmokeIndex = release.indexOf("Verify published entries");
    expect(publishIndex).toBeGreaterThan(-1);
    expect(registrySmokeIndex).toBeGreaterThan(publishIndex);

    const screenshotTolerance = playwrightConfig.match(
      /maxDiffPixelRatio:\s*([\d.]+)/,
    );
    expect(screenshotTolerance).not.toBeNull();
    expect(Number(screenshotTolerance?.[1])).toBeLessThanOrEqual(0.001);
    expect(release).not.toMatch(/^\s*cache:\s*pnpm\s*$/m);

    for (const workflow of [ci, release]) {
      const actions = [...workflow.matchAll(/^\s*- uses:\s+(\S+)/gm)].map(
        ([, action]) => action,
      );
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action).toMatch(/^[^@]+@[0-9a-f]{40}$/);
      }
    }
  });

  it("executes the release tag guard against the package version", () => {
    const guard = fileURLToPath(
      new URL("scripts/assert-release-tag.mjs", ROOT),
    );
    const baseEnvironment = { ...process.env };
    delete baseEnvironment.GITHUB_REF_NAME;
    const run = (tag: string | undefined) =>
      execFileSync(process.execPath, [guard], {
        env: {
          ...baseEnvironment,
          ...(tag === undefined ? {} : { GITHUB_REF_NAME: tag }),
        },
        stdio: "pipe",
      });

    expect(() => run("v0.1.0")).not.toThrow();
    expect(() => run("npm-baolq-v0.1.0")).not.toThrow();
    expect(() => run("npm-baolq-v0.1.1")).toThrow();
    expect(() => run("v0.1.1")).toThrow();
    expect(() => run(undefined)).toThrow();
  });

  it("documents every public usage and release boundary from the plan", async () => {
    const [readme, license] = await Promise.all([
      readFile(new URL("README.md", ROOT), "utf8"),
      readFile(new URL("LICENSE", ROOT), "utf8"),
    ]);

    for (const heading of [
      "## Vanilla",
      "## React",
      "## Sources",
      "## Motion API",
      "## Security, CORS, and CSP",
      "## Accessibility and reduced motion",
      "## Runtime support",
      "## Releasing",
    ]) {
      expect(readme).toContain(heading);
    }
    for (const contract of [
      "5 MiB",
      'trust: "sanitize"',
      'trust: "trusted"',
      "SvgPreparationError",
      "SvgAnimationError",
      "prefers-reduced-motion",
      "SSR-safe",
      "no npm token",
      "Trusted Publisher",
      "publish.yml",
      "@baolq/svg-motion@0.1.0",
    ]) {
      expect(readme).toContain(contract);
    }
    expect(readme).not.toMatch(/Vite \+ React|Edit <code>src\/App/);
    expect(license).toMatch(/^MIT License/m);
    expect(license).toContain("Copyright (c) 2026 Bao Le");
  });

  it("presents a professional package landing page", async () => {
    const readme = await readFile(new URL("README.md", ROOT), "utf8");

    for (const badge of [
      "actions/workflows/ci.yml/badge.svg",
      "npmjs.com/package/@baolq/svg-motion",
      "License-MIT",
    ]) {
      expect(readme).toContain(badge);
    }
    for (const destination of [
      "./CONTRIBUTING.md",
      "./SECURITY.md",
      "./CHANGELOG.md",
    ]) {
      expect(readme).toContain(destination);
    }
    for (const capability of [
      "Any SVG source",
      "Framework-agnostic",
      "React adapter",
      "Secure by default",
      "Web Animations API",
    ]) {
      expect(readme).toContain(capability);
    }
    expect(readme).toContain('from "@baolq/svg-motion"');
    expect(readme).toContain('from "@baolq/svg-motion/react"');
    expect(readme).toMatch(/Chromium.*Firefox.*WebKit/s);
  });

  it("documents the complete test and CI surface without volatile counts", async () => {
    const readme = await readFile(new URL("README.md", ROOT), "utf8");

    expect(readme).toContain("## Verification");
    for (const command of [
      "pnpm test",
      "pnpm test:browser",
      "pnpm test:consumer",
      "pnpm verify",
      "pnpm docs:test",
      "pnpm docs:api:check",
      "pnpm docs:docker:smoke",
    ]) {
      expect(readme).toContain(`\`${command}\``);
    }
    for (const scope of [
      "Unit and contract",
      "Chromium, Firefox, and WebKit",
      "React adapter",
      "security regressions",
      "Packed-package consumers",
      "API snapshot",
      "Docker",
    ]) {
      expect(readme).toContain(scope);
    }
    expect(readme).toMatch(/CI.*library.*docs.*docker/is);
    expect(readme).not.toMatch(/\b\d+\/\d+\s+(?:tests?|passing|passed)\b/i);
  });

  it("ships contributor, security, and release-history guidance", async () => {
    const [contributing, security, changelog] = await Promise.all([
      readFile(new URL("CONTRIBUTING.md", ROOT), "utf8"),
      readFile(new URL("SECURITY.md", ROOT), "utf8"),
      readFile(new URL("CHANGELOG.md", ROOT), "utf8"),
    ]);

    expect(contributing).toContain("Node.js 22");
    expect(contributing).toContain("pnpm 10.33.0");
    expect(contributing).toContain("pnpm verify");
    expect(contributing).toContain("Pull request");

    expect(security).toContain("0.1.x");
    expect(security).toMatch(/private/i);
    expect(security).toContain("Security advisory");
    expect(security).toContain("Do not open a public issue");

    expect(changelog).toContain("Keep a Changelog");
    expect(changelog).toContain("## [0.1.0] - 2026-08-15");
    for (const releaseFeature of [
      "prepareSvg",
      "animateSvg",
      "mountSvgMotion",
      "React",
      "sanitization",
      "Chromium, Firefox, and WebKit",
    ]) {
      expect(changelog).toContain(releaseFeature);
    }
  });

  it("keeps a dedicated packed-package tree-shaking consumer", async () => {
    await expect(
      exists("test/consumers/tree-shake/package.json"),
    ).resolves.toBe(true);
    await expect(exists("test/consumers/tree-shake/main.ts")).resolves.toBe(
      true,
    );
  });

  it("does not discover tests inside project-local worktrees", async () => {
    const viteConfig = await readFile(new URL("vite.config.ts", ROOT), "utf8");

    expect(viteConfig).toMatch(/exclude:\s*\[[^\]]*\.worktrees\/\*\*[^\]]*\]/s);
  });

  it("resolves temporary consumer lockfiles before enforcing offline install", async () => {
    const consumerSmoke = await readFile(
      new URL("scripts/consumer-smoke.mjs", ROOT),
      "utf8",
    );
    const lockfileResolution = consumerSmoke.indexOf('"--lockfile-only"');
    const offlineInstall = consumerSmoke.indexOf('"--offline"');

    expect(lockfileResolution).toBeGreaterThan(-1);
    expect(offlineInstall).toBeGreaterThan(lockfileResolution);
  });
});
