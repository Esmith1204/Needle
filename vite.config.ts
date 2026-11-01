import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Deezer's API doesn't allow calls from other sites' pages. vercel.json does the same in production.
const proxy = {
  "/deezer-api": {
    target: "https://api.deezer.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/deezer-api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
});
