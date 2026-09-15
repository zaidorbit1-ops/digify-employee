import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Digify Employee Management",
    short_name: "Digify",
    description: "Employee attendance, salary, leave, and holiday management.",
    start_url: "/dashboard",
    id: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f4f3",
    theme_color: "#241b19",
    lang: "en",
    icons: [
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
