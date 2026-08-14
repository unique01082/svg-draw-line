// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  SVG_ANIMATION_ERROR_CODES,
  mountSvgMotion,
  SvgAnimationError,
  SvgPreparationError,
} from "../src/index";
import {
  RecordedAnimation,
  allAnimations,
  installWaapi,
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
    { autoplay: false, preset: "fade", trust: "trusted" },
  );

  expect(container.children).toHaveLength(2);
  expect(container.firstElementChild).toBe(sibling);
  expect(container.lastElementChild).toBe(instance.svg);
  expect(instance.controller.state).toBe("idle");
  expect(instance.diagnostics).toEqual([]);
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

it("retries transient partial setup cleanup before mount rollback", async () => {
  const container = document.createElement("div");
  container.innerHTML = "<span>keep</span>";
  const nativeAnimate = vi
    .mocked(Element.prototype.animate)
    .getMockImplementation()!;
  const created: RecordedAnimation[] = [];
  let createdRoot: SVGSVGElement | undefined;
  let firstCancel: ReturnType<typeof vi.spyOn> | undefined;
  vi.spyOn(Element.prototype, "animate").mockImplementation(function (
    this: Element,
    keyframes,
    options,
  ) {
    createdRoot =
      (this as SVGElement).ownerSVGElement ?? (this as SVGSVGElement);
    const animation = nativeAnimate.call(
      this,
      keyframes,
      options,
    ) as unknown as RecordedAnimation;
    const index = created.length;
    created.push(animation);
    if (index === 0) {
      firstCancel = vi.spyOn(animation, "cancel").mockImplementationOnce(() => {
        throw new Error("private transient mounted cancel failure");
      });
    } else {
      Object.defineProperty(animation, "finished", {
        configurable: true,
        get() {
          throw new Error("private mounted finished getter failure");
        },
      });
    }
    return animation as unknown as Animation;
  });

  await expect(
    mountSvgMotion(
      container,
      '<svg xmlns="http://www.w3.org/2000/svg"><text>One</text><text>Two</text></svg>',
      { autoplay: false, preset: "stagger", stagger: 0 },
    ),
  ).rejects.toEqual(
    expect.objectContaining({
      code: SVG_ANIMATION_ERROR_CODES.setupFailed,
      message: "The SVG animation could not be created.",
    }),
  );
  expect(firstCancel).toHaveBeenCalledTimes(2);
  expect(createdRoot).toBeDefined();
  expect(allAnimations(createdRoot!)).toEqual([]);
  expect(container.innerHTML).toBe("<span>keep</span>");
});

it("allows mounted destroy to retry a typed native cleanup failure", async () => {
  const container = document.createElement("div");
  const instance = await mountSvgMotion(
    container,
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" /></svg>',
    { preset: "fade" },
  );
  const animation = allAnimations(instance.svg)[0]!;
  vi.spyOn(animation, "cancel").mockImplementationOnce(() => {
    throw new Error("private mounted cancel detail");
  });

  expect(() => instance.destroy()).toThrow(
    expect.objectContaining({
      name: "SvgAnimationError",
      code: SVG_ANIMATION_ERROR_CODES.animationFailed,
      message: "The SVG animation did not complete.",
    }),
  );
  expect(instance.controller.state).toBe("failed");
  expect(container.contains(instance.svg)).toBe(true);

  expect(() => instance.destroy()).not.toThrow();
  expect(instance.controller.state).toBe("destroyed");
  expect(container.contains(instance.svg)).toBe(false);
});
