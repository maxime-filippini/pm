import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: { manifest: true },
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
});
