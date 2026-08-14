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

  it("rewrites every ARIA IDREF and IDREF-list while preserving external IDs", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <path id="shape" />
        <text id="label">Label</text>
        <g id="details" />
        <g aria-activedescendant="shape" aria-controls="shape"
          aria-describedby="label external" aria-details="details"
          aria-errormessage="details" aria-flowto="shape external"
          aria-labelledby="label external" aria-owns="shape details external" />
      `),
      { trust: "trusted" },
    );
    const ids = Object.fromEntries(
      [...prepared.svg.querySelectorAll("[id]")].map((element) => [
        element.id.replace(/^svg-motion-\d+-/, ""),
        element.id,
      ]),
    );
    const group = prepared.svg.querySelector("g[aria-controls]")!;

    expect(group.getAttribute("aria-activedescendant")).toBe(ids.shape);
    expect(group.getAttribute("aria-controls")).toBe(ids.shape);
    expect(group.getAttribute("aria-describedby")).toBe(
      `${ids.label} external`,
    );
    expect(group.getAttribute("aria-details")).toBe(ids.details);
    expect(group.getAttribute("aria-errormessage")).toBe(ids.details);
    expect(group.getAttribute("aria-flowto")).toBe(`${ids.shape} external`);
    expect(group.getAttribute("aria-labelledby")).toBe(`${ids.label} external`);
    expect(group.getAttribute("aria-owns")).toBe(
      `${ids.shape} ${ids.details} external`,
    );
  });

  it("preserves hex colors when an ID has the same hash text", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <defs><linearGradient id="fff" /></defs>
        <path fill="#fff" stroke="#fff" aria-label="#fff" />
        <use href="#fff" xlink:href="#fff" />
      `),
    );
    const namespacedId = prepared.svg.querySelector("linearGradient")?.id;
    const path = prepared.svg.querySelector("path");
    const use = prepared.svg.querySelector("use");

    expect(namespacedId).toMatch(/^svg-motion-\d+-fff$/);
    expect(path?.getAttribute("fill")).toBe("#fff");
    expect(path?.getAttribute("stroke")).toBe("#fff");
    expect(path?.getAttribute("aria-label")).toBe("#fff");
    expect(use?.getAttribute("href")).toBe(`#${namespacedId}`);
    expect(use?.getAttribute("xlink:href")).toBe(`#${namespacedId}`);
  });

  it("does not report local stylesheet fragment URLs as external references", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>.shape { fill: url(#paint) }</style>
        <defs><linearGradient id="paint" /></defs>
        <path class="shape" />
      `),
    );

    expect(prepared.svg.querySelector("style")).toBeNull();
    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_UNSAFE_CONTENT",
      count: expect.any(Number),
    });
    expect(prepared.diagnostics).not.toContainEqual({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: expect.any(Number),
    });
  });

  it("ignores @import text inside stylesheet comments and strings", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>
          /* @import url(https://evil.test/comment.css); */
          .shape { fill: url(#paint); font-family: "@import url(https://evil.test/string.css)" }
        </style>
        <defs><linearGradient id="paint" /></defs>
        <path class="shape" />
      `),
    );

    expect(prepared.svg.querySelector("style")).toBeNull();
    expect(prepared.diagnostics).not.toContainEqual({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: expect.any(Number),
    });
  });

  it("reports a real stylesheet @import rule as external", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>@import url(https://evil.test/real.css); .shape { fill: red }</style>
        <path class="shape" />
      `),
    );

    expect(prepared.diagnostics).toContainEqual({
      code: "REMOVED_EXTERNAL_REFERENCE",
      count: expect.any(Number),
    });
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

  it("rewrites trusted reference selectors, @scope, and selector() conditions", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>
          [id="shape"], [href='#shape'], [xlink\\:href="#shape"],
          [xlink|href='#shape'],
          [aria-controls="shape"], [aria-labelledby~='label'],
          [aria-owns="shape external"] { fill: #fff }
          @scope (#shape) to ([id='label']) {
            [aria-describedby~="label"] { stroke: #fff }
          }
          @supports selector(#shape > [href="#shape"]) {
            #shape { color: #fff }
          }
          [data-ref="#shape"] { flood-color: #fff }
        </style>
        <path id="shape" />
        <text id="label">Label</text>
        <path id="fff" />
      `),
      { trust: "trusted" },
    );
    const shapeId = prepared.svg.querySelector("path")!.id;
    const labelId = prepared.svg.querySelector("text")!.id;
    const stylesheet = prepared.svg.querySelector("style")!.textContent!;

    expect(stylesheet).toContain(`[id="${shapeId}"]`);
    expect(stylesheet).toContain(`[href='#${shapeId}']`);
    expect(stylesheet).toContain(`[xlink\\:href="#${shapeId}"]`);
    expect(stylesheet).toContain(`[xlink|href='#${shapeId}']`);
    expect(stylesheet).toContain(`[aria-controls="${shapeId}"]`);
    expect(stylesheet).toContain(`[aria-labelledby~='${labelId}']`);
    expect(stylesheet).toContain(`[aria-owns="${shapeId} external"]`);
    expect(stylesheet).toContain(`@scope (#${shapeId})`);
    expect(stylesheet).toContain(`[id='${labelId}']`);
    expect(stylesheet).toContain(
      `selector(#${shapeId} > [href="#${shapeId}"])`,
    );
    expect(stylesheet).toContain('[data-ref="#shape"]');
    expect(stylesheet.match(/#fff/g)).toHaveLength(4);
  });

  it("serializes rewritten unquoted reference selectors as valid escaped CSS", async () => {
    const prepared = await prepareSvg(
      wrap(String.raw`
        <style>
          [id=punct\:dot\.value],
          [href=\#punct\:dot\.value],
          [xlink\:href=\#punct\:dot\.value],
          [aria-controls=punct\:dot\.value],
          [aria-labelledby~=punct\:dot\.value] { fill: #fff }
          [data-ref=\#punct\:dot\.value] { stroke: #fff }
        </style>
        <path id="punct:dot.value" />
        <path id="fff" />
      `),
      { trust: "trusted" },
    );
    const punctuatedId = prepared.svg.querySelector("path")!.id;
    const escapedId = punctuatedId
      .replaceAll(":", "\\:")
      .replaceAll(".", "\\.");
    const stylesheet = prepared.svg.querySelector("style")!.textContent!;

    expect(stylesheet).toContain(`[id=${escapedId}]`);
    expect(stylesheet).toContain(`[href=\\#${escapedId}]`);
    expect(stylesheet).toContain(`[xlink\\:href=\\#${escapedId}]`);
    expect(stylesheet).toContain(`[aria-controls=${escapedId}]`);
    expect(stylesheet).toContain(`[aria-labelledby~=${escapedId}]`);
    expect(stylesheet).toContain(String.raw`[data-ref=\#punct\:dot\.value]`);
    expect(stylesheet.match(/#fff/g)).toHaveLength(2);
  });

  it("sanitizes namespace confusion and DOM-clobbering-shaped input without mutation", async () => {
    const source = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    source.innerHTML = `
      <script id="constructor">globalThis.hostileMarker = true</script>
      <foreignObject id="ownerDocument">
        <div xmlns="http://www.w3.org/1999/xhtml" onload="hostile()">HTML</div>
      </foreignObject>
      <g id="__proto__" name="querySelectorAll" onload="hostile()">
        <path id="attributes" name="constructor" onclick="hostile()" />
      </g>
      <a id="toString" name="ownerDocument" href="javascript:hostile()">
        <path id="prototype" />
      </a>
      <html:script xmlns:html="http://www.w3.org/1999/xhtml" onerror="hostile()" />
      <evil:path xmlns:evil="urn:attacker" id="querySelector" onload="hostile()" />
    `;
    const original = source.outerHTML;

    const prepared = await prepareSvg(source);

    expect(source.outerHTML).toBe(original);
    expect(prepared.svg).not.toBe(source);
    expect(
      prepared.svg.querySelector(
        "script, foreignObject, [href^='javascript:']",
      ),
    ).toBeNull();
    expect(
      [...prepared.svg.querySelectorAll("*")].every(
        (element) =>
          element.namespaceURI === "http://www.w3.org/2000/svg" &&
          [...element.attributes].every(
            (attribute) => !attribute.localName.toLowerCase().startsWith("on"),
          ),
      ),
    ).toBe(true);
    expect(typeof prepared.svg.querySelectorAll).toBe("function");
    expect(prepared.svg.ownerDocument).toBeInstanceOf(Document);
    expect(prepared.diagnostics.length).toBeGreaterThan(0);
    expect(
      prepared.diagnostics.every(
        (diagnostic) =>
          Object.keys(diagnostic).sort().join(",") === "code,count" &&
          typeof diagnostic.code === "string" &&
          typeof diagnostic.count === "number",
      ),
    ).toBe(true);
    expect(JSON.stringify(prepared.diagnostics)).not.toMatch(
      /hostile|constructor|ownerDocument/,
    );
  });

  it("rewrites escaped, digit-leading, and punctuated trusted CSS IDs without touching quoted hashes", async () => {
    const prepared = await prepareSvg(
      wrap(String.raw`
        <style>
          #\31 23, #punct\:dot\.value { fill: url(#punct\:dot\.value) }
          [data-ref="#123"], [data-other='#punct:dot.value'] { stroke: red }
        </style>
        <defs><linearGradient id="punct:dot.value" /></defs>
        <path id="123" />
      `),
      { trust: "trusted" },
    );
    const digitId = prepared.svg.querySelector("path")?.id;
    const punctuatedId = prepared.svg.querySelector("linearGradient")?.id;
    const stylesheet = prepared.svg.querySelector("style")?.textContent;

    expect(digitId).toMatch(/^svg-motion-\d+-123$/);
    expect(punctuatedId).toMatch(/^svg-motion-\d+-punct:dot\.value$/);
    expect(stylesheet).toContain(`#${digitId}`);
    expect(stylesheet).toContain(
      `#${punctuatedId?.replaceAll(":", "\\:").replaceAll(".", "\\.")}`,
    );
    expect(stylesheet).toContain(
      `url(#${punctuatedId?.replaceAll(":", "\\:").replaceAll(".", "\\.")})`,
    );
    expect(stylesheet).toContain('[data-ref="#123"]');
    expect(stylesheet).toContain("[data-other='#punct:dot.value']");
  });

  it("rewrites a local reference in an escaped CSS url function token", async () => {
    const prepared = await prepareSvg(
      wrap(String.raw`
        <style>.shape { fill: u\72l(#paint) }</style>
        <defs><linearGradient id="paint" /></defs>
        <path class="shape" />
      `),
      { trust: "trusted" },
    );
    const paintId = prepared.svg.querySelector("linearGradient")?.id;
    const stylesheet = prepared.svg.querySelector("style")?.textContent;

    expect(stylesheet).toContain(`url(#${paintId})`);
    expect(stylesheet).not.toContain("u\\72l(#paint)");
  });

  it("does not rewrite a url suffix inside a larger CSS function name", async () => {
    const prepared = await prepareSvg(
      wrap(`
        <style>.shape { fill: noturl(#paint) }</style>
        <defs><linearGradient id="paint" /></defs>
        <path class="shape" />
      `),
      { trust: "trusted" },
    );

    expect(prepared.svg.querySelector("style")?.textContent).toContain(
      "noturl(#paint)",
    );
  });
});
