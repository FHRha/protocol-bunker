import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT_SOURCEMAP_ENABLED = process.env.BUNKER_CLIENT_SOURCEMAP === "1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: CLIENT_SOURCEMAP_ENABLED,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          markdown: ["react-markdown"],
        },
      },
    },
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
