# Contributing

Thank you for helping improve `@baole-space/svg-motion`. Contributions should preserve its small, browser-native core, secure defaults, and framework-independent public API.

## Requirements

- Node.js 22 or newer
- pnpm 10.33.0, enabled through Corepack
- Chromium, Firefox, and WebKit binaries supported by Playwright

## Local setup

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm verify
```

`pnpm verify` checks formatting, linting, strict TypeScript and NodeNext consumers, unit and security regressions, the three-browser Playwright matrix, the ESM/declaration build, package contents, tree-shaking, and packed Vanilla/React consumers.

Use focused commands while iterating:

```sh
pnpm test
pnpm test:browser
pnpm typecheck
pnpm build
pnpm test:consumer
```

## Development expectations

- Add a failing regression test before changing behavior.
- Keep diagnostics and typed error messages free of untrusted source content.
- Test security-sensitive SVG parsing against scripts, external resources, CSS URLs, namespaces, and DOM clobbering.
- Test animation behavior with native Web Animations API and `getTotalLength()` in Chromium, Firefox, and WebKit when browser semantics matter.
- Preserve caller-owned SVG nodes and restore all temporary styles and animations after completion, cancellation, failure, or destruction.
- Do not add runtime dependencies or expand the public API without explaining the need and compatibility impact.

## Pull request workflow

1. Create a focused branch from `master`.
2. Make the smallest coherent change with tests and documentation.
3. Run `pnpm verify` and `pnpm audit --prod`.
4. Open a Pull request describing the user-visible outcome, security implications, and verification evidence.

By contributing, you agree that your work is licensed under the repository's [MIT License](./LICENSE).
