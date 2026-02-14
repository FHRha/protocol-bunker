import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      "@bunker/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
