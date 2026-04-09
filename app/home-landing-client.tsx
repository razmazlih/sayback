'use client';

import { useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { buildHomeDeepLink } from "@/lib/home-deeplink";

const LEGACY_QUERY_KEYS = [
  "example",
  "message",
  "situation",
  "tone",
  "agrees",
  "checkout",
  "plan",
  "session_id",
] as const;

const quickHighlights = [
  "3 כיווני תשובה בכל לחיצה",
  "אפשר לרכך, לחדד או לנסח מחדש",
  "מותאם לוואטסאפ, אינסטגרם, דייטינג ולקוחות",
];

const usageSteps = [
  {
    stepLabel: "שלב 1",
    title: "מדביקים הודעה או מעלים צילום מסך",
    body: "מכניסים את ההודעה שקיבלתם או צילום מסך של השיחה. הכל ברור, קצר ובעברית.",
    accentClass: "bg-[#f7ff4f]",
  },
  {
    stepLabel: "שלב 2",
    title: "בוחרים סיטואציה וסגנון",
    body: "קראש, אקס, לקוח, בוס או יד2, יחד עם הטון שמתאים לכם: עדין, ישיר, זורם, מצחיק או פלרטטני.",
    accentClass: "bg-[#d7f9ff]",
  },
  {
    stepLabel: "שלב 3",
    title: "נפתחות 3 תשובות מוכנות להעתקה",
    body: "כל יצירה מחזירה כוונה קצרה ועוד 3 ניסוחים טבעיים, ואז אפשר לשפר כל תשובה בלחיצה.",
    accentClass: "bg-[#ffd6ce]",
  },
];

const quickExamples = [
  {
    title: "קראש שפתאום נזכר",
    message: "היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך",
    situation: "קראש",
    tone: "פלרטטני",
    agrees: "כן",
  },
  {
    title: "אקס שבודק דופק",
    message: "עברתי ליד המקום שלנו ונזכרתי בך. איך את?",
    situation: "אקס",
    tone: "ישיר",
    agrees: "לא",
  },
  {
    title: "לקוח שרוצה הנחה",
    message: "ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו",
    situation: "לקוח",
    tone: "עדין",
    agrees: "כן",
  },
] as const;

function hasLegacyComposeState(searchParams: URLSearchParams) {
  return LEGACY_QUERY_KEYS.some((key) => searchParams.has(key));
}

export default function HomeLandingClient() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hasLegacyHash = window.location.hash === "#compose-section";

    if (!hasLegacyHash && !hasLegacyComposeState(searchParams)) {
      return;
    }

    const nextUrl = `/${window.location.search}${window.location.hash}`;
    window.location.replace(nextUrl);
  }, []);

  return (
    <main dir="rtl" className="min-h-screen overflow-x-clip bg-[#111111] px-3 py-4 text-right text-black sm:px-6 sm:py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="overflow-hidden rounded-[30px] border-2 border-black bg-[#f7ff4f] shadow-[0_10px_0_0_#ff623d] sm:rounded-[36px] sm:shadow-[0_12px_0_0_#ff623d]">
          <div className="relative px-4 py-5 sm:px-8 sm:py-8">
            <div aria-hidden="true" className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-[#ff623d] blur-3xl" />
            <div aria-hidden="true" className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-[#6ce8ff] blur-3xl" />

            <div className="relative max-w-3xl space-y-3 sm:space-y-4">
              <p className="inline-flex min-h-[40px] items-center rounded-full border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-black">
                SayBack
              </p>
              <h1 className="text-[2.1rem] font-black leading-[1.06] tracking-tight text-black sm:text-6xl">
                איך מתחילים עם SayBack הכי מהר
              </h1>
              <p className="max-w-2xl text-[0.98rem] font-bold leading-7 text-neutral-900 sm:text-lg">
                כאן הופכים הודעה מורכבת לתשובה טבעית תוך שניות, עם דוגמאות מוכנות וצעד־אחר־צעד פשוט.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/#compose-section"
                  onClick={() => trackEvent("hero_cta_click", { source: "home_guide_top" })}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-black bg-[#111111] px-5 py-2.5 text-sm font-black text-[#f7ff4f] transition hover:-translate-y-0.5"
                >
                  קבלו מה לענות עכשיו
                </Link>
                <Link
                  href="/answers"
                  onClick={() => trackEvent("hero_cta_click", { source: "home_guide_answers" })}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 border-black bg-white px-5 py-2.5 text-sm font-black text-black transition hover:-translate-y-0.5"
                >
                  לכל דפי &quot;מה לענות ל...&quot;
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[26px] border-2 border-black bg-[#fff9ef] p-3 shadow-[0_8px_0_0_#111111] sm:rounded-[30px] sm:p-4">
          <ul className="grid gap-2 sm:grid-cols-3">
            {quickHighlights.map((item) => (
              <li
                key={item}
                className="rounded-2xl border-2 border-black bg-white px-3.5 py-2.5 text-center text-sm font-black text-black"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2d10]">איך משתמשים</p>
            <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">3 שלבים וזה מוכן</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {usageSteps.map((step) => (
              <article
                key={step.stepLabel}
                className="rounded-[24px] border-2 border-black bg-white p-4 shadow-[0_8px_0_0_#111111]"
              >
                <p
                  className={`inline-flex min-h-[32px] items-center rounded-full border-2 border-black px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-black ${step.accentClass}`}
                >
                  {step.stepLabel}
                </p>
                <h3 className="mt-3 text-lg font-black text-black">{step.title}</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border-2 border-black bg-[#d34f24] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-black">דוגמאות מהירות</p>
              <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">להתחיל מתרחיש מוכן</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-black">
              כל כרטיס מעביר אותך ישירות לכלי עם פרטים מוכנים, כדי להתחיל תוך שניות.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {quickExamples.map((example) => {
              const prefillHref = `${buildHomeDeepLink(
                {
                  message: example.message,
                  situation: example.situation,
                  tone: example.tone,
                  agrees: example.agrees,
                },
                { basePath: "/" },
              )}#compose-section`;

              return (
                <Link
                  key={example.title}
                  href={prefillHref}
                  className="block rounded-[24px] border-2 border-black bg-[#fff6d8] p-4 shadow-[0_8px_0_0_#111111] transition hover:-translate-y-0.5"
                >
                  <p className="text-base font-black text-black">{example.title}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-neutral-800">
                    &quot;{example.message}&quot;
                  </p>
                  <span className="mt-3 inline-block text-xs font-black text-[#9a2f10]">קבלו מה לענות עכשיו</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-[30px] border-2 border-black bg-[#111111] p-3 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-4">
          <Link
            href="/#compose-section"
            onClick={() => trackEvent("hero_cta_click", { source: "home_guide_bottom" })}
            className="inline-flex min-h-[56px] w-full items-center justify-center rounded-[22px] border-2 border-black bg-gradient-to-b from-[#ff7a56] to-[#ff623d] px-5 py-3 text-base font-black text-white shadow-[0_8px_0_0_#111111] transition hover:-translate-y-0.5 hover:shadow-[0_10px_0_0_#111111]"
          >
            קבלו מה לענות עכשיו
          </Link>
        </section>

        <footer className="w-full rounded-[24px] border-2 border-black bg-[#fff6d8] px-4 py-4 text-sm font-bold text-neutral-800 shadow-[0_8px_0_0_#111111]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>התשלום מאובטח, ואנחנו לא שומרים אצלנו פרטי אשראי.</p>
            <div className="flex items-center gap-3">
              <Link href="/privacy" className="rounded-full px-2 py-1 underline">
                מדיניות פרטיות
              </Link>
              <Link href="/terms" className="rounded-full px-2 py-1 underline">
                תנאי שימוש
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
