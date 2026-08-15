# Local Motion Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and locally run a polished React playground plus gallery that consumes the published `@baolq/svg-motion@0.1.0` package.

**Architecture:** Create an independent Vite consumer in `examples/playground` with its own manifest and lockfile. Keep deterministic SVG fixtures and state helpers separate from the React shell, use `<SvgMotion>` for rendering and its public ref/controller for transport, and verify the real registry package in Playwright rather than importing library source.

**Tech Stack:** React 18, TypeScript 5.9, Vite 8, `@baolq/svg-motion@0.1.0`, Vitest 4, Playwright 1.62, CSS.

## Global Constraints

- The demo lives under `examples/playground` and is excluded from the npm package allowlist.
- The demo pins the published `@baolq/svg-motion` version `0.1.0` and never imports `../../src` or another local package path.
- The page combines one interactive playground with a gallery on the same route.
- Supported source flows are SVG markup, URL, and local SVG file upload.
- Supported presets are `draw`, `fade`, `scale`, `stagger`, and `pulse`.
- The UI exposes play, pause, reverse, restart, finish, cancel, and seek controls.
- Fixtures are local, deterministic, safe, and do not require external resources.
- The page works without horizontal overflow at a 375-pixel viewport.
- Demo-only transitions respect `prefers-reduced-motion`; the library animation remains explicitly controllable.
- Existing library exports, package contents, runtime behavior, and release artifacts remain unchanged.

---

## File structure

- `examples/playground/package.json`: isolated registry consumer and demo scripts.
- `examples/playground/pnpm-lock.yaml`: reproducible install of the released package.
- `examples/playground/index.html`: Vite entry document and metadata.
- `examples/playground/tsconfig.json`: strict browser TypeScript configuration.
- `examples/playground/vite.config.ts`: local dev/build configuration.
- `examples/playground/playwright.config.ts`: browser test server and desktop/mobile projects.
- `examples/playground/src/main.tsx`: React root only.
- `examples/playground/src/App.tsx`: lab/gallery composition and public adapter/controller integration.
- `examples/playground/src/fixtures.ts`: deterministic fixture catalog and source-mode types.
- `examples/playground/src/styles.css`: plotting-desk visual system and responsive behavior.
- `examples/playground/test/demo.spec.ts`: rendered behavior, accessibility, and console checks.
- `package.json`: root `demo`, `demo:build`, and `demo:test` convenience scripts.
- `README.md`: local demo instructions.

---

### Task 1: Isolated published-package consumer and fixture contract

**Files:**

- Create: `examples/playground/package.json`
- Create: `examples/playground/index.html`
- Create: `examples/playground/tsconfig.json`
- Create: `examples/playground/vite.config.ts`
- Create: `examples/playground/src/main.tsx`
- Create: `examples/playground/src/fixtures.ts`
- Create: `examples/playground/src/fixtures.test.ts`
- Create: `examples/playground/src/App.tsx`
- Create: `examples/playground/src/styles.css`

**Interfaces:**

- Produces: `PresetName`, `DemoFixture`, `DEMO_FIXTURES`, `DEFAULT_FIXTURE`, and `fixtureById(id)` for the application and browser tests.
- Produces: a minimal Vite app importing `SvgMotion` only from `@baolq/svg-motion/react`.

- [ ] **Step 1: Create the isolated manifest and strict toolchain**

```json
{
  "name": "@baolq/svg-motion-playground",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@baolq/svg-motion": "0.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "latest",
    "typescript": "^5.9.3",
    "vite": "^8.2.1",
    "vitest": "^4.1.10"
  }
}
```

Create `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `jsx: "react-jsx"`, DOM libraries, and `moduleResolution: "Bundler"`. Configure Vite with `react()` and `server.host = "127.0.0.1"`. The HTML document title is `SVG Motion Lab · baole.space` and mounts `<div id="root"></div>`.

- [ ] **Step 2: Write the failing fixture contract**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_FIXTURE, DEMO_FIXTURES, fixtureById } from "./fixtures";

describe("demo fixtures", () => {
  it("covers every public preset and planned SVG capability", () => {
    expect(new Set(DEMO_FIXTURES.map(({ preset }) => preset))).toEqual(
      new Set(["draw", "fade", "scale", "stagger", "pulse"]),
    );
    const capabilities = new Set(
      DEMO_FIXTURES.flatMap(({ capability }) => capability),
    );
    for (const capability of [
      "path",
      "circle",
      "gradient",
      "mask",
      "clip-path",
      "filter",
      "text",
      "image",
      "stagger",
      "pulse",
    ]) {
      expect(capabilities.has(capability)).toBe(true);
    }
    expect(
      DEMO_FIXTURES.some(({ source }) => source.includes("<linearGradient")),
    ).toBe(true);
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<mask"))).toBe(
      true,
    );
    expect(
      DEMO_FIXTURES.some(({ source }) => source.includes("<clipPath")),
    ).toBe(true);
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<filter"))).toBe(
      true,
    );
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<text"))).toBe(
      true,
    );
    expect(DEMO_FIXTURES.some(({ source }) => source.includes("<image"))).toBe(
      true,
    );
  });

  it("returns the default for unknown identifiers", () => {
    expect(fixtureById("missing")).toBe(DEFAULT_FIXTURE);
  });
});
```

- [ ] **Step 3: Run the fixture test and capture RED**

Run: `pnpm --dir examples/playground install && pnpm --dir examples/playground test`

Expected: FAIL because `src/fixtures.ts` has not been implemented.

- [ ] **Step 4: Implement deterministic fixture data**

```ts
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
```

Keep every fixture as complete valid SVG markup with a `viewBox`, an accessible `<title>`, only fragment-local references, and no remote URL.

- [ ] **Step 5: Add the smallest registry-importing React shell**

```tsx
import { SvgMotion } from "@baolq/svg-motion/react";
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
```

Mount this component from `main.tsx` using `createRoot`. Add only structural reset styles required to render the smoke page.

- [ ] **Step 6: Run GREEN gates and prove registry resolution**

Run: `pnpm --dir examples/playground test && pnpm --dir examples/playground build && rg -n 'resolution:.*svg-motion-0.1.0|@baolq/svg-motion@0.1.0' examples/playground/pnpm-lock.yaml`

Expected: fixture tests and build PASS; the lockfile resolves the npm tarball at exactly `0.1.0`.

- [ ] **Step 7: Commit**

```bash
git add examples/playground
git commit -m "feat: scaffold published-package motion demo"
```

---

### Task 2: Interactive playground and controller transport

**Files:**

- Modify: `examples/playground/src/App.tsx`
- Modify: `examples/playground/src/styles.css`
- Create: `examples/playground/playwright.config.ts`
- Create: `examples/playground/test/demo.spec.ts`

**Interfaces:**

- Consumes: `PresetName`, `DemoFixture`, `DEFAULT_FIXTURE`, and `fixtureById` from Task 1.
- Produces: labelled inputs with test ids `source-mode`, `source-editor`, `source-url`, `source-file`, `preset`, `duration`, `easing`, `stagger`, and `progress`.
- Produces: controller buttons with accessible names `Play`, `Pause`, `Reverse`, `Restart`, `Finish`, and `Cancel`.

- [ ] **Step 1: Configure browser tests and write the RED interaction suite**

```ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "SVG Motion Lab" }),
  ).toBeVisible();
  await expect.poll(() => errors).toEqual([]);
});

test("exercises all presets and transport controls", async ({ page }) => {
  for (const preset of ["draw", "fade", "scale", "stagger", "pulse"]) {
    await page.getByLabel("Preset").selectOption(preset);
    await expect(page.locator("[data-motion-status]")).not.toHaveText("error");
  }
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("paused");
  await page.getByLabel("Progress").fill("50");
  await page.getByRole("button", { name: "Reverse" }).click();
  await page.getByRole("button", { name: "Restart" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("finished");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-motion-status]")).toHaveText("cancelled");
});

test("reports invalid markup and can reset", async ({ page }) => {
  await page.getByLabel("SVG markup").fill("<svg><script>");
  await expect(page.getByRole("alert")).toContainText("INVALID_SVG");
  await page.getByRole("button", { name: "Reset source" }).click();
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toBeVisible();
});
```

Configure Playwright with `testDir: "./test"`, `baseURL: "http://127.0.0.1:4317"`, one Chromium desktop project, and a `webServer` running `pnpm dev --host 127.0.0.1 --port 4317` with `reuseExistingServer: false`.

- [ ] **Step 2: Run the interaction suite and capture RED**

Run: `pnpm --dir examples/playground test:e2e`

Expected: FAIL because the controls, live status, and error presentation do not exist.

- [ ] **Step 3: Implement the lab state and public adapter integration**

```tsx
const motionRef = useRef<SvgMotionHandle>(null);
const [sourceMode, setSourceMode] = useState<"markup" | "url" | "file">(
  "markup",
);
const [source, setSource] = useState<SvgSource>(DEFAULT_FIXTURE.source);
const [preset, setPreset] = useState<PresetName>(DEFAULT_FIXTURE.preset);
const [duration, setDuration] = useState(1200);
const [easing, setEasing] = useState("ease-in-out");
const [stagger, setStagger] = useState<"auto" | number>("auto");
const [status, setStatus] = useState("loading");
const [diagnostics, setDiagnostics] = useState<readonly SvgDiagnostic[]>([]);
const [error, setError] = useState<unknown>(null);

const run = (action: (controller: SvgMotionController) => void) => {
  const controller = motionRef.current?.controller;
  if (!controller) return;
  try {
    action(controller);
    setStatus(controller.state);
    setDiagnostics(controller.diagnostics);
  } catch (nextError) {
    setError(nextError);
    setStatus("error");
  }
};
```

Render `<SvgMotion key={sourceRevision} ref={motionRef}>` with `source`, `preset`, `duration`, `easing`, `stagger`, and `svgProps={{ role: "img", "aria-label": activeTitle }}`. Use `onReady`, `onFinish`, `onCancel`, and `onError` to publish lifecycle state. Every controller button calls `run`; the progress input calls `controller.seek(Number(value) / 100)`.

For markup changes, debounce remounting by 250 ms while keeping the textarea immediately editable. URL submission creates `new URL(value, window.location.href)`. File input stores the selected `File` directly. Reset restores `DEFAULT_FIXTURE` and markup mode.

- [ ] **Step 4: Implement the plotting-desk shell and responsive lab**

Define CSS custom properties for `--paper`, `--ink`, `--muted`, `--rule`, `--cobalt`, and `--coral`. Build the stage background with two linear gradients at 24-pixel and 120-pixel intervals. Use a two-column `minmax(18rem, 0.8fr) minmax(0, 1.2fr)` lab above 880 pixels, collapse to one column below it, and wrap transport controls. Add `:focus-visible` outlines, 44-pixel minimum interactive heights, `overflow-wrap: anywhere`, and a `@media (prefers-reduced-motion: reduce)` rule that disables demo UI transitions.

- [ ] **Step 5: Run focused GREEN gates**

Run: `pnpm --dir examples/playground test && pnpm --dir examples/playground test:e2e && pnpm --dir examples/playground build`

Expected: unit tests, Chromium interaction tests, strict TypeScript, and Vite production build all PASS with no console/page errors.

- [ ] **Step 6: Commit**

```bash
git add examples/playground
git commit -m "feat: add interactive SVG motion playground"
```

---

### Task 3: Capability gallery and source workflows

**Files:**

- Modify: `examples/playground/src/App.tsx`
- Modify: `examples/playground/src/styles.css`
- Modify: `examples/playground/test/demo.spec.ts`

**Interfaces:**

- Consumes: all fixture records from `DEMO_FIXTURES`.
- Produces: one article per fixture, accessible `Open <title> in Lab` actions, URL submission, and SVG file upload.

- [ ] **Step 1: Add failing gallery, URL, and upload browser tests**

```ts
test("loads every gallery specimen into the lab", async ({ page }) => {
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(5);
  await page
    .getByRole("button", { name: "Open Layered signal in Lab" })
    .click();
  await expect(page.getByRole("img", { name: "Layered signal" })).toBeVisible();
  await expect(page.getByLabel("Preset")).toHaveValue("scale");
});

test("loads URL and File sources", async ({ page }) => {
  await page.route("**/remote.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"><title>Remote</title><circle cx="8" cy="8" r="6"/></svg>',
    }),
  );
  await page.getByLabel("URL source").check();
  await page.getByLabel("SVG URL").fill("/remote.svg");
  await page.getByRole("button", { name: "Load URL" }).click();
  await expect(page.locator("[data-stage] svg title")).toHaveText("Remote");

  await page.getByLabel("File source").check();
  await page.getByLabel("SVG file").setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><title>Local</title><rect width="10" height="10"/></svg>',
    ),
  });
  await expect(page.locator("[data-stage] svg title")).toHaveText("Local");
});
```

- [ ] **Step 2: Run the source-flow suite and capture RED**

Run: `pnpm --dir examples/playground test:e2e --grep "gallery|URL and File"`

Expected: FAIL because gallery cards and source-mode UI are incomplete.

- [ ] **Step 3: Implement gallery cards with live package previews**

```tsx
<section aria-labelledby="gallery-title" className="gallery-section">
  <header>
    <p className="eyebrow">Specimen library · 05</p>
    <h2 id="gallery-title">One engine, different drawing systems.</h2>
  </header>
  <div className="gallery-grid">
    {DEMO_FIXTURES.map((fixture) => (
      <article className="specimen-card" key={fixture.id}>
        <div className="specimen-preview">
          <SvgMotion
            source={fixture.source}
            preset={fixture.preset}
            duration={900}
            svgProps={{ "aria-label": `${fixture.title} preview` }}
          />
        </div>
        <h3>{fixture.title}</h3>
        <p>{fixture.description}</p>
        <ul aria-label="Capabilities">
          {fixture.capability.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button type="button" onClick={() => openFixture(fixture)}>
          Open {fixture.title} in Lab
        </button>
      </article>
    ))}
  </div>
</section>
```

`openFixture` sets markup mode, source/editor content, preset, accessible title, clears error, increments the source revision, and scrolls the lab heading into view with `behavior: "smooth"` unless reduced motion is requested.

- [ ] **Step 4: Finish markup, URL, and File source switching**

Use a labelled radio group. Markup mode renders the editor, URL mode renders a URL input plus explicit submit button, and File mode renders `accept=".svg,image/svg+xml"`. Revoke no object URL because the public API accepts the `File` directly. Changing modes must not load until URL submit or file selection.

- [ ] **Step 5: Run GREEN gates**

Run: `pnpm --dir examples/playground test:e2e && pnpm --dir examples/playground build`

Expected: all gallery/source tests PASS, all five cards render through the released adapter, and the build contains `@baolq/svg-motion` code from `node_modules`.

- [ ] **Step 6: Commit**

```bash
git add examples/playground
git commit -m "feat: add SVG motion capability gallery"
```

---

### Task 4: Accessibility, mobile QA, and repository integration

**Files:**

- Modify: `examples/playground/playwright.config.ts`
- Modify: `examples/playground/test/demo.spec.ts`
- Modify: `examples/playground/src/App.tsx`
- Modify: `examples/playground/src/styles.css`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**

- Produces: root commands `pnpm demo`, `pnpm demo:build`, and `pnpm demo:test`.
- Produces: desktop Chromium and mobile Chromium Playwright projects.

- [ ] **Step 1: Add failing accessibility and mobile assertions**

```ts
test("is keyboard labelled and mobile-safe", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("img", { name: "Geometry atlas" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("status")).toContainText(
    /idle|running|paused|finished|cancelled/,
  );
});
```

Add a second Playwright project named `mobile-chromium` using a 375×812 viewport, touch enabled, and reduced motion.

- [ ] **Step 2: Run mobile test and capture RED**

Run: `pnpm --dir examples/playground test:e2e --project=mobile-chromium`

Expected: FAIL on any missing live-region role, focus treatment, or horizontal overflow.

- [ ] **Step 3: Close accessibility and mobile gaps**

Give the lifecycle panel `role="status" aria-live="polite"`, errors a separate `role="alert"`, every field an explicit `<label>`, and every icon-bearing button visible text or `aria-label`. Ensure gallery chip lists have accessible names and decorative ruler marks use `aria-hidden="true"`. Add mobile rules that constrain textarea, SVG stage, grids, and control groups to `min-width: 0; max-width: 100%`.

- [ ] **Step 4: Add root commands and README instructions**

Add to root `package.json`:

```json
"demo": "pnpm --dir examples/playground dev",
"demo:build": "pnpm --dir examples/playground build",
"demo:test": "pnpm --dir examples/playground test && pnpm --dir examples/playground test:e2e"
```

Add a README section:

````md
## Local Motion Lab

The interactive playground and gallery install the published `0.1.0` package,
not the repository source:

```bash
pnpm --dir examples/playground install
pnpm demo
```
````

Open the URL printed by Vite. Use `pnpm demo:test` for its unit and browser checks.

````

- [ ] **Step 5: Run all verification gates**

Run:

```bash
pnpm --dir examples/playground install --frozen-lockfile
pnpm demo:build
pnpm demo:test
pnpm verify
git diff --check
````

Expected: demo unit/browser/build gates and the existing library verification all exit 0. Confirm the root tarball remains unchanged with `pnpm pack --dry-run` and does not list `examples/playground`.

- [ ] **Step 6: Start the local demo and perform rendered QA**

Run: `pnpm demo --host 127.0.0.1 --port 4317`

Open `http://127.0.0.1:4317/` and verify desktop plus 375×812 layouts, all five presets, transport state changes, invalid markup recovery, URL interception/file upload, keyboard focus, accessible names, and zero console/page errors. Keep the server running for the user.

- [ ] **Step 7: Commit**

```bash
git add package.json README.md examples/playground
git commit -m "docs: integrate local SVG motion lab"
```

---

## Self-review result

- Spec coverage: every approved product, visual, playground, gallery, accessibility, responsive, repository-integration, and verification requirement maps to Tasks 1–4.
- Placeholder scan: no `TBD`, deferred feature, or unspecified error-handling step remains. Fixture bodies are explicitly constrained, and all public control names and test ids are fixed.
- Type consistency: `PresetName`, `DemoFixture`, `SvgMotionHandle`, `SvgMotionController`, `SvgSource`, and `SvgDiagnostic` match the public package declarations and are used consistently across tasks.
- Scope: no library source, export, sanitizer, animation behavior, publishing workflow, or hosted demo is changed.
