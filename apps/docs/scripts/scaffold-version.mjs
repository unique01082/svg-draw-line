import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const [version, packageVersion] = process.argv.slice(2);
if (
  !version ||
  !packageVersion ||
  !/^\d+\.\d+$/.test(version) ||
  !/^\d+\.\d+\.\d+/.test(packageVersion)
) {
  throw new Error(
    "Usage: pnpm docs:scaffold <minor-version> <package-version>",
  );
}
const appRoot = process.cwd();
const source = resolve(appRoot, "content/0.1");
const target = resolve(appRoot, `content/${version}`);
if (existsSync(target))
  throw new Error(
    `Content snapshot ${version} already exists and will not be rewritten.`,
  );
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
const reflection = resolve(target, "api-reflection.json");
const snapshot = JSON.parse(readFileSync(reflection, "utf8"));
snapshot.packageVersion = packageVersion;
writeFileSync(reflection, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `Created immutable content scaffold ${version} for package ${packageVersion}.`,
);
