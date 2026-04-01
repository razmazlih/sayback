import type { Metadata } from "next";
import { CREDIT_PACK_PRICE_LABEL, CREDIT_PACK_USES } from "@/lib/pricing";

const SITE_NAME = "SayBack";
const ANSWERS_PATH = "/answers";
const UNLIMITED_MONTHLY_PRICE_AGOROT = 2490;
const UNLIMITED_MONTHLY_PRICE_LABEL = `${(UNLIMITED_MONTHLY_PRICE_AGOROT / 100).toFixed(2)}₪`;

export const ANSWERS_OG_SIZE = {
  width: 1200,
  height: 630,
} as const;

export const ANSWERS_INDEX_H1 = "תשובות להודעות לפי סיטואציה";
export const ANSWERS_INDEX_TITLE = "תשובות להודעות לפי סיטואציה | SayBack";
export const ANSWERS_INDEX_DESCRIPTION =
  `מחפשים מה לענות לקראש, לאקס, ללקוח, לבוס או ליד2? SayBack מייצר בדיוק 3 תשובות קצרות וטבעיות בעברית. 3 שימושים ראשונים חינם, ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL}, או ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`;
export const ANSWERS_PRICING_BLURB =
  `3 שימושים ראשונים חינם, אחר כך ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL} בתשלום חד-פעמי או מסלול ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`;

export type AnswerGuide = {
  slug: string;
  title: string;
  h1: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  intro: string;
  situations: readonly string[];
  toneNotes: readonly string[];
  sampleMessage: string;
  sampleIntent: string;
  sampleReplies: readonly [string, string, string];
  relatedSlugs: readonly string[];
  keywords: readonly string[];
  og: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
};

const answerGuides = [
  {
    slug: "crush-replies",
    title: "תשובה להודעה מקראש",
    h1: "תשובה להודעה מקראש בלי להישמע מתאמצים",
    metaTitle: "תשובה להודעה מקראש | 3 ניסוחים קצרים בעברית | SayBack",
    metaDescription:
      `צריכים תשובה להודעה מקראש? SayBack נותן 3 תשובות קצרות וטבעיות בעברית ששומרות על עניין, קלילות וטון מדויק. ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL} או ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`,
    summary:
      "כשקראש כותב פתאום, כל מילה מרגישה קריטית. המטרה היא לשמור על עניין, קלילות וקצב בלי להישמע זמינים מדי או קרים מדי.",
    intro:
      "העמוד הזה מתאים למי שרוצה לענות מהר, להמשיך את הפלואו ולהישאר טבעיים גם כשחושבים יותר מדי על כל מילה.",
    situations: [
      "כשהשיחה התחילה טוב ואתם רוצים לשמור על וייב קליל.",
      "כשמישהו חזר פתאום אחרי כמה ימים ואתם לא רוצים להיראות מחכים.",
      "כשבא לכם לפתוח עוד שאלה או קריצה בלי להעמיס.",
    ],
    toneNotes: [
      "לשמור על משפטים קצרים שמרגישים טבעיים בוואטסאפ ובאינסטגרם.",
      "להחזיר עניין, אבל לא להתחנן להמשך שיחה.",
      "לתת מקום לפלרטוט עדין או לזרימה פשוטה, לפי האנרגיה שמגיעה מהצד השני.",
    ],
    sampleMessage: "היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך",
    sampleIntent: "להחזיר עניין ולהשאיר את השיחה קלילה ומסקרנת.",
    sampleReplies: [
      "חח נו, יפה שנזכרת. מה גרם לזה דווקא עכשיו?",
      "אני מקבלת מחשבות יפות כאלה. מה איתך השבוע?",
      "טוב, זה פתיח לא רע בכלל. מה קורה אצלך?",
    ],
    relatedSlugs: ["ex-replies", "boss-replies", "client-replies"],
    keywords: ["תשובה לקראש", "מה לענות לקראש", "תשובות להודעות אהבה", "תשובה להודעה"],
    og: {
      eyebrow: "תשובות לקראש",
      title: "תשובה להודעה מקראש",
      subtitle: "3 ניסוחים קצרים, טבעיים וקלילים",
    },
  },
  {
    slug: "ex-replies",
    title: "תשובה להודעה מאקס",
    h1: "תשובה להודעה מאקס בלי להסתבך שוב",
    metaTitle: "תשובה להודעה מאקס | לשמור על גבולות וטון נכון | SayBack",
    metaDescription:
      `מחפשים תשובה להודעה מאקס? SayBack בונה 3 תשובות קצרות בעברית שעוזרות לשמור על גבולות, כבוד וטון מדויק. ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL} או ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`,
    summary:
      "הודעות מאקס מעלות מהר רגשות, זיכרונות וסימני שאלה. כאן המטרה היא לענות ברור, קצר ובלי לפתוח דלת שלא התכוונתם לפתוח.",
    intro:
      "העמוד הזה עוזר לבחור ניסוח ששומר עליכם: אפשר להיות אדיבים, אפשר להיות ישירים, ואפשר גם לסגור עניין בלי דרמה.",
    situations: [
      "כשהאקס בודק דופק ואתם לא בטוחים אם בכלל בא לכם להמשיך את השיחה.",
      "כשצריך לשים גבול בלי להיכנס לוויכוח ארוך.",
      "כשחשוב לענות בכבוד, אבל לא לתת מסר כפול.",
    ],
    toneNotes: [
      "לתת תשובה ברורה שמכבדת את שני הצדדים.",
      "להוריד דרמה ולהשאיר ניסוח נקי, בלי עקיצות מיותרות.",
      "לבחור אם הטון צריך להיות סגור, רך או חד יותר לפי הכוונה שלכם.",
    ],
    sampleMessage: "וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?",
    sampleIntent: "לענות בנימוס אבל לשמור על גבול ברור ולא לעודד בלבול.",
    sampleReplies: [
      "אני בסדר, תודה. מעדיפה להשאיר את זה מאחורינו.",
      "תודה ששאלת, הכול טוב. לא נראה לי נכון לפתוח את זה שוב.",
      "אני מעריכה את ההודעה, אבל עדיף לי לא לחזור לשם.",
    ],
    relatedSlugs: ["crush-replies", "boss-replies", "yad2-replies"],
    keywords: ["תשובה לאקס", "מה לענות לאקס", "איך לענות לאקס", "תשובה להודעה מאקס"],
    og: {
      eyebrow: "תשובות לאקס",
      title: "תשובה להודעה מאקס",
      subtitle: "לשמור על גבולות בלי להיגרר",
    },
  },
  {
    slug: "client-replies",
    title: "תשובה ללקוח",
    h1: "תשובה ללקוח שנשמעת מקצועית אבל לא רובוטית",
    metaTitle: "תשובה ללקוח | 3 ניסוחים קצרים ושירותיים | SayBack",
    metaDescription:
      `צריכים תשובה ללקוח על מחיר, הנחה או מעקב? SayBack מציע 3 תשובות קצרות וטבעיות בעברית ששומרות על מקצועיות וסגירה טובה. ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL} או ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`,
    summary:
      "לקוחות רוצים תשובה מהירה וברורה, אבל לא טקסט קר ומכני. הניסוח הנכון שומר גם על השירות וגם על הגבול העסקי.",
    intro:
      "כאן תמצאו דוגמאות לתשובות קצרות ללקוחות שמבקשים הנחה, עדכון, זמינות או הבהרה, בלי להתפזר ובלי לאבד סמכות.",
    situations: [
      "כשלקוח לוחץ לסגור עכשיו בתנאי מחיר אחר.",
      "כשצריך להסביר מה כלול בהצעה בלי חפירה.",
      "כשחשוב לשמור על שירותיות וגם על הרווחיות.",
    ],
    toneNotes: [
      "להישאר ענייניים, נקיים ומקצועיים.",
      "להסביר ערך במקום להישאב למיקוח מיותר.",
      "לנסח בצורה אנושית שנשמעת כמו עסק טוב, לא כמו הודעת מערכת.",
    ],
    sampleMessage: "ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו",
    sampleIntent: "לשמור על שירות טוב, להסביר גבול ולקרב לסגירה בלי להישבר מיד במחיר.",
    sampleReplies: [
      "מבין אותך. כרגע זה המחיר הכי מדויק שאני יכול לתת, והוא כבר כולל את מה שסיכמנו.",
      "אשמח לסגור איתך, אבל זה המחיר הנכון עבור העבודה. אם מתאים לך, אני ממשיך איתך עכשיו.",
      "רוצה לעזור לך להתקדם מהר, פשוט לא נכון לי לרדת בעוד 20%. אם תרצה, אני זמין לסגור בתנאים ששלחתי.",
    ],
    relatedSlugs: ["boss-replies", "yad2-replies", "crush-replies"],
    keywords: ["תשובה ללקוח", "מה לענות ללקוח", "תשובות שירות לקוחות", "ניסוח ללקוח"],
    og: {
      eyebrow: "תשובות ללקוחות",
      title: "תשובה ללקוח",
      subtitle: "מקצועי, קצר ומדויק לסגירה",
    },
  },
  {
    slug: "boss-replies",
    title: "תשובה לבוס",
    h1: "תשובה לבוס ששומרת על מקצועיות ועל עמוד שדרה",
    metaTitle: "תשובה לבוס | ניסוחים קצרים, מכבדים וברורים | SayBack",
    metaDescription:
      `מחפשים תשובה לבוס על משימה, דדליין או בקשה לחוצה? SayBack מייצר 3 תשובות קצרות בעברית ששומרות על מקצועיות, בהירות וגבולות. ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL} או ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`,
    summary:
      "מול בוס צריך דיוק. לא קצר מדי כדי להישמע מזלזלים, ולא ארוך מדי כדי להישמע מתגוננים. בדיוק כאן ניסוח טוב חוסך חיכוך.",
    intro:
      "העמוד הזה מתאים להודעות על סטטוס, דחיפות, שינוי סדר עדיפויות או בקשות שצריך לענות להן מהר ובצורה בטוחה.",
    situations: [
      "כשמבקשים עדכון ואתם צריכים להיות ברורים בלי להישמע מתנצלים.",
      "כשצריך לאשר משימה אבל לחדד לוחות זמנים או תלות בגורמים אחרים.",
      "כשבא לכם לשדר אחריות בלי לקחת על עצמכם יותר ממה שאפשר לעמוד בו.",
    ],
    toneNotes: [
      "לנסח ביטחון, אחריות ותמונה ברורה של השלב הבא.",
      "להימנע מהצטדקות ארוכה או משפה רכה מדי.",
      "לשמור על כבוד הדדי יחד עם גבול מקצועי ברור.",
    ],
    sampleMessage: "אפשר לקבל עדכון עד סוף היום? זה נהיה דחוף",
    sampleIntent: "להראות שליטה, לתת צפי ברור ולהישאר ענייניים.",
    sampleReplies: [
      "כן, אשלח עדכון מסודר עד סוף היום עם מה הושלם ומה נשאר.",
      "על זה. אני מרכז את הכול ואעדכן אותך היום עד הערב.",
      "כן. אעביר לך סטטוס ברור עוד היום כדי שנדע איך להתקדם.",
    ],
    relatedSlugs: ["client-replies", "ex-replies", "crush-replies"],
    keywords: ["תשובה לבוס", "מה לענות לבוס", "ניסוח לבוס", "תשובה מקצועית"],
    og: {
      eyebrow: "תשובות לבוס",
      title: "תשובה לבוס",
      subtitle: "מקצועיות, בהירות ועמוד שדרה",
    },
  },
  {
    slug: "yad2-replies",
    title: "תשובה לקונה ביד2",
    h1: "תשובה לקונה ביד2 שמקדמת עסקה בלי כאב ראש",
    metaTitle: "תשובה לקונה ביד2 | לסגור מהר בלי להסתבך | SayBack",
    metaDescription:
      `צריכים תשובה לקונה ביד2 על מחיר, זמינות או איסוף? SayBack נותן 3 תשובות קצרות בעברית שעוזרות לקדם עסקה מהר ובטון נכון. ${CREDIT_PACK_USES} שימושים ב-${CREDIT_PACK_PRICE_LABEL} או ללא הגבלה ב-${UNLIMITED_MONTHLY_PRICE_LABEL} לחודש.`,
    summary:
      "שיחות ביד2 נופלות על מהירות, בהירות וגבולות. ניסוח טוב עוזר לדעת מי רציני, לסגור מחיר ולהימנע משרשראות אינסופיות.",
    intro:
      "אם אתם מוכרים ורוצים לענות מהר בלי להישאב למיקוח מעייף, זה המקום לתשובות קצרות וברורות שנשמעות אנושיות.",
    situations: [
      "כששואלים ישר על מחיר אחרון בלי לקרוא את המודעה.",
      "כשצריך לקבוע איסוף או לשמור תור לקונה רציני.",
      "כשבא לכם להישאר זורמים אבל לא לבזבז זמן.",
    ],
    toneNotes: [
      "להיות ברורים על מחיר, זמינות ומיקום.",
      "לסנן בנימוס קונים לא רציניים.",
      "לשמור על ניסוח קצר שמתאים למסרים מהירים ולא למסכת שכנועים.",
    ],
    sampleMessage: "אחרון כמה? בא לקחת היום אם יש מחיר טוב",
    sampleIntent: "לשמור על עניין מצד הקונה, אבל להבהיר מחיר ותנאי סגירה.",
    sampleReplies: [
      "אם אתה רציני להיום, המחיר הסופי הוא כמו במודעה ואפשר לתאם איסוף.",
      "אפשר היום, המחיר נשאר כמו שפרסמתי. אם מתאים לך, שולח מיקום.",
      "יש גמישות קטנה רק מול קונה שסוגר היום. אם רלוונטי לך, נתקדם.",
    ],
    relatedSlugs: ["client-replies", "boss-replies", "ex-replies"],
    keywords: ["תשובה ביד2", "מה לענות ביד2", "תשובה לקונה", "ניסוח למכירה"],
    og: {
      eyebrow: "תשובות ליד2",
      title: "תשובה לקונה ביד2",
      subtitle: "לסגור מהר בלי חפירות מיותרות",
    },
  },
] as const satisfies readonly AnswerGuide[];

export function getAllAnswerGuides() {
  return answerGuides;
}

export function getAnswerGuideBySlug(slug: string): AnswerGuide | null {
  return answerGuides.find((answer) => answer.slug === slug) ?? null;
}

export function getRelatedAnswerGuides(relatedSlugs: readonly string[]) {
  return relatedSlugs
    .map((slug) => getAnswerGuideBySlug(slug))
    .filter(
      (
        answer,
      ): answer is NonNullable<ReturnType<typeof getAnswerGuideBySlug>> => answer !== null,
    );
}

export function getAnswersIndexMetadata(): Metadata {
  return {
    title: ANSWERS_INDEX_TITLE,
    description: ANSWERS_INDEX_DESCRIPTION,
    keywords: [
      "SayBack",
      "תשובות להודעות",
      "מה לענות",
      "וואטסאפ",
      "אינסטגרם",
      "דייטינג",
      "שירות לקוחות",
      "יד2",
    ],
    alternates: {
      canonical: ANSWERS_PATH,
    },
    openGraph: {
      title: ANSWERS_INDEX_TITLE,
      description: ANSWERS_INDEX_DESCRIPTION,
      url: ANSWERS_PATH,
      siteName: SITE_NAME,
      locale: "he_IL",
      type: "website",
      images: [
        {
          url: `${ANSWERS_PATH}/opengraph-image`,
          width: ANSWERS_OG_SIZE.width,
          height: ANSWERS_OG_SIZE.height,
          alt: ANSWERS_INDEX_H1,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ANSWERS_INDEX_TITLE,
      description: ANSWERS_INDEX_DESCRIPTION,
      images: [`${ANSWERS_PATH}/opengraph-image`],
    },
  };
}

export function getAnswerGuideMetadata(answer: AnswerGuide): Metadata {
  const path = getAnswerGuideHref(answer.slug);

  return {
    title: answer.metaTitle,
    description: answer.metaDescription,
    keywords: [
      ...answer.keywords,
      "SayBack",
      "תשובות להודעות",
      "עברית",
      "3 תשובות",
    ],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: answer.metaTitle,
      description: answer.metaDescription,
      url: path,
      siteName: SITE_NAME,
      locale: "he_IL",
      type: "website",
      images: [
        {
          url: `${path}/opengraph-image`,
          width: ANSWERS_OG_SIZE.width,
          height: ANSWERS_OG_SIZE.height,
          alt: answer.h1,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: answer.metaTitle,
      description: answer.metaDescription,
      images: [`${path}/opengraph-image`],
    },
  };
}

export function getAnswerGuideHref(slug: string) {
  return `${ANSWERS_PATH}/${slug}`;
}

export function toOgRtlText(text: string) {
  return Array.from(text).reverse().join("");
}
