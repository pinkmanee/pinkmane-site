import type { MetadataRoute } from "next";

// The pages Google is told about. Add a line here when a new page goes live.
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number) => ({
    url: `https://pinkmane.site${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority,
  });
  return [page("", 1), page("/shop", 0.8), page("/games/pink-kart", 0.6), page("/games/pink-dive", 0.7), page("/games/pink-rush", 0.6)];
}
