import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildGeneratorDeepLink,
  getRelatedSeoAnswerPages,
  getSeoAnswerPageBySlug,
  seoAnswerPages,
} from "@/lib/seo-answer-pages";
import { createMarketingMetadata } from "@/lib/seo";

type RouteParams = {
  slug: string;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return seoAnswerPages.map((page) => ({
    slug: page.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoAnswerPageBySlug(slug);

  if (!page) {
    return {
      title: "תוכן לא נמצא",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const pageTitle = page.metaTitle.includes("SayBack")
    ? page.metaTitle
    : `${page.metaTitle} | SayBack`;

  return createMarketingMetadata({
    title: pageTitle,
    description: page.metaDescription,
    canonicalPath: `/answers/${page.slug}`,
    ogType: "article",
    ogImagePath: `/answers/${page.slug}/opengraph-image`,
    ogImageAlt: `SayBack - ${page.query}`,
    keywords: ["מה לענות", page.query, "SayBack", "תשובות להודעות"],
  });
}

export default async function SeoAnswerDetailPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const page = getSeoAnswerPageBySlug(slug);

  if (!page) {
    notFound();
  }

  const generatorHref = buildGeneratorDeepLink(page.generatorPrefill);
  const relatedPages = getRelatedSeoAnswerPages(page.slug, 4);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#111111] px-3 py-4 text-right text-black sm:px-6 sm:py-6"
    >
      <article className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <section className="rounded-[30px] border-2 border-black bg-[#f7ff4f] px-4 py-5 shadow-[0_10px_0_0_#ff623d] sm:px-7 sm:py-7 sm:shadow-[0_12px_0_0_#ff623d]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black text-neutral-700">
            <Link href="/" className="underline">
              דף הבית
            </Link>
            <span aria-hidden="true">/</span>
            <Link href="/answers" className="underline">
              מה לענות ל...
            </Link>
          </div>

          <h1 className="mt-3 text-3xl font-black leading-tight text-black sm:text-4xl">
            {page.query}
          </h1>
          <p className="mt-3 text-[0.98rem] font-bold leading-7 text-neutral-900 sm:text-lg">
            {page.intro}
          </p>
        </section>

        <section className="rounded-[26px] border-2 border-black bg-white p-4 shadow-[0_8px_0_0_#111111] sm:p-5">
          <h2 className="text-2xl font-black text-black">3 תשובות שאפשר לשלוח עכשיו</h2>
          <ol className="mt-4 grid gap-3">
            {page.sampleReplies.map((sample, index) => (
              <li
                key={`${index + 1}-${sample.reply}`}
                className="rounded-[20px] border-2 border-black bg-[#fff9ef] p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#9a2f10]">
                  תשובה {index + 1}
                </p>
                <p className="mt-2 text-base font-black leading-7 text-black">
                  &quot;{sample.reply}&quot;
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">
                  למה זה עובד: {sample.whyItWorks}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[26px] border-2 border-black bg-[#d7f9ff] p-4 shadow-[0_8px_0_0_#111111] sm:p-5">
          <h2 className="text-2xl font-black text-black">דגשים מהירים לפני שליחה</h2>
          <ul className="mt-4 grid gap-2">
            {page.quickTips.map((tip) => (
              <li
                key={tip}
                className="rounded-2xl border-2 border-black bg-white px-4 py-3 text-sm font-bold leading-6 text-neutral-800"
              >
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[26px] border-2 border-black bg-white p-4 shadow-[0_8px_0_0_#111111] sm:p-5">
          <h2 className="text-2xl font-black text-black">שאלות נפוצות</h2>
          <div className="mt-4 grid gap-3">
            {page.faq.map((item) => (
              <details
                key={item.question}
                className="rounded-[18px] border-2 border-black bg-[#fff9ef] px-4 py-3"
              >
                <summary className="cursor-pointer text-sm font-black leading-6 text-black">
                  {item.question}
                </summary>
                <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border-2 border-black bg-[#fff6d8] p-5 shadow-[0_8px_0_0_#111111] sm:p-6">
          <h2 className="text-2xl font-black text-black">{page.ctaTitle}</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">{page.ctaDescription}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href={generatorHref}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-[#f7ff4f] px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5"
            >
              לפתוח את כלי התשובות עם הפרטים האלה
            </Link>
            <Link
              href="/#compose-section"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5"
            >
              מעבר לכלי תשובות ריק
            </Link>
          </div>
        </section>

        <section className="rounded-[26px] border-2 border-black bg-white p-4 shadow-[0_8px_0_0_#111111] sm:p-5">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-2xl font-black text-black">עמודים קשורים</h2>
            <Link href="/answers" className="text-sm font-black text-[#9a2f10] underline">
              לכל המדריכים
            </Link>
          </div>

          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {relatedPages.map((relatedPage) => (
              <li key={relatedPage.slug}>
                <Link
                  href={`/answers/${relatedPage.slug}`}
                  className="block rounded-[20px] border-2 border-black bg-[#fff9ef] px-4 py-3 transition hover:-translate-y-0.5"
                >
                  <p className="text-sm font-black text-black">{relatedPage.query}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">{relatedPage.teaser}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </main>
  );
}
