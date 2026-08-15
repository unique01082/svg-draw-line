import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const docsRoot = resolve(root, "apps/docs");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("documentation site delivery contract", () => {
  it("owns the production docs application and root commands", () => {
    expect(existsSync(resolve(root, "examples/playground"))).toBe(false);
    expect(existsSync(resolve(docsRoot, "package.json"))).toBe(true);

    const rootPackage = readJson<{ scripts: Record<string, string> }>(
      resolve(root, "package.json"),
    );
    const docsPackage = readJson<{
      dependencies: Record<string, string>;
      name: string;
    }>(resolve(docsRoot, "package.json"));
    expect(docsPackage.name).toBe("@baolq/svg-motion-docs");
    expect(docsPackage.dependencies["@baolq/svg-motion"]).toBe("0.1.0");
    expect(
      docsPackage.dependencies[`@${["baole", "space"].join("-")}/svg-motion`],
    ).toBeUndefined();
    expect(rootPackage.scripts).toMatchObject({
      "docs:dev": expect.any(String),
      "docs:build": expect.any(String),
      "docs:test": expect.any(String),
      "docs:api": expect.any(String),
      "docs:api:check": expect.any(String),
      "docs:docker:smoke": expect.any(String),
      "docs:candidate:verify": expect.stringMatching(/docs-candidate-smoke/),
    });
  });

  it("contains immutable 0.1 MDX content for every planned section", () => {
    const contentRoot = resolve(docsRoot, "content/0.1");
    const expected = [
      "getting-started.mdx",
      "core.mdx",
      "motion.mdx",
      "react.mdx",
      "guides.mdx",
      "reference.mdx",
    ];
    expect(
      readdirSync(contentRoot)
        .filter((file) => file.endsWith(".mdx"))
        .sort(),
    ).toEqual(expected.sort());
    for (const file of expected) {
      const content = readFileSync(resolve(contentRoot, file), "utf8");
      expect(content).toMatch(/^export const meta = \{/m);
      expect(content).toContain("## Related");
    }
  });

  it("keeps every MDX motion example linked to a real specimen", () => {
    const contentRoot = resolve(docsRoot, "content/0.1");
    const manifest = readJson<{ specimens: Array<{ slug: string }> }>(
      resolve(docsRoot, "src/specimens/manifest.json"),
    );
    const specimenSlugs = new Set(manifest.specimens.map(({ slug }) => slug));
    const referencedSlugs = readdirSync(contentRoot)
      .filter((file) => file.endsWith(".mdx"))
      .flatMap((file) =>
        Array.from(
          readFileSync(resolve(contentRoot, file), "utf8").matchAll(
            /<MotionExample\s+[^>]*specimen="([^"]+)"/g,
          ),
          (match) => match[1] ?? "",
        ),
      );

    expect(referencedSlugs.length).toBeGreaterThan(0);
    expect(referencedSlugs.filter((slug) => !specimenSlugs.has(slug))).toEqual(
      [],
    );
  });

  it("stores exactly 50 safe, checksummed, local Public Domain SVG specimens", () => {
    const manifest = readJson<{
      collectionId: string;
      collectionName: string;
      creator: string;
      sourceUrl: string;
      license: string;
      acquisitionDate: string;
      specimens: Array<{
        slug: string;
        originalName: string;
        file: string;
        sha256: string;
      }>;
    }>(resolve(docsRoot, "src/specimens/manifest.json"));

    expect(manifest.collectionId).toBe("pixellove-bordered-vectors");
    expect(manifest.collectionName).toBe("Pixellove Bordered Vectors");
    expect(manifest.creator).toBe("Pixellove");
    expect(manifest.license).toBe("Public Domain (CC0)");
    expect(manifest.sourceUrl).toBe(
      "https://www.svgrepo.com/collection/pixellove-bordered-vectors/",
    );
    expect(manifest.acquisitionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(manifest.specimens).toHaveLength(50);
    expect(new Set(manifest.specimens.map(({ slug }) => slug)).size).toBe(50);
    expect(manifest.specimens.every(({ originalName }) => originalName)).toBe(
      true,
    );

    for (const specimen of manifest.specimens) {
      const svg = readFileSync(
        resolve(docsRoot, "public/specimens", specimen.file),
        "utf8",
      );
      expect(svg).not.toContain("\r");
      expect(svg).not.toMatch(/[ \t]+$/m);
      expect(svg.match(/<svg\b/g)).toHaveLength(1);
      expect(svg).toMatch(/viewBox="[^"]+"/);
      expect(svg).not.toMatch(
        /<script|<foreignObject|\son\w+=|javascript:|<image|<use|(?:href|src)=["'](?:https?:|\/\/)/i,
      );
      expect(createHash("sha256").update(svg).digest("hex")).toBe(
        specimen.sha256,
      );
    }

    expect(
      readFileSync(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8"),
    ).toContain("Pixellove Bordered Vectors");
  });

  it("ships static delivery assets without changing the npm allowlist", () => {
    const packageJson = readJson<{ files: string[] }>(
      resolve(root, "package.json"),
    );
    expect(packageJson.files).toEqual(["dist", "README.md", "LICENSE"]);
    expect(existsSync(resolve(root, "Dockerfile"))).toBe(true);
    expect(existsSync(resolve(root, "deploy/nginx.conf"))).toBe(true);
    expect(
      existsSync(resolve(root, "docs/deployment/svg-motion.baole.space.md")),
    ).toBe(true);
  });

  it("isolates production browser checks from the local docs server", () => {
    const config = readFileSync(
      resolve(docsRoot, "playwright.config.ts"),
      "utf8",
    );
    const packageJson = readJson<{ scripts: Record<string, string> }>(
      resolve(root, "package.json"),
    );
    const runner = readFileSync(resolve(root, "scripts/docs-test.mjs"), "utf8");
    expect(config).toContain("DOCS_TEST_PORT");
    expect(config).toMatch(/baseURL:\s*origin/);
    expect(config).toMatch(/--port \$\{port\}/);
    expect(packageJson.scripts["docs:test"]).toBe("node scripts/docs-test.mjs");
    expect(runner).toContain('server.listen(0, "127.0.0.1"');
    expect(runner).toContain("DOCS_TEST_PORT");
  });

  it("keeps visual baselines for local macOS and Linux CI", () => {
    const snapshots = resolve(docsRoot, "test/docs.spec.ts-snapshots");
    for (const platform of ["darwin", "linux"]) {
      expect(
        existsSync(resolve(snapshots, `home-desktop-chromium-${platform}.png`)),
      ).toBe(true);
      expect(
        existsSync(
          resolve(snapshots, `playground-mobile-chromium-${platform}.png`),
        ),
      ).toBe(true);
    }

    const browserSpec = readFileSync(
      resolve(docsRoot, "test/docs.spec.ts"),
      "utf8",
    );
    expect(browserSpec).not.toContain("fullPage: true");
    expect(browserSpec.match(/maxDiffPixelRatio:\s*0\.04/g)).toHaveLength(2);
  });

  it("scaffolds a new minor snapshot without rewriting an existing line", () => {
    const fixture = mkdtempSync(resolve(tmpdir(), "svg-motion-docs-version-"));
    try {
      const source = resolve(fixture, "content/0.1");
      mkdirSync(source, { recursive: true });
      writeFileSync(
        resolve(source, "getting-started.mdx"),
        "# Immutable 0.1\n",
      );
      writeFileSync(
        resolve(source, "api-reflection.json"),
        JSON.stringify({ packageVersion: "0.1.0", exports: [] }),
      );
      const script = resolve(docsRoot, "scripts/scaffold-version.mjs");
      execFileSync(process.execPath, [script, "0.2", "0.2.0"], {
        cwd: fixture,
      });
      expect(readFileSync(resolve(source, "getting-started.mdx"), "utf8")).toBe(
        "# Immutable 0.1\n",
      );
      expect(
        readJson<{ packageVersion: string }>(
          resolve(fixture, "content/0.2/api-reflection.json"),
        ).packageVersion,
      ).toBe("0.2.0");
      expect(() =>
        execFileSync(process.execPath, [script, "0.2", "0.2.1"], {
          cwd: fixture,
          stdio: "pipe",
        }),
      ).toThrow();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
