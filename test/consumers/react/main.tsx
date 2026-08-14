import { SvgMotion, type SvgMotionHandle } from "@baole-space/svg-motion/react";
import { createRef } from "react";
import { createRoot } from "react-dom/client";

const handle = createRef<SvgMotionHandle>();
createRoot(document.querySelector("#root")!).render(
  <SvgMotion
    ref={handle}
    autoplay={false}
    source='<svg xmlns="http://www.w3.org/2000/svg"><circle r="8" /></svg>'
    svgProps={{ "aria-label": "Consumer fixture" }}
  />,
);
