export type PresetName = "draw" | "fade" | "scale" | "stagger" | "pulse";

export interface DemoFixture {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly capability: readonly string[];
  readonly preset: PresetName;
  readonly source: string;
}

export const DEMO_FIXTURES: readonly DemoFixture[] = [
  {
    id: "geometry-atlas",
    title: "Geometry atlas",
    description: "Paths and every primitive draw with one controller.",
    capability: [
      "path",
      "line",
      "polyline",
      "polygon",
      "circle",
      "ellipse",
      "rect",
    ],
    preset: "draw",
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img"><title>Geometry atlas</title><g fill="none" stroke="#1757d7" stroke-width="8"><path d="M48 88C96 24 152 152 206 78"/><line x1="250" y1="45" x2="330" y2="115"/><polyline points="370 112 410 45 450 112"/><polygon points="510 112 550 45 590 112"/><circle cx="90" cy="250" r="45"/><ellipse cx="230" cy="250" rx="62" ry="38"/><rect x="350" y="205" width="100" height="90" rx="18"/></g></svg>`,
  },
  {
    id: "layered-signal",
    title: "Layered signal",
    description:
      "Gradient, mask, clip path, and filter references stay intact.",
    capability: ["gradient", "mask", "clip-path", "filter"],
    preset: "scale",
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img"><title>Layered signal</title><defs><linearGradient id="g"><stop stop-color="#1757d7"/><stop offset="1" stop-color="#ff6846"/></linearGradient><mask id="m"><rect width="640" height="360" fill="white"/><circle cx="320" cy="180" r="58" fill="black"/></mask><clipPath id="c"><rect x="80" y="55" width="480" height="250" rx="48"/></clipPath><filter id="f"><feGaussianBlur stdDeviation="5"/></filter></defs><g clip-path="url(#c)" mask="url(#m)"><circle cx="320" cy="180" r="170" fill="url(#g)"/><path d="M75 220C180 60 460 300 575 125" fill="none" stroke="#0b1739" stroke-width="18" filter="url(#f)"/></g></svg>`,
  },
  {
    id: "fallback-study",
    title: "Fallback study",
    description: "Text and embedded bitmap leaves fade while geometry draws.",
    capability: ["text", "image", "fallback"],
    preset: "fade",
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img"><title>Fallback study</title><rect x="52" y="52" width="536" height="256" rx="32" fill="#eef3ff"/><image x="90" y="96" width="64" height="64" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII="/><text x="188" y="142" font-family="system-ui" font-size="38" fill="#0b1739">SVG / MOTION</text><path d="M90 267H550" stroke="#ff6846" stroke-width="8"/></svg>`,
  },
  {
    id: "constellation",
    title: "Constellation sequence",
    description: "Visual leaves enter in deterministic document order.",
    capability: ["stagger", "document-order", "multi-element"],
    preset: "stagger",
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img"><title>Constellation sequence</title><g fill="#1757d7"><circle cx="100" cy="220" r="18"/><circle cx="190" cy="105" r="24"/><circle cx="300" cy="185" r="15"/><circle cx="415" cy="85" r="21"/><circle cx="530" cy="215" r="27"/></g><path d="M100 220L190 105 300 185 415 85 530 215" fill="none" stroke="#ff6846" stroke-width="5"/></svg>`,
  },
  {
    id: "pulse-orbit",
    title: "Pulse orbit",
    description: "A complete composition scales around its visual center.",
    capability: ["pulse", "scale", "transform-origin"],
    preset: "pulse",
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img"><title>Pulse orbit</title><circle cx="320" cy="180" r="112" fill="#eef3ff" stroke="#1757d7" stroke-width="6"/><circle cx="320" cy="180" r="52" fill="#ff6846"/><path d="M320 35v52M320 273v52M175 180h52M413 180h52" stroke="#0b1739" stroke-width="8"/><circle cx="411" cy="115" r="18" fill="#1757d7"/></svg>`,
  },
] as const;

export const DEFAULT_FIXTURE = DEMO_FIXTURES[0]!;

export function fixtureById(id: string): DemoFixture {
  return DEMO_FIXTURES.find((fixture) => fixture.id === id) ?? DEFAULT_FIXTURE;
}
