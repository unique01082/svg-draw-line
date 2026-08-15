import { configDefaults, defineConfig } from "vitest/config";
import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";

export default defineConfig({
  plugins: [mdx({ rehypePlugins: [rehypeSlug, rehypeHighlight] }), react()],
  server: { host: "127.0.0.1" },
  test: {
    exclude: [...configDefaults.exclude, "test/**"],
  },
});
