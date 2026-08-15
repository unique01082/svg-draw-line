import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { specimenBySlug, specimens } from "./specimens";

describe("education specimens", () => {
  it("exposes all licensed icons with stable English labels", () => {
    expect(specimens).toHaveLength(30);
    expect(specimens.map(({ slug }) => slug)).toEqual(
      manifest.specimens.map(({ slug }) => slug),
    );
    expect(
      specimens.every(
        ({ label, source }) => label && source.startsWith("/specimens/"),
      ),
    ).toBe(true);
  });

  it("resolves a slug and falls back to the first specimen", () => {
    expect(specimenBySlug("bachelor-hat").originalName).toBe("Bachelor Hat");
    expect(specimenBySlug("missing")).toBe(specimens[0]);
  });
});
