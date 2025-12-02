import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx", ".json", ".wasm"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    // 啟動 dev server 時自動打開 /search.html
    open: "/search.html",
    headers: {
      // 讓頁面變成 cross-origin isolated（SharedArrayBuffer 才能用）
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/api": {
        target: env.VITE_API_BASE,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

