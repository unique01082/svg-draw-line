import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", ".worktrees/**", "test/browser/**"],
  },
  plugins: [
    dts({
      compilerOptions: { declarationMap: false },
      include: ["src/index.ts", "src/react.ts"],
    }),
  ],
  build: {
    copyPublicDir: false,
    lib: {
      entry: {
        index: resolve(rootDirectory, "src/index.ts"),
        react: resolve(rootDirectory, "src/react.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    sourcemap: true,
    rollupOptions: {
      external: ["dompurify", "react"],
    },
  },
});
