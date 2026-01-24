import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const defineEnv = Object.entries(env).reduce<Record<string, string>>((acc, [key, val]) => {
    acc[`process.env.${key}`] = JSON.stringify(val);
    return acc;
  }, {});

  return {
    base: "/",
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: defineEnv,
    server: {
      port: 5177,
      strictPort: true,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      fs: {
        allow: [
          path.resolve(__dirname, ".."),
          path.resolve(__dirname, "../.."),
          path.resolve(__dirname, "../../.."),
        ],
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
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-data": ["@tanstack/react-query"],
            "vendor-i18n": ["i18next", "react-i18next"],
            "vendor-chart": ["chart.js", "react-chartjs-2", "recharts"],
          },
        },
      },
    },
  };
});
