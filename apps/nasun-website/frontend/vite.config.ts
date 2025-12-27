// vite.config.ts

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { createHtmlPlugin } from "vite-plugin-html";

export default defineConfig(({ mode }) => {
  // 1) Load all .env files for the current mode (e.g. .env + .env.development)
  //    Third arg "" means “don’t filter by prefix” — we only use VITE_* anyway
  const env = loadEnv(mode, process.cwd(), "");

  // 2) Turn them into definitions under process.env.*
  const defineEnv = Object.entries(env).reduce<Record<string, string>>((acc, [key, val]) => {
    acc[`process.env.${key}`] = JSON.stringify(val);
    return acc;
  }, {});

  // 3) CSP 정책 처리
  const cspPolicy = env.VITE_CSP_POLICY ? env.VITE_CSP_POLICY.replace(/\s+/g, " ").trim() : "";

  // HTTP 기본 인증을 위한 Authorization 헤더 값 생성
  const wpUser = env.VITE_WORDPRESS_USERNAME;
  const wpPassword = env.VITE_WORDPRESS_PASSWORD;
  const basicAuth = Buffer.from(`${wpUser}:${wpPassword}`).toString("base64");

  return {
    base: "/",
    plugins: [
      react(),
      createHtmlPlugin({
        minify: true,
      }),
      // CSP 주입을 위한 커스텀 플러그인
      {
        name: "inject-csp",
        transformIndexHtml(html: string) {
          if (cspPolicy) {
            // </head> 태그 바로 앞에 CSP 메타 태그 주입
            return html.replace(
              "</head>",
              `<meta http-equiv="Content-Security-Policy" content="${cspPolicy}" /></head>`
            );
          }
          return html;
        },
      },
    ],

    // 다양한 미디어 파일을 포함
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
        "@": path.resolve(__dirname, "./src"),
        "@assets": path.resolve(__dirname, "./src/assets"),
        "./aws-exports": path.resolve(__dirname, "src/config/aws-exports.ts"),
      },
    },

    optimizeDeps: {
      include: ["aws-amplify", "@aws-amplify/auth", "@aws-amplify/core"],
    },

    // 4) 명시적으로 VITE_* 변수만 process.env에 주입
    define: defineEnv,

    server: {
      port: 5174,
      strictPort: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      cors: {
        origin: [
          "http://localhost:5174", // 개발 환경
          "https://nasun.io",
          "https://gensol.io",
        ],
        methods: ["GET", "POST", "DELETE", "OPTIONS", "PATCH", "PUT"],
        credentials: true,
      },
      proxy: {
        '/api/twitter': {
          target: 'https://api.twitter.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/twitter/, ''),
        },
        "/wp-api": {
          target: env.VITE_WORDPRESS_DOMAIN, // ★ .env 파일에서 읽어오도록 변경
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/wp-api/, "/wp-json/wp/v2"),
          headers: {
            Authorization: `Basic ${basicAuth}`, // 개발 환경 인증
          },
        },
        // 가격 API 프록시 (CORS 에러 방지)
        "/proxy-price-api": {
          target: env.VITE_PRICE_API_ENDPOINT || "https://lg4bcphtk6.execute-api.ap-northeast-2.amazonaws.com/prod/",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/proxy-price-api/, ""),
        },
        "/proxy-backup-api": {
          target: env.VITE_BACKUP_API_ENDPOINT || "https://db73lhz1m7.execute-api.ap-northeast-2.amazonaws.com/prod/",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/proxy-backup-api/, ""),
        },
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
      fs: {
        allow: [
          "/home/naru/my_apps/nasun-apps/nasun-website/frontend",
          "/home/naru/my_apps/nasun-apps/nasun-website/public",
          "/home/naru/my_apps/nasun-apps/nasun-website/frontend/node_modules",
        ],
      },
    },

    publicDir: "public",

    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
    },
  };
});