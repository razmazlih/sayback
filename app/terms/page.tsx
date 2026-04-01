import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "תנאי שימוש",
  description: "תנאי השימוש של SayBack לשירות ניסוח תשובות להודעות.",
};

export default function TermsPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#fff7e6] px-4 py-8 text-right text-[#19130f] sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-6 rounded-[28px] border-2 border-black bg-white p-6 shadow-[0_10px_0_0_#111111]">
        <h1 className="text-3xl font-black text-black">תנאי שימוש</h1>
        <p className="text-sm font-bold text-neutral-700">עודכן לאחרונה: 1 באפריל 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">מה השירות נותן</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            מה עונים? מספק הצעות ניסוח בלבד. האחריות על שליחת הודעה בפועל היא של המשתמש.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">שימוש מותר</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            אין להשתמש בשירות לצורך הטרדה, התחזות, הפרת חוק או פגיעה באחרים.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">תשלום וחבילות</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            רכישות מבוצעות דרך Stripe. חבילות שימוש ומסלולים כפופים למחיר שמופיע באתר בזמן הרכישה.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">זמינות ושינויים</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            ייתכנו תקלות זמניות ושינויים בתמחור, בתכונות או בתנאים, לפי שיקול המפעיל.
          </p>
        </section>
      </div>
    </main>
  );
}
