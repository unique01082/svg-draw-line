import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefCallback,
} from "react";

import {
  mountSvgMotion,
  type MountSvgMotionOptions,
  type SvgDiagnostic,
  type SvgMotionController,
  type SvgMotionControllerState,
  type SvgSource,
} from "./index.js";

export type SvgMotionStatus = "loading" | "error" | SvgMotionControllerState;

export type SvgMotionRole =
  | "img"
  | "graphics-document"
  | "graphics-object"
  | "graphics-symbol"
  | "none"
  | "presentation";

export interface SvgMotionSvgProps {
  width?: number | string;
  height?: number | string;
  viewBox?: string;
  preserveAspectRatio?: string;
  className?: string;
  style?: CSSProperties;
  role?: SvgMotionRole;
  focusable?: boolean | "true" | "false";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export interface SvgMotionReadyHandle {
  readonly svg: SVGSVGElement;
  readonly controller: SvgMotionController;
}

export interface SvgMotionHandle {
  readonly svg: SVGSVGElement | null;
  readonly controller: SvgMotionController | null;
}

export interface UseSvgMotionOptions extends Omit<
  MountSvgMotionOptions,
  "signal"
> {
  source: SvgSource;
  svgProps?: SvgMotionSvgProps;
  onReady?: (handle: SvgMotionReadyHandle) => void;
  onFinish?: () => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}

export interface UseSvgMotionResult {
  readonly containerRef: RefCallback<Element>;
  readonly svg: SVGSVGElement | null;
  readonly controller: SvgMotionController | null;
  readonly status: SvgMotionStatus;
  readonly error: unknown | null;
  readonly diagnostics: readonly SvgDiagnostic[];
}

export interface SvgMotionProps extends Omit<UseSvgMotionOptions, "onReady"> {
  as?: "div" | "span";
  loading?: ReactNode;
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onReady?: (handle: SvgMotionHandle) => void;
}

interface LifecycleSnapshot {
  svg: SVGSVGElement | null;
  controller: SvgMotionController | null;
  status: SvgMotionStatus;
  error: unknown | null;
  diagnostics: readonly SvgDiagnostic[];
}

interface CallbackSet {
  onReady: UseSvgMotionOptions["onReady"];
  onFinish: UseSvgMotionOptions["onFinish"];
  onCancel: UseSvgMotionOptions["onCancel"];
  onError: UseSvgMotionOptions["onError"];
}

const EMPTY_DIAGNOSTICS: readonly SvgDiagnostic[] = [];
const IDLE_SNAPSHOT: LifecycleSnapshot = {
  svg: null,
  controller: null,
  status: "idle",
  error: null,
  diagnostics: EMPTY_DIAGNOSTICS,
};
const VALID_ROLES = new Set<SvgMotionRole>([
  "img",
  "graphics-document",
  "graphics-object",
  "graphics-symbol",
  "none",
  "presentation",
]);
const DECORATIVE_ROLES = new Set<SvgMotionRole>(["none", "presentation"]);
const BASE_UNITLESS_STYLE_PROPERTIES = [
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "gridArea",
  "gridRow",
  "gridRowEnd",
  "gridRowSpan",
  "gridRowStart",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnSpan",
  "gridColumnStart",
  "fontWeight",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "scale",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
] as const;
const UNITLESS_STYLE_PROPERTIES = new Set<string>(
  BASE_UNITLESS_STYLE_PROPERTIES.flatMap((property) => [
    property,
    ...["Webkit", "ms", "Moz", "O"].map(
      (prefix) => `${prefix}${property[0]!.toUpperCase()}${property.slice(1)}`,
    ),
  ]),
);

function stableStyleSignature(style: CSSProperties | undefined): string {
  if (!style) return "";
  return JSON.stringify(
    Object.entries(style)
      .filter(([, value]) => value !== null && value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function cssPropertyName(property: string): string {
  if (property.startsWith("--")) return property;
  return property
    .replace(/^ms([A-Z])/, "-ms-$1")
    .replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function applyStyle(svg: SVGSVGElement, style: CSSProperties | undefined) {
  if (!style) return;
  for (const [property, supplied] of Object.entries(style)) {
    if (
      supplied === null ||
      supplied === undefined ||
      typeof supplied === "boolean"
    )
      continue;
    const value =
      typeof supplied === "number" &&
      supplied !== 0 &&
      !property.startsWith("--") &&
      !UNITLESS_STYLE_PROPERTIES.has(property)
        ? `${supplied}px`
        : String(supplied);
    svg.style.setProperty(cssPropertyName(property), value);
  }
}

function setOptionalAttribute(
  element: Element,
  name: string,
  value: boolean | number | string | undefined,
) {
  if (value !== undefined) element.setAttribute(name, String(value));
}

function assignDefined<T extends object>(
  target: T,
  values: Record<string, unknown>,
): T {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) Object.assign(target, { [key]: value });
  }
  return target;
}

function invokeSafely<Arguments extends unknown[]>(
  callback: ((...args: Arguments) => unknown) | undefined,
  ...args: Arguments
): void {
  if (!callback) return;
  try {
    void Promise.resolve(callback(...args)).catch(() => undefined);
  } catch {
    // Consumer callback failures do not belong to adapter-owned promises.
  }
}

function validRole(value: string | null): SvgMotionRole | undefined {
  return value && VALID_ROLES.has(value as SvgMotionRole)
    ? (value as SvgMotionRole)
    : undefined;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function applySvgProps(svg: SVGSVGElement, props: SvgMotionSvgProps) {
  const sourceAriaLabel = svg.getAttribute("aria-label");
  const sourceAriaLabelledby = svg.getAttribute("aria-labelledby");
  const sourceNamed = hasText(sourceAriaLabel) || hasText(sourceAriaLabelledby);
  const sourceTitle = [...svg.children].some(
    (child) => child.localName === "title" && hasText(child.textContent),
  );
  const sourceRole = validRole(svg.getAttribute("role"));

  setOptionalAttribute(svg, "width", props.width);
  setOptionalAttribute(svg, "height", props.height);
  setOptionalAttribute(svg, "viewBox", props.viewBox);
  setOptionalAttribute(svg, "preserveAspectRatio", props.preserveAspectRatio);
  setOptionalAttribute(svg, "focusable", props.focusable);
  setOptionalAttribute(svg, "aria-label", props["aria-label"]);
  setOptionalAttribute(svg, "aria-labelledby", props["aria-labelledby"]);
  setOptionalAttribute(svg, "aria-describedby", props["aria-describedby"]);
  setOptionalAttribute(svg, "aria-hidden", props["aria-hidden"]);
  if (props.className !== undefined) svg.setAttribute("class", props.className);
  if (props.role !== undefined) svg.setAttribute("role", props.role);
  applyStyle(svg, props.style);

  const callerNamed =
    hasText(props["aria-label"]) || hasText(props["aria-labelledby"]);
  if (callerNamed) {
    svg.setAttribute("role", "img");
    svg.removeAttribute("aria-hidden");
    return;
  }

  if (sourceNamed || sourceTitle) {
    if (hasText(sourceAriaLabel))
      svg.setAttribute("aria-label", sourceAriaLabel!);
    if (hasText(sourceAriaLabelledby))
      svg.setAttribute("aria-labelledby", sourceAriaLabelledby!);
    const role = validRole(svg.getAttribute("role"));
    if (!role || DECORATIVE_ROLES.has(role)) svg.setAttribute("role", "img");
    svg.removeAttribute("aria-hidden");
  } else {
    const role = props.role ?? sourceRole;
    if (role) svg.setAttribute("role", role);
    else svg.removeAttribute("role");
    svg.setAttribute("aria-hidden", "true");
  }
}

function observeController(
  target: SvgMotionController,
  onState: (state: SvgMotionControllerState) => void,
  onSettle: (state: SvgMotionControllerState) => void,
  onFailure: (error: unknown) => void,
): { controller: SvgMotionController; disconnect: () => void } {
  let active = true;
  type TerminalState = Extract<
    SvgMotionControllerState,
    "finished" | "cancelled"
  >;
  interface RunObservation {
    run: Promise<void>;
    terminal?: TerminalState;
    delivered: boolean;
  }
  let observed: RunObservation | undefined;

  const terminalState = (
    state: SvgMotionControllerState,
  ): TerminalState | undefined =>
    state === "finished" || state === "cancelled" ? state : undefined;

  const deliver = (observation: RunObservation) => {
    if (!active || observation.delivered || !observation.terminal) return;
    observation.delivered = true;
    onSettle(observation.terminal);
  };

  const watch = () => {
    const run = target.finished;
    if (observed?.run === run) return observed;
    const observation: RunObservation = { run, delivered: false };
    observed = observation;
    void run
      .then(
        () => {
          if (!active) return;
          if (observed === observation) {
            const terminal = terminalState(target.state);
            if (terminal) observation.terminal ??= terminal;
            onState(target.state);
          }
          deliver(observation);
        },
        (error: unknown) => {
          if (!active || observed !== observation) return;
          onState(target.state);
          onFailure(error);
        },
      )
      .catch(() => undefined);
    return observation;
  };
  const captureCurrentTerminal = () => {
    const observation = watch();
    const terminal = terminalState(target.state);
    if (terminal) observation.terminal ??= terminal;
  };
  const update = () => {
    if (active) onState(target.state);
    watch();
  };

  const controller: SvgMotionController = {
    get state() {
      return target.state;
    },
    get finished() {
      return target.finished;
    },
    get diagnostics() {
      return target.diagnostics;
    },
    play() {
      captureCurrentTerminal();
      try {
        target.play();
      } finally {
        update();
      }
    },
    pause() {
      try {
        target.pause();
      } finally {
        update();
      }
    },
    reverse() {
      captureCurrentTerminal();
      try {
        target.reverse();
      } finally {
        update();
      }
    },
    restart() {
      captureCurrentTerminal();
      try {
        target.restart();
      } finally {
        update();
      }
    },
    finish() {
      try {
        target.finish();
      } finally {
        update();
      }
    },
    cancel() {
      try {
        target.cancel();
      } finally {
        update();
      }
    },
    seek(progress) {
      try {
        target.seek(progress);
      } finally {
        update();
      }
    },
    destroy() {
      try {
        target.destroy();
      } finally {
        update();
      }
    },
  };

  watch();
  return {
    controller,
    disconnect() {
      active = false;
    },
  };
}

export function useSvgMotion(options: UseSvgMotionOptions): UseSvgMotionResult {
  const {
    source,
    trust,
    maxBytes,
    preset,
    autoplay,
    duration,
    delay,
    easing,
    iterations,
    direction,
    selector,
    order,
    stagger,
    svgProps = {},
    onReady,
    onFinish,
    onCancel,
    onError,
  } = options;
  const [container, setContainer] = useState<Element | null>(null);
  const [snapshot, setSnapshot] = useState<LifecycleSnapshot>({
    svg: null,
    controller: null,
    status: "loading",
    error: null,
    diagnostics: EMPTY_DIAGNOSTICS,
  });
  const callbacksRef = useRef<CallbackSet>({
    onReady,
    onFinish,
    onCancel,
    onError,
  });
  const svgPropsRef = useRef(svgProps);
  const hadContainerRef = useRef(false);
  callbacksRef.current = { onReady, onFinish, onCancel, onError };
  svgPropsRef.current = svgProps;
  const containerRef = useCallback<RefCallback<Element>>((node) => {
    setContainer(node);
  }, []);
  const styleSignature = stableStyleSignature(svgProps.style);

  useEffect(() => {
    if (!container) {
      if (hadContainerRef.current) {
        setSnapshot((current) =>
          current.svg === null &&
          current.controller === null &&
          current.status === "idle" &&
          current.error === null &&
          current.diagnostics.length === 0
            ? current
            : IDLE_SNAPSHOT,
        );
      }
      return;
    }
    hadContainerRef.current = true;

    let active = true;
    const abortController = new AbortController();
    let destroyCurrent: (() => void) | undefined;
    setSnapshot({
      svg: null,
      controller: null,
      status: "loading",
      error: null,
      diagnostics: EMPTY_DIAGNOSTICS,
    });

    const mountOptions = assignDefined<MountSvgMotionOptions>(
      {
        signal: abortController.signal,
      },
      {
        trust,
        maxBytes,
        preset,
        autoplay,
        duration,
        delay,
        easing,
        iterations,
        direction,
        selector,
        order,
        stagger,
      },
    );

    void mountSvgMotion(container, source, mountOptions)
      .then(
        (instance) => {
          if (!active) {
            instance.destroy();
            return;
          }
          applySvgProps(instance.svg, svgPropsRef.current);
          const observed = observeController(
            instance.controller,
            (status) => {
              if (!active) return;
              setSnapshot((current) => ({ ...current, status }));
            },
            (status) => {
              if (status === "finished")
                invokeSafely(callbacksRef.current.onFinish);
              else if (status === "cancelled")
                invokeSafely(callbacksRef.current.onCancel);
            },
            (error) => {
              if (!active) return;
              setSnapshot((current) => ({ ...current, error }));
              invokeSafely(callbacksRef.current.onError, error);
            },
          );
          destroyCurrent = () => {
            observed.disconnect();
            instance.destroy();
          };
          const ready = {
            svg: instance.svg,
            controller: observed.controller,
          } satisfies SvgMotionReadyHandle;
          setSnapshot({
            ...ready,
            status: observed.controller.state,
            error: null,
            diagnostics: instance.diagnostics,
          });
          invokeSafely(callbacksRef.current.onReady, ready);
        },
        (error: unknown) => {
          if (!active || abortController.signal.aborted) return;
          setSnapshot({
            svg: null,
            controller: null,
            status: "error",
            error,
            diagnostics: EMPTY_DIAGNOSTICS,
          });
          invokeSafely(callbacksRef.current.onError, error);
        },
      )
      .catch(() => undefined);

    return () => {
      active = false;
      abortController.abort();
      destroyCurrent?.();
    };
  }, [
    container,
    source,
    trust,
    maxBytes,
    preset,
    autoplay,
    duration,
    delay,
    easing,
    iterations,
    direction,
    selector,
    order,
    stagger,
    svgProps.width,
    svgProps.height,
    svgProps.viewBox,
    svgProps.preserveAspectRatio,
    svgProps.className,
    svgProps.role,
    svgProps.focusable,
    svgProps["aria-label"],
    svgProps["aria-labelledby"],
    svgProps["aria-describedby"],
    svgProps["aria-hidden"],
    styleSignature,
  ]);

  return {
    containerRef,
    svg: snapshot.svg,
    controller: snapshot.controller,
    status: snapshot.status,
    error: snapshot.error,
    diagnostics: snapshot.diagnostics,
  };
}

export const SvgMotion = forwardRef<SvgMotionHandle, SvgMotionProps>(
  function SvgMotion(
    {
      as = "div",
      loading = null,
      fallback = null,
      className,
      style,
      source,
      trust,
      maxBytes,
      preset,
      autoplay,
      duration,
      delay,
      easing,
      iterations,
      direction,
      selector,
      order,
      stagger,
      svgProps,
      onReady,
      onFinish,
      onCancel,
      onError,
    },
    forwardedRef,
  ) {
    const latestReadyCallback = useRef(onReady);
    latestReadyCallback.current = onReady;
    const liveRef = useRef<{
      svg: SVGSVGElement | null;
      controller: SvgMotionController | null;
    }>({ svg: null, controller: null });
    const handleRef = useRef<SvgMotionHandle>();
    if (!handleRef.current) {
      handleRef.current = {
        get svg() {
          return liveRef.current.svg;
        },
        get controller() {
          return liveRef.current.controller;
        },
      };
    }
    const reportReady = useCallback((ready: SvgMotionReadyHandle) => {
      liveRef.current = ready;
      invokeSafely(latestReadyCallback.current, handleRef.current!);
    }, []);
    const result = useSvgMotion(
      assignDefined<UseSvgMotionOptions>(
        { source, onReady: reportReady },
        {
          trust,
          maxBytes,
          preset,
          autoplay,
          duration,
          delay,
          easing,
          iterations,
          direction,
          selector,
          order,
          stagger,
          svgProps,
          onFinish,
          onCancel,
          onError,
        },
      ),
    );
    liveRef.current = { svg: result.svg, controller: result.controller };
    useImperativeHandle(forwardedRef, () => handleRef.current!, []);
    useEffect(
      () => () => {
        liveRef.current = { svg: null, controller: null };
      },
      [],
    );

    const child =
      result.status === "loading"
        ? loading
        : result.status === "error"
          ? fallback
          : null;
    return createElement(
      as,
      { className, ref: result.containerRef, style },
      child,
    );
  },
);
