import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appRoot, "../..");
const target = resolve(appRoot, "content/0.1/api-reflection.json");
const typedoc = resolve(appRoot, "node_modules/.bin/typedoc");
const temporary = mkdtempSync(resolve(tmpdir(), "svg-motion-api-"));
const rawPath = resolve(temporary, "typedoc.json");

const kindNames = new Map([
  [32, "Variable"],
  [64, "Function"],
  [128, "Class"],
  [256, "Interface"],
  [2097152, "Type alias"],
]);

try {
  execFileSync(
    typedoc,
    [
      "--json",
      rawPath,
      resolve(repoRoot, "dist/index.d.ts"),
      resolve(repoRoot, "dist/react.d.ts"),
      "--entryPointStrategy",
      "resolve",
      "--tsconfig",
      resolve(appRoot, "tsconfig.typedoc.json"),
      "--skipErrorChecking",
    ],
    { stdio: "pipe" },
  );
  const reflection = JSON.parse(readFileSync(rawPath, "utf8"));
  const modules = new Map(
    (reflection.children ?? []).map((child) => [child.name, child]),
  );
  const exports = [];
  for (const [moduleName, entry] of [
    ["index", "core"],
    ["react", "react"],
  ]) {
    const module = modules.get(moduleName);
    if (!module) throw new Error(`Missing TypeDoc module ${moduleName}.`);
    for (const child of module.children ?? []) {
      exports.push({
        name: child.name,
        kind: kindNames.get(child.kind) ?? `Reflection ${child.kind}`,
        entry,
      });
    }
  }
  const reflectionSnapshot = {
    packageVersion: "0.1.0",
    generatedFrom: ["dist/index.d.ts", "dist/react.d.ts"],
    exports,
  };
  const snapshot = `${JSON.stringify(reflectionSnapshot, null, 2)}\n`;
  if (process.argv.includes("--write")) writeFileSync(target, snapshot);
  else if (process.argv.includes("--check")) {
    const storedSnapshot = JSON.parse(readFileSync(target, "utf8"));
    if (JSON.stringify(storedSnapshot) !== JSON.stringify(reflectionSnapshot)) {
      throw new Error(
        "The 0.1 API reflection snapshot differs from built public declarations. Run pnpm docs:api.",
      );
    }
  } else throw new Error("Use --write or --check.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
