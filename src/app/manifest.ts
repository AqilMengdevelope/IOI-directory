import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IOI City Mall · 3D walkthrough",
    short_name: "IOI City Mall",
    description:
      "Unofficial hobby project, not affiliated with IOI City Mall. Walk every level of the mall in 3D and find your way to any shop.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#f2f2f2",
    theme_color: "#ec1d25",
    categories: ["navigation", "shopping", "travel"],
    icons: [
      { src: "/seo/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/seo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/seo/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
