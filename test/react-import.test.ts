import { expect, it } from "vitest";

import type { UseSvgMotionOptions } from "../src/react";

type HasExternalSignal = "signal" extends keyof UseSvgMotionOptions
  ? true
  : false;

const hasExternalSignal: HasExternalSignal = false;

it("imports the optional React adapter without a DOM", async () => {
  expect(globalThis.document).toBeUndefined();

  const reactEntry = await import("../src/react");

  expect(typeof reactEntry.SvgMotion).toBe("object");
  expect(typeof reactEntry.useSvgMotion).toBe("function");
  expect(hasExternalSignal).toBe(false);
});
