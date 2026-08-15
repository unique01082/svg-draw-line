import type {
  SvgMotionController,
  SvgMotionPreset,
  SvgSource,
} from "@baolq/svg-motion";
import type { SvgMotionHandle, SvgMotionStatus } from "@baolq/svg-motion/react";

export interface DocsVersionMeta {
  readonly id: string;
  readonly packageVersion: string;
  readonly label: string;
  readonly isLatest: boolean;
  readonly supportedRoutes: readonly string[];
}

export interface DocPageMeta {
  readonly version: string;
  readonly slug: string;
  readonly section:
    "Start" | "Core" | "Motion" | "React" | "Guides" | "Reference";
  readonly title: string;
  readonly description: string;
  readonly headings: readonly { id: string; label: string }[];
}

export interface Specimen {
  readonly slug: string;
  readonly label: string;
  readonly chineseName: string;
  readonly source: string;
  readonly file: string;
  readonly sha256: string;
}

export interface MotionPreviewProps {
  readonly source: SvgSource;
  readonly label: string;
  readonly preset?: SvgMotionPreset;
  readonly duration?: number;
  readonly autoplay?: boolean;
  readonly compact?: boolean;
  readonly className?: string;
  readonly easing?: string;
  readonly stagger?: "auto" | number;
  readonly revision?: number;
  readonly onReady?: (handle: SvgMotionHandle) => void;
  readonly onFinish?: () => void;
  readonly onCancel?: () => void;
  readonly onError?: (error: unknown) => void;
  readonly onStatus?: (
    status: SvgMotionStatus,
    controller: SvgMotionController | null,
  ) => void;
}
