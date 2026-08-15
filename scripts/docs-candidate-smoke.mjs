import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(
  join(tmpdir(), "svg-motion-docs-candidate-"),
);
const candidateRepo = join(temporaryRoot, "repo");
const candidateDocs = join(candidateRepo, "apps/docs");
const packageDirectory = join(candidateRepo, "package");
const excludedDirectories = new Set([
  "dist",
  "dist-ssr",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function run(command, args, cwd = root, env = process.env) {
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate a docs test port.");
  }
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

try {
  await mkdir(packageDirectory, { recursive: true });
  run("pnpm", ["build"]);
  run("pnpm", ["pack", "--pack-destination", packageDirectory]);

  const tarballs = (await readdir(packageDirectory)).filter((name) =>
    name.endsWith(".tgz"),
  );
  if (tarballs.length !== 1)
    throw new Error("Expected exactly one packed SVG Motion candidate.");
  const tarball = join(packageDirectory, tarballs[0]);

  await mkdir(join(candidateRepo, "apps"), { recursive: true });
  await cp(join(root, "apps/docs"), candidateDocs, {
    recursive: true,
    filter: (source) => !excludedDirectories.has(basename(source)),
  });
  await cp(join(root, "dist"), join(candidateRepo, "dist"), {
    recursive: true,
  });

  const manifestPath = join(candidateDocs, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.dependencies["@baolq/svg-motion"] =
    `file:../../package/${basename(tarball)}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  run(
    "pnpm",
    ["install", "--lockfile-only", "--frozen-lockfile=false"],
    candidateDocs,
  );
  run("pnpm", ["install", "--frozen-lockfile"], candidateDocs);
  const docsTestPort = await availablePort();
  run("pnpm", ["verify"], candidateDocs, {
    ...process.env,
    DOCS_TEST_PORT: String(docsTestPort),
  });
  run("pnpm", ["api:check"], candidateDocs);

  await mkdir(join(candidateRepo, "deploy"), { recursive: true });
  await mkdir(join(candidateRepo, "scripts"), { recursive: true });
  await cp(
    join(root, "deploy/nginx.conf"),
    join(candidateRepo, "deploy/nginx.conf"),
  );
  await cp(
    join(root, "scripts/docker-smoke.mjs"),
    join(candidateRepo, "scripts/docker-smoke.mjs"),
  );

  const trackedDockerfile = await readFile(join(root, "Dockerfile"), "utf8");
  const runtimeOffset = trackedDockerfile.indexOf("FROM nginx:");
  if (runtimeOffset < 0)
    throw new Error("The tracked Dockerfile has no nginx runtime stage.");
  const runtimeStage = trackedDockerfile.slice(runtimeOffset);
  const candidateDockerfile = `FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
COPY package ./package
COPY apps/docs/package.json apps/docs/pnpm-lock.yaml ./apps/docs/
RUN pnpm --dir apps/docs install --frozen-lockfile
COPY apps/docs ./apps/docs
RUN pnpm --dir apps/docs build

${runtimeStage}`;
  await writeFile(join(candidateRepo, "Dockerfile"), candidateDockerfile);
  await writeFile(
    join(candidateRepo, ".dockerignore"),
    "**/node_modules\n**/dist\n**/dist-ssr\n",
  );
  run("node", ["scripts/docker-smoke.mjs"], candidateRepo);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
