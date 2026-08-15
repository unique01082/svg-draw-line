import assert from "node:assert/strict";
import { createServer } from "node:http";
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
import { extname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium, firefox, webkit } from "@playwright/test";

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

async function installConsumer(name, tarball, { nodeRuntime = true } = {}) {
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
  if (nodeRuntime) run("node", ["runtime.mjs"], target);
  run("pnpm", ["exec", "vite", "build"], target);

  const assets = await readdir(join(target, "dist", "assets"));
  assert.ok(assets.some((file) => file.endsWith(".js")));
  return target;
}

async function readBuiltJavaScript(consumer) {
  return (
    await Promise.all(
      (await readdir(join(consumer, "dist", "assets")))
        .filter((file) => file.endsWith(".js"))
        .map((file) =>
          readFile(join(consumer, "dist", "assets", file), "utf8"),
        ),
    )
  ).join("\n");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function serveBuiltConsumer(consumer) {
  const dist = join(consumer, "dist");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
      const requested = resolve(
        dist,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      const relativePath = relative(dist, requested);
      if (relativePath.startsWith("..") || relativePath === "") {
        response.writeHead(404).end("Not found");
        return;
      }
      const body = await readFile(requested);
      response.writeHead(200, {
        "content-type":
          contentTypes[extname(requested)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}

async function verifyConsumerInBrowsers(name, consumer) {
  const server = await serveBuiltConsumer(consumer);
  try {
    for (const [browserName, browserType] of Object.entries({
      chromium,
      firefox,
      webkit,
    })) {
      const browser = await browserType.launch();
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(server.url, {
          waitUntil: "networkidle",
        });
        assert.ok(response?.ok(), `${name}/${browserName} did not load.`);
        await page.waitForFunction(
          () => globalThis.svgMotionConsumer?.ready === true,
          undefined,
          { timeout: 5_000 },
        );
        const initial = await page.evaluate(() =>
          globalThis.svgMotionConsumer.snapshot(),
        );
        assert.equal(initial.kind, name);
        assert.equal(initial.hasNativeAnimate, true);
        assert.equal(initial.svgCount, 1);
        assert.equal(initial.controllerState, "idle");
        assert.equal(initial.animationCount, 1);
        assert.ok(initial.geometryLength > 0);
        assert.equal(initial.reactReady, name === "react");
        if (name === "react")
          assert.equal(initial.ariaLabel, "Consumer fixture");

        const exercised = await page.evaluate(() =>
          globalThis.svgMotionConsumer.exercise(),
        );
        assert.equal(exercised.controllerState, "paused");
        assert.equal(exercised.playState, "paused");
        assert.ok(exercised.currentTime > 0);
        assert.deepEqual(errors, [], `${name}/${browserName} emitted errors.`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
}

async function verifyTreeShakingConsumerInBrowsers(consumer) {
  const server = await serveBuiltConsumer(consumer);
  try {
    for (const [browserName, browserType] of Object.entries({
      chromium,
      firefox,
      webkit,
    })) {
      const browser = await browserType.launch();
      try {
        const page = await browser.newPage();
        const errors = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(server.url, {
          waitUntil: "networkidle",
        });
        assert.ok(response?.ok(), `tree-shake/${browserName} did not load.`);
        await page.waitForFunction(
          () => globalThis.svgMotionTreeShakeConsumer?.ready === true,
          undefined,
          { timeout: 5_000 },
        );
        const result = await page.evaluate(
          () => globalThis.svgMotionTreeShakeConsumer,
        );
        assert.equal(result.svgCount, 1);
        assert.deepEqual(result.diagnostics, []);
        assert.deepEqual(
          errors,
          [],
          `tree-shake/${browserName} emitted errors.`,
        );
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
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
  const vanillaBundle = await readBuiltJavaScript(vanilla);
  assert.doesNotMatch(vanillaBundle, /react(?:\.production)?\.min/);

  const react = await installConsumer("react", tarball);
  const treeShake = await installConsumer("tree-shake", tarball, {
    nodeRuntime: false,
  });
  const treeShakeBundle = await readBuiltJavaScript(treeShake);
  assert.match(treeShakeBundle, /treeShakeReady/);
  assert.doesNotMatch(treeShakeBundle, /ANIMATION_FAILED/);
  assert.doesNotMatch(
    treeShakeBundle,
    /animateSvg requires an SVG root element\./,
  );
  assert.doesNotMatch(treeShakeBundle, /useImperativeHandle/);
  const treeShakeBytes = Buffer.byteLength(treeShakeBundle);
  const vanillaBytes = Buffer.byteLength(vanillaBundle);
  assert.ok(
    treeShakeBytes < 45_000 && treeShakeBytes < vanillaBytes * 0.85,
    `Tree-shaken bundle (${treeShakeBytes} bytes) is not materially smaller than the Vanilla bundle (${vanillaBytes} bytes).`,
  );
  await verifyConsumerInBrowsers("vanilla", vanilla);
  await verifyConsumerInBrowsers("react", react);
  await verifyTreeShakingConsumerInBrowsers(treeShake);
  console.log(
    "Tarball contents, tree-shaking, and Vanilla/React consumers verified in Chromium, Firefox, and WebKit.",
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
