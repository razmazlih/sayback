import type { Metadata } from "next";
import HomePageClient from "@/app/home-page-client";
import {
  CREDIT_PACK_CURRENCY,
  CREDIT_PACK_PRICE_AGOROT,
  CREDIT_PACK_REPLIES_PER_USE,
  CREDIT_PACK_USES,
} from "@/lib/pricing";
import { createMarketingMetadata, SITE_LANGUAGE, SITE_NAME, toSafeJsonLd } from "@/lib/seo";
import { resolveSiteUrl } from "@/lib/site-url";

const HOME_TITLE = "SayBack | מה לענות עכשיו";
const HOME_DESCRIPTION =
  "SayBack עוזר לך לדעת מה לענות בהודעות. מדביקים הודעה, בוחרים סגנון, ומקבלים 3 תשובות קצרות וטבעיות בעברית.";
const UNLIMITED_MONTHLY_PRICE_ILS = "24.90";
const BILLING_BYPASS_ENABLED =
  process.env.BILLING_BYPASS?.trim().toLowerCase() === "true";

const siteUrl = resolveSiteUrl();
const siteOrigin = siteUrl.origin;
const creditPackPrice = (CREDIT_PACK_PRICE_AGOROT / 100).toFixed(2);
const currencyCode = CREDIT_PACK_CURRENCY.toUpperCase();

export const metadata: Metadata = createMarketingMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  canonicalPath: "/",
  keywords: [
    "SayBack",
    "תשובות להודעות",
    "מחולל תשובות",
    "תשובות לוואטסאפ",
    "מה לענות",
  ],
});

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: siteOrigin,
  description: HOME_DESCRIPTION,
  inLanguage: SITE_LANGUAGE,
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  inLanguage: SITE_LANGUAGE,
  url: siteOrigin,
  description: HOME_DESCRIPTION,
  featureList: [
    "3 תשובות קצרות לכל הודעה",
    "התאמה לסיטואציה ולסגנון שלך",
    "אפשר לרכך, לחדד או לבקש ניסוח חדש",
  ],
  ...(BILLING_BYPASS_ENABLED
    ? {}
    : {
        offers: [
          {
            "@type": "Offer",
            name: `${CREDIT_PACK_USES} שימושים חד-פעמי`,
            price: creditPackPrice,
            priceCurrency: currencyCode,
            availability: "https://schema.org/InStock",
            description: `${CREDIT_PACK_REPLIES_PER_USE} תשובות בכל שימוש, עד ${
              CREDIT_PACK_USES * CREDIT_PACK_REPLIES_PER_USE
            } תשובות.`,
            url: `${siteOrigin}/`,
          },
          {
            "@type": "Offer",
            name: "ללא הגבלה חודשי",
            price: UNLIMITED_MONTHLY_PRICE_ILS,
            priceCurrency: "ILS",
            availability: "https://schema.org/InStock",
            description: "מנוי חודשי ללא הגבלה ליצירת תשובות.",
            url: `${siteOrigin}/`,
            category: "subscription",
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: UNLIMITED_MONTHLY_PRICE_ILS,
              priceCurrency: "ILS",
              referenceQuantity: {
                "@type": "QuantitativeValue",
                value: 1,
                unitText: "MONTH",
              },
            },
          },
        ],
      }),
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(softwareApplicationJsonLd) }}
      />
      <HomePageClient mode="generator" />
    </>
  );
}
