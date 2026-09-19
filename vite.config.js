import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import elmPlugin from "vite-plugin-elm";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    elmPlugin(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        navigateFallbackDenylist: [/^\/__/],
      },
      includeAssets: ["assets/favicon.png"],
      manifest: {
        name: "Kit",
        short_name: "Kit",
        description: "Just a to-do list.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/assets/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/assets/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
