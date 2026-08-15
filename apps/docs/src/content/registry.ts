import GettingStarted from "../../content/0.1/getting-started.mdx";
import Core from "../../content/0.1/core.mdx";
import Motion from "../../content/0.1/motion.mdx";
import ReactGuide from "../../content/0.1/react.mdx";
import Guides from "../../content/0.1/guides.mdx";
import Reference from "../../content/0.1/reference.mdx";

export const contentRegistry = {
  "0.1": {
    "getting-started": GettingStarted,
    core: Core,
    motion: Motion,
    react: ReactGuide,
    guides: Guides,
    reference: Reference,
  },
} as const;
