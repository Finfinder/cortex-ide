/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

function opencodeSyncPlugin() {
  return {
    name: "opencode-sync-plugin",
    configureServer(server: any) {
      server.middlewares.use("/api/save-opencode-config", (req: any, res: any) => {
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk: any) => {
            body += chunk;
          });
          req.on("end", () => {
            try {
              const home = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\Rafal";
              const configDir = path.join(home, ".config", "opencode");
              fs.mkdirSync(configDir, { recursive: true });
              const configPath = path.join(configDir, "opencode.jsonc");
              fs.writeFileSync(configPath, body, "utf-8");
              console.log("[opencode-sync-plugin] Saved opencode config to", configPath);

              exec("taskkill /F /IM opencode.exe", () => {
                exec("opencode serve --port 4096", () => {});
              });

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), opencodeSyncPlugin()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
}));
