import type { Metadata } from "next";
import Link from "next/link";
import { AnswersHubClient } from "./answers-hub-client";
import { answerPageCategories, seoAnswerPages } from "@/lib/seo-answer-pages";
import { createMarketingMetadata } from "@/lib/seo";

const ANSWERS_TITLE = "מה לענות ל... מאגר תשובות למצבים נפוצים | SayBack";
const ANSWERS_DESCRIPTION =
  "מאגר 'מה לענות ל...' של SayBack עם דפי תשובות קצרים בעברית לקראש, אקס, לקוחות, יד2 ודייטינג, כולל FAQ ומעבר מהיר לכלי התשובות.";

export const metadata: Metadata = createMarketingMetadata({
  title: ANSWERS_TITLE,
  description: ANSWERS_DESCRIPTION,
  canonicalPath: "/answers",
  ogImagePath: "/answers/opengraph-image",
  ogImageAlt: "SayBack - מה לענות ל... מאגר תשובות למצבים נפוצים",
  keywords: [
    "מה לענות ל",
    "תשובות מוכנות להודעות",
    "תשובות לקראש",
    "תשובות לאקס",
    "תשובות ללקוח",
    "SayBack Answers",
  ],
});

const hubItems = seoAnswerPages.map((page) => ({
  slug: page.slug,
  query: page.query,
  teaser: page.teaser,
  category: page.category,
}));

export default function AnswersHubPage() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#111111] px-3 py-4 text-right text-black sm:px-6 sm:py-6"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="overflow-hidden rounded-[30px] border-2 border-black bg-[#f7ff4f] shadow-[0_10px_0_0_#ff623d] sm:rounded-[36px] sm:shadow-[0_12px_0_0_#ff623d]">
          <div className="relative px-4 py-5 sm:px-8 sm:py-8">
            <div
              aria-hidden="true"
              className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-[#ff623d] blur-3xl"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-[#6ce8ff] blur-3xl"
            />

            <div className="relative space-y-4">
              <p className="inline-flex min-h-[36px] items-center rounded-full border-2 border-black bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-black">
                מאגר תשובות
              </p>
              <h1 className="text-4xl font-black leading-tight text-black sm:text-5xl">
                מה לענות ל...
              </h1>
              <p className="max-w-4xl text-[0.98rem] font-bold leading-7 text-neutral-900 sm:text-lg">
                כאן תמצאו תשובות מוכנות למצבים אמיתיים בעברית טבעית. כל עמוד מתמקד בשאילתה אחת,
                כולל 3 ניסוחים לדוגמה, הסבר קצר למה כל נוסח עובד, שאלות נפוצות וקישור ישיר לכלי התשובות.
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/#compose-section"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5"
                >
                  לפתוח את כלי התשובות
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-[#d7f9ff] px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5"
                >
                  לדף הבית
                </Link>
              </div>
            </div>
          </div>
        </section>

        <AnswersHubClient categories={answerPageCategories} items={hubItems} />
      </div>
    </main>
  );
}
