import { describe, expect, it } from "vitest";
import { canHydratePrerenderedRoute } from "./hydration";

describe("static route hydration", () => {
  it("hydrates only matching prerender output and remounts SPA fallbacks", () => {
    expect(
      canHydratePrerenderedRoute("/docs/0.1/core", "/docs/0.1/core", true),
    ).toBe(true);
    expect(canHydratePrerenderedRoute("/", "/docs/9.9/missing", true)).toBe(
      false,
    );
    expect(
      canHydratePrerenderedRoute(
        "/playground",
        "/playground?icon=coffee",
        true,
      ),
    ).toBe(false);
    expect(canHydratePrerenderedRoute(undefined, "/playground", false)).toBe(
      false,
    );
  });
});
