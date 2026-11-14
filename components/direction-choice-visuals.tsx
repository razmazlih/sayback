import type { ReactNode } from 'react';
import type { ContextOption, ToneOption } from '@/lib/generator-options';
import type { ContinuePreference, DirectionField, Goal } from '@/lib/reply-direction';

export type DirectionIconName =
  | 'feather' | 'target' | 'wave' | 'smile' | 'sparkle' | 'shield' | 'leaf'
  | 'briefcase' | 'sun' | 'list' | 'heart' | 'broken-heart' | 'people'
  | 'handshake' | 'tag' | 'coffee' | 'home' | 'key' | 'buildings' | 'chat'
  | 'calendar' | 'question' | 'door' | 'arrows' | 'bell' | 'clock' | 'language' | 'note';

// Original line drawings use geometry rather than emoji or device fonts.
const iconShapes: Record<DirectionIconName, ReactNode> = {
  feather: <><path d="M5 20 17 8M8 17C1 12 9 2 19 4c2 9-3 15-11 13ZM12 13V8M12 13h5" /></>,
  target: <><circle cx="11" cy="13" r="8" /><circle cx="11" cy="13" r="4" /><path d="m11 13 9-9M16 4h4v4" /></>,
  wave: <><path d="M3 8c3-4 6 4 9 0s6 4 9 0M3 13c3-4 6 4 9 0s6 4 9 0M3 18c3-4 6 4 9 0s6 4 9 0" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14c1 4 7 4 8 0M8 9h.01M16 9h.01" /></>,
  sparkle: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 3v4M18 5h4" /></>,
  shield: <><path d="M12 3c3 2 5 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6c3 0 5-1 8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  leaf: <><path d="M5 18C0 9 9 3 20 4c1 10-6 17-15 14ZM4 21 16 9M9 16v-5M9 16h5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c6 3 12 3 18 0M10 13v3h4v-3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  list: <><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  heart: <><path d="M12 20S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 11-9 11Z" /></>,
  'broken-heart': <><path d="M9 4a5 5 0 0 0-6 5c0 6 9 11 9 11s9-5 9-11a5 5 0 0 0-6-5M13 3l-3 6 4 3-3 6" /></>,
  people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3" /></>,
  handshake: <><path d="m2 9 4-4 4 2M22 9l-4-4-4 1-5 5 2 2 4-3 5 5M3 11l7 8c1 1 2 1 3 0l6-5M6 14l3 3M9 12l6 5M17 7l4 5" /></>,
  tag: <><path d="M3 4h8l10 10-8 8L3 12V4Z" /><circle cx="7.5" cy="8.5" r="1.5" /><path d="m12 12 4 4" /></>,
  coffee: <><path d="M4 9h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9ZM16 10h2a3 3 0 0 1 0 6h-2M7 3v3M12 3v3M2 21h18" /></>,
  home: <><path d="m2 11 10-8 10 8M5 10v11h14V10M10 21v-7h4v7" /></>,
  key: <><circle cx="8" cy="8" r="5" /><path d="m12 12 9 9M16 16l3-3M19 19l3-3M7 7h.01" /></>,
  buildings: <><path d="M3 21V5h9v16M12 9h9v12M2 21h20M6 9h3M6 13h3M6 17h3M16 13h2M16 17h2" /></>,
  chat: <><path d="M6 4h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-7l-5 4v-4a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M7 9h10M7 13h6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18m-13 5 3 3 5-5" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 17h.01" /></>,
  door: <><path d="M4 21V3h12v18M2 21h17M9 12h.01M17 12h5m-3-3 3 3-3 3" /></>,
  arrows: <><path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0v5l3 3H3l3-3V9ZM9 20a3 3 0 0 0 6 0M12 1v2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  language: <><path d="M3 5h12M9 3v2M5 5c0 5 4 8 8 10M13 5c0 5-4 8-9 10M14 21l4-10 4 10M15.5 17h5" /></>,
  note: <><path d="M12 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-6M8 16l1-4L18 3l3 3-9 9-4 1ZM16 5l3 3M7 7h3" /></>,
};

export function DirectionIcon({ name, className }: { name: DirectionIconName; className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {iconShapes[name]}
    </svg>
  );
}

export const directionChoices: Record<ToneOption | ContextOption | Goal | ContinuePreference, { icon: DirectionIconName; description: string; label?: string }> = {
  'עדין': { icon: 'feather', description: 'ברכות ובלי ללחוץ' },
  'ישיר': { icon: 'target', description: 'להגיד בדיוק מה שרוצים' },
  'זורם': { icon: 'wave', description: 'טבעי, כמו בשיחה' },
  'מצחיק': { icon: 'smile', description: 'להכניס חיוך קטן' },
  'פלרטטני': { icon: 'sparkle', description: 'עם רמז וקצת קסם' },
  'אסרטיבי': { icon: 'shield', description: 'בטוח וברור, בלי לתקוף' },
  'רגוע': { icon: 'leaf', description: 'להוריד קצת את המתח' },
  'רשמי': { icon: 'briefcase', description: 'מכובד ומקצועי' },
  'קליל': { icon: 'sun', description: 'פשוט, בלי כובד' },
  'ענייני': { icon: 'list', description: 'קצר ולעניין' },
  'קראש': { icon: 'heart', description: 'יש פה עניין' },
  'אקס': { icon: 'broken-heart', description: 'כשיש סיפור משותף' },
  'ידיד': { icon: 'people', description: 'בגובה העיניים' },
  'לקוח': { icon: 'handshake', description: 'שירותי וברור' },
  'בוס': { icon: 'briefcase', description: 'בשיחה עם המנהל' },
  'יד2': { icon: 'tag', description: 'קונים, מוכרים וסוגרים' },
  'בן/בת זוג': { icon: 'heart', description: 'למי שהכי קרוב' },
  'דייט': { icon: 'coffee', description: 'לפני או אחרי הפגישה' },
  'קולגה': { icon: 'briefcase', description: 'עובדים ביחד' },
  'משפחה': { icon: 'home', description: 'עם האנשים של הבית' },
  'שותף/ה לדירה': { icon: 'key', description: 'חולקים את היום־יום' },
  'שכנים': { icon: 'buildings', description: 'שומרים על שכנות טובה' },
  'להמשיך שיחה': { icon: 'chat', label: 'להמשיך לדבר', description: 'לענות ולשאול בחזרה' },
  'לקבוע זמן': { icon: 'calendar', label: 'לתאם זמן', description: 'לקבוע יום ושעה' },
  'לבקש הבהרה': { icon: 'question', label: 'להבין יותר', description: 'לשאול למה התכוונו' },
  'להציב גבול': { icon: 'shield', description: 'להגיד מה לא מתאים' },
  'לסגור בנימוס': { icon: 'door', label: 'לסיים בנעימות', description: 'לסגור את השיחה' },
  'להתמקח / לקדם סגירה': { icon: 'arrows', label: 'להתמקח', description: 'לשפר מחיר או תנאים' },
  'תזכורת עדינה': { icon: 'bell', description: 'להזכיר בלי להכביד' },
  'בדיקת סטטוס': { icon: 'clock', description: 'לברר איפה זה עומד' },
  'שחרור מכבד': { icon: 'door', description: 'לשחרר ולהשאיר טעם טוב' },
  'כן': { icon: 'chat', description: 'להשאיר מקום לעוד הודעה' },
  'לא': { icon: 'door', description: 'לסיים בנעימות כאן' },
};

export const directionFields: Record<DirectionField, { icon: DirectionIconName; question: string; description: string }> = {
  tone: { icon: 'wave', question: 'איזה וייב מתאים לתשובה?', description: 'בוחרים את הטון שלך, והוא מתעדכן מיד.' },
  context: { icon: 'people', question: 'עם מי מתכתבים?', description: 'בוחרים את הקשר לשיחה. הבחירה מתעדכנת מיד.' },
  goal: { icon: 'target', question: 'מה התשובה צריכה לעשות?', description: '' },
  language: { icon: 'language', question: 'איך הכי טבעי לנסח?', description: 'מתאימים את הניסוח שלך ואת הפנייה לצד השני.' },
  continue: { icon: 'chat', question: 'להשאיר פתח להמשך?', description: 'זו בחירה אם להמשיך לדבר, גם בלי להסכים לתוכן ההודעה.' },
  background: { icon: 'note', question: 'מה עוד כדאי לדעת?', description: 'כל שינוי מתעדכן מיד, רק לשיחה הזאת.' },
};
