# Local Motion Lab Design

Date: 2026-08-15
Status: Approved

## Goal

Create a polished local demo that installs and exercises the published
`@baole-space/svg-motion@0.1.0` package. The demo must make the library's core
capabilities easy to explore without becoming part of the library build or
published npm package.

## Product shape

Use a single-page "Motion Lab" layout. The interactive playground is the
primary experience and a showcase gallery follows it on the same page. Gallery
examples can be loaded into the playground so visitors can move naturally from
seeing an effect to inspecting and controlling it.

The page is an independent React + Vite consumer under
`examples/playground`. It imports the package by its public root and `/react`
entry points, never from `src`. Its own package manifest pins the released
`0.1.0` version, making the demo a realistic consumer and keeping demo-only
dependencies out of the library package.

## Visual direction

The visual language is a technical SVG plotting desk rather than a generic
dashboard. A light graph-paper field, precise navy typography, cobalt controls,
and coral status accents make paths and motion the visual focus. Panels use
thin drafting lines, measured spacing, and restrained elevation. Typography,
labels, focus states, and contrast remain readable at desktop and mobile sizes.

Motion in the surrounding UI is minimal so it does not compete with the SVG
under inspection. The demo respects reduced-motion preferences for its own
decorative transitions, while library animations remain under explicit user
control.

## Playground

The playground contains:

- a large live SVG stage;
- a source editor for pasted markup;
- URL loading and local SVG file upload;
- preset controls for `draw`, `fade`, `scale`, `stagger`, and `pulse`;
- duration, easing, stagger, and autoplay controls;
- controller actions for play, pause, reverse, restart, finish, and cancel;
- a 0–100% seek slider;
- current lifecycle status, safe diagnostics, and typed errors;
- an accessible live region for load and error feedback.

Source or option changes remount the React adapter cleanly. Imperative transport
controls use the exposed controller rather than creating independent animation
logic. The source editor includes a reset path so malformed input never traps
the visitor in an unusable state.

## Gallery

The gallery demonstrates representative capabilities rather than repeating the
same icon. Fixtures cover:

- paths and primitive geometry;
- gradients, masks, clip paths, and filters;
- text and image fallback behavior;
- staggered multi-element artwork;
- scale and pulse presets.

Each card names the demonstrated capability and provides an "Open in Lab"
action. Examples are local, deterministic, and safe to use offline. They avoid
external resources and network-dependent artwork.

## Accessibility and responsive behavior

All controls have programmatic labels, visible keyboard focus, adequate target
sizes, and meaningful disabled states. Icon-only transport controls also expose
accessible names. The stage SVG receives a useful accessible name. Status and
errors are announced without repeatedly interrupting the user.

At narrow widths, the two-column lab becomes a single column, transport
controls wrap, and the gallery becomes a compact card list. No essential
control depends on hover. The layout must work at a 375-pixel viewport without
horizontal page scrolling.

## Repository integration

Add a root `demo` script that launches the example, while retaining an
independent example manifest and lockfile. The root library build, exports,
package allowlist, tests, and release artifacts remain unchanged. Documentation
will state that the demo uses the published npm package and provide its local
run command.

## Verification

Verification includes:

- clean install of the demo's pinned registry dependency;
- TypeScript and production Vite build of the demo;
- the existing root `pnpm verify` gate;
- rendered browser checks for all presets and controller actions;
- paste, invalid markup, gallery-to-lab, and local upload flows;
- keyboard-accessible controls, accessible names, console cleanliness, and a
  375-pixel viewport check;
- confirmation that the built demo resolves package exports rather than local
  source files.

## Non-goals

The demo is not a documentation site, hosted product, Studio editor, timeline
authoring tool, icon pack, or new library API. It does not add morphing or
plugins and does not change `@baole-space/svg-motion` runtime behavior.
