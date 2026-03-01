// vite.config.ts

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";
import fs from "fs";
import { createHtmlPlugin } from "vite-plugin-html";

export default defineConfig(({ mode }) => {
  // 1) Load all .env files for the current mode (e.g. .env + .env.development)
  //    Third arg "" means “don’t filter by prefix” — we only use VITE_* anyway
  const env = loadEnv(mode, process.cwd(), "");

  // 2) Turn VITE_* vars into definitions under process.env.*
  //    SECURITY: Only expose VITE_* prefixed vars to the client bundle.
  //    Sensitive server-only vars (credentials, secrets) MUST NOT use the VITE_ prefix.
  const defineEnv = Object.entries(env).reduce<Record<string, string>>((acc, [key, val]) => {
    if (key.startsWith('VITE_')) {
      acc[`process.env.${key}`] = JSON.stringify(val);
    }
    return acc;
  }, {});

  // 3) CSP 정책 처리 — enforce a restrictive default if env var is missing
  const DEFAULT_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  const cspPolicy = (env.VITE_CSP_POLICY || DEFAULT_CSP).replace(/\s+/g, " ").trim();

  // HTTP 기본 인증을 위한 Authorization 헤더 값 생성
  const wpUser = env.WP_USERNAME;
  const wpPassword = env.WP_PASSWORD;
  const basicAuth = Buffer.from(`${wpUser}:${wpPassword}`).toString("base64");

  return {
    base: "/",
    plugins: [
      // Sync src/assets/locales/ → public/locales/ so i18next-http-backend can load them.
      // src/assets/locales/ is the single source of truth for all locale files.
      // Watches for changes in dev mode so locale edits don't require server restart.
      {
        name: "sync-locales",
        buildStart() {
          const src = path.resolve(__dirname, "src/assets/locales");
          const dest = path.resolve(__dirname, "public/locales");
          fs.cpSync(src, dest, { recursive: true });
        },
        configureServer(server) {
          const src = path.resolve(__dirname, "src/assets/locales");
          const dest = path.resolve(__dirname, "public/locales");
          server.watcher.add(src);
          server.watcher.on("change", (changedPath) => {
            if (changedPath.startsWith(src)) {
              fs.cpSync(src, dest, { recursive: true });
            }
          });
        },
      },
      nodePolyfills({
        globals: { Buffer: true, global: true, process: true },
        protocolImports: false,
      }),
      react(),
      createHtmlPlugin({
        minify: true,
        inject: {
          tags: env.VITE_UMAMI_WEBSITE_ID && env.VITE_UMAMI_HOST
            ? [
                {
                  injectTo: "head",
                  tag: "script",
                  attrs: {
                    defer: true,
                    src: `${env.VITE_UMAMI_HOST}/ns.js`,
                    "data-website-id": env.VITE_UMAMI_WEBSITE_ID,
                  },
                },
              ]
            : [],
        },
      }),
      // CSP injection plugin — always applies (uses DEFAULT_CSP as fallback)
      {
        name: "inject-csp",
        transformIndexHtml(html: string) {
          return html.replace(
            "</head>",
            `<meta http-equiv="Content-Security-Policy" content="${cspPolicy}" /></head>`
          );
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
      preserveSymlinks: true,
      // Prevent duplicate module instances in pnpm workspace
      dedupe: ["zustand", "react", "react-dom", "@nasun/wallet", "@nasun/wallet-ui"],
    },

    optimizeDeps: {
      include: ["aws-amplify", "@aws-amplify/auth", "@aws-amplify/core", "zustand", "@nasun/wallet", "@nasun/wallet-ui", "@metamask/sdk"],
    },

    // 4) 명시적으로 VITE_* 변수만 process.env에 주입
    define: defineEnv,

    server: {
      port: 5174,
      strictPort: true,
      // SECURITY: Removed wildcard CORS headers - use the cors config below instead
      // Added security headers for defense-in-depth
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "strict-origin-when-cross-origin",
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
          // 모노레포 루트와 현재 프로젝트 경로 허용
          path.resolve(__dirname, ".."),
          path.resolve(__dirname, "../.."),
          path.resolve(__dirname, "../../.."),
        ],
      },
    },

    publicDir: "public",

    // Strip console.log and console.debug in production builds (keep console.warn/error)
    esbuild: {
      drop: mode === "production" ? ["debugger"] : [],
      pure: mode === "production" ? ["console.log", "console.debug"] : [],
    },

    build: {
      outDir: "dist",
      assetsDir: "assets",
      emptyOutDir: true,
      // modulePreload disabled: vendor-chart (505KB raw) gets modulepreloaded
      // and parsed before FCP on slow CPUs, tripling TBT (120ms → 390ms).
      // With modulePreload off, browser discovers chunks after parsing index.js,
      // deferring non-critical chunk parsing to after first paint.
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React
            "vendor-react": ["react", "react-dom", "react-router-dom"],

            // UI Components
            "vendor-radix": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-popover",
              "@radix-ui/react-tooltip",
            ],

            // Web3 — lazy-loaded via WalletLayer and page-level imports
            // NOTE: @mysten/dapp-kit intentionally NOT assigned here.
            // It imports clsx + zustand internally, which forces vendor-web3
            // into the critical path (index statically imports shared deps).
            // Letting Rollup place dapp-kit in lazy chunks naturally avoids this.
            "vendor-web3": ["ethers"],

            // MetaMask SDK — NOT assigned to manual chunk.
            // Let Rollup place it in the lazy chunk (WalletLoginButton).
            // Assigning it causes __vitePreload to live in this chunk,
            // forcing a static import from index.

            // AWS
            "vendor-aws": ["aws-amplify"],

            // State & Data
            "vendor-data": ["zustand", "@tanstack/react-query", "axios"],

            // i18n
            "vendor-i18n": ["i18next", "react-i18next"],

            // Heavy Libraries
            "vendor-framer-motion": ["framer-motion"],
            // chart.js/recharts — NOT assigned to manual chunk.
            // Only used in lazy-loaded pages (Network, MyAccount).
            // Assigning to manual chunk forces Rollup to place it in index's
            // dependency graph, adding 505KB raw JS to the critical path.
            "vendor-carousel": ["react-slick", "slick-carousel"],
          },
        },
      },
    },
  };
});