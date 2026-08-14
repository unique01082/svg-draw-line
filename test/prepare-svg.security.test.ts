// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { prepareSvg } from "../src/index";

const wrap = (content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${content}</svg>`;

describe("prepareSvg sanitization", () => {
  it("removes executable, HTML, SMIL, event-handler, and unsafe CSS content", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <script>globalThis.pwned = true</script>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>
        <animate attributeName="x" values="0;1" />
        <set attributeName="display" to="none" />
        <path onclick="alert(1)" style="fill: red; behavior: url(x); unknown: nope" d="M0 0h1" />
      `),
    );

    expect(
      prepared.svg.querySelector("script, foreignObject, animate, set"),
    ).toBeNull();
    const path = prepared.svg.querySelector("path");
    expect(path?.hasAttribute("onclick")).toBe(false);
    expect(path?.getAttribute("style")).toContain("fill: red");
    expect(path?.getAttribute("style")).not.toContain("behavior");
    expect(path?.getAttribute("style")).not.toContain("unknown");
    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_UNSAFE_CONTENT",
      count: expect.any(Number),
    });
    expect(JSON.stringify(prepared.diagnostics)).not.toContain(
      "globalThis.pwned",
    );
  });

  it("preserves explicitly safe presentation attributes and CSS", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <defs><linearGradient id="paint"><stop offset="0" stop-color="#fff" /></linearGradient></defs>
        <path id="shape" d="M0 0h1" fill="url(#paint)" stroke="currentColor"
          stroke-width="2" opacity="0.5"
          style="fill: url(#paint); stroke-linecap: round; vector-effect: non-scaling-stroke" />
      `),
    );
    const path = prepared.svg.querySelector("path");

    expect(path?.getAttribute("fill")).toMatch(
      /^url\(#svg-motion-[^)]+-paint\)$/,
    );
    expect(path?.getAttribute("stroke")).toBe("currentColor");
    expect(path?.getAttribute("stroke-width")).toBe("2");
    expect(path?.getAttribute("opacity")).toBe("0.5");
    expect(path?.getAttribute("style")).toContain("stroke-linecap: round");
    expect(path?.getAttribute("style")).toContain(
      "vector-effect: non-scaling-stroke",
    );
  });

  it("removes external stylesheets and resource references", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>@import url(https://evil.test/a.css); .x { fill: url(https://evil.test/a.svg#x) }</style>
        <use href="https://evil.test/icon.svg#x" />
        <image xlink:href="https://evil.test/pixel.png" />
        <path fill="url(https://evil.test/paint.svg#x)" style="filter: url(//evil.test/filter.svg#x)" />
      `),
    );

    expect(prepared.svg.querySelector("style")).toBeNull();
    for (const element of prepared.svg.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toMatch(/evil\.test|url\(\/\//);
      }
    }
    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: expect.any(Number),
    });
  });

  it("removes escaped CSS resource URLs from presentation attributes", async () => {
    const prepared = await prepareSvg(
      wrap(String.raw`<path fill="u\72l(https://evil.test/paint.svg#x)" />`),
    );

    expect(prepared.svg.querySelector("path")?.hasAttribute("fill")).toBe(
      false,
    );
    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_UNSAFE_CONTENT",
      count: expect.any(Number),
    });
    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: expect.any(Number),
    });
  });

  it.each(["png", "jpeg", "gif", "webp", "avif"])(
    "allows embedded %s bitmap data",
    async (format) => {
      const prepared = await prepareSvg(
        wrap(`<image href="data:image/${format};base64,AAAA" />`),
      );

      expect(prepared.svg.querySelector("image")?.getAttribute("href")).toBe(
        `data:image/${format};base64,AAAA`,
      );
    },
  );

  it("removes embedded SVG data", async () => {
    const prepared = await prepareSvg(
      wrap(
        '<image href="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E" />',
      ),
    );

    expect(prepared.svg.querySelector("image")?.hasAttribute("href")).toBe(
      false,
    );
    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: expect.any(Number),
    });
  });

  it("namespaces IDs and rewrites every local reference form", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <defs>
          <linearGradient id="paint" />
          <filter id="fx" />
          <mask id="mask" />
          <clipPath id="clip" />
          <marker id="marker" />
          <path id="shape" />
        </defs>
        <use href="#shape" xlink:href="#shape" />
        <path fill="url(#paint)" filter="url(#fx)" mask="url(#mask)"
          clip-path="url(#clip)" marker-start="url(#marker)"
          marker-mid="url(#marker)" marker-end="url(#marker)"
          style="stroke: url(#paint); filter: url(#fx)" />
      `),
    );
    const prefix = prepared.svg
      .querySelector("linearGradient")
      ?.id.replace(/paint$/, "");
    const use = prepared.svg.querySelector("use");
    const path = prepared.svg.querySelector(":scope > path");

    expect(prefix).toMatch(/^svg-motion-/);
    expect(use?.getAttribute("href")).toBe(`#${prefix}shape`);
    expect(use?.getAttribute("xlink:href")).toBe(`#${prefix}shape`);
    for (const attribute of [
      "fill",
      "filter",
      "mask",
      "clip-path",
      "marker-start",
      "marker-mid",
      "marker-end",
    ]) {
      expect(path?.getAttribute(attribute), attribute).toContain(
        `url(#${prefix}`,
      );
    }
    expect(path?.getAttribute("style")).toContain(`url(#${prefix}paint)`);
    expect(path?.getAttribute("style")).toContain(`url(#${prefix}fx)`);
  });

  it("bypasses filtering in trusted mode while still cloning and namespacing", async () => {
    const source = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    source.innerHTML =
      '<script id="code">trusted()</script><path id="shape" />';

    const prepared = await prepareSvg(source, { trust: "trusted" });

    expect(prepared.svg).not.toBe(source);
    expect(prepared.svg.querySelector("script")).not.toBeNull();
    expect(prepared.svg.querySelector("script")?.id).not.toBe("code");
    expect(source.querySelector("script")?.id).toBe("code");
    expect(prepared.diagnostics).toEqual([]);
  });

  it("rewrites trusted stylesheet and whitespace-padded fragment references", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>
          .shape { fill: url(#paint) }
          #shape { stroke: red }
          @media (min-width: 1px) { #shape { filter: url(#paint) } }
        </style>
        <defs><linearGradient id="paint" /></defs>
        <path id="shape" />
        <use href=" #shape " />
      `),
      { trust: "trusted" },
    );
    const prefix = prepared.svg
      .querySelector("linearGradient")
      ?.id.replace(/paint$/, "");
    const stylesheet = prepared.svg.querySelector("style")?.textContent;

    expect(stylesheet).toContain(`url(#${prefix}paint)`);
    expect(stylesheet).toContain(`#${prefix}shape`);
    expect(stylesheet).not.toMatch(/#shape\b/);
    expect(prepared.svg.querySelector("use")?.getAttribute("href")).toBe(
      `#${prefix}shape`,
    );
  });
});
