// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareSvg, SvgPreparationError } from "../src/index";

async function fixture(name: string): Promise<string> {
  return readFile(
    resolve(process.cwd(), "test/fixtures", `${name}.svg`),
    "utf8",
  );
}

describe("release SVG fixtures", () => {
  it.each([
    "primitives",
    "advanced",
    "fallback",
    "embedded-bitmap",
    "no-geometry",
  ])("prepares the safe %s fixture", async (name) => {
    const prepared = await prepareSvg(await fixture(name));

    expect(prepared.svg.localName).toBe("svg");
    expect(prepared.diagnostics).toEqual([]);
  });

  it("preserves the safe embedded bitmap", async () => {
    const prepared = await prepareSvg(await fixture("embedded-bitmap"));

    expect(prepared.svg.querySelector("image")?.getAttribute("href")).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("sanitizes the malicious fixture without reflecting source content", async () => {
    const prepared = await prepareSvg(await fixture("malicious"));

    expect(
      prepared.svg.querySelector("script, foreignObject, animate"),
    ).toBeNull();
    expect(prepared.svg.querySelector("[onload]")).toBeNull();
    expect(prepared.svg.querySelector("image")?.hasAttribute("href")).toBe(
      false,
    );
    expect(prepared.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "REMOVED_UNSAFE_CONTENT",
        "REMOVED_EXTERNAL_REFERENCE",
      ]),
    );
    expect(JSON.stringify(prepared.diagnostics)).not.toContain("attacker");
  });

  it("rejects the malformed fixture with a typed error", async () => {
    await expect(prepareSvg(await fixture("malformed"))).rejects.toMatchObject({
      code: "INVALID_SVG",
    } satisfies Partial<SvgPreparationError>);
  });
});
