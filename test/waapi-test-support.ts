import { vi } from "vitest";

type RecordedKeyframe = Record<string, string | number | null | undefined>;

let animations = new WeakMap<Element, RecordedAnimation[]>();

function normalizedKeyframes(
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
): RecordedKeyframe[] {
  if (Array.isArray(keyframes)) return keyframes as RecordedKeyframe[];

  const entries = Object.entries(keyframes);
  const length = Math.max(
    1,
    ...entries.map(([, value]) => (Array.isArray(value) ? value.length : 1)),
  );
  return Array.from({ length }, (_, index) =>
    Object.fromEntries(
      entries.map(([property, value]) => [
        property,
        Array.isArray(value) ? value[index] : value,
      ]),
    ),
  );
}

function normalizedTiming(options?: number | KeyframeAnimationOptions) {
  const supplied =
    typeof options === "number" ? { duration: options } : options;
  return {
    delay: Number(supplied?.delay ?? 0),
    direction: supplied?.direction ?? "normal",
    duration: Number(supplied?.duration ?? 0),
    easing: supplied?.easing ?? "linear",
    fill: supplied?.fill ?? "none",
    iterations: Number(supplied?.iterations ?? 1),
  } satisfies Record<string, string | number>;
}

export class RecordedAnimation {
  readonly target: Element;
  readonly keyframes: RecordedKeyframe[];
  readonly timing: ReturnType<typeof normalizedTiming>;
  readonly effect: KeyframeEffect;
  currentTime: CSSNumberish | null = 0;
  playbackRate = 1;
  playState: AnimationPlayState = "running";
  private resolveFinished!: (animation: Animation) => void;
  readonly finished: Promise<Animation>;

  constructor(
    target: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions,
  ) {
    this.target = target;
    this.keyframes = normalizedKeyframes(keyframes);
    this.timing = normalizedTiming(options);
    this.finished = new Promise((resolve) => {
      this.resolveFinished = resolve;
    });
    this.effect = {
      getComputedTiming: () => ({
        ...this.timing,
        activeDuration:
          this.timing.iterations === Infinity
            ? Infinity
            : this.timing.duration * this.timing.iterations,
        endTime:
          this.timing.iterations === Infinity
            ? Infinity
            : this.timing.delay + this.timing.duration * this.timing.iterations,
      }),
      getKeyframes: () => this.keyframes,
      getTiming: () => this.timing,
    } as unknown as KeyframeEffect;
  }

  play() {
    this.playState = "running";
  }

  pause() {
    this.playState = "paused";
  }

  reverse() {
    this.playbackRate = this.playbackRate > 0 ? -this.playbackRate : 1;
    this.playState = "running";
  }

  finish() {
    const endTime = this.effect.getComputedTiming().endTime;
    if (endTime === Infinity) {
      throw new DOMException(
        "Cannot finish an animation with an infinite target effect end.",
        "InvalidStateError",
      );
    }
    this.currentTime = endTime ?? 0;
    this.playState = "finished";
    this.resolveFinished(this as unknown as Animation);
  }

  cancel() {
    this.currentTime = null;
    this.playState = "idle";
    const owned = animations.get(this.target);
    if (owned)
      animations.set(
        this.target,
        owned.filter((item) => item !== this),
      );
  }
}

export function installWaapi() {
  animations = new WeakMap<Element, RecordedAnimation[]>();
  vi.stubGlobal("Animation", RecordedAnimation);
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: vi.fn(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = new RecordedAnimation(this, keyframes ?? [], options);
      animations.set(this, [...(animations.get(this) ?? []), animation]);
      return animation as unknown as Animation;
    }),
  });
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    writable: true,
    value: vi.fn(function (this: Element, options?: GetAnimationsOptions) {
      const own = animations.get(this) ?? [];
      const descendants = options?.subtree
        ? [...this.querySelectorAll("*")].flatMap(
            (element) => animations.get(element) ?? [],
          )
        : [];
      return [...own, ...descendants] as unknown as Animation[];
    }),
  });
}

export function uninstallWaapi() {
  Reflect.deleteProperty(Element.prototype, "animate");
  Reflect.deleteProperty(Element.prototype, "getAnimations");
}

export function animationsFor(element: Element): RecordedAnimation[] {
  return (element.getAnimations() as unknown as RecordedAnimation[]) ?? [];
}

export function allAnimations(element: Element): RecordedAnimation[] {
  return (
    (element.getAnimations({
      subtree: true,
    }) as unknown as RecordedAnimation[]) ?? []
  );
}

export function setLength(element: Element, length: number) {
  Object.defineProperty(element, "getTotalLength", {
    configurable: true,
    value: () => length,
  });
}
