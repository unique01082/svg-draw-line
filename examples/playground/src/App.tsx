import { SvgMotion } from "@baole-space/svg-motion/react";
import { DEFAULT_FIXTURE } from "./fixtures";

export function App() {
  return (
    <main>
      <h1>SVG Motion Lab</h1>
      <SvgMotion
        source={DEFAULT_FIXTURE.source}
        preset={DEFAULT_FIXTURE.preset}
        svgProps={{ "aria-label": DEFAULT_FIXTURE.title }}
      />
    </main>
  );
}
