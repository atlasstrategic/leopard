import { defineConfig } from "vite";
export default defineConfig(({ command, isPreview }) => ({
  // Project Pages URL: https://<owner>.github.io/leopard/
  // Keep local development at /; preview and the build use the deployed path.
  base: command === "build" || isPreview ? "/leopard/" : "/",
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
}));
