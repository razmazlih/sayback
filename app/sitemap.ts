import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "@/lib/site-url";
import { seoAnswerPages } from "@/lib/seo-answer-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = resolveSiteUrl();
  const lastModified = new Date();
  const answerHubEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl.origin}/answers`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    ...seoAnswerPages.map((answerPage) => ({
      url: `${siteUrl.origin}/answers/${answerPage.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.72,
    })),
  ];

  return [
    {
      url: `${siteUrl.origin}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...answerHubEntries,
    {
      url: `${siteUrl.origin}/privacy`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${siteUrl.origin}/terms`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
