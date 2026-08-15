import type { DocPageMeta } from "../contracts";
import { docsVersions } from "../versions";

const pageDefinitions = [
  {
    slug: "getting-started",
    section: "Start",
    title: "Getting started",
    description: "Install SVG Motion and animate the first safe SVG source.",
    headings: [
      { id: "install", label: "Install" },
      { id: "first-animation", label: "First animation" },
      { id: "source-types", label: "Source types" },
    ],
  },
  {
    slug: "core",
    section: "Core",
    title: "Core API",
    description: "Prepare, animate and mount SVG sources without a framework.",
    headings: [
      { id: "prepare-svg", label: "prepareSvg" },
      { id: "animate-svg", label: "animateSvg" },
      { id: "mount-svg-motion", label: "mountSvgMotion" },
    ],
  },
  {
    slug: "motion",
    section: "Motion",
    title: "Motion system",
    description: "Presets, timing, stagger and controller lifecycle.",
    headings: [
      { id: "presets", label: "Presets" },
      { id: "timing", label: "Timing" },
      { id: "controller", label: "Controller" },
    ],
  },
  {
    slug: "react",
    section: "React",
    title: "React adapter",
    description: "Use SvgMotion and useSvgMotion with SSR-safe imports.",
    headings: [
      { id: "component", label: "SvgMotion" },
      { id: "hook", label: "useSvgMotion" },
      { id: "ssr", label: "SSR" },
    ],
  },
  {
    slug: "guides",
    section: "Guides",
    title: "Production guides",
    description: "Security, CORS, CSP, accessibility and resilient loading.",
    headings: [
      { id: "sanitization", label: "Sanitization" },
      { id: "cors-csp", label: "CORS and CSP" },
      { id: "accessibility", label: "Accessibility" },
    ],
  },
  {
    slug: "reference",
    section: "Reference",
    title: "API reference",
    description: "Public types, errors, diagnostics and browser support.",
    headings: [
      { id: "public-exports", label: "Public exports" },
      { id: "errors", label: "Errors and diagnostics" },
      { id: "browser-support", label: "Browser support" },
    ],
  },
] as const;

export const docPages: readonly DocPageMeta[] = pageDefinitions.map((page) => ({
  ...page,
  version: "0.1",
}));

export function resolveDocPage(
  version: string,
  slug: string,
): DocPageMeta | null {
  const resolvedVersion = version === "latest" ? "0.1" : version;
  return (
    docPages.find(
      (page) => page.version === resolvedVersion && page.slug === slug,
    ) ?? null
  );
}

export const knownRoutes = [
  "/",
  "/playground",
  "/changelog",
  ...docsVersions.flatMap((version) =>
    version.supportedRoutes.map((slug) => `/docs/${version.id}/${slug}`),
  ),
] as const;
