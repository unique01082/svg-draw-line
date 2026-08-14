import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), "svg-motion-consumer-"));
const packDirectory = join(temporaryRoot, "package");

function run(command, args, cwd = root) {
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });
}

async function verifyTarball(tarball) {
  const entries = execFileSync("tar", ["-tf", tarball], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .sort();
  assert.deepEqual(entries, [
    "package/LICENSE",
    "package/README.md",
    "package/dist/index.d.ts",
    "package/dist/index.js",
    "package/dist/index.js.map",
    "package/dist/react.d.ts",
    "package/dist/react.js",
    "package/dist/react.js.map",
    "package/package.json",
  ]);

  for (const entry of entries.filter((path) => path.endsWith(".map"))) {
    const sourceMap = JSON.parse(
      execFileSync("tar", ["-xOf", tarball, entry], { encoding: "utf8" }),
    );
    for (const [index, source] of sourceMap.sources.entries()) {
      const embedded = sourceMap.sourcesContent?.[index] != null;
      const packagedSource = posix.normalize(
        posix.join(posix.dirname(entry), sourceMap.sourceRoot ?? "", source),
      );
      assert.ok(
        embedded || entries.includes(packagedSource),
        `${entry} references unpublished source ${source}.`,
      );
    }
  }
}

async function installConsumer(name, tarball) {
  const source = resolve(root, "test/consumers", name);
  const target = join(temporaryRoot, name);
  await cp(source, target, { recursive: true });

  const packagePath = join(target, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  packageJson.dependencies["@baole-space/svg-motion"] = `file:${tarball}`;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  run(
    "pnpm",
    ["install", "--offline", "--ignore-scripts", "--frozen-lockfile=false"],
    target,
  );
  run("pnpm", ["exec", "tsc", "--noEmit"], target);
  run("node", ["runtime.mjs"], target);
  run("pnpm", ["exec", "vite", "build"], target);

  const assets = await readdir(join(target, "dist", "assets"));
  assert.ok(assets.some((file) => file.endsWith(".js")));
  return target;
}

try {
  await rm(packDirectory, { force: true, recursive: true });
  await mkdir(packDirectory, { recursive: true });
  run("pnpm", ["pack", "--pack-destination", packDirectory]);
  const packed = (await readdir(packDirectory)).filter((file) =>
    file.endsWith(".tgz"),
  );
  assert.equal(packed.length, 1);
  const tarball = join(packDirectory, packed[0]);
  await verifyTarball(tarball);

  const vanilla = await installConsumer("vanilla", tarball);
  const vanillaBundle = (
    await Promise.all(
      (await readdir(join(vanilla, "dist", "assets")))
        .filter((file) => file.endsWith(".js"))
        .map((file) => readFile(join(vanilla, "dist", "assets", file), "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(vanillaBundle, /react(?:\.production)?\.min/);

  await installConsumer("react", tarball);
  console.log("Tarball contents and Vanilla/React consumers verified.");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
