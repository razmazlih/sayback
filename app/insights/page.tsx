import type { Metadata } from "next";
import InsightsClient from "./insights-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "נתוני שימוש | SayBack",
  description: "מסך פרטי לנתוני שימוש מצטברים ב־SayBack.",
  robots: { index: false, follow: false },
};

export default function InsightsPage() {
  return <InsightsClient />;
}
