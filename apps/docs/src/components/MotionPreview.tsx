import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { SvgMotion, type SvgMotionHandle } from "@baolq/svg-motion/react";
import type { MotionPreviewProps } from "../contracts";

const SSR_PLACEHOLDER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor"/></svg>';

export const MotionPreview = forwardRef<SvgMotionHandle, MotionPreviewProps>(
  function MotionPreview(
    {
      source,
      label,
      preset = "draw",
      duration = 1200,
      autoplay = false,
      loop = false,
      compact = false,
      className = "",
      easing = "ease-in-out",
      stagger = "auto",
      revision = 0,
      onReady,
      onFinish,
      onCancel,
      onError,
      onStatus,
    },
    forwardedRef,
  ) {
    const innerRef = useRef<SvgMotionHandle>(null);
    const replayFrame = useRef<number | null>(null);
    useEffect(
      () => () => {
        if (replayFrame.current !== null) {
          window.cancelAnimationFrame(replayFrame.current);
          replayFrame.current = null;
        }
      },
      [loop, revision],
    );
    useImperativeHandle(
      forwardedRef,
      () => ({
        get svg() {
          return innerRef.current?.svg ?? null;
        },
        get controller() {
          return innerRef.current?.controller ?? null;
        },
      }),
      [],
    );
    const resolvedSource = useMemo(() => {
      if (typeof source !== "string" || source.trimStart().startsWith("<"))
        return source;
      if (typeof window === "undefined") return SSR_PLACEHOLDER;
      return new URL(source, window.location.href);
    }, [source]);

    return (
      <div
        className={`motion-preview ${compact ? "motion-preview--compact" : ""} ${className}`.trim()}
        data-motion-preview
      >
        <SvgMotion
          key={revision}
          ref={innerRef}
          source={resolvedSource}
          preset={preset}
          duration={duration}
          autoplay={autoplay}
          easing={easing}
          stagger={stagger}
          svgProps={{ role: "img", "aria-label": label }}
          onReady={(handle) => {
            onReady?.(handle);
            onStatus?.(
              handle.controller?.state ?? "loading",
              handle.controller,
            );
          }}
          onFinish={() => {
            onFinish?.();
            onStatus?.("finished", innerRef.current?.controller ?? null);
            if (
              loop &&
              !window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ) {
              if (replayFrame.current !== null) {
                window.cancelAnimationFrame(replayFrame.current);
              }
              replayFrame.current = window.requestAnimationFrame(() => {
                replayFrame.current = null;
                try {
                  innerRef.current?.controller?.restart();
                  onStatus?.(
                    innerRef.current?.controller?.state ?? "loading",
                    innerRef.current?.controller ?? null,
                  );
                } catch (error) {
                  onError?.(error);
                  onStatus?.("error", innerRef.current?.controller ?? null);
                }
              });
            }
          }}
          onCancel={() => {
            onCancel?.();
            onStatus?.("cancelled", innerRef.current?.controller ?? null);
          }}
          onError={(error) => {
            onError?.(error);
            onStatus?.("error", innerRef.current?.controller ?? null);
          }}
        />
      </div>
    );
  },
);
