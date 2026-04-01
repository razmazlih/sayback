import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description: "איך SayBack אוסף מידע, משתמש בו ושומר על פרטיות המשתמשים.",
};

export default function PrivacyPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#fff7e6] px-4 py-8 text-right text-[#19130f] sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-6 rounded-[28px] border-2 border-black bg-white p-6 shadow-[0_10px_0_0_#111111]">
        <h1 className="text-3xl font-black text-black">מדיניות פרטיות</h1>
        <p className="text-sm font-bold text-neutral-700">עודכן לאחרונה: 1 באפריל 2026</p>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">איזה מידע נאסף</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            כדי לספק את השירות אנחנו שומרים נתוני חשבון בסיסיים (מזהה משתמש אנונימי), סטטוס שימוש ותשלום.
            תהליך התשלום מבוצע על ידי Stripe.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">מה לא נשמר</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            הודעות הצ&apos;אט והתמונות שנשלחות לצורך ניסוח תשובה לא נשמרות במסד נתונים של המוצר מעבר לטיפול
            המיידי בבקשה.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">ספקים חיצוניים</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            השירות נעזר ב-OpenAI ליצירת ניסוחים, Firebase לאימות משתמשים ושמירת מצב חשבון, ו-Stripe
            לסליקה.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-black text-black">יצירת קשר</h2>
          <p className="text-sm leading-7 font-bold text-neutral-800">
            לפניות בנושא פרטיות אפשר ליצור קשר דרך ערוץ התמיכה של האתר.
          </p>
        </section>
      </div>
    </main>
  );
}
