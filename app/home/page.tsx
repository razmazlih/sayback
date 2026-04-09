import type { Metadata } from "next";
import HomeLandingClient from "@/app/home-landing-client";
import { createMarketingMetadata } from "@/lib/seo";

const HOME_GUIDE_TITLE = "SayBack | איך מתחילים מהר";
const HOME_GUIDE_DESCRIPTION =
  "מדריך קצר ופשוט ל-SayBack: מדביקים הודעה, בוחרים סגנון, ומקבלים 3 תשובות מוכנות לשליחה.";

export const metadata: Metadata = createMarketingMetadata({
  title: HOME_GUIDE_TITLE,
  description: HOME_GUIDE_DESCRIPTION,
  canonicalPath: "/home",
  keywords: [
    "SayBack",
    "איך להשתמש ב SayBack",
    "מה לענות",
    "תשובות להודעות",
  ],
});

export default function HomeGuidePage() {
  return <HomeLandingClient />;
}
