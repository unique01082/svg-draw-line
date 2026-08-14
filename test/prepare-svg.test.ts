// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SvgPreparationError,
  prepareSvg,
  type SvgPreparationErrorCode,
} from "../src/index";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><path id="line" d="M0 0h10"/></svg>';

function expectPreparationError(error: unknown, code: SvgPreparationErrorCode) {
  expect(error).toBeInstanceOf(SvgPreparationError);
  expect((error as SvgPreparationError).code).toBe(code);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prepareSvg sources", () => {
  it("prepares markup strings with sanitize defaults", async () => {
    const prepared = await prepareSvg(SVG);

    expect(prepared.svg).toBeInstanceOf(SVGSVGElement);
    expect(prepared.svg.querySelector("path")).not.toBeNull();
    expect(prepared.diagnostics).toEqual([]);
  });

  it.each([
    ["URL strings", "https://example.test/icon.svg"],
    ["URL objects", new URL("https://example.test/icon.svg")],
  ])("fetches %s with the native fetch contract", async (_label, source) => {
    const fetchMock = vi.fn(async () => new Response(SVG, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const prepared = await prepareSvg(source);

    expect(fetchMock).toHaveBeenCalledWith(
      source instanceof URL ? source : new URL(source),
      {},
    );
    expect(prepared.svg.querySelector("path")).not.toBeNull();
  });

  it.each([
    ["Blob", new Blob([SVG], { type: "image/svg+xml" })],
    ["File", new File([SVG], "icon.svg", { type: "image/svg+xml" })],
  ])("prepares a %s source", async (_label, source) => {
    const prepared = await prepareSvg(source);

    expect(prepared.svg.querySelector("path")).not.toBeNull();
  });

  it("clones an SVGSVGElement source without mutating it", async () => {
    document.body.innerHTML = SVG;
    const source = document.querySelector("svg") as SVGSVGElement;
    const originalMarkup = source.outerHTML;

    const first = await prepareSvg(source);
    const second = await prepareSvg(source);

    expect(source.outerHTML).toBe(originalMarkup);
    expect(first.svg).not.toBe(source);
    expect(first.svg.querySelector("path")?.id).not.toBe(
      source.querySelector("path")?.id,
    );
    expect(first.svg.querySelector("path")?.id).not.toBe(
      second.svg.querySelector("path")?.id,
    );
  });
});

describe("prepareSvg failures", () => {
  it.each([NaN, Infinity, -Infinity, -1, 1.5])(
    "rejects invalid maxBytes %s before reading any source",
    async (maxBytes) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const parseMock = vi.spyOn(DOMParser.prototype, "parseFromString");
      const blob = new Blob([SVG]);
      const blobReadMock = vi.spyOn(blob, "arrayBuffer");

      for (const source of [SVG, blob, "https://example.test/icon.svg"]) {
        await expect(prepareSvg(source, { maxBytes })).rejects.toEqual(
          expect.objectContaining({
            name: "RangeError",
            message: "maxBytes must be a finite non-negative integer.",
          }),
        );
      }

      expect(fetchMock).not.toHaveBeenCalled();
      expect(parseMock).not.toHaveBeenCalled();
      expect(blobReadMock).not.toHaveBeenCalled();
    },
  );

  it("accepts zero maxBytes and enforces a zero-byte ceiling", async () => {
    await expect(prepareSvg(SVG, { maxBytes: 0 })).rejects.toSatisfy(
      (error: unknown) => {
        expectPreparationError(error, "SOURCE_TOO_LARGE");
        return true;
      },
    );
  });

  it.each([
    {
      localName: "svg",
      namespaceURI: "http://www.w3.org/2000/svg",
      cloneNode: true,
    },
    {
      localName: "svg",
      namespaceURI: "http://www.w3.org/2000/svg",
      cloneNode() {
        throw new Error("<script>hostile clone detail</script>");
      },
    },
  ])("wraps spoofed SVG-like sources as unsupported", async (source) => {
    await expect(prepareSvg(source as never)).rejects.toEqual(
      expect.objectContaining({
        name: "SvgPreparationError",
        code: "UNSUPPORTED_SOURCE",
        message: "The SVG source type is not supported.",
      }),
    );
  });

  it("wraps real-node serialization and clone failures without hostile detail", async () => {
    document.body.innerHTML = SVG;
    const source = document.querySelector("svg") as SVGSVGElement;

    vi.spyOn(
      XMLSerializer.prototype,
      "serializeToString",
    ).mockImplementationOnce(() => {
      throw new Error("private serializer detail");
    });
    await expect(prepareSvg(source)).rejects.toEqual(
      expect.objectContaining({
        name: "SvgPreparationError",
        code: "UNSUPPORTED_SOURCE",
        message: "The SVG source type is not supported.",
      }),
    );

    vi.spyOn(source, "cloneNode").mockImplementationOnce(() => {
      throw new Error("private clone detail");
    });
    await expect(prepareSvg(source)).rejects.toEqual(
      expect.objectContaining({
        name: "SvgPreparationError",
        code: "UNSUPPORTED_SOURCE",
        message: "The SVG source type is not supported.",
      }),
    );

    const original = source.outerHTML;
    vi.spyOn(source, "cloneNode").mockReturnValueOnce(source);
    await expect(prepareSvg(source)).rejects.toEqual(
      expect.objectContaining({
        name: "SvgPreparationError",
        code: "UNSUPPORTED_SOURCE",
        message: "The SVG source type is not supported.",
      }),
    );
    expect(source.outerHTML).toBe(original);
  });

  it.each([
    ["malformed XML", "<svg><path></svg>"],
    ["a non-SVG root", "<div>not svg</div>"],
  ])("rejects %s", async (_label, source) => {
    await expect(prepareSvg(source)).rejects.toSatisfy((error: unknown) => {
      expectPreparationError(error, "INVALID_SVG");
      return true;
    });
  });

  it("rejects oversized markup and blob sources", async () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>large</text></svg>';

    for (const source of [markup, new Blob([markup])]) {
      await expect(prepareSvg(source, { maxBytes: 8 })).rejects.toSatisfy(
        (error: unknown) => {
          expectPreparationError(error, "SOURCE_TOO_LARGE");
          return true;
        },
      );
    }
  });

  it("rejects an oversized fetched response before reading it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(SVG, { headers: { "content-length": String(10_000) } }),
      ),
    );

    await expect(
      prepareSvg("https://example.test/large.svg", { maxBytes: 16 }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPreparationError(error, "SOURCE_TOO_LARGE");
      return true;
    });
  });

  it("cancels a chunked response as soon as it exceeds maxBytes", async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(10));
        if (pulls === 10) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );

    await expect(
      prepareSvg("https://example.test/chunked.svg", { maxBytes: 16 }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPreparationError(error, "SOURCE_TOO_LARGE");
      return true;
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(10);
  });

  it("preserves the oversized error when response cancellation fails", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(20));
      },
      cancel() {
        throw new Error("cancel failed");
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );

    await expect(
      prepareSvg("https://example.test/chunked.svg", { maxBytes: 16 }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPreparationError(error, "SOURCE_TOO_LARGE");
      return true;
    });
  });

  it("wraps failed HTTP and network fetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockRejectedValueOnce(new TypeError("network detail"));
    vi.stubGlobal("fetch", fetchMock);

    for (const url of [
      "https://example.test/404.svg",
      "https://example.test/offline.svg",
    ]) {
      await expect(prepareSvg(url)).rejects.toSatisfy((error: unknown) => {
        expectPreparationError(error, "FETCH_FAILED");
        expect((error as Error).message).not.toContain("network detail");
        return true;
      });
    }
  });

  it("reports an already-aborted operation with a typed error", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareSvg(SVG, { signal: controller.signal }),
    ).rejects.toSatisfy((error: unknown) => {
      expectPreparationError(error, "ABORTED");
      return true;
    });
  });

  it("translates a fetch abort to a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
    );

    await expect(prepareSvg("https://example.test/icon.svg")).rejects.toSatisfy(
      (error: unknown) => {
        expectPreparationError(error, "ABORTED");
        return true;
      },
    );
  });

  it("rejects DOM work in an unsupported environment", async () => {
    vi.stubGlobal("DOMParser", undefined);

    await expect(prepareSvg(SVG)).rejects.toSatisfy((error: unknown) => {
      expectPreparationError(error, "UNSUPPORTED_ENVIRONMENT");
      return true;
    });
  });
});
