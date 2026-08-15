# Local Motion Lab final-fixes report

Date: 2026-08-15
Base: `945a9c4`

## Scope

Changed only the isolated playground and the pull-request CI workflow. The
library runtime under `src/` and `.github/workflows/publish.yml` are unchanged.

## TDD evidence

### RED

Before production edits:

```sh
pnpm --dir examples/playground test -- styles.test.ts
pnpm --dir examples/playground exec playwright test --project=chromium --grep 'autoplay|remounts every preset|reports invalid markup|loads every gallery specimen|custom accessible'
```

The contrast audit failed with coral on paper at `3.1240133784397432:1`, below
the required `4.5:1`. All five focused browser regressions failed for the
expected missing behavior: no Autoplay control, no ready/remount signal,
enabled transport in the invalid-SVG state, no deterministic gallery load
signal, and a stale fixture accessible name after custom markup.

### GREEN

The focused browser pass initially exposed two test-harness races: a ready
sequence sampled after an already-completed duration remount, and an absent
gallery button `aria-label`. Those assertions were corrected without changing
product behavior. A transient `loading` text assertion was also removed after
the 250 ms debounce legitimately advanced to `error`; the test retains the
immediate disabled assertion and the error-state disabled assertion.

Final focused run:

```sh
pnpm --dir examples/playground test -- styles.test.ts
pnpm --dir examples/playground exec playwright test --project=chromium --grep 'autoplay|remounts every preset|reports invalid markup|loads every gallery specimen|custom accessible'
pnpm --dir examples/playground build
```

Result: 3 Vitest tests passed, 5 focused Chromium browser tests passed, and
the strict TypeScript/Vite production build passed.

## Delivered review fixes

- Added typed `autoplay: boolean` state and a labelled checkbox; the primary
  `SvgMotion` receives it. Browser coverage proves `false` stays `idle` and
  `true` starts `running`.
- Added a scoped `data-ready-sequence` on the lab stage. It is an application
  readiness signal, not a debug global. Browser tests wait for it after every
  remount, collect console/page errors through `afterEach`, iterate all five
  gallery actions, and check real native WAAPI seek time plus reverse playback
  rate.
- Disabled seek and all transport buttons while loading, erroring, or without
  a controller. Immediate post-edit and invalid-SVG tests cover their disabled
  semantics and reset recovery.
- Added CI steps for the nested frozen install, demo build, nested Chromium
  installation, and combined demo unit/browser test command; the existing
  full root Playwright install and `pnpm verify` remain in place.
- Darkened coral to `#a63b28` and muted text to `#535f73`; a deterministic
  CSS-token test verifies both against paper at >= `4.5:1`.
- Cleared and nulled the markup debounce on mode/fixture cancellation and
  component unmount; typed lifecycle state as `SvgMotionStatus`; made
  source-mode labels 44 px minimum hit targets; and rename edited markup to
  `Custom SVG markup` rather than retaining a fixture name.

## Final verification

```sh
pnpm demo:test
pnpm demo:build
pnpm --dir examples/playground install --frozen-lockfile
pnpm verify
actionlint .github/workflows/ci.yml
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "YAML parse: ok"'
pnpm exec prettier --check .github/workflows/ci.yml
git diff --check
```

Results:

- `pnpm demo:test`: 3 Vitest tests and 14 Chromium/mobile-Chromium Playwright
  tests passed with no captured console or page errors.
- `pnpm demo:build`: passed strict TypeScript and Vite build.
- Nested frozen install: lockfile current and install completed successfully.
- `pnpm verify`: format, lint, all typechecks, 229 root Vitest tests, 81 root
  Chromium/Firefox/WebKit Playwright tests, root build, package verification,
  and consumer smoke passed.
- `actionlint`, Ruby YAML parse, Prettier workflow check, and `git diff --check`
  passed.

## Concerns

None. The deliberate `loading` state is short-lived during the 250 ms markup
debounce, so browser coverage asserts its directly observable disabled result
rather than depending on scheduler timing for the status text.
