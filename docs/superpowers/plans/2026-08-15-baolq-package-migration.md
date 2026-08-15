# `@baolq/svg-motion` Package Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@baole-space/svg-motion` with the single canonical package `@baolq/svg-motion@0.1.0`, publish and verify it, then deprecate the old release without changing runtime behavior.

**Architecture:** Rename the package identity and active consumers while preserving historical records. Before the registry package exists, verify docs and Docker from the exact packed candidate in an isolated temporary copy; after publication, regenerate the independent docs lockfile from npm and rerun production verification. Use the guarded one-time tag `npm-baolq-v0.1.0` because `v0.1.0` already belongs to the old package release.

**Tech Stack:** Node.js 22, pnpm 10.33.0, TypeScript 5.9, Vite 8, Vitest 4, Playwright 1.62, GitHub Actions, npm, Docker, nginx.

## Global Constraints

- Canonical package is exactly `@baolq/svg-motion@0.1.0`.
- Preserve root and `/react` exports and all runtime behavior.
- Rename the private docs app to `@baolq/svg-motion-docs`.
- Keep `svg-motion.baole.space` and `/docs/0.1/*` unchanged.
- Update active repository metadata to `unique01082/svg-motion`.
- Preserve historical specs/plans; active files must use the new identity.
- Docs production must depend on registry version `0.1.0`, never a workspace link.
- Publish the new package before deprecating the old package.
- Deprecation message is exactly `Moved to @baolq/svg-motion`.
- Never expose npm credentials in source, logs, or Git history.

---

### Task 1: Lock the canonical identity contract

**Files:**

- Create: `test/package-identity.test.ts`
- Modify: `test/package-contract.test.ts`
- Modify: `test/release-contract.test.ts`
- Modify: `test/docs-site-contract.test.ts`

**Interfaces:**

- Consumes: package manifests, active Markdown, workflows, imports, and consumer fixtures.
- Produces: tests allowing the old scope only in historical design records and the intentional migration notice.

- [ ] **Step 1: Write the failing identity test**

Create `test/package-identity.test.ts` with this recursive text-file scan:

```ts
import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");
const ignored = [
  "docs/superpowers/specs",
  "docs/superpowers/plans",
  "test/package-identity.test.ts",
  // Removed after the registry-backed lockfile is generated in Task 6.
  "apps/docs/pnpm-lock.yaml",
];

async function textFiles(directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = resolve(directory, entry.name);
        const name = relative(root, path);
        if ([".git", ".worktrees", "node_modules", "dist"].includes(entry.name))
          return [];
        if (
          ignored.some(
            (prefix) => name === prefix || name.startsWith(`${prefix}/`),
          )
        )
          return [];
        if (entry.isDirectory()) return textFiles(path);
        return [".json", ".md", ".mjs", ".ts", ".tsx", ".yml"].includes(
          extname(path),
        )
          ? [path]
          : [];
      }),
    )
  ).flat();
}

test("uses the canonical package identity in active files", async () => {
  const packageJson = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  );
  expect(packageJson.name).toBe("@baolq/svg-motion");
  expect(packageJson.repository.url).toBe(
    "https://github.com/unique01082/svg-motion.git",
  );
  const oldScope = `@${"baole-space"}/svg-motion`;
  const violations: string[] = [];
  for (const path of await textFiles()) {
    if ((await readFile(path, "utf8")).includes(oldScope))
      violations.push(relative(root, path));
  }
  expect(violations).toEqual([]);
});
```

The helper must skip `.git`, `.worktrees`, `node_modules`, generated `dist`, and binary files. Update existing contracts to expect `@baolq/svg-motion`, `@baolq/svg-motion/react`, `@baolq/svg-motion-docs`, and `unique01082/svg-motion`.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run test/package-identity.test.ts test/package-contract.test.ts test/release-contract.test.ts test/docs-site-contract.test.ts
```

Expected: failures identify the old package/repository metadata and imports.

- [ ] **Step 3: Commit the tests-only checkpoint**

```bash
git add test/package-identity.test.ts test/package-contract.test.ts test/release-contract.test.ts test/docs-site-contract.test.ts
git commit -m "test: require baolq package identity"
```

---

### Task 2: Rename the library and packed consumers

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`, `README.md`, `CONTRIBUTING.md`
- Modify: `scripts/consumer-smoke.mjs`
- Modify: `test/package-consumer.ts`
- Modify: `test/consumers/vanilla/package.json`
- Modify: `test/consumers/vanilla/main.ts`
- Modify: `test/consumers/vanilla/runtime.mjs`
- Modify: `test/consumers/react/package.json`
- Modify: `test/consumers/react/main.tsx`
- Modify: `test/consumers/react/runtime.mjs`
- Modify: `test/consumers/tree-shake/package.json`
- Modify: `test/consumers/tree-shake/main.ts`

**Interfaces:**

- Consumes: unchanged compiled root and `/react` APIs.
- Produces: a renamed nine-file tarball and Vanilla/React/tree-shaking consumers.

- [ ] **Step 1: Change package and repository identity**

Apply these exact `package.json` fields and leave exports, dependencies, peers, files, and runtime source unchanged:

```json
{
  "name": "@baolq/svg-motion",
  "version": "0.1.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/unique01082/svg-motion.git"
  },
  "bugs": { "url": "https://github.com/unique01082/svg-motion/issues" },
  "homepage": "https://github.com/unique01082/svg-motion#readme"
}
```

- [ ] **Step 2: Rename active imports, badges, and packed dependency keys**

All current examples and fixtures use:

```ts
import { mountSvgMotion } from "@baolq/svg-motion";
import { SvgMotion, type SvgMotionHandle } from "@baolq/svg-motion/react";
```

`scripts/consumer-smoke.mjs` must inject the candidate with:

```js
packageJson.dependencies["@baolq/svg-motion"] = `file:${tarball}`;
```

- [ ] **Step 3: Update the Git remote**

```bash
git remote set-url origin https://github.com/unique01082/svg-motion.git
git remote -v
```

Expected: fetch and push both target `unique01082/svg-motion.git`.

- [ ] **Step 4: Run focused GREEN checks**

```bash
pnpm install --lockfile-only
pnpm exec vitest run test/package-identity.test.ts test/package-contract.test.ts test/release-contract.test.ts
pnpm build
pnpm verify:package
pnpm test:consumer
pnpm pack --dry-run
```

Expected: the new tarball has exactly nine files and packed consumers pass in Chromium, Firefox, and WebKit.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml README.md CONTRIBUTING.md scripts/consumer-smoke.mjs test
git commit -m "refactor: rename package to baolq svg motion"
```

---

### Task 3: Migrate docs and verify the unpublished candidate

**Files:**

- Modify: `apps/docs/package.json`
- Modify: `apps/docs/src/components/MotionPreview.tsx`
- Modify: `apps/docs/src/content/MdxComponents.tsx`
- Modify: `apps/docs/src/contracts.ts`
- Modify: `apps/docs/src/pages/PlaygroundPage.tsx`
- Modify: `apps/docs/src/components/SiteHeader.tsx`
- Modify: `apps/docs/content/0.1/getting-started.mdx`
- Modify: `apps/docs/content/0.1/react.mdx`
- Modify: `package.json`
- Create: `scripts/docs-candidate-smoke.mjs`
- Modify: `test/docs-site-contract.test.ts`

**Interfaces:**

- Consumes: `pnpm pack --pack-destination <temporary-directory>` output.
- Produces: `pnpm docs:candidate:verify`, exercising docs and Docker without changing the tracked registry dependency.

- [ ] **Step 1: Extend the failing docs contract**

```ts
expect(docsPackage.name).toBe("@baolq/svg-motion-docs");
expect(docsPackage.dependencies["@baolq/svg-motion"]).toBe("0.1.0");
expect(
  docsPackage.dependencies[`@${"baole-space"}/svg-motion`],
).toBeUndefined();
expect(rootPackage.scripts["docs:candidate:verify"]).toMatch(
  /docs-candidate-smoke/,
);
```

Run `pnpm exec vitest run test/docs-site-contract.test.ts` and expect RED.

- [ ] **Step 2: Rename docs identity and authored imports**

Set the private package identity and registry dependency:

```json
{
  "name": "@baolq/svg-motion-docs",
  "dependencies": { "@baolq/svg-motion": "0.1.0" }
}
```

Replace active TS/TSX/MDX imports and install commands, and change the site header repository link to `https://github.com/unique01082/svg-motion`. Do not regenerate `apps/docs/pnpm-lock.yaml` before publication.

- [ ] **Step 3: Implement isolated candidate verification**

Create `scripts/docs-candidate-smoke.mjs` with this bounded lifecycle:

```js
const temporaryRoot = await mkdtemp(
  join(tmpdir(), "svg-motion-docs-candidate-"),
);
try {
  run("pnpm", ["build"], root);
  run("pnpm", ["pack", "--pack-destination", packageDirectory], root);
  await cp(join(root, "apps/docs"), candidateDocs, { recursive: true });
  await cp(join(root, "dist"), candidateDist, { recursive: true });

  const manifest = JSON.parse(await readFile(candidateManifest, "utf8"));
  manifest.dependencies["@baolq/svg-motion"] = `file:${tarball}`;
  await writeFile(candidateManifest, `${JSON.stringify(manifest, null, 2)}\n`);

  run(
    "pnpm",
    ["install", "--lockfile-only", "--frozen-lockfile=false"],
    candidateDocs,
  );
  run("pnpm", ["install", "--offline", "--frozen-lockfile"], candidateDocs);
  run("pnpm", ["verify"], candidateDocs);
  await verifyDockerCandidate(candidateRepo);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
```

`verifyDockerCandidate` copies `deploy/nginx.conf` and writes a temporary-only
Dockerfile that also copies `package/*.tgz` before the docs install:

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
COPY package ./package
COPY apps/docs/package.json apps/docs/pnpm-lock.yaml ./apps/docs/
RUN pnpm --dir apps/docs install --frozen-lockfile
COPY apps/docs ./apps/docs
RUN pnpm --dir apps/docs build
```

Append the unchanged nginx runtime stage from the tracked root `Dockerfile`,
then repeat the existing `/healthz`, deep-link, latest redirect, cache,
CSP/security header, and shutdown assertions. No tracked manifest may contain a
`file:` or `workspace:` dependency.

Add:

```json
{ "docs:candidate:verify": "node scripts/docs-candidate-smoke.mjs" }
```

- [ ] **Step 4: Run GREEN**

```bash
pnpm exec vitest run test/docs-site-contract.test.ts test/package-identity.test.ts
pnpm docs:candidate:verify
```

Expected: docs unit/build/browser/API and Docker pass against the exact local tarball while tracked docs still depends on `"0.1.0"`.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/package.json apps/docs/src apps/docs/content package.json scripts/docs-candidate-smoke.mjs test/docs-site-contract.test.ts
git commit -m "docs: migrate site to baolq package"
```

---

### Task 4: Guard the one-time migration tag

**Files:**

- Modify: `.github/workflows/publish.yml`
- Modify: `scripts/assert-release-tag.mjs`
- Modify: `test/release-contract.test.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: normal version tags or the exact one-time migration tag.
- Produces: a publish job refusing mismatched identity/version/tag or an existing target release.

- [ ] **Step 1: Write failing workflow tests**

```ts
expect(release).toMatch(/npm-baolq-v\*\.\*\.\*/);
expect(tagGuard).toContain("@baolq/svg-motion");
expect(() => run("npm-baolq-v0.1.0")).not.toThrow();
expect(() => run("npm-baolq-v0.1.1")).toThrow();
```

Run the focused release contract and confirm RED.

- [ ] **Step 2: Add the guarded migration tag pattern**

```yaml
on:
  push:
    tags:
      - "v*.*.*"
      - "npm-baolq-v*.*.*"
```

Migration mode is valid only when:

```js
const isMigration =
  process.env.GITHUB_REF_NAME === "npm-baolq-v0.1.0" &&
  packageJson.name === "@baolq/svg-motion" &&
  packageJson.version === "0.1.0";
```

Normal mode still requires `GITHUB_REF_NAME === v${packageJson.version}`.
Before publish, fail if `npm view @baolq/svg-motion@0.1.0` succeeds. Retain
immutable action SHAs, Node 22, npm 11.11.1, `id-token: write`,
`--access public`, `--provenance`, and full `pnpm verify`.

After `npm publish`, verify the new registry metadata and install the root and
`/react` entries in a clean temporary consumer. Only after those checks pass,
the migration-tag path deprecates the old release:

```yaml
- name: Deprecate the previous package identity
  if: github.ref_name == 'npm-baolq-v0.1.0'
  run: npm deprecate @baole-space/svg-motion@0.1.0 "Moved to @baolq/svg-motion"
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Update release guidance**

Document the one-time granular token, migration tag, registry verification,
Trusted Publisher configuration for
`unique01082/svg-motion/.github/workflows/publish.yml`, and token revocation.

- [ ] **Step 4: Run GREEN and commit**

```bash
pnpm exec vitest run test/release-contract.test.ts test/package-identity.test.ts
pnpm lint
pnpm format
git add .github/workflows/publish.yml scripts/assert-release-tag.mjs test/release-contract.test.ts README.md
git commit -m "ci: guard baolq package migration publish"
```

---

### Task 5: Verify and publish `@baolq/svg-motion@0.1.0`

**Files:**

- No source files unless verification exposes a defect.
- External: GitHub `unique01082/svg-motion`, `NPM_TOKEN`, npm registry.

**Interfaces:**

- Consumes: verified branch commit plus a short-lived granular npm token.
- Produces: public, provenanced `@baolq/svg-motion@0.1.0`.

- [ ] **Step 1: Run prepublication verification**

```bash
pnpm verify
pnpm docs:candidate:verify
pnpm docs:api:check
pnpm audit --prod
pnpm --dir apps/docs audit --prod
pnpm pack --dry-run
git diff --check
git status --short
```

Expected: all gates pass, no known production vulnerability, exact nine-file tarball, clean worktree.

- [ ] **Step 2: Confirm external preconditions read-only**

```bash
gh auth status
gh repo view unique01082/svg-motion --json nameWithOwner,visibility,url
npm view @baolq/svg-motion@0.1.0 --json
npm view @baole-space/svg-motion@0.1.0 version deprecated --json
```

Expected: public repository, new package E404, old package present.

- [ ] **Step 3: Configure bootstrap credentials**

In the authenticated npm UI create a short-lived granular automation token limited to publishing the new package and deprecating the old `0.1.0`. Save it directly as GitHub secret `NPM_TOKEN`; never echo it.

- [ ] **Step 4: Create and push the guarded migration tag**

```bash
git tag -a npm-baolq-v0.1.0 -m "Publish @baolq/svg-motion 0.1.0"
git push origin npm-baolq-v0.1.0
gh run list --repo unique01082/svg-motion --workflow publish.yml --limit 1
gh run watch --repo unique01082/svg-motion --exit-status
```

Expected: GitHub executes the workflow from the verified tagged commit and
publishes exactly `@baolq/svg-motion@0.1.0` with public access and provenance.

- [ ] **Step 5: Verify the registry artifact**

```bash
npm view @baolq/svg-motion@0.1.0 name version license repository dist.tarball dist.integrity --json
```

Install it in a fresh temporary Vanilla and React consumer, then import both:

```js
const core = await import("@baolq/svg-motion");
const react = await import("@baolq/svg-motion/react");
if (!core.prepareSvg || !react.SvgMotion) process.exit(1);
```

Expected: both registry entries import and the metadata points to `unique01082/svg-motion`.

Also verify the workflow applied the old-package notice only after the new
artifact passed its registry smoke:

```bash
npm view @baole-space/svg-motion@0.1.0 deprecated --json
```

Expected: `"Moved to @baolq/svg-motion"`.

---

### Task 6: Lock production docs and deprecate the old package

**Files:**

- Modify: `apps/docs/pnpm-lock.yaml`
- Modify: `test/package-identity.test.ts`

**Interfaces:**

- Consumes: public registry `@baolq/svg-motion@0.1.0`.
- Produces: frozen registry-backed docs and old-package migration notice.

- [ ] **Step 1: Generate the real docs lockfile**

```bash
pnpm --dir apps/docs install --lockfile-only --frozen-lockfile=false
pnpm --dir apps/docs install --frozen-lockfile
rg -n '@baolq/svg-motion@0.1.0' apps/docs/pnpm-lock.yaml
! rg -n '@baole-space/svg-motion' apps/docs/package.json apps/docs/pnpm-lock.yaml
```

Expected: public registry resolution with no file/workspace link.

Remove the temporary `apps/docs/pnpm-lock.yaml` exception from
`test/package-identity.test.ts`, then run that focused test to prove the old
scope is absent from the final active lockfile.

- [ ] **Step 2: Run postpublication production verification**

```bash
pnpm verify
pnpm docs:test
pnpm docs:api:check
pnpm docs:docker:smoke
pnpm audit --prod
pnpm --dir apps/docs audit --prod
git diff --check
```

Expected: all library, registry-backed docs, API, browser, package-consumer, and Docker gates pass.

- [ ] **Step 3: Commit and push the lockfile**

```bash
git add apps/docs/pnpm-lock.yaml test/package-identity.test.ts
git commit -m "build: lock docs to baolq registry package"
git push -u origin codex/local-motion-lab
```

- [ ] **Step 4: Confirm the old release deprecation**

```bash
npm view @baole-space/svg-motion@0.1.0 version deprecated --json
```

Expected deprecation is exactly `Moved to @baolq/svg-motion`.

- [ ] **Step 5: Configure Trusted Publisher and revoke bootstrap access**

Configure npm Trusted Publisher with repository `unique01082/svg-motion`, workflow `publish.yml`, and no environment. Remove GitHub secret `NPM_TOKEN` and revoke the granular token after successful publication and deprecation.

- [ ] **Step 6: Verify final state**

```bash
npm view @baolq/svg-motion@0.1.0 name version deprecated repository --json
npm view @baole-space/svg-motion@0.1.0 deprecated --json
gh repo view unique01082/svg-motion --json nameWithOwner,visibility,url
git status --short --branch
```

Expected: new package canonical and not deprecated, old package carries the exact migration message, repository public, worktree clean. Do not deploy docs, change DNS, merge, or delete the branch without separate authorization.
