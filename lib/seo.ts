import type { Metadata } from "next";

export const SITE_NAME = "SayBack";
export const SITE_LOCALE = "he_IL";
export const SITE_LANGUAGE = "he-IL";
export const DEFAULT_OG_IMAGE_ALT = "SayBack - מה לענות עכשיו, 3 תשובות בעברית";
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image";
export const DEFAULT_TWITTER_IMAGE_PATH = "/twitter-image";

type MarketingMetadataInput = {
  title: string;
  description: string;
  canonicalPath: `/${string}` | "/";
  keywords?: string[];
  ogType?: "website" | "article";
  ogImagePath?: `/${string}`;
  ogImageAlt?: string;
};

export function createMarketingMetadata({
  title,
  description,
  canonicalPath,
  keywords,
  ogType = "website",
  ogImagePath = DEFAULT_OG_IMAGE_PATH,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
}: MarketingMetadataInput): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      type: ogType,
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: ogImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        {
          url: ogImagePath,
          alt: ogImageAlt,
        },
      ],
    },
  };
}

export function toSafeJsonLd(value: object) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
