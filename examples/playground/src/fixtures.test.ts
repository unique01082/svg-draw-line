import { describe, expect, it } from "vitest";
import { DEFAULT_FIXTURE, DEMO_FIXTURES, fixtureById } from "./fixtures";

describe("demo fixtures", () => {
  it("covers every public preset and planned SVG capability", () => {
    expect(new Set(DEMO_FIXTURES.map(({ preset }) => preset))).toEqual(
      new Set(["draw", "fade", "scale", "stagger", "pulse"]),
    );
    const capabilities = new Set(
      DEMO_FIXTURES.flatMap(({ capability }) => capability),
    );
    for (const capability of [
      "path",
      "circle",
      "gradient",
      "mask",
      "clip-path",
      "filter",
      "text",
      "image",
      "stagger",
      "pulse",
    ]) {
      expect(capabilities.has(capability)).toBe(true);
    }
    expect(
      DEMO_FIXTURES.some(({ source }) => source.includes("<linearGradient")),
    ).toBe(true);
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<mask"))).toBe(
      true,
    );
    expect(
      DEMO_FIXTURES.some(({ source }) => source.includes("<clipPath")),
    ).toBe(true);
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<filter"))).toBe(
      true,
    );
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<text"))).toBe(
      true,
    );
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<image"))).toBe(
      true,
    );
  });

  it("returns the default for unknown identifiers", () => {
    expect(fixtureById("missing")).toBe(DEFAULT_FIXTURE);
  });
});
