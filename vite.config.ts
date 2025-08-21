import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

// Change the import to use your runtime specific build
import build from "@hono/vite-build/node";

export default defineConfig(({ mode }) => {

  if (mode === "client")
    return {
      esbuild: {
        jsxImportSource: "hono/jsx/dom", // Optimized for hono/jsx/dom
      },
      build: {
        rollupOptions: {
          input: "./src/index.ts",
          output: {
            entryFileNames: "static/client.js",
          },
        },
      },
    };

  return {
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    },
    plugins: [
      build({
        entry: "src/index.ts",
      }),
      devServer({
        entry: "src/index.ts",
      }),
    ],
  };
});
