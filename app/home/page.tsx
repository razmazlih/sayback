import type { Metadata } from "next";
import HomeLandingClient from "@/app/home-landing-client";
import { createMarketingMetadata } from "@/lib/seo";

const HOME_GUIDE_TITLE = "SayBack | איך משתמשים נכון";
const HOME_GUIDE_DESCRIPTION =
  "דף הסבר קצר של SayBack: איך להזין הודעה, איך לבחור טון, ואיך להוציא 3 תשובות טבעיות בעברית תוך שניות.";

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
