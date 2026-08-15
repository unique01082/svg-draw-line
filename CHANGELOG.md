# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-15

### Added

- Framework-agnostic `prepareSvg`, `animateSvg`, and `mountSvgMotion` APIs for SVG markup, URL, `File`, `Blob`, and `SVGSVGElement` sources.
- Draw, fade, scale, stagger, and pulse presets backed by the browser Web Animations API.
- Playback controllers with play, pause, reverse, restart, finish, cancel, seek, destroy, state, diagnostics, and observable completion.
- Optional React component and hook entry at `@baole-space/svg-motion/react`, including lifecycle callbacks, typed status, source cancellation, SSR-safe imports, and accessible SVG defaults.
- DOMPurify-based sanitization with SVG-specific CSS and resource hardening, safe bitmap support, internal ID namespacing, byte limits, typed errors, and code/count-only diagnostics.
- Strict TypeScript declarations and ESM packaging for Node.js 22 and evergreen browsers.
- Unit, security, package, and native integration coverage across Chromium, Firefox, and WebKit, plus packed Vanilla and React consumer tests.

[0.1.0]: https://github.com/unique01082/svg-draw-line/releases/tag/v0.1.0
