import { execFileSync } from "node:child_process";

const suffix = `${process.pid}-${Date.now()}`;
const image = `svg-motion-docs-smoke:${suffix}`;
const container = `svg-motion-docs-smoke-${suffix}`;

function docker(...args) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function curl(...args) {
  return execFileSync("curl", ["--fail", "--silent", "--show-error", ...args], {
    encoding: "utf8",
  });
}

try {
  docker("build", "--pull", "-t", image, ".");
  docker(
    "run",
    "--detach",
    "--name",
    container,
    "--publish",
    "127.0.0.1::80",
    image,
  );
  const mapping = docker("port", container, "80/tcp");
  const port = mapping.match(/:(\d+)$/)?.[1];
  if (!port)
    throw new Error(`Could not resolve container port from ${mapping}.`);
  const origin = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if (curl(`${origin}/healthz`).trim() === "ok") {
        healthy = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!healthy) throw new Error("Docs container did not become healthy.");
  const deepLink = curl(`${origin}/docs/0.1/core`);
  if (!deepLink.includes("Core API") || !deepLink.includes("site-shell"))
    throw new Error("Prerendered deep link is incomplete.");
  const fallback = curl(`${origin}/client-only-state`);
  if (!fallback.includes("SVG Motion"))
    throw new Error("SPA fallback is incomplete.");
  const headers = curl(
    "--head",
    `${origin}/assets/${deepLink.match(/assets\/([^"]+\.js)/)?.[1] ?? "missing.js"}`,
  );
  if (!/cache-control: public, max-age=31536000, immutable/i.test(headers))
    throw new Error("Hashed assets are missing immutable caching.");
  const htmlHeaders = curl("--head", `${origin}/docs/0.1/core`);
  for (const expected of [
    "content-security-policy:",
    "x-content-type-options: nosniff",
    "cache-control: no-cache",
  ]) {
    if (!htmlHeaders.toLowerCase().includes(expected))
      throw new Error(`Missing response header ${expected}`);
  }
  const redirect = curl("--head", `${origin}/docs/latest/core`);
  if (!redirect.includes("308") || !redirect.includes("/docs/0.1/core"))
    throw new Error("Latest documentation redirect is incorrect.");
} finally {
  try {
    docker("rm", "--force", container);
  } catch {
    /* Best-effort scoped cleanup. */
  }
  try {
    docker("image", "rm", "--force", image);
  } catch {
    /* Best-effort scoped cleanup. */
  }
}
