import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

execFileSync("pnpm", ["--dir", "apps/docs", "verify"], {
  cwd: root,
  env: { ...process.env, DOCS_TEST_PORT: String(address.port) },
  stdio: "inherit",
});
