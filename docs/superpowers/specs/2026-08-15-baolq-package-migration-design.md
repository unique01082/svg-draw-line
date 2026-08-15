# `@baolq/svg-motion` package migration design

## Goal

Make `@baolq/svg-motion` the single canonical npm identity for SVG Motion while
preserving the existing `0.1.0` runtime, public API, React entry point, and
versioned documentation line.

The migration replaces the published `@baole-space/svg-motion` identity; it
does not introduce a compatibility fork or a second maintained release line.

## Package identity

- Publish the unchanged library API as `@baolq/svg-motion@0.1.0`.
- Keep the root and `@baolq/svg-motion/react` export contracts unchanged apart
  from their package specifiers.
- Rename the private documentation application to
  `@baolq/svg-motion-docs`.
- Update package metadata, badges, links, release contracts, consumer fixtures,
  lockfiles, documentation examples, API content, and CI to use the new scope.
- Update repository metadata from `unique01082/svg-draw-line` to
  `unique01082/svg-motion`.
- Keep `svg-motion.baole.space`, `/docs/0.1/*`, and package version `0.1.0`.

## Release migration

The new package is published only after the renamed source passes the complete
library, browser, documentation, package-consumer, API-reflection, security,
and Docker verification matrix. Publication uses public access and provenance.

After the registry confirms `@baolq/svg-motion@0.1.0` is installable and its
root and `/react` entries work from the registry tarball, deprecate
`@baole-space/svg-motion@0.1.0` with the message:

> Moved to @baolq/svg-motion

The old package is not unpublished and receives no later releases. This keeps
existing installations reproducible while directing new users to the canonical
scope.

## Documentation and consumers

All authored installation commands and imports use `@baolq/svg-motion`.
The production docs application continues to consume the published registry
package rather than a workspace link. Its API snapshot continues to reflect
the built public declarations and remains attached to the immutable `0.1`
documentation line.

Vanilla, React, tree-shaking, SSR, and browser consumers install the renamed
tarball. Tests assert that no active package metadata, generated documentation,
or release workflow still names the old scope except the intentional migration
notice and historical design records.

## Release automation

GitHub workflow and README instructions target the repository
`unique01082/svg-motion` and package `@baolq/svg-motion`. The Trusted Publisher
configuration must match that repository and the existing publish workflow.
The migration does not expose credentials in source or logs.

If authenticated npm CLI publication is unavailable, publication pauses before
external mutation; source migration and verification can still complete. The
old package is deprecated only after the new registry artifact has been
verified.

## Verification

- Package contract, exports, types, SSR import, and exact tarball contents.
- Unit and security suites plus native Chromium, Firefox, and WebKit tests.
- Packed Vanilla, React, and tree-shaking consumers on all three browsers.
- Documentation unit, component, production browser, prerender, link, SEO,
  API-reflection, and 21-specimen tests.
- Docker build and runtime smoke checks.
- Registry verification for package metadata, public access, provenance,
  installability, and root plus `/react` imports.
- Registry verification that the old `0.1.0` release carries the migration
  deprecation message only after the new package succeeds.

## Non-goals

- No runtime or public API behavior changes.
- No version bump beyond the new package's initial `0.1.0` release.
- No dual publishing or continued maintenance under the old scope.
- No unpublish of `@baole-space/svg-motion`.
- No change to the documentation hostname or versioned URL structure.
