# @baolq/svg-motion

[![CI](https://github.com/unique01082/svg-motion/actions/workflows/ci.yml/badge.svg)](https://github.com/unique01082/svg-motion/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@baolq/svg-motion)](https://www.npmjs.com/package/@baolq/svg-motion)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Safe, browser-native animation for any SVG. `@baolq/svg-motion` is an ESM-only TypeScript library with a framework-agnostic core and an optional React adapter.

| Capability              | What it provides                                                           |
| ----------------------- | -------------------------------------------------------------------------- |
| Any SVG source          | Markup, URL, `File`, `Blob`, or an existing `SVGSVGElement`                |
| Framework-agnostic      | Prepare, animate, or mount SVGs without a UI framework                     |
| React adapter           | `<SvgMotion>` and `useSvgMotion()` from a separate optional entry          |
| Secure by default       | Sanitization, resource hardening, byte limits, and namespaced internal IDs |
| Web Animations API      | Native playback control with no Anime.js dependency                        |
| Verified across engines | Real-browser coverage in evergreen Chromium, Firefox, and WebKit           |

[Documentation](https://svg-motion.baole.space/docs/0.1/getting-started) · [Playground](https://svg-motion.baole.space/playground) · [Install](#install) · [Vanilla](#vanilla) · [React](#react) · [Security](#security-cors-and-csp) · [Contributing](./CONTRIBUTING.md) · [Security policy](./SECURITY.md) · [Changelog](./CHANGELOG.md)

## Install

```sh
pnpm add @baolq/svg-motion
```

Add `react >=18` only when using the React entry.

## Documentation site

The production documentation application lives in `apps/docs`. It installs the
published `0.1.0` package from the registry rather than linking repository source:

```bash
pnpm --dir apps/docs install --frozen-lockfile
pnpm docs:dev
```

Use `pnpm docs:test` for unit, prerender and three-engine browser checks.
`pnpm docs:docker:smoke` verifies the production nginx image. See the
[deployment guide](./docs/deployment/svg-motion.baole.space.md) for the later
self-hosted rollout; repository implementation does not modify live DNS or servers.

## Vanilla

```ts
import { mountSvgMotion } from "@baolq/svg-motion";

const container = document.querySelector("#logo")!;
const motion = await mountSvgMotion(container, "/logo.svg", {
  preset: "draw",
  duration: 1200,
});

motion.controller.pause();
motion.controller.seek(0.5);
motion.controller.play();

// Restores temporary styles, cancels animations and removes the mounted SVG.
motion.destroy();
```

For a caller-owned SVG node, use `animateSvg(svg, options)`. To prepare without mounting, use `await prepareSvg(source, options)`.

## React

```tsx
import { useRef } from "react";
import { SvgMotion, type SvgMotionHandle } from "@baolq/svg-motion/react";

export function Logo() {
  const motion = useRef<SvgMotionHandle>(null);

  return (
    <SvgMotion
      ref={motion}
      source="/logo.svg"
      preset="draw"
      autoplay
      svgProps={{ "aria-label": "Bao Le" }}
      fallback={<span>Logo unavailable</span>}
    />
  );
}
```

`useSvgMotion(options)` returns `containerRef`, `svg`, `controller`, `status`, `error`, and `diagnostics` for custom render trees. Source changes are aborted and replaced; unmount destroys the active instance.

## Sources

`SvgSource` accepts:

- SVG markup strings
- same-origin or CORS-enabled URL strings and `URL` objects
- `File` and `Blob` values
- an `SVGSVGElement`

APIs accepting `SvgSource` always clone the artwork. `animateSvg()` is the only API that operates directly on a caller-provided node. The default size limit is 5 MiB and can be changed with `maxBytes`; remote loading accepts an `AbortSignal` through `prepareSvg()` and `mountSvgMotion()`.

## Motion API

Presets are `draw`, `fade`, `scale`, `stagger`, and `pulse`. Defaults are `draw`, autoplay, `duration: 1200`, `delay: 0`, `easing: "ease-in-out"`, one iteration, document order, and automatic staggering. Automatic staggering distributes starts across at most 600 ms; pass a millisecond number for a fixed step.

Options also include `direction`, `selector`, `order: "document" | "reverse"`, and `iterations`. Pulse repeats forever only when `iterations: Infinity` is explicit. During draw, text, image, use, and other visible leaf content fades; an SVG without drawable geometry falls back to a root fade and emits `NO_DRAWABLE_GEOMETRY`.

`SvgMotionController` exposes:

```ts
controller.play();
controller.pause();
controller.reverse();
controller.restart();
controller.finish();
controller.cancel();
controller.seek(0.5); // 0..1
controller.destroy();

controller.state;
await controller.finished;
controller.diagnostics;
```

`finish()` restores the original artwork at its final state. `cancel()` restores the initial artwork. `destroy()` cancels all animations and removes temporary inline styles. `SvgMotionInstance.destroy()` also removes the SVG appended by `mountSvgMotion()`.

Preparation failures are `SvgPreparationError` instances with a safe `code`: `ABORTED`, `FETCH_FAILED`, `INVALID_SVG`, `SANITIZATION_FAILED`, `SOURCE_TOO_LARGE`, `UNSUPPORTED_ENVIRONMENT`, or `UNSUPPORTED_SOURCE`. Diagnostics use `REMOVED_UNSAFE_CONTENT`, `REMOVED_EXTERNAL_REFERENCE`, and `NO_DRAWABLE_GEOMETRY` with counts only.

Animation failures are `SvgAnimationError` instances. Their safe `code` is `INVALID_SVG`, `UNSUPPORTED_ENVIRONMENT`, `ANIMATION_SETUP_FAILED`, or `ANIMATION_FAILED`. A synchronous setup failure makes `animateSvg()` throw; `mountSvgMotion()` preserves that typed error and removes the SVG it appended. If `play()`, `reverse()`, or `restart()` cannot create or activate a new run, the method throws while the new `controller.finished` rejects with the same typed error. An unexpected native completion failure changes `controller.state` to `failed`, restores the original artwork, removes owned animations, and rejects `controller.finished` with `SvgAnimationError`. Await or catch `controller.finished` when application behavior depends on completion.

## Security, CORS, and CSP

`trust: "sanitize"` is the default. It uses DOMPurify's SVG/filter profile plus stricter rules that remove scripts, event handlers, `foreignObject`, SMIL, external stylesheets/resources, unsafe CSS, and non-local `url(...)` references. Embedded PNG, JPEG, GIF, WebP, and AVIF data images are allowed; embedded SVG images are not. IDs and local references are namespaced for every prepared instance.

Use `trust: "trusted"` only for fully trusted SVG. Trusted mode skips filtering, so dangerous markup remains dangerous; it still clones the input, applies the byte limit, and namespaces IDs. Diagnostics contain only codes and counts, never source markup.

Remote SVG fetches follow browser CORS rules. Configure `connect-src` for SVG origins. If using embedded bitmap data URLs, allow the required `data:` image type in `img-src`. A strict `style-src-attr` policy may also affect SVG presentation attributes or temporary styles; validate the library under your deployed CSP.

## Accessibility and reduced motion

The React adapter preserves source `<title>` and valid semantic roles. Supplying `aria-label` or `aria-labelledby` makes the SVG an image. An SVG without an accessible name is marked `aria-hidden="true"`. The component creates no replay button, click behavior, or tab stop.

Reduced-motion policy belongs to the consumer in v0.1.0:

```ts
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
await mountSvgMotion(
  node,
  source,
  reduce ? { preset: "fade", duration: 0 } : {},
);
```

## Runtime support

The runtime targets evergreen Chromium, Firefox, and WebKit browsers with Web Animations API and `SVGGeometryElement.getTotalLength()`. Package imports are SSR-safe, but preparing, mounting, or animating SVG requires a browser DOM. The package does not include Anime.js or Ant Design.

## Verification

The repository keeps library, documentation, and delivery checks separate so a
passing package build cannot hide a docs or container regression. GitHub Actions
CI runs independent `library`, `docs`, and `docker` jobs on every push and pull
request.

| Scope                    | Command                  | Coverage                                                                       |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------ |
| Unit and contract        | `pnpm test`              | Core APIs, React adapter, typed errors, accessibility and security regressions |
| Native browser behavior  | `pnpm test:browser`      | Web Animations API and SVG geometry in Chromium, Firefox, and WebKit           |
| Packed-package consumers | `pnpm test:consumer`     | Tarball imports, strict types, tree-shaking, Vanilla and React consumers       |
| Complete library gate    | `pnpm verify`            | Format, lint, strict types, unit, browser, build and consumer checks           |
| Documentation site       | `pnpm docs:test`         | Routes, components, prerendered pages and browser flows                        |
| API snapshot             | `pnpm docs:api:check`    | Public root and React declarations remain aligned with documentation           |
| Docker delivery          | `pnpm docs:docker:smoke` | nginx health, deep links, caching and security headers                         |

Unit coverage includes the React adapter and security regressions as first-class
contracts. The CI badge at the top of this README always reflects the current
workflow result. Test totals are intentionally not hard-coded here because the
suite grows with every regression case.

## Releasing

Pull requests and pushes run `pnpm verify`. Tags matching `vX.Y.Z` run the same gates, reject a tag that differs from `package.json`, and publish with public access and provenance.

`@baolq/svg-motion@0.1.0` was published with provenance and supersedes the previous package identity, which now carries the migration notice. Releases authenticate through the [npm Trusted Publisher](https://docs.npmjs.com/trusted-publishers/) connection for `unique01082/svg-motion` and `publish.yml`; no npm token is stored in GitHub. Version tags use GitHub OIDC (`id-token: write`), verify the public registry artifact after bounded propagation retries, and retain provenance.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

[MIT](./LICENSE)
