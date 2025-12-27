/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { createHtmlPlugin } from "vite-plugin-html"

export default defineConfig(({ mode }) => {
  // 1) Load all .env files for the current mode (e.g. .env + .env.test)
  //    The third arg "" means “don’t filter by prefix” — we'll only have VITE_* anyway
  const env = loadEnv(mode, process.cwd(), "")

  // 2) Turn them into definitions under process.env.*
  const defineEnv = Object.entries(env).reduce<Record<string, string>>((acc, [key, val]) => {
    acc[`process.env.${key}`] = JSON.stringify(val)
    return acc
  }, {})

  // 3) CSP 정책 처리
  const cspPolicy = env.VITE_CSP_POLICY ? env.VITE_CSP_POLICY.replace(/\s+/g, " ").trim() : ""

  return {
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/setupTests.ts",
      css: true,
    },
    base: "/",
    plugins: [
      react(),
      createHtmlPlugin({
        minify: true,
        inject: {
          data: {
            cspMeta:
              mode !== "development" && cspPolicy
                ? `<meta http-equiv="Content-Security-Policy" content="${cspPolicy}" />`
                : "",
          },
        },
      }),
    ],
    assetsInclude: [
      "**/*.webm",
      "**/*.webp",
      "**/*.png",
      "**/*.jpg",
      "**/*.jpeg",
      "**/*.svg",
      "**/*.gif",
      "**/*.mp4",
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@assets": path.resolve(__dirname, "src/assets"),
        // 여전히 aws-exports.ts를 process.env.*로 읽기 위해 매핑
        "./aws-exports": path.resolve(__dirname, "src/config/aws-exports.ts"),
      },
    },
    optimizeDeps: {
      include: ["aws-amplify", "@aws-amplify/auth", "@aws-amplify/core"],
    },

    // 3) 명시적으로 VITE_* 변수만 process.env에 주입
    define: defineEnv,

    server: {
      port: 5173,
      strictPort: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST", "DELETE", "OPTIONS", "PATCH", "PUT"],
        credentials: true,
      },
      proxy: {
        "/wp-api": {
          target: "https://cms.moonoak.io",
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/wp-api/, "/wp-json"),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        },
      },
    },
    publicDir: "public",
    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            films: ["@/pages/FilmsPage"],
            games: ["@/pages/GamesPage"],
            home: ["@/pages/HomePage"],
          },
        },
      },
    },
  }
})
