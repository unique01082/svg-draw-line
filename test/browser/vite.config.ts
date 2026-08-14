import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    fs: { allow: [repositoryRoot] },
  },
});
