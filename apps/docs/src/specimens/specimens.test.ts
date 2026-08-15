import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { specimenBySlug, specimens } from "./specimens";

describe("Pixellove specimens", () => {
  it("exposes all licensed icons with stable English labels", () => {
    expect(specimens).toHaveLength(50);
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
    expect(specimenBySlug("des-wand-2").originalName).toBe("Des Wand 2");
    expect(specimenBySlug("missing")).toBe(specimens[0]);
  });
});
