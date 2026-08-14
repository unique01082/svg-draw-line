// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  SVG_ANIMATION_ERROR_CODES,
  mountSvgMotion,
  SvgAnimationError,
  SvgPreparationError,
} from "../src/index";
import {
  allAnimations,
  installWaapi,
  setLength,
  uninstallWaapi,
} from "./waapi-test-support";

beforeEach(() => {
  installWaapi();
});

afterEach(() => {
  uninstallWaapi();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("prepares, appends without replacement, animates, and destroys only its SVG", async () => {
  const container = document.createElement("div");
  const sibling = document.createElement("span");
  sibling.textContent = "keep";
  container.append(sibling);

  const instance = await mountSvgMotion(
    container,
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#f00" d="M0 0h10" /></svg>',
    { autoplay: false, trust: "trusted" },
  );
  const path = instance.svg.querySelector("path")!;
  setLength(path, 10);

  expect(container.children).toHaveLength(2);
  expect(container.firstElementChild).toBe(sibling);
  expect(container.lastElementChild).toBe(instance.svg);
  expect(instance.controller.state).toBe("idle");
  expect(instance.diagnostics).toEqual([
    { code: "NO_DRAWABLE_GEOMETRY", count: 1 },
  ]);
  expect(allAnimations(instance.svg)).toHaveLength(1);

  instance.destroy();

  expect(container.children).toHaveLength(1);
  expect(container.firstElementChild).toBe(sibling);
  expect(instance.controller.state).toBe("destroyed");
  expect(allAnimations(instance.svg)).toEqual([]);
});

it("leaves the container unchanged when preparation fails", async () => {
  const container = document.createElement("div");
  container.innerHTML = "<span>keep</span>";
  const original = container.innerHTML;

  await expect(
    mountSvgMotion(container, "<svg><path></svg>"),
  ).rejects.toBeInstanceOf(SvgPreparationError);
  expect(container.innerHTML).toBe(original);
});

it("rolls back the appended SVG when animation setup fails", async () => {
  const container = document.createElement("div");
  container.innerHTML = "<span>keep</span>";
  vi.spyOn(Element.prototype, "animate").mockImplementationOnce(() => {
    throw new Error("private native setup detail");
  });

  const failure = mountSvgMotion(
    container,
    '<svg xmlns="http://www.w3.org/2000/svg"><text>Hi</text></svg>',
  );
  await expect(failure).rejects.toBeInstanceOf(SvgAnimationError);
  await expect(failure).rejects.toEqual(
    expect.objectContaining({
      code: SVG_ANIMATION_ERROR_CODES.setupFailed,
      message: "The SVG animation could not be created.",
    }),
  );
  expect(container.innerHTML).toBe("<span>keep</span>");
});
