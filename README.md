# @baole-space/svg-motion

Animate arbitrary SVG documents with a small browser-first TypeScript API. The package is ESM-only and includes a framework-agnostic core plus an optional React adapter.

## Install

```sh
pnpm add @baole-space/svg-motion
```

Add `react >=18` only when using the React entry.

## Vanilla

```ts
import { mountSvgMotion } from "@baole-space/svg-motion";

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
import { SvgMotion, type SvgMotionHandle } from "@baole-space/svg-motion/react";

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

## Releasing

Pull requests and pushes run `pnpm verify`. Tags matching `vX.Y.Z` run the same gates, reject a tag that differs from `package.json`, and publish with public access and provenance.

For the first `0.1.0` release, make the GitHub repository public, confirm control of the npm `@baole-space` scope, add a short-lived granular npm token as the `NPM_TOKEN` Actions secret, then push `v0.1.0`. Configure [npm Trusted Publisher](https://docs.npmjs.com/trusted-publishers/) for `unique01082/svg-draw-line` and the `publish.yml` workflow, restricted to `npm publish`. Revoke and remove the bootstrap token afterward; later tags authenticate through GitHub OIDC (`id-token: write`) and retain provenance.

## License

[MIT](./LICENSE)
