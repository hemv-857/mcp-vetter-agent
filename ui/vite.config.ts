import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy TrueForge API to bypass CORS — browser hits same origin,
      // Vite dev server forwards to TrueForge on port 8790.
      "/trueforge": {
        target: "http://localhost:8790",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/trueforge/, ""),
      },
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
