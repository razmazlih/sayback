import { buildHomeDeepLink } from '@/lib/home-deeplink';

export type ContextOption = 'קראש' | 'אקס' | 'לקוח' | 'בוס' | 'יד2';
export type ToneOption = 'עדין' | 'ישיר' | 'זורם' | 'מצחיק' | 'פלרטטני';
export type ContinuePreference = 'כן' | 'לא';
export type AnswerPageCategory = 'crush-ex' | 'client-boss' | 'yad2' | 'daily-dating';

type ReplySample = {
  reply: string;
  whyItWorks: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

type FaqList =
  | readonly [FaqItem, FaqItem, FaqItem, FaqItem]
  | readonly [FaqItem, FaqItem, FaqItem, FaqItem, FaqItem]
  | readonly [FaqItem, FaqItem, FaqItem, FaqItem, FaqItem, FaqItem];

type QuickTips =
  | readonly [string, string, string]
  | readonly [string, string, string, string];

export type SeoAnswerGeneratorPrefill = {
  message: string;
  context: ContextOption;
  tone: ToneOption;
  continuePreference?: ContinuePreference;
};

export type SeoAnswerPage = {
  slug: string;
  query: string;
  teaser: string;
  category: AnswerPageCategory;
  intro: string;
  sampleReplies: readonly [ReplySample, ReplySample, ReplySample];
  quickTips: QuickTips;
  faq: FaqList;
  ctaTitle: string;
  ctaDescription: string;
  generatorPrefill: SeoAnswerGeneratorPrefill;
  relatedSlugs: readonly string[];
  metaTitle: string;
  metaDescription: string;
};

export const answerPageCategories = [
  {
    id: 'crush-ex',
    label: 'קראש/אקס',
    description: 'סיטואציות רגישות עם משיכה, חזרה מהעבר או בדיקת גבולות.',
  },
  {
    id: 'client-boss',
    label: 'לקוח/בוס',
    description: 'תגובות מקצועיות למו״מ, תשלומים, דחיפות ושעות עבודה.',
  },
  {
    id: 'yad2',
    label: 'יד2',
    description: 'ניהול משא ומתן מהיר בלי לבזבז זמן או להישאב להתמקחות אינסופית.',
  },
  {
    id: 'daily-dating',
    label: 'יומיומי/דייטינג',
    description: 'מצבים חברתיים יומיומיים: מבוכה, ביטולים, חוסר עניין ושיחות רגישות.',
  },
] as const;

export const topAnswerPageSlugs = [
  'crush-suddenly-texted',
  'ex-checking-in',
  'client-asks-discount',
  'boss-messages-at-night',
  'yad2-last-price',
  'need-to-talk-message',
] as const;

export const seoAnswerPages = [
  {
    slug: 'crush-suddenly-texted',
    query: 'מה לענות לקראש שפתאום נזכר',
    teaser: 'תשובות ששומרות עניין בלי להיראות זמינים מדי.',
    category: 'crush-ex',
    intro:
      'כשהקראש חוזר אחרי שקט, כדאי לענות חם אבל לא מתמסר מדי. המטרה היא להחזיר שיחה טובה תוך שמירה על ערך עצמי.',
    sampleReplies: [
      {
        reply: 'היי, איזה קטע שנזכרת 🙂 מה חדש אצלך?',
        whyItWorks: 'קליל, מזמין המשך שיחה, ולא משדר שחיכית כל היום.',
      },
      {
        reply: 'כיף לשמוע ממך. איך עבר עליך השבוע?',
        whyItWorks: 'מכבד וזורם, עם שאלה שמחזירה אליו את הכדור.',
      },
      {
        reply: 'דווקא תפס אותי בזמן טוב, בא לך לקפה השבוע?',
        whyItWorks: 'מעביר לשלב פרקטי במקום להיתקע בהתכתבויות.',
      },
    ],
    quickTips: [
      'לא לפתוח את נושא ההיעלמות במשפט הראשון.',
      'להשאיר ניסוח קצר ולא הסבר רגשי ארוך.',
      'אם מתאים לך להמשיך, תני צעד הבא ברור.',
    ],
    faq: [
      {
        question: 'כדאי להזכיר שהוא נעלם?',
        answer: 'רק אם זה חשוב לך להצבת גבול, ובניסוח קצר בלי האשמות.',
      },
      {
        question: 'איך לא להישמע קרה מדי?',
        answer: 'להוסיף שאלה פתוחה אחת ולשמור טון ענייני וחמים.',
      },
      {
        question: 'מתי לעבור להצעה להיפגש?',
        answer: 'כשיש רצף של כמה הודעות נעימות ולא רק "מה קורה" יבש.',
      },
      {
        question: 'אם אני לא בטוחה שאני רוצה להמשיך?',
        answer: 'עני קצר ובנימוס, בלי לפתוח הזמנה להמשך שלא מתאים לך.',
      },
      {
        question: 'מה להימנע מלכתוב?',
        answer: 'משפטים כמו "חיכיתי שתכתוב" שיכולים להחליש את העמדה שלך.',
      },
    ],
    ctaTitle: 'רוצה נוסח שמתאים בדיוק להודעה שקיבלת?',
    ctaDescription: 'פתח/י את כלי התשובות עם פרה־פיל מוכן, ותקבל/י 3 תשובות נוספות בסגנון שבחרת.',
    generatorPrefill: {
      message: 'היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך',
      context: 'קראש',
      tone: 'פלרטטני',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'ghosted-then-returned',
      'need-to-talk-message',
      'polite-not-interested',
      'ex-checking-in',
    ],
    metaTitle: 'מה לענות לקראש שפתאום נזכר | 3 תשובות טבעיות + FAQ',
    metaDescription:
      'מה לענות לקראש שפתאום נזכר: 3 ניסוחים קצרים, הסברים למה הם עובדים, FAQ וקישור ישיר לכלי התשובות.',
  },
  {
    slug: 'ex-checking-in',
    query: 'מה לענות לאקס שבודק דופק',
    teaser: 'ניסוחים ברורים שמציבים גבול בלי לייצר דרמה.',
    category: 'crush-ex',
    intro:
      'אקס שחוזר לבדוק דופק הוא מצב שמבלבל הרבה אנשים. תשובה טובה צריכה להיות קצרה, מכבדת, וברורה לגבי הכיוון שלך.',
    sampleReplies: [
      {
        reply: 'טוב לשמוע ממך. אני במקום אחר היום ומעדיף/ה לשמור מרחק.',
        whyItWorks: 'מכבד את הצד השני אבל לא משאיר פתח מעורפל.',
      },
      {
        reply: 'מעריך/ה את ההודעה, פשוט לא מתאים לי לפתוח את זה מחדש.',
        whyItWorks: 'ישיר וענייני בלי להיגרר לוויכוח.',
      },
      {
        reply: 'מאחל/ת לך טוב, ואני ממשיך/ה הלאה.',
        whyItWorks: 'מסיים את השיחה בצורה בוגרת וקצרה.',
      },
    ],
    quickTips: [
      'לא להצדיק את עצמך בפסקאות ארוכות.',
      'אם כתבת גבול, לא לרכך אותו מיד אחרי.',
      'כשיש לחץ מהצד השני, חזרי על אותו מסר בקצרה.',
    ],
    faq: [
      {
        question: 'איך לענות אם אני עדיין מתלבט/ת?',
        answer: 'אפשר לבקש זמן בלי להבטיח חזרה לקשר כרגע.',
      },
      {
        question: 'מותר לא לענות בכלל?',
        answer: 'כן, במיוחד אם הקשר היה פוגעני או לא בטוח עבורך.',
      },
      {
        question: 'מה אם הוא שולח כמה הודעות ברצף?',
        answer: 'להשיב פעם אחת בצורה ברורה ולהימנע מדיון חוזר.',
      },
      {
        question: 'כדאי להסביר למה זה נגמר?',
        answer: 'רק אם זה משרת אותך. ברוב המקרים משפט קצר מספיק.',
      },
      {
        question: 'איך לשמור על טון לא תוקפני?',
        answer: 'להשתמש ב"אני" במקום האשמות, ולסגור במשפט מנומס.',
      },
    ],
    ctaTitle: 'צריך/ה נוסח עדין יותר או חד יותר?',
    ctaDescription: 'בכלי התשובות אפשר לבחור טון וסיטואציה ולקבל ניסוחים שמתאימים בדיוק לשיחה שלך.',
    generatorPrefill: {
      message: 'וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?',
      context: 'אקס',
      tone: 'ישיר',
      continuePreference: 'לא',
    },
    relatedSlugs: [
      'crush-suddenly-texted',
      'ghosted-then-returned',
      'polite-not-interested',
      'need-to-talk-message',
    ],
    metaTitle: 'מה לענות לאקס שבודק דופק | 3 תשובות שמציבות גבול',
    metaDescription:
      'מה לענות לאקס שבודק דופק: 3 תגובות ברורות, FAQ פרקטי וקישור לכלי התשובות עם פרה־פיל.',
  },
  {
    slug: 'client-asks-discount',
    query: 'מה לענות ללקוח שמבקש הנחה',
    teaser: 'איך להגן על המחיר ועדיין להתקדם לסגירה.',
    category: 'client-boss',
    intro:
      'בקשה להנחה היא חלק טבעי במכירה. תשובה נכונה לא חייבת לוותר על הערך שלך, אלא לכוון את השיחה לסגירה חכמה.',
    sampleReplies: [
      {
        reply: 'תודה על הפנייה. המחיר שהעברתי כולל את כל מה שסיכמנו והוא המחיר הנכון לפרויקט.',
        whyItWorks: 'שומר על מסגרת המחיר בלי להתנצל.',
      },
      {
        reply: 'יכול/ה לבוא לקראתך בהטבה קטנה אם סוגרים היום.',
        whyItWorks: 'נותן גמישות מוגבלת ומחבר אותה למחויבות.',
      },
      {
        reply: 'אם נוריד היקף, אוכל להתאים מחיר. רוצה שאשלח שתי חלופות?',
        whyItWorks: 'מעביר את הדיון לערך והיקף במקום הורדה אוטומטית.',
      },
    ],
    quickTips: [
      'להגיב בביטחון ולא ממקום מתגונן.',
      'לקשור כל הנחה לתנאי ברור (זמן, היקף, מקדמה).',
      'לסיים כל הודעה בצעד הבא.',
    ],
    faq: [
      {
        question: 'מתי כן כדאי לתת הנחה?',
        answer: 'כשיש ערך עסקי ברור כמו נפח גדול או לקוח אסטרטגי.',
      },
      {
        question: 'איך מסרבים להנחה בלי לאבד את הלקוח?',
        answer: 'להסביר את הערך, להישאר קצר, ולהציע חלופה רלוונטית.',
      },
      {
        question: 'כדאי לכתוב "זה המחיר האחרון"?',
        answer: 'רק אם באמת אין גמישות. אחרת עדיף להציע מבנה עסקה חלופי.',
      },
      {
        question: 'מה עושים אם הלקוח משווה למתחרה זול?',
        answer: 'להחזיר את השיחה לתוצאה, שירות ותמורה, לא רק למחיר.',
      },
      {
        question: 'איך לשמור על יחסים טובים גם כשלא מסכימים?',
        answer: 'להישאר מקצועיים, לא אישיים, ולשדר רצון להתקדם.',
      },
    ],
    ctaTitle: 'רוצה לנסח תשובה מקצועית להודעה של הלקוח שלך?',
    ctaDescription: 'הדבק/י את ההודעה וקבל/י 3 נוסחים מוכנים כולל טון ומסגור עסקי נכון.',
    generatorPrefill: {
      message: 'ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו',
      context: 'לקוח',
      tone: 'עדין',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'client-late-payment',
      'boss-messages-at-night',
      'yad2-last-price',
      'friend-cancelled-last-minute',
    ],
    metaTitle: 'מה לענות ללקוח שמבקש הנחה | תגובות מקצועיות שסוגרות עסקאות',
    metaDescription:
      'מה לענות ללקוח שמבקש הנחה: 3 נוסחים מעשיים, טיפים למו״מ ו־FAQ קצר לשמירה על ערך.',
  },
  {
    slug: 'boss-messages-at-night',
    query: 'מה לענות לבוס ששולח בערב',
    teaser: 'להישאר מקצועיים בלי ליצור זמינות אינסופית.',
    category: 'client-boss',
    intro:
      'הודעות ערב מהבוס קורות לכולם. המפתח הוא לתת מענה ענייני שמכבד את העבודה וגם את הגבולות שלך.',
    sampleReplies: [
      {
        reply: 'ראיתי, תודה. מטפל/ת בזה דבר ראשון בבוקר ומעדכן/ת.',
        whyItWorks: 'מאשר קבלה ומגדיר זמן תגובה ריאלי.',
      },
      {
        reply: 'קיבלתי. אם זה דחוף להערב תגיד/י ואבדוק איך לקדם.',
        whyItWorks: 'משאיר גמישות למצבי חירום בלי להתחייב אוטומטית.',
      },
      {
        reply: 'על זה. שולח/ת עדכון מסודר עד 09:30.',
        whyItWorks: 'שידור שליטה, אחריות וציפייה ברורה.',
      },
    ],
    quickTips: [
      'להפריד בין דחוף באמת לבין לא דחוף.',
      'לנסח זמני עדכון מדויקים.',
      'לא להתנצל על גבול לגיטימי.',
    ],
    faq: [
      {
        question: 'מתי כדאי לענות מיד?',
        answer: 'כשיש השפעה מיידית על לקוח/מערכת או אירוע חירום אמיתי.',
      },
      {
        question: 'איך להציב גבול בלי להישמע לא מחויב/ת?',
        answer: 'להראות אחריות ולתת זמן ביצוע ברור במקום "לא יכול/ה" בלבד.',
      },
      {
        question: 'מה אם זה דפוס קבוע?',
        answer: 'שווה לפתוח שיחה יזומה על שעות תגובה וציפיות עבודה.',
      },
      {
        question: 'לענות בוואטסאפ או במייל?',
        answer: 'לפי הנוהל בצוות; בעדכון משמעותי עדיף גם תיעוד במייל/כלי עבודה.',
      },
      {
        question: 'אפשר להשתמש באותו נוסח שוב?',
        answer: 'כן, עקביות בגבולות דווקא עוזרת לבסס ציפיות.',
      },
    ],
    ctaTitle: 'צריך/ה ניסוח מהיר להודעת ערב שקיבלת מהעבודה?',
    ctaDescription: 'פתח/י את כלי התשובות עם פרמטרים מוכנים והתאם/י את ההודעה לפי הסיטואציה שלך.',
    generatorPrefill: {
      message: 'אפשר עדכון קצר על המשימה? זה חשוב להנהלה עד הבוקר',
      context: 'בוס',
      tone: 'ישיר',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'client-asks-discount',
      'client-late-payment',
      'need-to-talk-message',
      'awkward-follow-up-message',
    ],
    metaTitle: 'מה לענות לבוס ששולח בערב | תגובות מקצועיות עם גבול ברור',
    metaDescription:
      'מה לענות לבוס ששולח בערב: 3 תגובות קצרות, טיפים לשעות עבודה ו־FAQ לשמירה על גבולות.',
  },
  {
    slug: 'yad2-last-price',
    query: 'מה לענות ביד2 על "אחרון כמה"',
    teaser: 'תשובות קצרות שמקדמות סגירה במקום התשה.',
    category: 'yad2',
    intro:
      'בשיחות יד2 השאלה "אחרון כמה" חוזרת שוב ושוב. נוסח נכון יחסוך זמן ויקדם את הקונה להחלטה במקום עוד סיבוב התמקחות.',
    sampleReplies: [
      {
        reply: 'המחיר האחרון הוא 420₪. אם מתאים לך, אפשר לאסוף היום בערב.',
        whyItWorks: 'ברור, ממוקד, ומוסיף צעד סגירה.',
      },
      {
        reply: 'יכול/ה לרדת ל-390₪ בסגירה היום.',
        whyItWorks: 'נותן הנחה מוגבלת שמייצרת דחיפות.',
      },
      {
        reply: 'המחיר נשאר כמו במודעה, המוצר שמור ועובד מצוין.',
        whyItWorks: 'שומר על ערך המוצר בלי להיגרר לוויכוח.',
      },
    ],
    quickTips: [
      'לציין מחיר אחד ברור ולא טווח.',
      'להוסיף זמינות לאיסוף/מפגש.',
      'לא להאריך בהסברים מיותרים.',
    ],
    faq: [
      {
        question: 'איך להגיב להצעה נמוכה מאוד?',
        answer: 'בנימוס ובקצרה: מחיר סופי או סירוב, בלי דיון מתיש.',
      },
      {
        question: 'מתי כדאי להתגמש?',
        answer: 'כשאת/ה רוצה לסגור היום או כשמדובר בקונה רציני וזמין.',
      },
      {
        question: 'כדאי להחזיק פריט למי ששואל הרבה?',
        answer: 'רק אחרי התחייבות ברורה לשעה ומקום, אחרת לא.',
      },
      {
        question: 'להוסיף "לא גמיש" במודעה?',
        answer: 'אפשר, אבל עדיין תקבל/י שאלה. עדיף להכין תשובה קצרה קבועה.',
      },
      {
        question: 'איך לשמור על בטיחות במכירה?',
        answer: 'להיפגש במקום ציבורי ולשתף רק פרטים נחוצים.',
      },
    ],
    ctaTitle: 'רוצה ניסוח מותאם לשיחת היד2 שלך?',
    ctaDescription: 'הדבק/י את ההודעה של הקונה וקבל/י 3 תגובות מהירות שמוכנות לשליחה.',
    generatorPrefill: {
      message: 'אחרון כמה? אם תעשה מחיר סוגר עכשיו',
      context: 'יד2',
      tone: 'זורם',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'client-asks-discount',
      'client-late-payment',
      'friend-cancelled-last-minute',
      'awkward-follow-up-message',
    ],
    metaTitle: 'מה לענות ביד2 על "אחרון כמה" | 3 תגובות לסגירה מהירה',
    metaDescription:
      'מה לענות ביד2 על "אחרון כמה": דוגמאות תשובה קצרות, טיפים להתמקחות חכמה ו־FAQ.',
  },
  {
    slug: 'ghosted-then-returned',
    query: 'מה לענות למישהו שלא ענה ואז חזר',
    teaser: 'להמשיך בטבעיות בלי לוותר על כבוד עצמי.',
    category: 'crush-ex',
    intro:
      'אחרי שקט פתאומי וחזרה מאוחרת, עדיף לענות מאוזן: לא מתעלם לגמרי, אבל גם לא כאילו כלום לא קרה.',
    sampleReplies: [
      {
        reply: 'היי, טוב שחזרת. מה קורה אצלך?',
        whyItWorks: 'נעים, קצר, ולא נכנס מיד לחשבון נפש.',
      },
      {
        reply: 'ראיתי את ההודעה עכשיו. אם בא לך להמשיך, בוא נשמור על תקשורת רציפה.',
        whyItWorks: 'מציב ציפייה ברורה בצורה רגועה.',
      },
      {
        reply: 'שמח/ה לשמוע ממך. מתאים לך לקבוע שיחה במקום פינג־פונג?',
        whyItWorks: 'מעביר לשיחה אמיתית ומסנן חוסר רצינות.',
      },
    ],
    quickTips: [
      'להימנע ממשפט פתיחה ציני או עוקצני.',
      'אם חשוב לך רצף, תגיד/י את זה במפורש.',
      'להזיז את השיחה לפעולה במקום חפירות.',
    ],
    faq: [
      {
        question: 'כדאי לפתוח ב"איפה נעלמת"?',
        answer: 'רק אם את/ה מסוגל/ת לכתוב את זה קליל בלי האשמה כבדה.',
      },
      {
        question: 'איך לזהות אם החזרה רצינית?',
        answer: 'בדקי אם יש יוזמה עקבית ולא רק הודעה חד־פעמית בלילה.',
      },
      {
        question: 'מה אם אני עדיין פגוע/ה?',
        answer: 'מותר לקחת מרחק או לענות רק כשתרגיש/י נוח.',
      },
      {
        question: 'לכמה זמן לחכות לפני תגובה?',
        answer: 'אין חוק. בחרי זמן שמרגיש טבעי ולא תגובה אימפולסיבית.',
      },
      {
        question: 'איך לא להישאב שוב לאותו דפוס?',
        answer: 'להגדיר ציפייה ברורה כבר בתחילת השיחה.',
      },
    ],
    ctaTitle: 'רוצה תשובה מותאמת לסיטואציה המדויקת שלך?',
    ctaDescription: 'פתח/י את כלי התשובות עם פרה־פיל וקבל/י נוסחים נוספים לפי הטון שלך.',
    generatorPrefill: {
      message: 'סליחה שנעלמתי, היה לי עומס מטורף. מה איתך?',
      context: 'קראש',
      tone: 'זורם',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'crush-suddenly-texted',
      'ex-checking-in',
      'need-to-talk-message',
      'awkward-follow-up-message',
    ],
    metaTitle: 'מה לענות למישהו שלא ענה ואז חזר | תשובות עם גבול בריא',
    metaDescription:
      'מה לענות למישהו שלא ענה ואז חזר: 3 תשובות מאוזנות, טיפים לשמירה על ערך עצמי ו־FAQ.',
  },
  {
    slug: 'need-to-talk-message',
    query: 'מה לענות ל"צריך לדבר"',
    teaser: 'להרגיע לחץ ולהגדיר מסגרת לשיחה.',
    category: 'daily-dating',
    intro:
      'ההודעה "צריך לדבר" יכולה להקפיץ דופק. תשובה טובה מורידה את רמת הלחץ ומכוונת את השיחה למסגרת ברורה.',
    sampleReplies: [
      {
        reply: 'בטח, מתי נוח לך לדבר?',
        whyItWorks: 'קצר, יציב, ומראה זמינות עניינית בלי פאניקה.',
      },
      {
        reply: 'סבבה. אפשר להבין בכמה מילים על מה מדובר?',
        whyItWorks: 'מבקש הקשר ומקטין אי־ודאות לפני השיחה.',
      },
      {
        reply: 'אני פנוי/ה בערב. אם דחוף, אפשר גם עכשיו לכמה דקות.',
        whyItWorks: 'נותן חלופות ומחזיר שליטה על הזמנים.',
      },
    ],
    quickTips: [
      'לא להניח ישר תסריט שלילי.',
      'לבקש הקשר אם זה עוזר לך להירגע.',
      'להציע זמן קונקרטי במקום "מתי שתרצה".',
    ],
    faq: [
      {
        question: 'כדאי לשאול "קרה משהו"?',
        answer: 'כן, בניסוח רגוע וקצר כדי לא להעצים לחץ.',
      },
      {
        question: 'מה אם אני לא פנוי/ה כרגע?',
        answer: 'תני חלון זמן ברור חלופי כדי לא להשאיר את זה פתוח.',
      },
      {
        question: 'עדיף שיחה או הודעות?',
        answer: 'במצבים רגישים עדיף שיחה קצרה כדי למנוע פרשנויות.',
      },
      {
        question: 'איך לא להישמע מתגוננ/ת?',
        answer: 'להיצמד לעובדות ולזמנים, בלי להסביר יותר מדי.',
      },
      {
        question: 'מתי נכון לדחות למחר?',
        answer: 'כשאין דחיפות מיידית ואת/ה צריך/ה זמן להיות ממוקד/ת.',
      },
    ],
    ctaTitle: 'רוצה ניסוח מדויק ל"צריך לדבר" שקיבלת?',
    ctaDescription: 'כלי התשובות ייתן לך 3 תגובות רגועות לפי ההקשר והסגנון שלך.',
    generatorPrefill: {
      message: 'צריך לדבר כשיהיה לך רגע',
      context: 'קראש',
      tone: 'עדין',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'ghosted-then-returned',
      'awkward-follow-up-message',
      'date-rejected',
      'boss-messages-at-night',
    ],
    metaTitle: 'מה לענות ל"צריך לדבר" | 3 תגובות שמורידות לחץ',
    metaDescription:
      'מה לענות ל"צריך לדבר": דוגמאות קצרות ומרגיעות, FAQ שימושי וקישור לכלי התשובות של SayBack.',
  },
  {
    slug: 'date-rejected',
    query: 'מה לענות כשדוחים דייט',
    teaser: 'לשמור על כבוד עצמי ולהמשיך הלאה בסטייל.',
    category: 'daily-dating',
    intro:
      'דחייה אחרי הצעת דייט יכולה לבאס, אבל תשובה טובה שומרת על כבוד עצמי ומשאירה אותך במקום בוגר ונעים.',
    sampleReplies: [
      {
        reply: 'הכול טוב, תודה על הכנות 🙏 שיהיה לך שבוע מעולה.',
        whyItWorks: 'מכבד, קצר, וסוגר יפה בלי מרירות.',
      },
      {
        reply: 'מבין/ה לגמרי, מעריך/ה שכתבת ברור.',
        whyItWorks: 'משדר ביטחון רגשי ולא תגובת פגיעה.',
      },
      {
        reply: 'אין בעיה, בהצלחה בהמשך.',
        whyItWorks: 'תשובה מינימלית שמונעת גרירת שיחה מיותרת.',
      },
    ],
    quickTips: [
      'לא לנסות לשכנע אחרי דחייה ברורה.',
      'לא לשלוח כמה הודעות המשך ברצף.',
      'לשמור על ניסוח קצר ומכבד.',
    ],
    faq: [
      {
        question: 'כדאי לשאול "למה לא"?',
        answer: 'ברוב המקרים לא. זה לרוב לא ישנה את התוצאה.',
      },
      {
        question: 'מותר להשאיר דלת פתוחה?',
        answer: 'כן, אם זה טבעי. לא בלחץ ולא בציפייה גבוהה.',
      },
      {
        question: 'איך להימנע מהודעה פגועה?',
        answer: 'כתבי הודעה קצרה, קחי כמה דקות לפני השליחה.',
      },
      {
        question: 'מה אם הצד השני לא היה ברור?',
        answer: 'אפשר לשאול פעם אחת בעדינות ולהמשיך הלאה.',
      },
      {
        question: 'להוריד עוקב אחרי דחייה?',
        answer: 'תלוי בך. אם זה עוזר לך לשחרר, זו בחירה לגיטימית.',
      },
    ],
    ctaTitle: 'רוצה תשובה מותאמת לדחייה שקיבלת?',
    ctaDescription: 'פתח/י את כלי התשובות וקבל/י 3 ניסוחים שמרגישים טבעיים ולא מתאמצים.',
    generatorPrefill: {
      message: 'את/ה נשמע/ת מקסים, אבל זה פחות מתאים לי כרגע',
      context: 'קראש',
      tone: 'עדין',
      continuePreference: 'לא',
    },
    relatedSlugs: [
      'polite-not-interested',
      'need-to-talk-message',
      'crush-suddenly-texted',
      'friend-cancelled-last-minute',
    ],
    metaTitle: 'מה לענות כשדוחים דייט | תשובות קצרות ומכבדות',
    metaDescription:
      'מה לענות כשדוחים דייט: 3 תגובות מכבדות, FAQ פרקטי וטיפים לשמירה על כבוד עצמי.',
  },
  {
    slug: 'polite-not-interested',
    query: 'מה לענות כשלא מעוניינים אבל רוצים להישאר מנומסים',
    teaser: 'לסרב ברור ועדין בלי לפגוע ובלי לערפל.',
    category: 'daily-dating',
    intro:
      'לפעמים רוצים לומר "לא" בצורה יפה. תשובה טובה צריכה להיות מנומסת, ברורה, ולא להשאיר ציפייה לא נכונה.',
    sampleReplies: [
      {
        reply: 'תודה על ההודעה, זה מחמיא. אני פחות בכיוון הזה כרגע.',
        whyItWorks: 'מכיר/ה במחווה ומעביר/ה גבול ברור.',
      },
      {
        reply: 'מעריך/ה אותך, אבל לא מרגיש/ה התאמה רומנטית.',
        whyItWorks: 'ישיר ומכבד, בלי דו־משמעות.',
      },
      {
        reply: 'תודה שכתבת. מעדיפ/ה לשמור את זה בידידות.',
        whyItWorks: 'מגדיר כיוון חלופי בצורה רגועה.',
      },
    ],
    quickTips: [
      'לא להשתמש בתירוצים מורכבים.',
      'משפט אחד ברור עדיף על ניסוח מתפתל.',
      'להימנע מ"אולי בעתיד" אם זה לא באמת נכון.',
    ],
    faq: [
      {
        question: 'איך לא להישמע קשוח/ה מדי?',
        answer: 'פותחים בהערכה קצרה ואז מוסיפים גבול חד־משמעי.',
      },
      {
        question: 'מה אם הצד השני מתעקש?',
        answer: 'לחזור על המסר בנימוס, בלי להיכנס לוויכוח.',
      },
      {
        question: 'כדאי להציע חברות?',
        answer: 'רק אם זה באמת מתאים לך ולא מתוך אשמה.',
      },
      {
        question: 'איך מסיימים את השיחה יפה?',
        answer: 'משפט קצר כמו "מאחל/ת לך טוב" סוגר בנעימות.',
      },
      {
        question: 'להתנצל על זה שאני לא מעוניינ/ת?',
        answer: 'לא חייבים להתנצל על גבול אישי לגיטימי.',
      },
    ],
    ctaTitle: 'רוצה "לא" ברור שנשמע טבעי?',
    ctaDescription: 'כלי התשובות יעזור לך לנסח תשובה מנומסת שמתאימה בדיוק להקשר שלך.',
    generatorPrefill: {
      message: 'היי, ממש נהניתי לדבר איתך. בא לך שנצא השבוע?',
      context: 'קראש',
      tone: 'עדין',
      continuePreference: 'לא',
    },
    relatedSlugs: [
      'date-rejected',
      'ex-checking-in',
      'crush-suddenly-texted',
      'awkward-follow-up-message',
    ],
    metaTitle: 'מה לענות כשלא מעוניינים אבל רוצים להישאר מנומסים | ניסוחים ברורים',
    metaDescription:
      'מה לענות כשלא מעוניינים אבל רוצים להישאר מנומסים: 3 תגובות קצרות, FAQ וטיפים להצבת גבול נעים.',
  },
  {
    slug: 'friend-cancelled-last-minute',
    query: 'מה לענות לחבר שביטל ברגע האחרון',
    teaser: 'להגיב בלי פיצוץ, ועדיין לשמור על גבול.',
    category: 'daily-dating',
    intro:
      'ביטול בדקה ה-90 יכול לתסכל. אפשר לענות בצורה רגועה שמכבדת את הקשר אבל גם לא מחליקה את הכול.',
    sampleReplies: [
      {
        reply: 'סבבה, קורה. פעם הבאה בוא נקבע כשאתה בטוח.',
        whyItWorks: 'מכיל את המצב ומסמן ציפייה לעתיד.',
      },
      {
        reply: 'מבין/ה, אבל התארגנתי במיוחד. נקבע מחדש בזמן שמתאים לשנינו.',
        whyItWorks: 'משקף את ההשפעה בלי לתקוף.',
      },
      {
        reply: 'אין בעיה, רק תעדכן יותר מוקדם בפעם הבאה 🙏',
        whyItWorks: 'טון נעים עם בקשה ברורה לשיפור.',
      },
    ],
    quickTips: [
      'לא לשלוח הודעה פוגעת מתוך עצבים מיידיים.',
      'לציין מה היה לא נעים לך, בלי האשמות אישיות.',
      'להוסיף מה היית רוצה בפעם הבאה.',
    ],
    faq: [
      {
        question: 'כדאי לענות מיד או אחרי שנרגעים?',
        answer: 'עדיף אחרי כמה דקות כדי לא להגיב מהבטן.',
      },
      {
        question: 'מה אם זה קורה שוב ושוב?',
        answer: 'שווה להציב גבול ברור לגבי תיאומים עתידיים.',
      },
      {
        question: 'איך לא להישמע דרמטי/ת?',
        answer: 'להישאר בעובדות: מה קרה ומה את/ה מבקש/ת להבא.',
      },
      {
        question: 'למחול תמיד כדי לשמור על החברות?',
        answer: 'חברות טובה כוללת גם אמינות וכבוד לזמן שלך.',
      },
      {
        question: 'מה לכתוב אם אני לא רוצה לקבוע שוב?',
        answer: 'אפשר לענות בנימוס ולסגור בלי לתאם חלופה.',
      },
    ],
    ctaTitle: 'רוצה תשובה מאוזנת לביטול שקיבלת?',
    ctaDescription: 'הדבק/י את ההודעה ותקבל/י 3 ניסוחים לפי הטון שמתאים לך כרגע.',
    generatorPrefill: {
      message: 'סליחה אחי, לא אספיק להגיע בסוף',
      context: 'קראש',
      tone: 'ישיר',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'awkward-follow-up-message',
      'need-to-talk-message',
      'yad2-last-price',
      'date-rejected',
    ],
    metaTitle: 'מה לענות לחבר שביטל ברגע האחרון | תגובות עם גבול ברור',
    metaDescription:
      'מה לענות לחבר שביטל ברגע האחרון: 3 תגובות פרקטיות, FAQ וטיפים לניהול סיטואציה מבאסת.',
  },
  {
    slug: 'client-late-payment',
    query: 'מה לענות ללקוח שמתעכב בתשלום',
    teaser: 'תזכורות חדות אבל מכבדות שמקדמות גבייה.',
    category: 'client-boss',
    intro:
      'כשלקוח מתעכב בתשלום, חשוב להיות ענייניים ועקביים. הודעה ברורה עם תאריך או פעולה ספציפית מעלה סיכוי לתשלום מהיר.',
    sampleReplies: [
      {
        reply: 'היי, תזכורת קצרה שהחשבונית מתאריך 12.3 עדיין פתוחה. אשמח לעדכון על מועד התשלום.',
        whyItWorks: 'מדויק ומבוסס עובדות, בלי תוקפנות.',
      },
      {
        reply: 'כדי להמשיך לשלב הבא, צריך לסגור את התשלום הפתוח עד מחר ב-12:00.',
        whyItWorks: 'מחבר תשלום להתקדמות עבודה באופן ברור.',
      },
      {
        reply: 'אם נוח, אפשר לבצע העברה היום ולשלוח אישור כדי שאמשיך מיד.',
        whyItWorks: 'נותן פעולה פשוטה ומיידית במקום דיון כללי.',
      },
    ],
    quickTips: [
      'להתייחס לחשבונית/סכום/תאריך בפועל.',
      'להציע צעד הבא ברור עם זמן יעד.',
      'לשמור תיעוד כתוב של כל תזכורת.',
    ],
    faq: [
      {
        question: 'מתי לשלוח תזכורת ראשונה?',
        answer: 'בדרך כלל יום-יומיים אחרי תאריך היעד שנקבע.',
      },
      {
        question: 'כדאי להיות קשוח כבר מההודעה הראשונה?',
        answer: 'לא. מתחילים ענייני ומסלימים רק אם אין תגובה.',
      },
      {
        question: 'מה אם הלקוח מבטיח ומשהה שוב?',
        answer: 'לבקש תאריך קשיח ולתעד אותו בהודעה חוזרת.',
      },
      {
        question: 'מותר לעצור עבודה עד תשלום?',
        answer: 'כן, אם זה מופיע בתנאים שסוכמו מראש.',
      },
      {
        question: 'להתקשר או לשלוח הודעה?',
        answer: 'שילוב טוב הוא הודעה מתועדת ואז שיחת מעקב קצרה.',
      },
    ],
    ctaTitle: 'צריך/ה ניסוח גבייה מותאם ללקוח שלך?',
    ctaDescription: 'פתח/י את כלי התשובות עם טקסט מוכן וקבל/י 3 תזכורות מקצועיות ומדויקות.',
    generatorPrefill: {
      message: 'היי, ראיתי שעדיין לא הועבר התשלום על החשבונית. מתי אפשר לצפות לסגירה?',
      context: 'לקוח',
      tone: 'ישיר',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'client-asks-discount',
      'boss-messages-at-night',
      'yad2-last-price',
      'awkward-follow-up-message',
    ],
    metaTitle: 'מה לענות ללקוח שמתעכב בתשלום | תזכורות מקצועיות לגבייה',
    metaDescription:
      'מה לענות ללקוח שמתעכב בתשלום: 3 הודעות גבייה קצרות, FAQ וטיפים לשמירה על מקצועיות.',
  },
  {
    slug: 'awkward-follow-up-message',
    query: 'מה לענות להודעת המשך מביכה',
    teaser: 'לצאת ממבוכה במהירות עם ניסוח קליל ובטוח.',
    category: 'daily-dating',
    intro:
      'הודעת המשך מביכה יכולה לקרות לכל אחד. תשובה טובה מחזירה את השיחה למסלול בלי להפוך את הרגע למשהו גדול מדי.',
    sampleReplies: [
      {
        reply: 'חח הכול טוב, בוא נמשיך מכאן 😄',
        whyItWorks: 'מנרמל את המבוכה ומחזיר זרימה.',
      },
      {
        reply: 'קלטתי 🙂 ניסחת יפה בסוף, על מה אתה אומר שנלך?',
        whyItWorks: 'משלב הומור קל ומזיז קדימה את השיחה.',
      },
      {
        reply: 'אין לחץ, קורה לכולם. מה רצית לשאול בעצם?',
        whyItWorks: 'מוריד מתח ומבקש פוקוס לנושא המקורי.',
      },
    ],
    quickTips: [
      'לא להדגיש יותר מדי את המבוכה עצמה.',
      'להוסיף אמוג׳י מתון אם מתאים לדינמיקה.',
      'לכוון מהר לנושא הבא.',
    ],
    faq: [
      {
        question: 'מתי עדיף הומור ומתי לא?',
        answer: 'הומור מתאים כשיש כבר קלילות ביניכם; במצב רגיש עדיף ענייני.',
      },
      {
        question: 'מה אם גם אני נבוך/ה?',
        answer: 'תשובה קצרה ועדינה עדיפה על הסבר ארוך למה זה היה מביך.',
      },
      {
        question: 'כדאי להתעלם ולהמשיך רגיל?',
        answer: 'כן, לרוב זה הפתרון הכי טבעי והכי אפקטיבי.',
      },
      {
        question: 'איך לא להישמע ציני/ת?',
        answer: 'להימנע מעקיצות, ולהשתמש בניסוח חיובי.',
      },
      {
        question: 'מה לעשות אם המבוכה חוזרת שוב?',
        answer: 'להאט טיפה את הקצב ולנסח ברור יותר את הכוונה שלך.',
      },
    ],
    ctaTitle: 'רוצה תגובה קלילה למסר המביך שקיבלת?',
    ctaDescription: 'כלי התשובות יציע 3 תשובות טבעיות לפי הטון שתבחר/י.',
    generatorPrefill: {
      message: 'רגע סליחה, זה יצא ממש מוזר, לא התכוונתי לזה ככה',
      context: 'קראש',
      tone: 'זורם',
      continuePreference: 'כן',
    },
    relatedSlugs: [
      'need-to-talk-message',
      'friend-cancelled-last-minute',
      'ghosted-then-returned',
      'polite-not-interested',
    ],
    metaTitle: 'מה לענות להודעת המשך מביכה | 3 תגובות שמחזירות זרימה',
    metaDescription:
      'מה לענות להודעת המשך מביכה: 3 תשובות טבעיות, FAQ קצר וטיפים להחזרת השיחה למסלול.',
  },
] as const satisfies readonly SeoAnswerPage[];

const seoAnswerPagesBySlug = new Map<string, SeoAnswerPage>(
  seoAnswerPages.map((page) => [page.slug, page]),
);

export function getSeoAnswerPageBySlug(slug: string) {
  return seoAnswerPagesBySlug.get(slug);
}

export function getRelatedSeoAnswerPages(slug: string, limit = 4) {
  const page = getSeoAnswerPageBySlug(slug);
  const normalizedLimit = Math.max(0, Math.floor(limit));

  if (!page || normalizedLimit === 0) {
    return [] as SeoAnswerPage[];
  }

  const result: SeoAnswerPage[] = [];
  const seenSlugs = new Set<string>([slug]);

  for (const relatedSlug of page.relatedSlugs) {
    const relatedPage = getSeoAnswerPageBySlug(relatedSlug);

    if (!relatedPage || seenSlugs.has(relatedPage.slug)) {
      continue;
    }

    result.push(relatedPage);
    seenSlugs.add(relatedPage.slug);

    if (result.length >= normalizedLimit) {
      return result;
    }
  }

  for (const candidate of seoAnswerPages) {
    if (seenSlugs.has(candidate.slug)) {
      continue;
    }

    if (candidate.category !== page.category) {
      continue;
    }

    result.push(candidate);
    seenSlugs.add(candidate.slug);

    if (result.length >= normalizedLimit) {
      return result;
    }
  }

  for (const candidate of seoAnswerPages) {
    if (seenSlugs.has(candidate.slug)) {
      continue;
    }

    result.push(candidate);
    seenSlugs.add(candidate.slug);

    if (result.length >= normalizedLimit) {
      return result;
    }
  }

  return result;
}

export function buildGeneratorDeepLink(prefill: SeoAnswerGeneratorPrefill) {
  const pathWithQuery = buildHomeDeepLink(
    {
      message: prefill.message,
      situation: prefill.context,
      tone: prefill.tone,
      agrees: prefill.continuePreference ?? null,
    },
    { basePath: '/' },
  );

  return `${pathWithQuery}#compose-section`;
}
