import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { knownRoutes } from "../routes/manifest";

const contentRoot = resolve(import.meta.dirname, "../../content/0.1");
const contentFiles = readdirSync(contentRoot).filter((file) =>
  file.endsWith(".mdx"),
);

describe("0.1 documentation content", () => {
  it("has complete metadata and no duplicate document titles", () => {
    const titles = contentFiles.map((file) => {
      const source = readFileSync(resolve(contentRoot, file), "utf8");
      expect(source).toMatch(
        /export const meta = \{[\s\S]*?title: "[^"]+"[\s\S]*?description: "[^"]+"[\s\S]*?\};/,
      );
      expect(source).toMatch(/^# [^#]/m);
      expect(source).toContain("## Related");
      return source.match(/title: "([^"]+)"/)?.[1];
    });
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("contains only resolvable internal content links", () => {
    const known = new Set(knownRoutes);
    for (const file of contentFiles) {
      const source = readFileSync(resolve(contentRoot, file), "utf8");
      for (const match of source.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g)) {
        const path = match[1]!.split("#")[0]!;
        expect(known.has(path), `${file} links to unknown route ${path}`).toBe(
          true,
        );
      }
    }
  });
});
