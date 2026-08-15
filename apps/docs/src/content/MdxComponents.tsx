import type { MDXComponents } from "mdx/types";
import { useRef, useState } from "react";
import type { SvgMotionHandle } from "@baole-space/svg-motion/react";
import { specimenBySlug } from "../specimens/specimens";
import { ApiTable } from "./ApiTable";
import { CodeBlock } from "../components/CodeBlock";
import { MotionPreview } from "../components/MotionPreview";

function MotionExample({
  specimen,
  preset,
}: {
  readonly specimen: string;
  readonly preset: "draw" | "fade" | "scale" | "stagger" | "pulse";
}) {
  const item = specimenBySlug(specimen);
  const ref = useRef<SvgMotionHandle>(null);
  const [revision, setRevision] = useState(0);
  return (
    <section
      className="runnable-example"
      aria-label={`${item.label} live example`}
    >
      <header>
        <span>LIVE PACKAGE PREVIEW</span>
        <button
          type="button"
          onClick={() => {
            ref.current?.controller?.restart();
            setRevision((value) => value + 1);
          }}
        >
          Replay
        </button>
      </header>
      <MotionPreview
        ref={ref}
        source={item.source}
        label={item.label}
        preset={preset}
        revision={revision}
        autoplay
        compact
      />
    </section>
  );
}

function Callout({ children }: { readonly children?: React.ReactNode }) {
  return <aside className="callout">{children}</aside>;
}

export const mdxComponents: MDXComponents = {
  pre: CodeBlock,
  MotionExample,
  ApiTable,
  Callout,
};
