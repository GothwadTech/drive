import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": "/src",
      "@mtcute/node/utils.js": "/src/lib/emptyModule.ts",
      "@mtcute/node": "/src/lib/emptyModule.ts",
      "@mtcute/convert": "/node_modules/@mtcute/convert/gramjs/convert.js",
    },
  },
  optimizeDeps: {
    exclude: ["@mtcute/convert"],
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@mtcute") || id.includes("node_modules/long")) {
            return "mtcute-vendor";
          }
          if (
            id.includes("node_modules/xlsx") ||
            id.includes("node_modules/mammoth") ||
            id.includes("node_modules/epubjs") ||
            id.includes("node_modules/docx-preview") ||
            id.includes("node_modules/jszip") ||
            id.includes("node_modules/pdfjs-dist")
          ) {
            return "document-preview-vendor";
          }
        },
      },
    },
  },
});
