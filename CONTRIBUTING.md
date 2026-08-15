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

## Documentation development

The versioned site is an independent application that consumes the published
package from npm:

```sh
pnpm --dir apps/docs install --frozen-lockfile
pnpm docs:dev
pnpm docs:test
pnpm docs:api:check
pnpm docs:docker:smoke
```

Content for a published minor line is immutable under `apps/docs/content/<minor>`.
Create a future snapshot with `pnpm docs:scaffold -- 0.2 0.2.0`; the command
refuses to overwrite an existing line. Keep the route manifest, API reflection,
canonical URLs and nginx `latest` redirect synchronized.

The 21 licensed specimen SVGs are local documentation assets. Do not alter their
paths, fills or viewboxes. Any collection update must also update checksums,
provenance and `THIRD_PARTY_NOTICES.md` while keeping those assets outside the npm
package allowlist.

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
