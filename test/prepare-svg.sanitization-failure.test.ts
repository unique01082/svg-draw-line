// @vitest-environment jsdom

import { expect, it, vi } from "vitest";

vi.mock("dompurify", () => ({
  default: () => ({
    removed: [],
    sanitize: () => {
      throw new Error("sensitive sanitizer detail");
    },
  }),
}));

it("wraps sanitizer failures without leaking input or internals", async () => {
  const { SvgPreparationError, prepareSvg } = await import("../src/index");
  const attackerMarkup =
    '<svg xmlns="http://www.w3.org/2000/svg"><path id="secret" /></svg>';

  await expect(prepareSvg(attackerMarkup)).rejects.toSatisfy(
    (error: unknown) => {
      expect(error).toBeInstanceOf(SvgPreparationError);
      expect((error as InstanceType<typeof SvgPreparationError>).code).toBe(
        "SANITIZATION_FAILED",
      );
      expect((error as Error).message).not.toContain("secret");
      expect((error as Error).message).not.toContain(
        "sensitive sanitizer detail",
      );
      return true;
    },
  );
});
