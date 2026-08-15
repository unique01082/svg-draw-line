import { describe, expect, it } from "vitest";
import {
  LATEST_DOCS_VERSION,
  docsVersions,
  resolveDocsVersion,
  switchVersionPath,
} from "./versions";
import { docPages, knownRoutes, resolveDocPage } from "./routes/manifest";

describe("versioned documentation manifests", () => {
  it("maps latest to the immutable 0.1 line", () => {
    expect(LATEST_DOCS_VERSION).toBe("0.1");
    expect(docsVersions).toEqual([
      {
        id: "0.1",
        packageVersion: "0.1.0",
        label: "0.1",
        isLatest: true,
        supportedRoutes: [
          "getting-started",
          "core",
          "motion",
          "react",
          "guides",
          "reference",
        ],
      },
    ]);
    expect(resolveDocsVersion("latest")?.id).toBe("0.1");
    expect(resolveDocsVersion("0.1")?.packageVersion).toBe("0.1.0");
    expect(resolveDocsVersion("missing")).toBeNull();
  });

  it("preserves supported slugs and falls back to getting started", () => {
    expect(switchVersionPath("/docs/0.1/core", "0.1")).toBe("/docs/0.1/core");
    expect(switchVersionPath("/docs/0.1/not-real", "0.1")).toBe(
      "/docs/0.1/getting-started",
    );
  });

  it("has unique versioned pages, stable sections and known routes", () => {
    expect(docPages.map(({ slug }) => slug)).toEqual([
      "getting-started",
      "core",
      "motion",
      "react",
      "guides",
      "reference",
    ]);
    expect(new Set(docPages.map(({ slug }) => slug)).size).toBe(
      docPages.length,
    );
    expect(
      docPages.every(
        ({ section, title, description }) => section && title && description,
      ),
    ).toBe(true);
    expect(resolveDocPage("0.1", "core")?.title).toBe("Core API");
    expect(resolveDocPage("latest", "react")?.slug).toBe("react");
    expect(resolveDocPage("0.1", "missing")).toBeNull();
    expect(knownRoutes).toContain("/");
    expect(knownRoutes).toContain("/playground");
    expect(knownRoutes).toContain("/changelog");
    expect(knownRoutes).toContain("/docs/0.1/reference");
  });
});
