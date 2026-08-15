import { describe, expect, it } from "vitest";
import manifest from "./manifest.json";
import { specimenBySlug, specimens } from "./specimens";

describe("beverage specimens", () => {
  it("exposes all licensed icons with stable English labels", () => {
    expect(specimens).toHaveLength(21);
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
    expect(specimenBySlug("mango-juice").chineseName).toBe("芒果汁");
    expect(specimenBySlug("missing")).toBe(specimens[0]);
  });
});
