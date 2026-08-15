import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  fileURLToPath(new URL("./styles.css", import.meta.url)),
  "utf8",
);

function cssHexToken(name: string): string {
  const value = stylesheet.match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"),
  )?.[1];
  if (!value) throw new Error(`Missing --${name} color token.`);
  return value;
}

function luminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((channel) => {
    const normalized = Number.parseInt(channel, 16) / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  if (!channels || channels.length !== 3)
    throw new Error(`Invalid color ${hex}`);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe("Night Glass color and motion tokens", () => {
  it("keeps normal text and accents readable on the darkest surfaces", () => {
    const night = cssHexToken("night");
    const panel = cssHexToken("panel");
    for (const token of ["text", "muted", "blue", "orange", "mint"]) {
      expect(contrast(cssHexToken(token), night)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(cssHexToken("muted"), panel)).toBeGreaterThanOrEqual(4.5);
  });

  it("contains a reduced-motion override for site transitions", () => {
    expect(stylesheet).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesheet).toContain("scroll-behavior: auto");
    expect(stylesheet).toContain("transition-duration: 0.01ms");
  });
});
