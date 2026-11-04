"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import type { VisitorInsights } from "@/lib/visitor-insights";

type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "error" }
  | { status: "ready"; user: User };
type ReportState =
  | { status: "loading" }
  | { status: "permission_pending" }
  | { status: "forbidden" }
  | { status: "signed_out" }
  | { status: "error" }
  | { status: "ready"; data: VisitorInsights };

const sourceLabels = {
  instagram: "אינסטגרם",
  tiktok: "טיקטוק",
  facebook: "פייסבוק",
  google: "גוגל",
  direct_or_unknown: "ישיר או לא ידוע",
  other_campaign: "קמפיין אחר",
} as const;
const focusClass = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#246354]";
const numberFormatter = new Intl.NumberFormat("he-IL");
const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric", month: "short", timeZone: "UTC",
});
const timestampFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Never render missing, malformed, or unavailable data as a successful zero. */
export function isVisitorInsights(value: unknown): value is VisitorInsights {
  if (!isRecord(value) || value.available !== true || !isDate(value.generatedAt)) return false;
  const { period, sample, totals, daily, sources } = value;
  if (!isRecord(period) || (period.days !== 7 && period.days !== 30) || period.timeZone !== "UTC" ||
    !isDate(period.start) || !isDate(period.end)) return false;
  if (!isRecord(sample) || !isCount(sample.limit) || !isCount(sample.scannedEvents) ||
    !isCount(sample.includedEvents) || typeof sample.truncated !== "boolean") return false;
  if (!isRecord(totals) || !["pageViews", "visitors", "generations", "generatingUsers", "copies", "copyingUsers", "returningUsers"].every((key) => isCount(totals[key]))) return false;
  if (!Array.isArray(daily) || !daily.every((row) => isRecord(row) && isDate(row.date) &&
    ["pageViews", "visitors", "generations", "copies"].every((key) => isCount(row[key])))) return false;
  return Array.isArray(sources) && sources.every((row) => isRecord(row) && typeof row.source === "string" &&
    Object.hasOwn(sourceLabels, row.source) && isCount(row.pageViews) && isCount(row.visitors));
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-[22px] border border-[#e2d7c8] bg-[#fffdfa] p-4 sm:p-5">
      <dt className="text-sm font-bold text-[#6d6259]">{label}</dt>
      <dd className="mt-2 text-3xl font-black tabular-nums text-[#241d18]">{numberFormatter.format(value)}</dd>
      <dd className="mt-2 text-xs leading-5 text-[#6d6259]">{detail}</dd>
    </div>
  );
}

function Report({ data }: { data: VisitorInsights }) {
  const { totals } = data;
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-[#6d6259]">
        {dateFormatter.format(new Date(data.period.start))}–{dateFormatter.format(new Date(data.period.end))}
        {" · "}כל התאריכים לפי UTC. עודכן {timestampFormatter.format(new Date(data.generatedAt))}.
      </p>
      {data.sample.truncated ? (
        <p role="note" className="rounded-2xl border border-[#e7c594] bg-[#fff4df] p-4 text-sm leading-6 text-[#66411a]">
          הנתונים חלקיים: נבדקו עד {numberFormatter.format(data.sample.limit)} אירועים. המספרים כאן מתייחסים למדגם שנקרא, ולא לכל הפעילות בתקופה.
        </p>
      ) : null}
      {data.sample.includedEvents === 0 ? (
        <div className="rounded-[22px] border border-[#e2d7c8] bg-white p-6">
          <h2 className="text-lg font-bold text-[#241d18]">עדיין אין אירועים בתקופה הזו</h2>
          <p className="mt-2 text-sm leading-6 text-[#6d6259]">הנתונים נטענו בהצלחה. אפשר לבחור תקופה ארוכה יותר או לבדוק שוב בהמשך.</p>
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="מבקרים מזוהים" value={totals.visitors} detail="אומדן לפי מזהה דפדפן; אינו מספר אנשים ודאי." />
            <Metric label="צפיות בדף הבית" value={totals.pageViews} detail="כניסות שנרשמו במערכת האירועים." />
            <Metric label="יצירות שהצליחו" value={totals.generations} detail={`כולל שיפורי ניסוח; עבור ${numberFormatter.format(totals.generatingUsers)} זהויות משתמש.`} />
            <Metric label="פעולות העתקה" value={totals.copies} detail={`${numberFormatter.format(totals.copyingUsers)} זהויות העתיקו תשובה. העתקה אינה הוכחה לשליחה.`} />
            <Metric label="זהויות שיצרו תשובות" value={totals.generatingUsers} detail="מזהי התחברות, כולל משתמשים אנונימיים; אינם בהכרח אנשים שונים." />
            <Metric label="זהויות שחזרו ביום אחר" value={totals.returningUsers} detail="זהויות עם פעילות בתקופה שנראו לראשונה ביום UTC מוקדם יותר." />
          </dl>
          <section aria-labelledby="sources-title" className="rounded-[22px] border border-[#e2d7c8] bg-white p-4 sm:p-5">
            <h2 id="sources-title" className="text-lg font-black text-[#241d18]">מאיפה הגיעו המבקרים</h2>
            <p className="mt-1 text-sm leading-6 text-[#6d6259]">לפי תיוג הקמפיין הראשון (UTM). ללא תיוג אי אפשר לדעת בוודאות מה היה המקור.</p>
            {data.sources.length === 0 ? <p className="mt-4 text-sm text-[#6d6259]">אין צפיות עם מקור לתצוגה בתקופה הזו.</p> : (
              <ul className="mt-4 divide-y divide-[#eee5da]">
                {data.sources.map((row) => (
                  <li key={row.source} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="font-bold text-[#463b33]">{sourceLabels[row.source]}</span>
                    <span className="text-sm tabular-nums text-[#6d6259]">{numberFormatter.format(row.visitors)} מבקרים · {numberFormatter.format(row.pageViews)} צפיות</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <details className="rounded-[22px] border border-[#e2d7c8] bg-white p-4 sm:p-5">
            <summary className={`min-h-11 cursor-pointer rounded-lg py-2 font-bold text-[#463b33] ${focusClass}`}>פירוט לפי יום</summary>
            <div role="region" aria-label="נתוני שימוש יומיים, ניתן לגלול אופקית" tabIndex={0} className={`mt-3 overflow-x-auto rounded-lg ${focusClass}`}>
              <table className="w-full min-w-[360px] text-right text-sm tabular-nums">
                <caption className="sr-only">ספירת אירועים לכל יום בתקופה, לפי UTC</caption>
                <thead><tr className="border-b border-[#e2d7c8] text-[#6d6259]">
                  <th scope="col" className="py-3 pe-2">תאריך</th><th scope="col" className="px-2 py-3">צפיות</th><th scope="col" className="px-2 py-3">מבקרים</th><th scope="col" className="px-2 py-3">יצירות</th><th scope="col" className="ps-2 py-3">העתקות</th>
                </tr></thead>
                <tbody>{data.daily.map((row) => <tr key={row.date} className="border-b border-[#f0e9e0] text-[#463b33]">
                  <th scope="row" className="whitespace-nowrap py-3 pe-2 font-medium">{dateFormatter.format(new Date(row.date))}</th>
                  <td className="px-2 py-3">{numberFormatter.format(row.pageViews)}</td><td className="px-2 py-3">{numberFormatter.format(row.visitors)}</td><td className="px-2 py-3">{numberFormatter.format(row.generations)}</td><td className="ps-2 py-3">{numberFormatter.format(row.copies)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="text-xs leading-5 text-[#6d6259]">המסך מציג ספירות מצטברות בלבד, ללא תוכן הודעות, כתובות אימייל או מזהי מבקרים. צפיות, יצירות והעתקות משתמשות בבסיסי זיהוי שונים, ולכן אינן משפך המרה מדויק.</p>
    </div>
  );
}

export default function InsightsClient() {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [reportState, setReportState] = useState<ReportState>({ status: "loading" });
  const [days, setDays] = useState<7 | 30>(7);
  const [refresh, setRefresh] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    async function observeAuth() {
      try {
        const [{ getFirebaseClientAuth }, { onAuthStateChanged }] = await Promise.all([
          import("@/lib/firebase-client"), import("firebase/auth"),
        ]);
        if (disposed) return;
        unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), (user) => {
          if (disposed) return;
          requestVersion.current += 1;
          setReportState({ status: "loading" });
          setAuthState(user && !user.isAnonymous ? { status: "ready", user } : { status: "signed_out" });
        }, () => { if (!disposed) setAuthState({ status: "error" }); });
      } catch {
        if (!disposed) setAuthState({ status: "error" });
      }
    }
    void observeAuth();
    return () => { disposed = true; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (authState.status !== "ready") return;
    const controller = new AbortController();
    const version = requestVersion.current;
    const user = authState.user;
    const isCurrent = () => !controller.signal.aborted && requestVersion.current === version;
    async function load() {
      try {
        const token = await user.getIdToken();
        if (!isCurrent()) return;
        const response = await fetch(`/api/insights?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!isCurrent()) return;
        if (response.status === 401) {
          setReportState({ status: "signed_out" });
        } else if (response.status === 403) {
          setReportState({ status: isRecord(body) && body.code === "INSIGHTS_NOT_CONFIGURED" ? "permission_pending" : "forbidden" });
        } else if (response.ok && isVisitorInsights(body) && body.period.days === days) {
          setReportState({ status: "ready", data: body });
        } else {
          setReportState({ status: "error" });
        }
      } catch {
        if (isCurrent()) setReportState({ status: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [authState, days, refresh]);

  const state = authState.status === "ready" ? reportState : authState;
  const canRefresh = authState.status === "ready" && reportState.status !== "loading";
  const signedOut = state.status === "signed_out";
  const stateMessage = state.status === "permission_pending"
    ? { title: "הגישה לנתונים עדיין לא הופעלה", body: "נדרשת הגדרת הרשאה בצד השרת לפני שאפשר לצפות בנתונים. אין כרגע נתונים להצגה לחשבון הזה." }
    : state.status === "forbidden"
      ? { title: "אין לחשבון הזה הרשאה לצפות בנתונים", body: "הנתונים פרטיים וזמינים רק לחשבונות שקיבלו הרשאה. אפשר לחזור לדף הבית ולהתחבר לחשבון המתאים." }
      : signedOut
        ? { title: "צריך להתחבר לחשבון מורשה", body: "התחברו דרך דף הבית, ואז חזרו לכאן ורעננו את העמוד. כניסה אנונימית אינה מעניקה גישה לנתונים." }
        : { title: "הנתונים אינם זמינים כרגע", body: "לא הצלחנו לטעון את הנתונים. זו אינה ספירה של אפס פעילות. אפשר לנסות שוב בעוד רגע." };

  return (
    <main dir="rtl" className="min-h-screen bg-[#fbf7f1] px-4 py-6 text-[#241d18] sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-black tracking-wide text-[#8f371e]">SAYBACK · מסך פרטי</p><h1 className="mt-2 text-3xl font-black">נתוני שימוש</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#6d6259]">תמונת מצב מצטברת של ביקורים, יצירת תשובות והעתקות.</p></div>
          <Link href="/" className={`inline-flex min-h-11 items-center rounded-full border border-[#ded2c3] bg-white px-4 text-sm font-bold ${focusClass}`}>חזרה ל־SayBack</Link>
        </header>
        {authState.status === "ready" ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="insights-period">תקופה
              <select id="insights-period" value={days} onChange={(event) => { requestVersion.current += 1; setReportState({ status: "loading" }); setDays(event.target.value === "30" ? 30 : 7); }} className={`min-h-11 rounded-xl border border-[#ded2c3] bg-white px-3 text-[#463b33] ${focusClass}`}>
                <option value="7">7 ימים אחרונים</option><option value="30">30 ימים אחרונים</option>
              </select>
            </label>
            <button type="button" disabled={!canRefresh} onClick={() => { requestVersion.current += 1; setReportState({ status: "loading" }); setRefresh((current) => current + 1); }} className={`min-h-11 rounded-xl bg-[#241d18] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50 ${focusClass}`}>רענון נתונים</button>
          </div>
        ) : null}
        {state.status === "loading" ? (
          <div role="status" className="rounded-[22px] border border-[#e2d7c8] bg-white p-6 text-[#6d6259]">טוענים את נתוני השימוש…</div>
        ) : state.status === "ready" && "data" in state ? <Report data={state.data} /> : (
          <section role="status" className="rounded-[22px] border border-[#e2d7c8] bg-white p-6">
            <h2 className="text-lg font-bold">{stateMessage.title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#6d6259]">{stateMessage.body}</p>
            {signedOut || state.status === "forbidden" ? <Link href="/" className={`mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#241d18] px-4 text-sm font-bold text-white ${focusClass}`}>לכניסה דרך דף הבית</Link> : null}
            {authState.status === "error" ? <button type="button" onClick={() => window.location.reload()} className={`mt-4 min-h-11 rounded-xl border border-[#ded2c3] px-4 text-sm font-bold ${focusClass}`}>טעינה מחדש</button> : null}
          </section>
        )}
      </div>
    </main>
  );
}
