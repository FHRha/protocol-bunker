import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const CLIENT_SOURCEMAP_ENABLED = process.env.BUNKER_CLIENT_SOURCEMAP === "1";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: CLIENT_SOURCEMAP_ENABLED,
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "@bunker/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
