'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';
import { buildHomeDeepLink } from '@/lib/home-deeplink';
import {
  MAX_CONVERSATION_BACKGROUND_LENGTH,
  MAX_INCOMING_MESSAGE_LENGTH,
  MAX_LAST_OUTGOING_MESSAGE_LENGTH,
  MAX_NO_REPLY_DURATION_VALUE,
} from '@/lib/message-limits';
import {
  CREDIT_PACK_PRICE_LABEL,
} from '@/lib/pricing';

type ContextOption =
  | 'קראש'
  | 'אקס'
  | 'ידיד'
  | 'לקוח'
  | 'בוס'
  | 'יד2'
  | 'בן/בת זוג'
  | 'דייט'
  | 'קולגה'
  | 'משפחה'
  | 'שותף/ה לדירה'
  | 'שכנים';
type ToneOption =
  | 'עדין'
  | 'ישיר'
  | 'זורם'
  | 'מצחיק'
  | 'פלרטטני'
  | 'אסרטיבי'
  | 'רגוע'
  | 'רשמי'
  | 'קליל'
  | 'ענייני';
type ContinuePreference = 'כן' | 'לא';
type ComposeMode = 'incoming' | 'no_reply';
type NoReplyDurationUnit = 'minutes' | 'hours' | 'days';
type ReplyAction = 'softer' | 'sharper' | 'retry';
type SubscriptionAction = 'cancel_next_charge' | 'resume_renewal';
type CheckoutPlan = 'credits_50' | 'unlimited_monthly';
type PaidPlan = CheckoutPlan | null;
type MobileSectionId = 'compose' | 'results' | 'examples' | 'plans';
type MobileNavSectionId = Exclude<MobileSectionId, 'plans'>;
type ExampleId = 'crush-comeback' | 'ex-check-in' | 'client-discount' | 'yad2-classic';

type ExampleScenario = {
  id: ExampleId;
  title: string;
  message: string;
  context: ContextOption;
  tone: ToneOption;
  continuePreference?: ContinuePreference | null;
};

type HomeDeepLinkPrefill = {
  hasValidState: boolean;
  shouldFocusMessage: boolean;
  exampleId?: ExampleId;
  message?: string;
  context?: ContextOption;
  tone?: ToneOption;
  continuePreference?: ContinuePreference;
};

type GenerateResponse = {
  intent: string;
  replies: string[];
  billing?: BillingSnapshot;
};

type GenerateRequest = {
  message: string;
  imageBase64: string | null;
  context: ContextOption;
  tone: ToneOption;
  continuePreference?: ContinuePreference | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  action?: ReplyAction;
  sourceReply?: string;
};

type BillingSnapshot = {
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  credits: number;
  hasUnlimited: boolean;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  billingBypassEnabled?: boolean;
  accessState: 'free' | 'credits' | 'unlimited' | 'blocked';
};

type CheckoutSessionState = {
  clientSecret: string;
  sessionId: string;
  plan: CheckoutPlan;
};

type ManagedSubscriptionState = {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  canCancel: boolean;
  canResume: boolean;
};

type SubscriptionManagementResponse = {
  message?: string;
  error?: string;
  subscription?: ManagedSubscriptionState | null;
  billing?: BillingSnapshot;
};

type CouponRedeemResponse = {
  message?: string;
  error?: string;
  redemption?: {
    status?: 'redeemed' | 'already_redeemed';
    code?: string;
    grantedUses?: number;
  };
  billing?: BillingSnapshot;
};

const FREE_LIMIT = 3;
const BILLING_BYPASS_FALLBACK_ENABLED =
  process.env.NEXT_PUBLIC_BILLING_BYPASS?.trim().toLowerCase() === 'true';
const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const AUTH_ERROR_MESSAGE = 'לא הצלחנו לחבר מחדש את החשבון. נסה שוב בעוד רגע.';
const PAYWALL_TITLE = 'ממשיכים בלי להיתקע';
const PAYWALL_BODY = 'בוחרים מסלול וממשיכים לנסח תשובות מעולות בלי לעצור.';
const DAILY_FREE_EXHAUSTED_HELPER_TEXT =
  'נגמר החינם להיום. אפשר לחזור מחר, או להמשיך עכשיו עם אחד המסלולים.';
const CREDIT_PLAN_COPY = {
  title: '50 שימושים',
  helper: 'עד 150 תשובות',
  price: CREDIT_PACK_PRICE_LABEL,
  badge: 'הכי טוב להתחלה',
  body: 'תשלום חד-פעמי, בלי התחייבות',
  cta: 'לקנות 50 שימושים',
} as const;
const UNLIMITED_PLAN_COPY = {
  title: 'ללא הגבלה חודשי',
  helper: 'למי שרוצה לענות חופשי',
  price: '24.90₪',
  badge: 'חופשי כל החודש',
  body: 'כמה תשובות שרוצים לאורך כל החודש',
  cta: 'לפתוח ללא הגבלה',
} as const;
const DEEP_LINK_PREFILL_BANNER_TEXT = 'מילאנו לך התחלה. אפשר לערוך לפני שמייצרים.';
const QUERY_PARAM_MAX_LENGTH = {
  example: 64,
  message: MAX_INCOMING_MESSAGE_LENGTH,
  situation: 24,
  tone: 24,
  agrees: 8,
} as const;

const contextOptions: ContextOption[] = [
  'קראש',
  'אקס',
  'ידיד',
  'לקוח',
  'בוס',
  'יד2',
  'בן/בת זוג',
  'דייט',
  'קולגה',
  'משפחה',
  'שותף/ה לדירה',
  'שכנים',
];
const toneOptions: ToneOption[] = [
  'עדין',
  'ישיר',
  'זורם',
  'מצחיק',
  'פלרטטני',
  'אסרטיבי',
  'רגוע',
  'רשמי',
  'קליל',
  'ענייני',
];
const continuePreferenceOptions: ContinuePreference[] = ['כן', 'לא'];
const composeModeOptions: Array<{ value: ComposeMode; label: string; description: string }> = [
  {
    value: 'incoming',
    label: 'קיבלתי הודעה',
    description: 'קיבלת הודעה חדשה ורוצה תשובה טובה ומהירה.',
  },
  {
    value: 'no_reply',
    label: 'מחכה לתשובה',
    description: 'שלחת הודעה, ועכשיו צריך פולו-אפ נעים שמקדם תשובה.',
  },
];
const noReplyDurationUnitOptions: Array<{ value: NoReplyDurationUnit; label: string }> = [
  { value: 'minutes', label: 'דקות' },
  { value: 'hours', label: 'שעות' },
  { value: 'days', label: 'ימים' },
];
const mobileSectionNavItems: Array<{ id: MobileNavSectionId; label: string; stepLabel: string }> = [
  { id: 'compose', label: 'כתיבה', stepLabel: 'שלב 1' },
  { id: 'results', label: 'תשובות', stepLabel: 'שלב 2' },
  { id: 'examples', label: 'דוגמאות', stepLabel: 'שלב 3' },
];
const quickStartSteps = [
  {
    step: 'שלב 1',
    title: 'מדביקים את ההודעה',
    body: 'מדביקים הודעה או מוסיפים צילום מסך, ובוחרים את הסגנון שמתאים לכם.',
  },
  {
    step: 'שלב 2',
    title: 'לוחצים ופותחים 3 תשובות',
    body: 'לחיצה אחת, ותוך רגע עולים 3 ניסוחים טבעיים שאפשר לשלוח.',
  },
  {
    step: 'שלב 3',
    title: 'בוחרים ושולחים',
    body: 'אפשר להעתיק כמו שזה, או לרכך, לחדד ולבקש ניסוח חדש בלחיצה.',
  },
] as const;
type HomePageClientMode = 'generator' | 'full';

type ScrollLockSnapshot = {
  scrollY: number;
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyTouchAction: string;
  bodyOverscrollBehavior: string;
};

let activeDocumentScrollLocks = 0;
let documentScrollLockSnapshot: ScrollLockSnapshot | null = null;

function acquireDocumentScrollLock() {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const htmlElement = document.documentElement;
  const bodyElement = document.body;

  if (activeDocumentScrollLocks === 0) {
    const scrollY = window.scrollY;

    documentScrollLockSnapshot = {
      scrollY,
      htmlOverflow: htmlElement.style.overflow,
      htmlOverscrollBehavior: htmlElement.style.overscrollBehavior,
      bodyOverflow: bodyElement.style.overflow,
      bodyPosition: bodyElement.style.position,
      bodyTop: bodyElement.style.top,
      bodyLeft: bodyElement.style.left,
      bodyRight: bodyElement.style.right,
      bodyWidth: bodyElement.style.width,
      bodyTouchAction: bodyElement.style.touchAction,
      bodyOverscrollBehavior: bodyElement.style.overscrollBehavior,
    };

    htmlElement.style.overflow = 'hidden';
    htmlElement.style.overscrollBehavior = 'none';
    bodyElement.style.overflow = 'hidden';
    bodyElement.style.position = 'fixed';
    bodyElement.style.top = `-${scrollY}px`;
    bodyElement.style.left = '0';
    bodyElement.style.right = '0';
    bodyElement.style.width = '100%';
    bodyElement.style.touchAction = 'none';
    bodyElement.style.overscrollBehavior = 'none';
  }

  activeDocumentScrollLocks += 1;

  return () => {
    if (activeDocumentScrollLocks === 0) {
      return;
    }

    activeDocumentScrollLocks -= 1;

    if (activeDocumentScrollLocks !== 0) {
      return;
    }

    if (!documentScrollLockSnapshot) {
      return;
    }

    const snapshot = documentScrollLockSnapshot;
    documentScrollLockSnapshot = null;

    htmlElement.style.overflow = snapshot.htmlOverflow;
    htmlElement.style.overscrollBehavior = snapshot.htmlOverscrollBehavior;
    bodyElement.style.overflow = snapshot.bodyOverflow;
    bodyElement.style.position = snapshot.bodyPosition;
    bodyElement.style.top = snapshot.bodyTop;
    bodyElement.style.left = snapshot.bodyLeft;
    bodyElement.style.right = snapshot.bodyRight;
    bodyElement.style.width = snapshot.bodyWidth;
    bodyElement.style.touchAction = snapshot.bodyTouchAction;
    bodyElement.style.overscrollBehavior = snapshot.bodyOverscrollBehavior;

    window.scrollTo({ top: snapshot.scrollY, left: 0, behavior: 'auto' });
  };
}

function useDocumentScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) {
      return undefined;
    }

    return acquireDocumentScrollLock();
  }, [isLocked]);
}

const examples: ExampleScenario[] = [
  {
    id: 'crush-comeback',
    title: 'קראש שפתאום נזכר',
    message: 'היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך',
    context: 'קראש',
    tone: 'פלרטטני',
    continuePreference: 'כן',
  },
  {
    id: 'ex-check-in',
    title: 'אקס שבודק דופק',
    message: 'וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?',
    context: 'אקס',
    tone: 'ישיר',
    continuePreference: 'לא',
  },
  {
    id: 'client-discount',
    title: 'לקוח שרוצה הנחה',
    message: 'ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו',
    context: 'לקוח',
    tone: 'עדין',
    continuePreference: 'כן',
  },
  {
    id: 'yad2-classic',
    title: 'יד2 קלאסי',
    message: 'אחרון כמה? בא לקחת היום אם יש מחיר טוב',
    context: 'יד2',
    tone: 'זורם',
    continuePreference: 'כן',
  },
];

const answerHubHighlights = [
  {
    slug: 'crush-suddenly-texted',
    query: 'מה לענות לקראש שפתאום נזכר',
    teaser: 'איך להישאר זורמים בלי להיראות זמינים מדי.',
  },
  {
    slug: 'ex-checking-in',
    query: 'מה לענות לאקס שבודק דופק',
    teaser: 'לענות ברור, בלי לפתוח שוב את אותה לולאה.',
  },
  {
    slug: 'client-asks-discount',
    query: 'מה לענות ללקוח שמבקש הנחה',
    teaser: 'להגן על המחיר ועדיין לשמור על שיחה מקצועית.',
  },
  {
    slug: 'boss-messages-at-night',
    query: 'מה לענות לבוס ששולח בערב',
    teaser: 'לשמור על מקצועיות וגבולות בריאים.',
  },
  {
    slug: 'yad2-last-price',
    query: 'מה לענות ביד2 על \"אחרון כמה\"',
    teaser: 'לנהל מו\"מ קצר שמתקדם לסגירה.',
  },
  {
    slug: 'need-to-talk-message',
    query: 'מה לענות ל\"צריך לדבר\"',
    teaser: 'להוריד לחץ ולהיכנס לשיחה עם שליטה.',
  },
] as const;
const exampleIds = new Set<ExampleId>(examples.map((scenario) => scenario.id));
const contextAliases: Record<string, ContextOption> = {
  קראש: 'קראש',
  crush: 'קראש',
  אקס: 'אקס',
  ex: 'אקס',
  ידיד: 'ידיד',
  friend: 'ידיד',
  לקוח: 'לקוח',
  client: 'לקוח',
  בוס: 'בוס',
  boss: 'בוס',
  יד2: 'יד2',
  yad2: 'יד2',
  'בן/בת זוג': 'בן/בת זוג',
  partner: 'בן/בת זוג',
  דייט: 'דייט',
  date: 'דייט',
  קולגה: 'קולגה',
  colleague: 'קולגה',
  משפחה: 'משפחה',
  family: 'משפחה',
  'שותף/ה לדירה': 'שותף/ה לדירה',
  roommate: 'שותף/ה לדירה',
  שכנים: 'שכנים',
  neighbors: 'שכנים',
  neighbours: 'שכנים',
};
const toneAliases: Record<string, ToneOption> = {
  עדין: 'עדין',
  soft: 'עדין',
  ישיר: 'ישיר',
  direct: 'ישיר',
  זורם: 'זורם',
  flow: 'זורם',
  מצחיק: 'מצחיק',
  funny: 'מצחיק',
  פלרטטני: 'פלרטטני',
  flirty: 'פלרטטני',
  אסרטיבי: 'אסרטיבי',
  assertive: 'אסרטיבי',
  רגוע: 'רגוע',
  calm: 'רגוע',
  רשמי: 'רשמי',
  formal: 'רשמי',
  קליל: 'קליל',
  casual: 'קליל',
  ענייני: 'ענייני',
  business: 'ענייני',
  matteroffact: 'ענייני',
};
const continuePreferenceAliases: Record<string, ContinuePreference> = {
  כן: 'כן',
  yes: 'כן',
  true: 'כן',
  '1': 'כן',
  לא: 'לא',
  no: 'לא',
  false: 'לא',
  '0': 'לא',
};

const focusRingBaseClass =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6ce8ff] focus-visible:ring-offset-2';
const lightSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#fff9ef]`;
const whiteSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-white`;
const darkSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#111111]`;
const interactiveBadgeClass =
  'inline-flex min-h-[28px] items-center rounded-full border-2 border-black bg-[#111111] px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#f7ff4f]';
const readOnlyBadgeClass =
  'inline-flex min-h-[28px] items-center rounded-full border-2 border-black bg-[#fff6d8] px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.12em] text-black';
const focusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), details summary, [tabindex]:not([tabindex="-1"])';

const CheckoutPaymentForm = dynamic(
  () => import('@/components/checkout-payment-form').then((module) => module.CheckoutPaymentForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[24px] border-2 border-black bg-white px-4 py-6 text-center text-sm font-bold text-neutral-700">
        רגע, מכינים את התשלום...
      </div>
    ),
  },
);

function isCheckoutPlan(value: string | null): value is CheckoutPlan {
  return value === 'credits_50' || value === 'unlimited_monthly';
}

function mapApiErrorMessage(message: string) {
  const normalized = message.trim();

  if (!normalized) {
    return 'משהו נתקע לרגע. נסה שוב.';
  }

  if (/[\u0590-\u05FF]/.test(normalized)) {
    return normalized;
  }

  const lower = normalized.toLowerCase();

  if (
    lower.includes('authentication is required') ||
    lower.includes('missing firebase bearer token') ||
    lower.includes('unable to verify firebase token')
  ) {
    return AUTH_ERROR_MESSAGE;
  }

  if (lower.includes('too many requests') || lower.includes('too many ')) {
    return 'יש עומס קטן עכשיו. נסה שוב בעוד כמה שניות.';
  }

  if (lower.includes('content-type must be application/json') || lower.includes('request body')) {
    return 'לא קיבלנו את הבקשה בצורה תקינה. רענן את הדף ונסה שוב.';
  }

  if (lower.includes('text input is too long')) {
    return `ההודעה ארוכה מדי. אפשר עד ${MAX_INCOMING_MESSAGE_LENGTH} תווים.`;
  }

  if (lower.includes('no billing access')) {
    return 'נגמרו השימושים כרגע. אפשר לבחור מסלול ולהמשיך.';
  }

  if (lower.includes('unable to start checkout') || lower.includes('unable to load checkout session')) {
    return 'לא הצלחנו לפתוח את התשלום כרגע. נסה שוב בעוד רגע.';
  }

  if (lower.includes('checkout is temporarily disabled')) {
    return 'כרגע הכל פתוח לשימוש ללא הגבלה.';
  }

  if (lower.includes('unexpected server error') || lower.includes('unable to load billing status')) {
    return 'יש תקלה זמנית בצד שלנו. נסה שוב בעוד רגע.';
  }

  return 'משהו נתקע לרגע. נסה שוב.';
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [] as HTMLElement[];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    if (element.tabIndex < 0) {
      return false;
    }

    if (element instanceof HTMLInputElement && element.type === 'hidden') {
      return false;
    }

    return !element.hasAttribute('disabled');
  });
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('טעינת התמונה נכשלה'));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => reject(new Error('טעינת התמונה נכשלה'));
    reader.readAsDataURL(file);
  });
}

function isCompactViewport() {
  return window.matchMedia('(max-width: 1023px)').matches;
}

function getPreferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function formatSubscriptionPeriodEnd(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function isExampleId(value: string): value is ExampleId {
  return exampleIds.has(value as ExampleId);
}

function sanitizeIncomingToken(value: string | null, maxLength: number) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);

  return normalized.length > 0 ? normalized : null;
}

function sanitizeIncomingMessage(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, QUERY_PARAM_MAX_LENGTH.message);

  return normalized.length > 0 ? normalized : null;
}

function parseHomeDeepLinkPrefill(searchParams: URLSearchParams): HomeDeepLinkPrefill {
  const rawExample = sanitizeIncomingToken(searchParams.get('example'), QUERY_PARAM_MAX_LENGTH.example);
  const rawSituation = sanitizeIncomingToken(searchParams.get('situation'), QUERY_PARAM_MAX_LENGTH.situation);
  const rawTone = sanitizeIncomingToken(searchParams.get('tone'), QUERY_PARAM_MAX_LENGTH.tone);
  const rawAgrees = sanitizeIncomingToken(searchParams.get('agrees'), QUERY_PARAM_MAX_LENGTH.agrees);
  const message = sanitizeIncomingMessage(searchParams.get('message')) ?? undefined;

  const exampleCandidate = rawExample?.toLowerCase();
  const exampleId = exampleCandidate && isExampleId(exampleCandidate) ? exampleCandidate : undefined;
  const context = rawSituation ? contextAliases[rawSituation.toLowerCase()] : undefined;
  const tone = rawTone ? toneAliases[rawTone.toLowerCase()] : undefined;
  const continuePreference = rawAgrees ? continuePreferenceAliases[rawAgrees.toLowerCase()] : undefined;

  const hasValidState = Boolean(exampleId || message || context || tone || continuePreference);

  return {
    hasValidState,
    shouldFocusMessage: Boolean(message || exampleId),
    exampleId,
    message,
    context,
    tone,
    continuePreference,
  };
}

function ChipGroup<T extends string>({
  title,
  description,
  options,
  value,
  onChange,
  helperText,
  optional = false,
  allowEmpty = false,
  primaryVisibleCount,
  moreOptionsLabel = 'עוד אפשרויות',
}: {
  title: string;
  description?: string;
  options: readonly T[];
  value: T | null;
  onChange: (nextValue: T | null) => void;
  helperText?: string;
  optional?: boolean;
  allowEmpty?: boolean;
  primaryVisibleCount?: number;
  moreOptionsLabel?: string;
}) {
  const hasSelection = value !== null;
  const normalizedPrimaryVisibleCount = Math.min(
    Math.max(primaryVisibleCount ?? options.length, 1),
    options.length,
  );
  const primaryOptions = options.slice(0, normalizedPrimaryVisibleCount);
  const extraOptions = options.slice(normalizedPrimaryVisibleCount);
  const hasMoreOptions = extraOptions.length > 0;
  const selectedFromMoreOptions = Boolean(value && extraOptions.includes(value));
  const moreOptionsDialogTitleId = useId();
  const moreOptionsDialogDescriptionId = useId();
  const [isMoreOptionsDialogOpen, setIsMoreOptionsDialogOpen] = useState(false);
  const [isMoreOptionsDialogClosing, setIsMoreOptionsDialogClosing] = useState(false);
  const [moreOptionsSearchTerm, setMoreOptionsSearchTerm] = useState('');
  const closeMoreOptionsDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMoreOptionsDialog = () => {
    if (closeMoreOptionsDialogTimerRef.current !== null) {
      clearTimeout(closeMoreOptionsDialogTimerRef.current);
      closeMoreOptionsDialogTimerRef.current = null;
    }

    setMoreOptionsSearchTerm('');
    setIsMoreOptionsDialogClosing(false);
    setIsMoreOptionsDialogOpen(true);
  };

  const closeMoreOptionsDialog = useCallback(() => {
    if (!isMoreOptionsDialogOpen || isMoreOptionsDialogClosing) {
      return;
    }

    setIsMoreOptionsDialogClosing(true);

    if (closeMoreOptionsDialogTimerRef.current !== null) {
      clearTimeout(closeMoreOptionsDialogTimerRef.current);
    }

    closeMoreOptionsDialogTimerRef.current = setTimeout(() => {
      setIsMoreOptionsDialogOpen(false);
      setIsMoreOptionsDialogClosing(false);
      closeMoreOptionsDialogTimerRef.current = null;
    }, 190);
  }, [isMoreOptionsDialogClosing, isMoreOptionsDialogOpen]);

  const filteredMoreOptions = useMemo(() => {
    const normalizedSearchTerm = moreOptionsSearchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm) {
      return options;
    }

    return options.filter((option) => option.toLowerCase().includes(normalizedSearchTerm));
  }, [options, moreOptionsSearchTerm]);

  useDocumentScrollLock(isMoreOptionsDialogOpen);

  useEffect(() => {
    if (!isMoreOptionsDialogOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMoreOptionsDialog();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeMoreOptionsDialog, isMoreOptionsDialogOpen]);

  useEffect(() => {
    return () => {
      if (closeMoreOptionsDialogTimerRef.current !== null) {
        clearTimeout(closeMoreOptionsDialogTimerRef.current);
      }
    };
  }, []);

  const renderOption = (option: T, mode: 'inline' | 'dialog' = 'inline') => {
    const isSelected = option === value;
    const shouldCloseDialogOnSelect = mode === 'dialog';

    return (
      <button
        key={option}
        type="button"
        aria-pressed={isSelected}
        onClick={() => {
          onChange(allowEmpty && isSelected ? null : option);

          if (shouldCloseDialogOnSelect) {
            closeMoreOptionsDialog();
          }
        }}
        className={[
          `w-full rounded-full border-2 px-3.5 py-2 font-bold transition duration-150 touch-manipulation ${whiteSurfaceFocusClass}`,
          mode === 'dialog'
            ? 'min-h-[44px] text-sm sm:w-auto'
            : 'min-h-[40px] text-sm sm:min-h-[42px] sm:w-auto',
          isSelected
            ? 'border-black bg-[#111111] text-[#f7ff4f] shadow-[0_6px_0_0_#ff623d]'
            : 'border-black bg-[#fffdf8] text-black hover:-translate-y-0.5 hover:bg-[#fff8da]',
        ].join(' ')}
      >
        {option}
      </button>
    );
  };

  return (
    <section className="w-full min-w-0 rounded-[22px] border-2 border-black bg-white p-3 shadow-[0_4px_0_0_#111111] sm:p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[0.92rem] font-black text-neutral-900 sm:text-[0.95rem]">{title}</p>
          <span
            className={[
              'rounded-full border border-black px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-[0.12em]',
              optional ? 'bg-[#fff6d8] text-neutral-800' : 'bg-[#d7f9ff] text-black',
            ].join(' ')}
          >
            {optional ? 'אופציונלי' : 'לבחירה'}
          </span>
        </div>

        {allowEmpty && hasSelection ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`min-h-[32px] rounded-full border-2 border-black bg-[#f8f4ed] px-2.5 py-1 text-[0.68rem] font-black text-neutral-800 transition hover:bg-[#efe8dd] ${whiteSurfaceFocusClass}`}
          >
            נקה
          </button>
        ) : null}
      </div>

      {description ? (
        <p className="mt-1 hidden text-xs font-bold leading-5 text-neutral-700 md:block">{description}</p>
      ) : null}

      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {primaryOptions.map((option) => renderOption(option, 'inline'))}
        </div>

        {hasMoreOptions ? (
          <div className="overflow-hidden rounded-[18px] border-2 border-black bg-gradient-to-l from-[#d7f9ff] via-[#fff6d8] to-[#fff2bf] p-2 shadow-[0_3px_0_0_#111111]">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={openMoreOptionsDialog}
                className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border-2 border-black bg-[#111111] px-3.5 py-1.5 text-xs font-black text-[#f7ff4f] shadow-[0_4px_0_0_#ff623d] transition hover:-translate-y-0.5 ${whiteSurfaceFocusClass}`}
              >
                <span>{moreOptionsLabel}</span>
                <span className="rounded-full border border-black bg-white px-1.5 py-0.5 text-[0.62rem] text-black">
                  +{extraOptions.length}
                </span>
              </button>

              {selectedFromMoreOptions && value ? (
                <span className="rounded-full border-2 border-black bg-white px-2.5 py-1 text-xs font-black text-black">
                  נבחר מתוך עוד: {value}
                </span>
              ) : (
                <span className="text-xs font-black text-neutral-800">
                  עוד {extraOptions.length} אפשרויות זמינות בלחיצה
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {helperText ? (
        <p className="mt-1 hidden text-xs font-bold leading-5 text-neutral-600 md:block">{helperText}</p>
      ) : null}

      {hasMoreOptions && isMoreOptionsDialogOpen ? (
        <div
          className={[
            'fixed inset-0 z-[120] flex items-end justify-center sm:items-center',
            isMoreOptionsDialogClosing
              ? 'pointer-events-none motion-safe:animate-[sb-fade-out_190ms_ease-in_forwards]'
              : 'motion-safe:animate-[sb-fade-in_200ms_ease-out]',
          ].join(' ')}
        >
          <button
            type="button"
            aria-label="סגירה"
            onClick={closeMoreOptionsDialog}
            className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={moreOptionsDialogTitleId}
            aria-describedby={moreOptionsDialogDescriptionId}
            className={[
              'relative z-[121] flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[28px] border-2 border-black bg-white shadow-[0_-8px_0_0_#111111] sm:max-h-[84vh] sm:max-w-2xl sm:rounded-[28px] sm:shadow-[0_10px_0_0_#111111]',
              isMoreOptionsDialogClosing
                ? 'motion-safe:animate-[sb-paywall-out_190ms_ease-in_forwards]'
                : 'motion-safe:animate-[sb-paywall-in_240ms_ease-out]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3 border-b-2 border-black bg-[#fff6d8] px-4 py-3">
              <div className="space-y-1">
                <p id={moreOptionsDialogTitleId} className="text-base font-black text-black sm:text-lg">
                  {title}: בחירה מורחבת
                </p>
                <p id={moreOptionsDialogDescriptionId} className="text-xs font-bold text-neutral-700 sm:text-sm">
                  בחרו בנוחות את האופציה שמתאימה בדיוק. לחיצה על אופציה סוגרת ושומרת בחירה.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMoreOptionsDialog}
                className={`inline-flex min-h-[38px] items-center justify-center rounded-full border-2 border-black bg-white px-3 text-xs font-black text-black transition hover:bg-[#fff8da] ${whiteSurfaceFocusClass}`}
              >
                סגור
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black text-neutral-800">חיפוש מהיר</span>
                  <input
                    type="text"
                    value={moreOptionsSearchTerm}
                    onChange={(event) => setMoreOptionsSearchTerm(event.target.value)}
                    placeholder="הקלידו כדי לסנן אפשרויות..."
                    className={`min-h-[44px] w-full rounded-full border-2 border-black bg-[#fffdf8] px-4 py-2 text-sm font-bold text-black outline-none transition placeholder:text-neutral-500 focus:bg-white ${whiteSurfaceFocusClass}`}
                  />
                </label>

                {allowEmpty && hasSelection ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(null);
                      closeMoreOptionsDialog();
                    }}
                    className={`inline-flex min-h-[40px] items-center justify-center rounded-full border-2 border-black bg-[#f8f4ed] px-3.5 py-2 text-xs font-black text-neutral-800 transition hover:bg-[#efe8dd] ${whiteSurfaceFocusClass}`}
                  >
                    לנקות בחירה
                  </button>
                ) : null}

                {filteredMoreOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                    {filteredMoreOptions.map((option) => renderOption(option, 'dialog'))}
                  </div>
                ) : (
                  <p className="rounded-2xl border-2 border-black bg-[#fff6d8] px-4 py-3 text-sm font-bold text-neutral-800">
                    לא נמצאו תוצאות לחיפוש הזה.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ExampleCard({
  scenario,
  onUse,
}: {
  scenario: ExampleScenario;
  onUse: (scenario: ExampleScenario) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onUse(scenario)}
      className={`group flex min-h-44 w-full cursor-pointer flex-col justify-between rounded-[28px] border-2 border-black bg-[#fff6d8] p-5 text-right shadow-[0_10px_0_0_#111111] transition duration-200 hover:-translate-y-1 hover:bg-[#f7ff4f] touch-manipulation ${darkSurfaceFocusClass}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs font-black text-neutral-700">
          <span className="rounded-full border border-black bg-white px-3 py-1">
            {scenario.context}
          </span>
          <div className="flex items-center gap-2">
            <span>{scenario.tone}</span>
            <span className={interactiveBadgeClass}>לחיץ</span>
          </div>
        </div>
        <h3 className="text-lg font-black text-black">{scenario.title}</h3>
        <p className="text-sm leading-6 text-neutral-800">
          &quot;{scenario.message}&quot;
        </p>
      </div>
      <span className="mt-4 text-sm font-black text-black">לחיצה אחת, והדוגמה נכנסת לטופס</span>
    </button>
  );
}

function ReplyCard({
  reply,
  index,
  onCopy,
  onAdjust,
  isBusy,
  isUpdating,
  copied,
}: {
  reply: string;
  index: number;
  onCopy: (reply: string, index: number) => void;
  onAdjust: (index: number, action: ReplyAction) => void;
  isBusy: boolean;
  isUpdating: boolean;
  copied: boolean;
}) {
  return (
    <article className="relative w-full min-w-0 overflow-hidden rounded-[26px] border-2 border-black bg-white p-3.5 shadow-[0_8px_0_0_#111111] sm:rounded-[28px] sm:p-4 sm:shadow-[0_10px_0_0_#111111]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-black bg-[#f7ff4f] px-3 py-1 text-xs font-black text-black">
          אפשרות {index + 1}
        </span>
        {isUpdating ? (
          <span className="text-xs font-bold text-neutral-700">מעדכן...</span>
        ) : null}
      </div>

      <p className="text-base leading-7 font-bold text-neutral-900">{reply}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-bold">
        <button
          type="button"
          onClick={() => onCopy(reply, index)}
          className={`inline-flex min-h-[42px] items-center justify-center rounded-2xl border-2 border-black bg-[#111111] px-3.5 py-2 leading-5 text-[#f7ff4f] transition hover:bg-[#222222] ${whiteSurfaceFocusClass}`}
        >
          {copied ? 'הועתק' : 'העתק'}
        </button>

        <details className="group min-w-0 flex-1 rounded-[20px] border-2 border-dashed border-black bg-[#fff6d8] transition-colors duration-200 open:bg-[#fff2bf] sm:min-w-[11rem]">
          <summary
            className={`flex min-h-[42px] cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-right text-sm font-black text-black marker:content-none ${whiteSurfaceFocusClass}`}
          >
            <span>לשפר את הניסוח</span>
            <span className="text-xs transition-transform duration-200 group-open:rotate-180">⌄</span>
          </summary>

          <div className="sb-accordion-content">
            <div className="sb-accordion-content-inner">
              <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => onAdjust(index, 'softer')}
                  disabled={isBusy}
                  className={`inline-flex min-h-[42px] items-center justify-center rounded-2xl border-2 border-black bg-[#d7f9ff] px-3.5 py-2 leading-5 text-black transition hover:bg-[#b8f2ff] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                >
                  עדין יותר
                </button>
                <button
                  type="button"
                  onClick={() => onAdjust(index, 'sharper')}
                  disabled={isBusy}
                  className={`inline-flex min-h-[42px] items-center justify-center rounded-2xl border-2 border-black bg-[#ffd6ce] px-3.5 py-2 leading-5 text-black transition hover:bg-[#ffc5b8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                >
                  חד יותר
                </button>
                <button
                  type="button"
                  onClick={() => onAdjust(index, 'retry')}
                  disabled={isBusy}
                  className={`inline-flex min-h-[42px] items-center justify-center rounded-2xl border-2 border-black bg-white px-3.5 py-2 leading-5 text-black transition hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                >
                  ניסוח חדש
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

function formatUsageWord(count: number) {
  return count === 1 ? 'שימוש' : 'שימושים';
}

type BillingSnapshotPanelProps = {
  freeRemaining: number;
  freeLimit: number;
  dailyFreeRemaining: number;
  dailyLimit: number;
  paidCredits: number;
  hasUnlimitedAccess: boolean;
  showDailyFreeExhaustedHelper: boolean;
  className?: string;
};

function BillingSnapshotPanel({
  freeRemaining,
  freeLimit,
  dailyFreeRemaining,
  dailyLimit,
  paidCredits,
  hasUnlimitedAccess,
  showDailyFreeExhaustedHelper,
  className = '',
}: BillingSnapshotPanelProps) {
  const rows: Array<{ label: string; value: string; bgClass: string }> = [];

  if (hasUnlimitedAccess) {
    rows.push({
      label: 'ללא הגבלה',
      value: 'המסלול החודשי פעיל עכשיו.',
      bgClass: 'bg-[#d7f9ff]',
    });
  }

  if (paidCredits > 0) {
    rows.push({
      label: 'יתרת שימושים',
      value: `נשארו לך ${paidCredits} ${formatUsageWord(paidCredits)}.`,
      bgClass: 'bg-[#fff6d8]',
    });
  }

  if (freeRemaining > 0) {
    rows.push({
      label: 'חינם להתחלה',
      value: `נשארו לך ${freeRemaining} מתוך ${freeLimit} שימושי היכרות.`,
      bgClass: 'bg-white',
    });
  }

  if (dailyLimit > 0 && (dailyFreeRemaining > 0 || (freeRemaining === 0 && !hasUnlimitedAccess))) {
    rows.push({
      label: 'חינם יומי',
      value:
        dailyFreeRemaining > 0
          ? `נשאר לך ${dailyFreeRemaining} ${formatUsageWord(dailyFreeRemaining)} חינם להיום.`
          : 'החינם היומי נגמר להיום.',
      bgClass: 'bg-white',
    });
  }

  if (rows.length === 0) {
    rows.push({
      label: 'סטטוס שימוש',
      value: 'כרגע אין שימושים זמינים.',
      bgClass: 'bg-white',
    });
  }

  return (
    <div className={`w-full min-w-0 rounded-[22px] border-2 border-black bg-[#fff6d8] p-3 ${className}`.trim()}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b2d10]">מה נשאר לך בחשבון</p>
      <div className="mt-2 grid gap-2">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className={`rounded-2xl border-2 border-black px-3 py-2 ${row.bgClass}`}
          >
            <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-neutral-600">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-bold text-black">{row.value}</p>
          </div>
        ))}
      </div>

      {showDailyFreeExhaustedHelper ? (
        <p className="mt-2 rounded-2xl border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black">
          {DAILY_FREE_EXHAUSTED_HELPER_TEXT}
        </p>
      ) : null}
    </div>
  );
}

type SubscriptionManagementPanelProps = {
  subscription: ManagedSubscriptionState | null;
  isLoading: boolean;
  isSessionReady: boolean;
  onAction: (action: SubscriptionAction) => void;
  actionError: string | null;
  actionNotice: string | null;
  className?: string;
};

function SubscriptionManagementPanel({
  subscription,
  isLoading,
  isSessionReady,
  onAction,
  actionError,
  actionNotice,
  className = '',
}: SubscriptionManagementPanelProps) {
  if (!subscription && !isLoading && !actionError && !actionNotice) {
    return null;
  }

  const periodEndLabel = formatSubscriptionPeriodEnd(subscription?.currentPeriodEnd ?? null);
  const statusLine = subscription
    ? subscription.cancelAtPeriodEnd
      ? periodEndLabel
        ? `החיוב הבא בוטל. המנוי ממשיך לעבוד עד ${periodEndLabel}.`
        : 'החיוב הבא בוטל. המנוי נשאר פעיל עד סוף התקופה הנוכחית.'
      : periodEndLabel
        ? `המנוי פעיל ומתחדש לבד. החיוב הבא צפוי ב-${periodEndLabel}.`
        : 'המנוי פעיל ומתחדש אוטומטית בכל חודש.'
    : 'טוענים את פרטי המנוי...';
  const canSubmitAction = isSessionReady && !isLoading && Boolean(subscription);

  return (
    <div className={`w-full min-w-0 rounded-[22px] border-2 border-black bg-white p-3 ${className}`.trim()}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b2d10]">ניהול מנוי חודשי</p>
      <p className="mt-1 text-sm font-bold text-black">{statusLine}</p>
      <p className="mt-2 text-xs font-bold text-neutral-700">
        אפשר לעצור רק את החיוב הבא, ועדיין להמשיך להשתמש עד סוף התקופה.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {subscription?.canCancel ? (
          <button
            type="button"
            onClick={() => onAction('cancel_next_charge')}
            disabled={!canSubmitAction}
            className={`min-h-[42px] rounded-2xl border-2 border-black bg-[#ffd6ce] px-3.5 py-2 text-sm font-black text-black transition hover:bg-[#ffc5b8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isLoading ? 'מעדכנים...' : 'לעצור את החיוב הבא'}
          </button>
        ) : null}

        {subscription?.canResume ? (
          <button
            type="button"
            onClick={() => onAction('resume_renewal')}
            disabled={!canSubmitAction}
            className={`min-h-[42px] rounded-2xl border-2 border-black bg-[#d7f9ff] px-3.5 py-2 text-sm font-black text-black transition hover:bg-[#b8f2ff] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isLoading ? 'מעדכנים...' : 'להפעיל חידוש אוטומטי'}
          </button>
        ) : null}
      </div>

      {actionNotice ? (
        <p className="mt-2 rounded-2xl border-2 border-black bg-[#d7f9ff] px-3 py-2 text-sm font-bold text-black">
          {actionNotice}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-2 rounded-2xl border-2 border-black bg-[#ffd6ce] px-3 py-2 text-sm font-bold text-black">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

type CouponRedeemPanelProps = {
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  onRedeemCoupon: () => void;
  isRedeemingCoupon: boolean;
  isSessionReady: boolean;
  couponError: string | null;
  couponNotice: string | null;
  className?: string;
};

function CouponRedeemPanel({
  couponCode,
  onCouponCodeChange,
  onRedeemCoupon,
  isRedeemingCoupon,
  isSessionReady,
  couponError,
  couponNotice,
  className = '',
}: CouponRedeemPanelProps) {
  const inputId = useId();
  const canRedeem =
    isSessionReady && !isRedeemingCoupon && couponCode.trim().length > 0;

  return (
    <div
      className={`w-full min-w-0 rounded-[22px] border-2 border-black bg-white p-3 ${className}`.trim()}
    >
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b2d10]">הזן קוד קופון</p>
      <p className="mt-1 text-sm font-bold text-neutral-700">
        מזינים כאן קוד ומקבלים עוד שימושים לחשבון.
      </p>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          onRedeemCoupon();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          קוד קופון
        </label>
        <input
          id={inputId}
          value={couponCode}
          onChange={(event) => onCouponCodeChange(event.target.value)}
          placeholder="LOVE26"
          dir="ltr"
          spellCheck={false}
          autoCapitalize="characters"
          autoCorrect="off"
          className={`min-h-[44px] w-full rounded-2xl border-2 border-black bg-white px-3 py-2 text-base font-black uppercase text-black placeholder:text-neutral-400 ${whiteSurfaceFocusClass}`}
        />
        <button
          type="submit"
          disabled={!canRedeem}
          className={`min-h-[44px] shrink-0 rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-2 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
        >
          {isRedeemingCoupon ? 'מממשים...' : 'לממש קופון'}
        </button>
      </form>

      {couponNotice ? (
        <p className="mt-2 rounded-2xl border-2 border-black bg-[#d7f9ff] px-3 py-2 text-sm font-bold text-black">
          {couponNotice}
        </p>
      ) : null}

      {couponError ? (
        <p className="mt-2 rounded-2xl border-2 border-black bg-[#ffd6ce] px-3 py-2 text-sm font-bold text-black">
          {couponError}
        </p>
      ) : null}
    </div>
  );
}

function PaywallModal({
  open,
  onClose,
  onSelectPlan,
  onResetCheckout,
  onPaymentCompleted,
  isCheckoutLoading,
  checkoutPlan,
  checkoutError,
  checkoutSession,
  freeRemaining,
  freeLimit,
  dailyFreeRemaining,
  dailyLimit,
  paidCredits,
  hasUnlimitedAccess,
  showDailyFreeExhaustedHelper,
  couponCode,
  onCouponCodeChange,
  onRedeemCoupon,
  isRedeemingCoupon,
  isSessionReady,
  couponError,
  couponNotice,
}: {
  open: boolean;
  onClose: () => void;
  onSelectPlan: (plan: CheckoutPlan) => void;
  onResetCheckout: () => void;
  onPaymentCompleted: () => void;
  isCheckoutLoading: boolean;
  checkoutPlan: CheckoutPlan | null;
  checkoutError: string | null;
  checkoutSession: CheckoutSessionState | null;
  freeRemaining: number;
  freeLimit: number;
  dailyFreeRemaining: number;
  dailyLimit: number;
  paidCredits: number;
  hasUnlimitedAccess: boolean;
  showDailyFreeExhaustedHelper: boolean;
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  onRedeemCoupon: () => void;
  isRedeemingCoupon: boolean;
  isSessionReady: boolean;
  couponError: string | null;
  couponNotice: string | null;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const selectedPlanCopy = checkoutSession
    ? checkoutSession.plan === 'credits_50'
      ? CREDIT_PLAN_COPY
      : UNLIMITED_PLAN_COPY
    : null;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (
          activeElement === firstFocusable ||
          activeElement === null ||
          !focusableElements.includes(activeElement)
        ) {
          event.preventDefault();
          lastFocusable?.focus();
        }

        return;
      }

      if (activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      activeElement?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 motion-safe:animate-[sb-fade-in_220ms_ease-out] sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        id="paywall-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        aria-describedby="paywall-description"
        className="max-h-[88svh] w-full max-w-md overflow-y-auto rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_10px_0_0_#111111] motion-safe:animate-[sb-paywall-in_260ms_ease-out] sm:rounded-[32px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#9a2f10]">
              {checkoutSession ? 'שלב 2 מתוך 2' : 'שלב 1 מתוך 2'}
            </p>
            <h2 id="paywall-title" className="mt-2 text-2xl font-black text-black sm:text-3xl">
              {PAYWALL_TITLE}
            </h2>
            <p id="paywall-description" className="mt-2 text-sm font-bold text-neutral-700">
              {PAYWALL_BODY}
            </p>
            {checkoutSession ? (
              <p className="mt-1 text-xs font-bold text-neutral-600">
                בוחרים את דרך התשלום שנוחה לכם וממשיכים מיד.
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={`min-h-[44px] rounded-full border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black ${whiteSurfaceFocusClass}`}
          >
            סגור
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <BillingSnapshotPanel
            freeRemaining={freeRemaining}
            freeLimit={freeLimit}
            dailyFreeRemaining={dailyFreeRemaining}
            dailyLimit={dailyLimit}
            paidCredits={paidCredits}
            hasUnlimitedAccess={hasUnlimitedAccess}
            showDailyFreeExhaustedHelper={showDailyFreeExhaustedHelper}
            className="bg-white"
          />

          <CouponRedeemPanel
            couponCode={couponCode}
            onCouponCodeChange={onCouponCodeChange}
            onRedeemCoupon={onRedeemCoupon}
            isRedeemingCoupon={isRedeemingCoupon}
            isSessionReady={isSessionReady}
            couponError={couponError}
            couponNotice={couponNotice}
          />

          {checkoutSession ? (
            <>
              <div
                className={[
                  'rounded-[24px] border-2 border-black p-4',
                  checkoutSession.plan === 'credits_50' ? 'bg-white text-black' : 'bg-[#111111] text-white',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {selectedPlanCopy ? (
                      <span
                        className={[
                          'rounded-full border px-3 py-1 text-xs font-black',
                          checkoutSession.plan === 'credits_50'
                            ? 'border-black bg-[#f7ff4f] text-black'
                            : 'border-white/40 bg-white/10 text-white',
                        ].join(' ')}
                      >
                        {selectedPlanCopy.badge}
                      </span>
                    ) : null}
                    <h3 className="mt-3 text-lg font-black">{selectedPlanCopy?.title}</h3>
                    <p className={checkoutSession.plan === 'credits_50' ? 'mt-1 text-sm font-bold text-neutral-700' : 'mt-1 text-sm font-bold text-white/80'}>
                      {selectedPlanCopy?.helper}
                    </p>
                    <p className={checkoutSession.plan === 'credits_50' ? 'mt-1 text-sm text-neutral-700' : 'mt-1 text-sm text-white/80'}>
                      {selectedPlanCopy?.body}
                    </p>
                  </div>
                  <p className="text-2xl font-black">
                    {selectedPlanCopy?.price}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onResetCheckout}
                  className={[
                    `mt-4 min-h-[42px] rounded-full border-2 px-3.5 py-2 text-sm font-black transition ${whiteSurfaceFocusClass}`,
                    checkoutSession.plan === 'credits_50'
                      ? 'border-black bg-[#fff6d8] text-black hover:bg-[#fff2bf]'
                      : 'border-white bg-[#ff623d] text-black hover:bg-[#ff7a56]',
                  ].join(' ')}
                >
                  לבחור מסלול אחר
                </button>
              </div>

              <CheckoutPaymentForm
                clientSecret={checkoutSession.clientSecret}
                submitLabel={
                  checkoutSession.plan === 'credits_50'
                    ? `לשלם ${CREDIT_PLAN_COPY.price}`
                    : UNLIMITED_PLAN_COPY.cta
                }
                onComplete={onPaymentCompleted}
              />
            </>
          ) : (
            <>
              <div className="rounded-[24px] border-2 border-black bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full border border-black bg-[#f7ff4f] px-3 py-1 text-xs font-black text-black">
                      {CREDIT_PLAN_COPY.badge}
                    </span>
                    <h3 className="mt-3 text-lg font-black text-black">{CREDIT_PLAN_COPY.title}</h3>
                    <p className="mt-1 text-sm font-bold text-neutral-700">{CREDIT_PLAN_COPY.helper}</p>
                    <p className="mt-1 text-sm text-neutral-700">{CREDIT_PLAN_COPY.body}</p>
                  </div>
                  <p className="text-2xl font-black text-black">{CREDIT_PLAN_COPY.price}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlan('credits_50')}
                  disabled={isCheckoutLoading}
                  className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                >
                  {checkoutPlan === 'credits_50' ? 'טוען טופס תשלום...' : CREDIT_PLAN_COPY.cta}
                </button>
              </div>

              <div className="rounded-[24px] border-2 border-black bg-[#111111] p-4 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-black">
                      {UNLIMITED_PLAN_COPY.badge}
                    </span>
                    <h3 className="mt-3 text-lg font-black">{UNLIMITED_PLAN_COPY.title}</h3>
                    <p className="mt-1 text-sm font-bold text-white/80">{UNLIMITED_PLAN_COPY.helper}</p>
                    <p className="mt-1 text-sm text-white/80">{UNLIMITED_PLAN_COPY.body}</p>
                  </div>
                  <p className="text-2xl font-black">{UNLIMITED_PLAN_COPY.price}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlan('unlimited_monthly')}
                  disabled={isCheckoutLoading}
                  className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-white bg-[#ff623d] px-4 py-3 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
                >
                  {checkoutPlan === 'unlimited_monthly'
                    ? 'טוען טופס תשלום...'
                    : UNLIMITED_PLAN_COPY.cta}
                </button>
              </div>

              <div className="rounded-[20px] border-2 border-black bg-white px-4 py-3 text-sm font-bold text-neutral-800">
                <p>התשלום קצר, ברור ובטוח.</p>
              </div>
            </>
          )}

          {checkoutError ? (
            <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
              {checkoutError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Home({
  mode = 'full',
}: {
  mode?: HomePageClientMode;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastOutgoingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composeSectionRef = useRef<HTMLDivElement | null>(null);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const examplesSectionRef = useRef<HTMLElement | null>(null);
  const plansSectionRef = useRef<HTMLElement | null>(null);
  const hasTrackedQuotaBadgeViewRef = useRef(false);
  const hasTrackedBillingStatusViewRef = useRef(false);
  const [composeMode, setComposeMode] = useState<ComposeMode>('incoming');
  const [message, setMessage] = useState('');
  const [lastOutgoingMessage, setLastOutgoingMessage] = useState('');
  const [noReplyDurationValue, setNoReplyDurationValue] = useState('');
  const [noReplyDurationUnit, setNoReplyDurationUnit] = useState<NoReplyDurationUnit>('hours');
  const [conversationBackground, setConversationBackground] = useState('');
  const [context, setContext] = useState<ContextOption>('קראש');
  const [tone, setTone] = useState<ToneOption>('זורם');
  const [continuePreference, setContinuePreference] = useState<ContinuePreference | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showDeepLinkPrefillBanner, setShowDeepLinkPrefillBanner] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [freeUsed, setFreeUsed] = useState(0);
  const [initialFreeLimit, setInitialFreeLimit] = useState(FREE_LIMIT);
  const [freeRemaining, setFreeRemaining] = useState(FREE_LIMIT);
  const [dailyFreeLimit, setDailyFreeLimit] = useState(1);
  const [dailyFreeRemaining, setDailyFreeRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [busyReplyIndex, setBusyReplyIndex] = useState<number | null>(null);
  const [copiedReplyIndex, setCopiedReplyIndex] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paidPlan, setPaidPlan] = useState<PaidPlan>(null);
  const [paidCredits, setPaidCredits] = useState(0);
  const [checkoutPlan, setCheckoutPlan] = useState<CheckoutPlan | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSessionState | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponNotice, setCouponNotice] = useState<string | null>(null);
  const [isRedeemingCoupon, setIsRedeemingCoupon] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [managedSubscription, setManagedSubscription] = useState<ManagedSubscriptionState | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
  const [isSubscriptionActionLoading, setIsSubscriptionActionLoading] = useState(false);
  const [subscriptionActionError, setSubscriptionActionError] = useState<string | null>(null);
  const [subscriptionActionNotice, setSubscriptionActionNotice] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(true);
  const [billingBypassEnabled, setBillingBypassEnabled] = useState(
    BILLING_BYPASS_FALLBACK_ENABLED,
  );
  const authRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const authTokenPromiseRef = useRef<Promise<string> | null>(null);
  const isGeneratorPrimaryMode = mode === 'generator';

  const hasUnlimitedAccess = billingBypassEnabled || paidPlan === 'unlimited_monthly';
  const hasCreditBalance = paidCredits > 0;
  const isSessionReady = isAuthReady && Boolean(authToken) && !isBillingLoading;
  const totalFreeRemaining = useMemo(
    () => Math.max(freeRemaining + dailyFreeRemaining, 0),
    [dailyFreeRemaining, freeRemaining],
  );
  const isGenerating = isLoading || busyReplyIndex !== null;
  const isNoReplyMode = composeMode === 'no_reply';
  const messageLength = message.length;
  const lastOutgoingMessageLength = lastOutgoingMessage.length;
  const conversationBackgroundLength = conversationBackground.length;
  const generateButtonLabel = 'קבלו מה לענות עכשיו';
  const heroGenerateCtaLabel = 'קבלו מה לענות עכשיו';
  const billingStatusLine = billingBypassEnabled
    ? 'שימושים ללא הגבלה פעילים כרגע.'
    : hasUnlimitedAccess
      ? 'מסלול ללא הגבלה פעיל'
      : hasCreditBalance
        ? `נשארו לך ${paidCredits} שימושים בחבילה`
        : totalFreeRemaining > 0
          ? `נשארו לך ${totalFreeRemaining} שימושים חינם`
          : 'המכסה החינמית הסתיימה. אפשר לבחור חבילה ולהמשיך.';
  const accountStatusLine = isSessionReady
    ? billingStatusLine
    : 'רגע, מחברים את החשבון...';
  const accessState = hasUnlimitedAccess
    ? 'unlimited'
    : hasCreditBalance
      ? 'credits'
      : totalFreeRemaining > 0
        ? 'free'
        : 'blocked';
  const isBlockedOnlyByDailyFreeExhausted =
    accessState === 'blocked' &&
    !hasUnlimitedAccess &&
    !hasCreditBalance &&
    freeRemaining === 0 &&
    dailyFreeRemaining === 0 &&
    dailyFreeLimit > 0;

  useEffect(() => {
    trackEvent('page_view_home');
  }, []);

  useEffect(() => {
    if (composeMode !== 'no_reply') {
      return;
    }

    setImageBase64(null);
    setImageName(null);
    setImageError(null);
  }, [composeMode]);

  useEffect(() => {
    if (!isSessionReady || isBillingLoading || hasTrackedQuotaBadgeViewRef.current) {
      return;
    }

    hasTrackedQuotaBadgeViewRef.current = true;
    trackEvent('quota_badge_view', {
      access_state: accessState,
      free_remaining: freeRemaining,
      daily_remaining: dailyFreeRemaining,
      credits: paidCredits,
      has_unlimited: hasUnlimitedAccess,
    });
  }, [
    accessState,
    dailyFreeRemaining,
    freeRemaining,
    hasUnlimitedAccess,
    isBillingLoading,
    isSessionReady,
    paidCredits,
  ]);

  const scrollToMobileSection = useCallback(
    (
      section: MobileSectionId,
      options?: { behavior?: ScrollBehavior; source?: 'navigation' | 'system' },
    ) => {
      if (!isCompactViewport()) {
        return;
      }

      const sectionElement =
        section === 'compose'
          ? composeSectionRef.current
          : section === 'results'
            ? resultsSectionRef.current
            : section === 'examples'
              ? examplesSectionRef.current
              : plansSectionRef.current;

      if (!sectionElement) {
        return;
      }

      const behavior = options?.behavior ?? getPreferredScrollBehavior();
      sectionElement.scrollIntoView({
        behavior,
        block: 'start',
      });
    },
    [],
  );

  const scrollToComposeSection = useCallback(() => {
    const behavior = getPreferredScrollBehavior();

    if (isCompactViewport()) {
      scrollToMobileSection('compose', { source: 'system', behavior });
    } else {
      composeSectionRef.current?.scrollIntoView({
        behavior,
        block: 'start',
      });
    }

    window.requestAnimationFrame(() => {
      (messageInputRef.current ?? lastOutgoingInputRef.current)?.focus();
    });
  }, [scrollToMobileSection]);

  useEffect(() => {
    const deepLinkPrefill = parseHomeDeepLinkPrefill(new URLSearchParams(window.location.search));

    if (!deepLinkPrefill.hasValidState) {
      return;
    }

    const scenarioFromExample = deepLinkPrefill.exampleId
      ? examples.find((scenario) => scenario.id === deepLinkPrefill.exampleId)
      : null;

    setComposeMode('incoming');
    setMessage((deepLinkPrefill.message ?? scenarioFromExample?.message ?? '').slice(0, MAX_INCOMING_MESSAGE_LENGTH));
    setLastOutgoingMessage('');
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('hours');
    setConversationBackground('');
    setContext(deepLinkPrefill.context ?? scenarioFromExample?.context ?? 'קראש');
    setTone(deepLinkPrefill.tone ?? scenarioFromExample?.tone ?? 'זורם');
    setContinuePreference(
      deepLinkPrefill.continuePreference ?? scenarioFromExample?.continuePreference ?? null,
    );
    setImageBase64(null);
    setImageName(null);
    setImageError(null);
    setRequestError(null);
    setResult(null);
    setShowDeepLinkPrefillBanner(true);

    trackEvent('deep_link_prefill_applied', {
      from_example: Boolean(deepLinkPrefill.exampleId),
      has_message: Boolean(deepLinkPrefill.message),
      has_context: Boolean(deepLinkPrefill.context),
      has_tone: Boolean(deepLinkPrefill.tone),
      has_continue_preference: Boolean(deepLinkPrefill.continuePreference),
    });

    window.requestAnimationFrame(() => {
      scrollToComposeSection();

      if (deepLinkPrefill.shouldFocusMessage) {
        messageInputRef.current?.focus();
      }
    });
  }, [scrollToComposeSection]);

  const applyBillingSnapshot = useCallback((billing: BillingSnapshot) => {
    const hasBillingBypass =
      billing.billingBypassEnabled === true || BILLING_BYPASS_FALLBACK_ENABLED;

    setFreeUsed(Math.max(0, Math.floor(billing.freeUsed)));
    setInitialFreeLimit(Math.max(0, Math.floor(billing.freeLimit)));
    setFreeRemaining(Math.max(0, Math.floor(billing.freeRemaining)));
    setDailyFreeLimit(Math.max(0, Math.floor(billing.dailyLimit)));
    setDailyFreeRemaining(Math.max(0, Math.floor(billing.dailyRemaining)));
    setPaidCredits(Math.max(0, Math.floor(billing.credits)));
    setSubscriptionStatus(billing.subscriptionStatus);
    setBillingBypassEnabled(hasBillingBypass);

    if (!billing.subscriptionStatus) {
      setManagedSubscription(null);
      setSubscriptionActionError(null);
      setSubscriptionActionNotice(null);
    }

    if (hasBillingBypass) {
      setShowPaywall(false);
      setCheckoutPlan(null);
      setCheckoutSession(null);
      setCheckoutError(null);
      setPaidPlan('unlimited_monthly');
      return;
    }

    if (billing.hasUnlimited) {
      setPaidPlan('unlimited_monthly');
      return;
    }

    if (billing.credits > 0) {
      setPaidPlan('credits_50');
      return;
    }

    setPaidPlan(null);
  }, []);

  const syncAuthState = useCallback((nextToken: string | null) => {
    setAuthToken((currentToken) => currentToken === nextToken ? currentToken : nextToken);
    setIsAuthReady(true);

    if (nextToken) {
      setRequestError((currentError) =>
        currentError === AUTH_ERROR_MESSAGE ? null : currentError,
      );
    }
  }, []);

  const getClientFirebaseAuth = useCallback(async () => {
    const [{ FirebaseClientConfigError, getFirebaseClientAuth, isFirebaseClientConfigured }, firebaseAuth] =
      await Promise.all([
        import('@/lib/firebase-client'),
        import('firebase/auth'),
      ]);

    if (!isFirebaseClientConfigured()) {
      throw new FirebaseClientConfigError(
        'Firebase client config is missing in NEXT_PUBLIC_FIREBASE_*.',
      );
    }

    return {
      auth: getFirebaseClientAuth(),
      onIdTokenChanged: firebaseAuth.onIdTokenChanged,
      signInAnonymously: firebaseAuth.signInAnonymously,
    };
  }, []);

  const ensureAuthenticatedUser = useCallback(async (allowSilentReauth = true) => {
    const { auth, signInAnonymously } = await getClientFirebaseAuth();
    await auth.authStateReady();

    if (auth.currentUser) {
      return auth.currentUser;
    }

    if (!allowSilentReauth) {
      throw new Error(AUTH_ERROR_MESSAGE);
    }

    if (!authRecoveryPromiseRef.current) {
      authRecoveryPromiseRef.current = signInAnonymously(auth)
        .then(() => undefined)
        .finally(() => {
          authRecoveryPromiseRef.current = null;
        });
    }

    await authRecoveryPromiseRef.current;

    if (!auth.currentUser) {
      throw new Error(AUTH_ERROR_MESSAGE);
    }

    return auth.currentUser;
  }, [getClientFirebaseAuth]);

  const getFreshAuthToken = useCallback(async (options?: {
    forceRefresh?: boolean;
    allowSilentReauth?: boolean;
  }) => {
    const forceRefresh = options?.forceRefresh ?? false;

    if (!forceRefresh && authTokenPromiseRef.current) {
      return authTokenPromiseRef.current;
    }

    const tokenPromise = (async () => {
      const user = await ensureAuthenticatedUser(options?.allowSilentReauth ?? true);
      const nextToken = await user.getIdToken(forceRefresh);
      syncAuthState(nextToken);
      return nextToken;
    })()
      .catch((error) => {
        syncAuthState(null);
        throw error instanceof Error ? error : new Error(AUTH_ERROR_MESSAGE);
      })
      .finally(() => {
        if (authTokenPromiseRef.current === tokenPromise) {
          authTokenPromiseRef.current = null;
        }
      });

    authTokenPromiseRef.current = tokenPromise;
    return tokenPromise;
  }, [ensureAuthenticatedUser, syncAuthState]);

  const fetchWithAuth = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const sendRequest = async (forceRefresh = false) => {
      const token = await getFreshAuthToken({ forceRefresh, allowSilentReauth: true });
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);

      return fetch(input, {
        ...init,
        headers,
      });
    };

    let response = await sendRequest(false);

    if (response.status !== 401) {
      return response;
    }

    response = await sendRequest(true);
    return response;
  }, [getFreshAuthToken]);

  const refreshBillingStatus = useCallback(async () => {
    if (!isAuthReady) {
      return null;
    }

    setIsBillingLoading(true);

    try {
      const response = await fetchWithAuth('/api/billing/status', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        error?: string;
        billing?: BillingSnapshot;
      };

      if (!response.ok || !data.billing) {
        throw new Error(mapApiErrorMessage(data.error ?? 'לא הצלחנו לרענן מצב תשלום.'));
      }

      applyBillingSnapshot(data.billing);

      if (!hasTrackedBillingStatusViewRef.current) {
        hasTrackedBillingStatusViewRef.current = true;
        trackEvent('billing_status_view', {
          access_state: data.billing.accessState,
          free_remaining: data.billing.freeRemaining,
          daily_remaining: data.billing.dailyRemaining,
          credits: data.billing.credits,
          has_unlimited: data.billing.hasUnlimited,
          subscription_status: data.billing.subscriptionStatus ?? 'none',
        });
      }

      return data.billing;
    } catch (error) {
      const message = mapApiErrorMessage(
        error instanceof Error ? error.message : 'שגיאה בטעינת מצב תשלום.',
      );

      if (message !== AUTH_ERROR_MESSAGE) {
        setRequestError(message);
      }

      return null;
    } finally {
      setIsBillingLoading(false);
    }
  }, [applyBillingSnapshot, fetchWithAuth, isAuthReady]);

  const refreshManagedSubscription = useCallback(async () => {
    if (!isSessionReady || !subscriptionStatus) {
      setManagedSubscription(null);
      return null;
    }

    setIsSubscriptionLoading(true);

    try {
      const response = await fetchWithAuth('/api/billing/subscription', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = (await response.json()) as SubscriptionManagementResponse;
      const hasSubscriptionField = Object.prototype.hasOwnProperty.call(data, 'subscription');

      if (!response.ok || !hasSubscriptionField) {
        throw new Error(mapApiErrorMessage(data.error ?? 'לא הצלחנו לטעון את מצב המנוי.'));
      }

      if (data.billing) {
        applyBillingSnapshot(data.billing);
      }

      setManagedSubscription(data.subscription ?? null);
      setSubscriptionActionError(null);
      return data.subscription ?? null;
    } catch (error) {
      setSubscriptionActionError(
        mapApiErrorMessage(
          error instanceof Error ? error.message : 'לא הצלחנו לטעון את מצב המנוי.',
        ),
      );
      return null;
    } finally {
      setIsSubscriptionLoading(false);
    }
  }, [applyBillingSnapshot, fetchWithAuth, isSessionReady, subscriptionStatus]);

  useEffect(() => {
    let isCancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function syncUserToken() {
      try {
        await getFreshAuthToken({ allowSilentReauth: true });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error('Firebase auth recovery failed', error);
        syncAuthState(null);
        setIsBillingLoading(false);
      }
    }

    async function initAuth() {
      const { auth, onIdTokenChanged } = await getClientFirebaseAuth();
      await auth.authStateReady();

      unsubscribe = onIdTokenChanged(auth, (user) => {
        if (isCancelled) {
          return;
        }

        if (!user) {
          syncAuthState(null);
          void syncUserToken();
          return;
        }

        void syncUserToken();
      });

      await syncUserToken();

      if (!isCancelled) {
        setIsAuthReady(true);
      }
    }

    void initAuth().catch((error) => {
      if (isCancelled) {
        return;
      }

      console.error('Firebase auth init failed', error);
      syncAuthState(null);
      setIsBillingLoading(false);
    });

    return () => {
      isCancelled = true;
      unsubscribe?.();
    };
  }, [getClientFirebaseAuth, getFreshAuthToken, syncAuthState]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    void refreshBillingStatus();
  }, [authToken, isAuthReady, refreshBillingStatus]);

  useEffect(() => {
    if (!isSessionReady) {
      return;
    }

    if (!subscriptionStatus) {
      setManagedSubscription(null);
      setSubscriptionActionError(null);
      setSubscriptionActionNotice(null);
      setIsSubscriptionLoading(false);
      return;
    }

    void refreshManagedSubscription();
  }, [isSessionReady, refreshManagedSubscription, subscriptionStatus]);

  const waitForBillingSync = useCallback(async (plan: CheckoutPlan, baselineCredits: number) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const billing = await refreshBillingStatus();

      if (
        billing &&
        (
          (plan === 'credits_50' && billing.credits > baselineCredits) ||
          (plan === 'unlimited_monthly' && billing.hasUnlimited)
        )
      ) {
        return true;
      }

      if (attempt < 9) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    }

    return false;
  }, [refreshBillingStatus]);

  const scrollToComposeAfterPayment = useCallback(() => {
    scrollToComposeSection();
  }, [scrollToComposeSection]);

  const finalizeSuccessfulCheckout = useCallback(async (plan: CheckoutPlan) => {
    const baselineCredits = paidCredits;

    setShowPaywall(false);
    setCheckoutPlan(null);
    setCheckoutSession(null);
    setCheckoutError(null);
    setPaymentNotice('התשלום נקלט. מעדכנים את החשבון שלך...');
    trackEvent('checkout_success', { plan });

    const didSync = await waitForBillingSync(plan, baselineCredits);

    setPaymentNotice(
      didSync
        ? plan === 'credits_50'
          ? 'מעולה, החבילה נוספה לחשבון שלך.'
          : 'מעולה, מסלול ללא הגבלה הופעל בחשבון שלך.'
        : 'התשלום נקלט. העדכון יופיע כאן בתוך כמה שניות.',
    );

    scrollToComposeAfterPayment();
  }, [paidCredits, scrollToComposeAfterPayment, waitForBillingSync]);

  const handleReturnedCheckout = useCallback(async (sessionId: string, fallbackPlan: CheckoutPlan | null) => {
    try {
      const response = await fetchWithAuth(`/api/checkout/session?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        error?: string;
        billing?: BillingSnapshot;
        session?: {
          plan?: CheckoutPlan | null;
          paymentStatus?: string | null;
          status?: string | null;
        };
      };

      if (!response.ok || !data.session) {
        throw new Error(mapApiErrorMessage(data.error ?? 'לא הצלחנו לאמת את מצב התשלום.'));
      }

      if (data.billing) {
        applyBillingSnapshot(data.billing);
      }

      const resolvedPlan = data.session.plan ?? fallbackPlan;
      const isPaidSession =
        data.session.status === 'complete' &&
        (data.session.paymentStatus === 'paid' ||
          data.session.paymentStatus === 'no_payment_required');

      if (resolvedPlan && isPaidSession) {
        await finalizeSuccessfulCheckout(resolvedPlan);
        return;
      }

      if (data.session.status === 'open') {
        setPaymentNotice('התשלום עוד לא הושלם. אפשר לנסות שוב כאן באתר.');
        return;
      }

      setPaymentNotice('לא בוצע תשלום חדש. אפשר לנסות שוב בכל רגע.');
    } catch (error) {
      setPaymentNotice(
        mapApiErrorMessage(
          error instanceof Error ? error.message : 'לא הצלחנו לאמת את מצב התשלום.',
        ),
      );
    }
  }, [applyBillingSnapshot, fetchWithAuth, finalizeSuccessfulCheckout]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const checkoutStatus = searchParams.get('checkout');
    const planFromCheckout = searchParams.get('plan');
    const sessionId = searchParams.get('session_id');

    function clearCheckoutParams() {
      searchParams.delete('checkout');
      searchParams.delete('plan');
      searchParams.delete('session_id');
      const nextQuery = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }

    if (checkoutStatus === 'return') {
      if (!isAuthReady || !sessionId) {
        return;
      }

      clearCheckoutParams();
      void handleReturnedCheckout(
        sessionId,
        isCheckoutPlan(planFromCheckout) ? planFromCheckout : null,
      );
      return;
    }

    if (checkoutStatus === 'success' && isCheckoutPlan(planFromCheckout)) {
      setShowPaywall(false);
      setPaymentNotice('התשלום נקלט. מאמתים ומעדכנים את החשבון שלך...');
      trackEvent('checkout_success', { plan: planFromCheckout });
    } else if (checkoutStatus === 'cancelled') {
      setPaymentNotice('התשלום בוטל, אפשר לנסות שוב בכל רגע.');
    }

    if (checkoutStatus) {
      clearCheckoutParams();
    }
  }, [handleReturnedCheckout, isAuthReady]);

  useEffect(() => {
    if (copiedReplyIndex === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedReplyIndex(null);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copiedReplyIndex]);

  useEffect(() => {
    if (!showPaywall) {
      return;
    }

    trackEvent('paywall_view', {
      used: freeUsed,
      remaining: totalFreeRemaining,
      daily_remaining: dailyFreeRemaining,
      access_state: accessState,
    });
  }, [accessState, dailyFreeRemaining, freeUsed, showPaywall, totalFreeRemaining]);

  useDocumentScrollLock(showPaywall);

  function closePaywall() {
    setShowPaywall(false);
    setCheckoutPlan(null);
    setCheckoutSession(null);
    setCheckoutError(null);
  }

  function resetCheckoutSelection() {
    setCheckoutSession(null);
    setCheckoutError(null);
  }

  function openPaywall() {
    if (billingBypassEnabled) {
      return;
    }

    setShowPaywall(true);
    setCheckoutSession(null);
    setCheckoutError(null);
  }

  function handleCouponCodeChange(value: string) {
    setCouponCode(value.toUpperCase());
    setCouponError(null);
    setCouponNotice(null);
  }

  async function handleRedeemCoupon() {
    const normalizedCouponCode = couponCode.trim().toUpperCase();

    if (!normalizedCouponCode) {
      setCouponError('צריך להזין קוד קופון.');
      setCouponNotice(null);
      return;
    }

    setCouponError(null);
    setCouponNotice(null);
    setIsRedeemingCoupon(true);

    try {
      const response = await fetchWithAuth('/api/billing/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: normalizedCouponCode,
        }),
      });

      const data = (await response.json()) as CouponRedeemResponse;

      if (!response.ok || !data.redemption || !data.billing) {
        throw new Error(mapApiErrorMessage(data.error ?? 'לא הצלחנו לממש את הקופון. נסה שוב.'));
      }

      applyBillingSnapshot(data.billing);

      const fallbackMessage =
        data.redemption.status === 'already_redeemed'
          ? 'הקוד הזה כבר מומש בחשבון שלך.'
          : `הקוד מומש בהצלחה ונוספו לחשבון שלך ${Math.max(
              0,
              Math.floor(data.redemption.grantedUses ?? 0),
            )} שימושים.`;
      const message =
        typeof data.message === 'string' && data.message.trim().length > 0
          ? data.message.trim()
          : fallbackMessage;

      setCouponNotice(message);
      setCouponError(null);
      setPaymentNotice(message);

      if (data.redemption.status === 'redeemed') {
        setCouponCode('');
      }

      const hasAccessAfterRedeem =
        data.billing.hasUnlimited ||
        data.billing.credits > 0 ||
        data.billing.freeRemaining > 0 ||
        data.billing.dailyRemaining > 0;

      if (hasAccessAfterRedeem) {
        setShowPaywall(false);
      }
    } catch (error) {
      setCouponNotice(null);
      setCouponError(
        mapApiErrorMessage(
          error instanceof Error ? error.message : 'לא הצלחנו לממש את הקופון. נסה שוב בעוד רגע.',
        ),
      );
    } finally {
      setIsRedeemingCoupon(false);
    }
  }

  async function handleSubscriptionAction(action: SubscriptionAction) {
    if (!isSessionReady) {
      return;
    }

    setSubscriptionActionError(null);
    setSubscriptionActionNotice(null);
    setIsSubscriptionActionLoading(true);

    try {
      const response = await fetchWithAuth('/api/billing/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as SubscriptionManagementResponse;
      const hasSubscriptionField = Object.prototype.hasOwnProperty.call(data, 'subscription');

      if (!response.ok || !hasSubscriptionField) {
        throw new Error(
          mapApiErrorMessage(data.error ?? 'לא הצלחנו לעדכן את הגדרות המנוי. נסה שוב.'),
        );
      }

      if (data.billing) {
        applyBillingSnapshot(data.billing);
      }

      setManagedSubscription(data.subscription ?? null);

      const fallbackMessage =
        action === 'cancel_next_charge'
          ? 'החיוב הבא בוטל. המנוי נשאר פעיל עד סוף התקופה הנוכחית.'
          : 'החידוש האוטומטי חזר לפעול.';
      const message =
        typeof data.message === 'string' && data.message.trim().length > 0
          ? data.message.trim()
          : fallbackMessage;

      setSubscriptionActionNotice(message);
      setPaymentNotice(message);
    } catch (error) {
      setSubscriptionActionError(
        mapApiErrorMessage(
          error instanceof Error
            ? error.message
            : 'לא הצלחנו לעדכן את הגדרות המנוי. נסה שוב בעוד רגע.',
        ),
      );
    } finally {
      setIsSubscriptionActionLoading(false);
    }
  }

  async function handleCheckout(plan: CheckoutPlan) {
    if (billingBypassEnabled) {
      setShowPaywall(false);
      setCheckoutSession(null);
      setCheckoutError(null);
      return;
    }

    setShowPaywall(true);

    setCheckoutPlan(plan);
    setCheckoutSession(null);
    setCheckoutError(null);
    setPaymentNotice(null);

    trackEvent('plan_select', { plan });
    trackEvent('checkout_start', { plan });

    try {
      const response = await fetchWithAuth('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });

      const data = (await response.json()) as {
        clientSecret?: string;
        error?: string;
        sessionId?: string;
      };

      if (!response.ok || !data.clientSecret || !data.sessionId) {
        throw new Error(mapApiErrorMessage(data.error ?? 'לא הצלחנו לטעון את טופס התשלום. נסה שוב.'));
      }

      setCheckoutSession({
        clientSecret: data.clientSecret,
        sessionId: data.sessionId,
        plan,
      });
      trackEvent('checkout_session_loaded', { plan });
    } catch (error) {
      const message = mapApiErrorMessage(
        error instanceof Error ? error.message : 'משהו השתבש בחיבור לתשלום.',
      );
      setCheckoutError(message);
    } finally {
      setCheckoutPlan(null);
    }
  }

  async function handlePaymentCompleted() {
    if (!checkoutSession) {
      return;
    }

    await handleReturnedCheckout(checkoutSession.sessionId, checkoutSession.plan);
  }

  async function runGeneration(
    payload: GenerateRequest,
    options?: { replyIndex?: number },
  ) {
    setRequestError(null);
    setImageError(null);

    const generationMode = payload.action ? 'refine' : 'initial';
    const payloadComposeMode = payload.noReplyMode ? 'no_reply' : 'incoming';
    const payloadHasBackground = Boolean(payload.conversationBackground?.trim());
    const payloadHasLastOutgoing = Boolean(payload.lastOutgoingMessage?.trim());

    if (typeof options?.replyIndex === 'number') {
      setBusyReplyIndex(options.replyIndex);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetchWithAuth('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Partial<GenerateResponse> & {
        error?: string;
        billing?: BillingSnapshot;
      };

      if (data.billing) {
        applyBillingSnapshot(data.billing);
      }

      if (response.status === 402) {
        trackEvent('generate_blocked_402', {
          mode: generationMode,
          action: payload.action ?? 'initial',
          compose_mode: payloadComposeMode,
          context: payload.context,
          tone: payload.tone,
          continue_preference: payload.continuePreference ?? 'unspecified',
          has_image: Boolean(payload.imageBase64),
          has_text: Boolean(payload.message.trim()),
          has_background: payloadHasBackground,
          has_last_outgoing: payloadHasLastOutgoing,
          no_reply_duration_value: payload.noReplyDurationValue ?? null,
          no_reply_duration_unit: payload.noReplyDurationUnit ?? null,
        });
        openPaywall();
        return;
      }

      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? 'משהו נתקע בדרך. נסה שוב בעוד רגע.'));
      }

      const nextIntent = typeof data.intent === 'string' ? data.intent : '';
      const nextReplies = Array.isArray(data.replies)
        ? data.replies.filter(
            (reply): reply is string => typeof reply === 'string' && reply.trim().length > 0,
          )
        : [];

      if (!nextIntent || nextReplies.length === 0) {
        throw new Error('לא קיבלתי תשובות תקינות. נסה שוב.');
      }

      const replyIndex = options?.replyIndex;

      if (typeof replyIndex === 'number') {
        setResult((currentResult) => {
          if (!currentResult) {
            return {
              intent: nextIntent,
              replies: nextReplies.slice(0, 3),
            };
          }

          const replies = [...currentResult.replies];
          replies[replyIndex] = nextReplies[0];

          return {
            intent: nextIntent,
            replies,
          };
        });

        trackEvent('generate_success', {
          mode: generationMode,
          action: payload.action ?? 'initial',
          compose_mode: payloadComposeMode,
          context: payload.context,
          tone: payload.tone,
          continue_preference: payload.continuePreference ?? 'unspecified',
          has_image: Boolean(payload.imageBase64),
          has_text: Boolean(payload.message.trim()),
          has_background: payloadHasBackground,
          has_last_outgoing: payloadHasLastOutgoing,
          no_reply_duration_value: payload.noReplyDurationValue ?? null,
          no_reply_duration_unit: payload.noReplyDurationUnit ?? null,
        });

        return;
      }

      setResult({
        intent: nextIntent,
        replies: nextReplies.slice(0, 3),
      });

      if (isCompactViewport()) {
        window.requestAnimationFrame(() => {
          scrollToMobileSection('results', { source: 'system' });
        });
      }

      trackEvent('generate_success', {
        mode: generationMode,
        action: payload.action ?? 'initial',
        compose_mode: payloadComposeMode,
        context: payload.context,
        tone: payload.tone,
        continue_preference: payload.continuePreference ?? 'unspecified',
        has_image: Boolean(payload.imageBase64),
        has_text: Boolean(payload.message.trim()),
        has_background: payloadHasBackground,
        has_last_outgoing: payloadHasLastOutgoing,
        no_reply_duration_value: payload.noReplyDurationValue ?? null,
        no_reply_duration_unit: payload.noReplyDurationUnit ?? null,
      });
    } catch (error) {
      trackEvent('generate_error', {
        mode: generationMode,
        action: payload.action ?? 'initial',
        compose_mode: payloadComposeMode,
        context: payload.context,
        tone: payload.tone,
        continue_preference: payload.continuePreference ?? 'unspecified',
        has_image: Boolean(payload.imageBase64),
        has_text: Boolean(payload.message.trim()),
        has_background: payloadHasBackground,
        has_last_outgoing: payloadHasLastOutgoing,
        no_reply_duration_value: payload.noReplyDurationValue ?? null,
        no_reply_duration_unit: payload.noReplyDurationUnit ?? null,
      });
      setRequestError(
        mapApiErrorMessage(
          error instanceof Error ? error.message : 'משהו השתבש. נסה שוב בעוד רגע.',
        ),
      );
    } finally {
      setIsLoading(false);
      setBusyReplyIndex(null);
    }
  }

  async function handleMainSubmit() {
    const trimmedMessage = message.trim().slice(0, MAX_INCOMING_MESSAGE_LENGTH);
    const trimmedLastOutgoingMessage = lastOutgoingMessage
      .trim()
      .slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH);
    const trimmedConversationBackground = conversationBackground
      .trim()
      .slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH);
    const parsedNoReplyDuration = Number.parseInt(noReplyDurationValue, 10);
    const effectiveContinuePreference = isNoReplyMode ? null : continuePreference;

    if (isNoReplyMode) {
      if (!trimmedLastOutgoingMessage) {
        setRequestError('כדי להמשיך צריך למלא מה שלחת בהודעה האחרונה.');

        if (isCompactViewport()) {
          scrollToMobileSection('compose', { source: 'system' });
        } else {
          lastOutgoingInputRef.current?.focus();
        }

        return;
      }

      if (
        !Number.isInteger(parsedNoReplyDuration) ||
        parsedNoReplyDuration < 1 ||
        parsedNoReplyDuration > MAX_NO_REPLY_DURATION_VALUE
      ) {
        setRequestError(
          `צריך לבחור זמן תקין בין 1 ל-${MAX_NO_REPLY_DURATION_VALUE} (${noReplyDurationUnitOptions
            .map((option) => option.label)
            .join('/')}).`,
        );

        if (isCompactViewport()) {
          scrollToMobileSection('compose', { source: 'system' });
        } else {
          lastOutgoingInputRef.current?.focus();
        }

        return;
      }
    } else if (!trimmedMessage && !imageBase64) {
      setRequestError('כדי לקבל תשובות, הדביקו הודעה או העלו צילום מסך.');

      if (isCompactViewport()) {
        scrollToMobileSection('compose', { source: 'system' });
      } else {
        messageInputRef.current?.focus();
      }

      return;
    }

    trackEvent('generate_click', {
      context,
      tone,
      compose_mode: composeMode,
      continue_preference: effectiveContinuePreference ?? 'unspecified',
      has_image: !isNoReplyMode && Boolean(imageBase64),
      has_text: !isNoReplyMode && Boolean(trimmedMessage),
      has_background: Boolean(trimmedConversationBackground),
      has_last_outgoing: Boolean(trimmedLastOutgoingMessage),
      no_reply_duration_value: Number.isInteger(parsedNoReplyDuration) ? parsedNoReplyDuration : null,
      no_reply_duration_unit: isNoReplyMode ? noReplyDurationUnit : null,
    });

    await runGeneration({
      message: isNoReplyMode ? '' : trimmedMessage,
      imageBase64: isNoReplyMode ? null : imageBase64,
      context,
      tone,
      continuePreference: effectiveContinuePreference,
      conversationBackground: trimmedConversationBackground || undefined,
      noReplyMode: isNoReplyMode,
      noReplyDurationValue: isNoReplyMode ? parsedNoReplyDuration : undefined,
      noReplyDurationUnit: isNoReplyMode ? noReplyDurationUnit : undefined,
      lastOutgoingMessage: isNoReplyMode ? trimmedLastOutgoingMessage : undefined,
    });
  }

  async function handleReplyAction(index: number, action: ReplyAction) {
    if (!result?.replies[index]) {
      return;
    }

    const effectiveContinuePreference = isNoReplyMode ? null : continuePreference;

    trackEvent('refine_click', {
      action,
      index,
      context,
      tone,
      compose_mode: composeMode,
      continue_preference: effectiveContinuePreference ?? 'unspecified',
      has_image: !isNoReplyMode && Boolean(imageBase64),
      has_text: !isNoReplyMode && Boolean(message.trim()),
      has_background: Boolean(conversationBackground.trim()),
      has_last_outgoing: Boolean(lastOutgoingMessage.trim()),
    });

    const trimmedMessage = message.trim().slice(0, MAX_INCOMING_MESSAGE_LENGTH);
    const trimmedLastOutgoingMessage = lastOutgoingMessage
      .trim()
      .slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH);
    const trimmedConversationBackground = conversationBackground
      .trim()
      .slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH);
    const parsedNoReplyDuration = Number.parseInt(noReplyDurationValue, 10);

    if (
      isNoReplyMode &&
      (!trimmedLastOutgoingMessage ||
        !Number.isInteger(parsedNoReplyDuration) ||
        parsedNoReplyDuration < 1 ||
        parsedNoReplyDuration > MAX_NO_REPLY_DURATION_VALUE)
    ) {
      setRequestError('כדי לשפר תשובה כאן, צריך הודעה אחרונה וזמן המתנה תקין.');
      scrollToComposeSection();
      return;
    }

    await runGeneration(
      {
        message: isNoReplyMode ? '' : trimmedMessage,
        imageBase64: isNoReplyMode ? null : imageBase64,
        context,
        tone,
        continuePreference: effectiveContinuePreference,
        conversationBackground: trimmedConversationBackground || undefined,
        noReplyMode: isNoReplyMode,
        noReplyDurationValue:
          isNoReplyMode && Number.isInteger(parsedNoReplyDuration)
            ? parsedNoReplyDuration
            : undefined,
        noReplyDurationUnit: isNoReplyMode ? noReplyDurationUnit : undefined,
        lastOutgoingMessage: isNoReplyMode ? trimmedLastOutgoingMessage : undefined,
        action,
        sourceReply: result.replies[index],
      },
      { replyIndex: index },
    );
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('אפשר להעלות רק קובצי תמונה.');
      setImageBase64(null);
      setImageName(null);
      event.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setImageError('התמונה גדולה מדי. אפשר להעלות עד 4MB.');
      setImageBase64(null);
      setImageName(null);
      event.target.value = '';
      return;
    }

    try {
      const nextImageBase64 = await fileToBase64(file);
      setImageBase64(nextImageBase64);
      setImageName(file.name);
      setImageError(null);
      trackEvent('screenshot_upload', {
        mime_type: file.type,
        file_size_bytes: file.size,
      });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'טעינת התמונה נכשלה');
      setImageBase64(null);
      setImageName(null);
    }
  }

  function clearImage() {
    setImageBase64(null);
    setImageName(null);
    setImageError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopy(reply: string, index: number) {
    try {
      await navigator.clipboard.writeText(reply);
      setCopiedReplyIndex(index);
      trackEvent('reply_copy', { index, context, tone });
    } catch {
      setRequestError('ההעתקה נכשלה. נסה שוב.');
    }
  }

  function applyExample(scenario: ExampleScenario) {
    trackEvent('example_click', {
      example_id: scenario.id,
      context: scenario.context,
      tone: scenario.tone,
      continue_preference: scenario.continuePreference ?? 'unspecified',
    });

    setComposeMode('incoming');
    setMessage(scenario.message.slice(0, MAX_INCOMING_MESSAGE_LENGTH));
    setLastOutgoingMessage('');
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('hours');
    setConversationBackground('');
    setContext(scenario.context);
    setTone(scenario.tone);
    setContinuePreference(scenario.continuePreference ?? null);
    setShowDeepLinkPrefillBanner(false);
    setRequestError(null);
    setResult(null);

    const nextUrl = buildHomeDeepLink(
      {
        example: scenario.id,
        message: scenario.message,
        situation: scenario.context,
        tone: scenario.tone,
        agrees: scenario.continuePreference ?? null,
      },
      { basePath: window.location.pathname },
    );
    const nextHash = window.location.hash;
    window.history.replaceState(null, '', `${nextUrl}${nextHash}`);

    if (isCompactViewport()) {
      window.requestAnimationFrame(() => {
        scrollToMobileSection('compose', { source: 'system' });
      });
    }
  }

  function handleMessagePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedText = event.clipboardData.getData('text')?.trim() ?? '';

    if (!pastedText) {
      return;
    }

    trackEvent('message_paste', {
      pasted_chars: pastedText.length,
    });
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-clip bg-[#111111] px-3 pb-0 pt-3 text-right text-black sm:px-6 sm:py-6 sm:pb-6"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
        {isGeneratorPrimaryMode ? (
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

              <div className="relative max-w-3xl space-y-3 sm:space-y-4">
                <p className="inline-flex min-h-[40px] items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-black">
                  SayBack
                </p>
                <h1 className="text-[2rem] font-black leading-[1.08] tracking-tight text-black sm:text-5xl">
                  מהודעה מלחיצה לתשובה בטוחה בתוך רגע
                </h1>
                <p className="max-w-2xl text-[0.98rem] font-bold leading-7 text-neutral-900 sm:text-lg">
                  מדביקים את ההודעה שקיבלתם, בוחרים וייב, ותוך רגע קופצות 3 תשובות קצרות,
                  טבעיות ובול לסיטואציה. רוצים עוד רעיונות? מחכה לכם עמוד עם דוגמאות אמיתיות.
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    href="/home"
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5 ${lightSurfaceFocusClass}`}
                  >
                    לעוד דוגמאות ורעיונות
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
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

                <div className="relative max-w-3xl space-y-3 sm:space-y-4">
                  <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-black">
                    SayBack
                  </div>
                  <div className="space-y-2.5 sm:space-y-3">
                    <h1 className="text-[2.1rem] font-black leading-[1.06] tracking-tight text-black sm:text-6xl">
                      תקועים על ניסוח? תוך רגע עולות 3 תשובות שנשמעות כמוכם
                    </h1>
                    <p className="max-w-2xl text-[0.98rem] font-bold leading-7 text-neutral-900 sm:text-lg">
                      מדביקים הודעה או מעלים צילום מסך, בוחרים סיטואציה וסגנון, ותוך רגע נפתחות 3 תשובות קצרות, טבעיות ומוכנות להעתקה.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section
              aria-label="למה זה עובד מהר"
              className="rounded-[26px] border-2 border-black bg-[#fff9ef] p-3 shadow-[0_8px_0_0_#111111] sm:rounded-[30px] sm:p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8b2d10]">מה חשוב לדעת</p>
                <span className={readOnlyBadgeClass}>לקריאה</span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-3">
                {['3 שימושים חינם להתחלה', 'לא שומרים את ההודעות שלך', 'מוכן לשליחה תוך רגע'].map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border-2 border-black bg-white px-3.5 py-2.5 text-center text-sm font-black text-black"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[26px] border-2 border-black bg-[#111111] p-3 shadow-[0_8px_0_0_#111111] sm:rounded-[30px] sm:p-4">
              <button
                type="button"
                onClick={() => {
                  trackEvent('hero_cta_click');
                  scrollToComposeSection();
                }}
                className={`inline-flex min-h-[56px] w-full items-center justify-center rounded-[22px] border-2 border-black bg-gradient-to-b from-[#ff7a56] to-[#ff623d] px-5 py-3 text-base font-black text-white shadow-[0_8px_0_0_#111111] transition hover:-translate-y-0.5 hover:shadow-[0_10px_0_0_#111111] active:translate-y-0 active:shadow-[0_5px_0_0_#111111] ${darkSurfaceFocusClass}`}
              >
                {heroGenerateCtaLabel}
              </button>
            </section>
          </>
        )}

        <section
          aria-label="איך מתחילים בדקה"
          className="w-full min-w-0 rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2d10]">ברוכים הבאים</p>
              <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">מה עושים כאן עכשיו?</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-neutral-700">
              שלושה צעדים קצרים, ויש לך תשובה מוכנה לשליחה.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {quickStartSteps.map((step) => (
              <article
                key={step.step}
                className="rounded-[22px] border-2 border-black bg-white p-3.5 shadow-[0_6px_0_0_#111111]"
              >
                <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#8b2d10]">
                  {step.step}
                </p>
                <h3 className="mt-2 text-base font-black text-black">{step.title}</h3>
                <p className="mt-1.5 text-sm font-bold leading-6 text-neutral-700">{step.body}</p>
              </article>
            ))}
          </div>

        </section>

        <section className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-5">
          <div
            ref={composeSectionRef}
            id="compose-section"
            className="mobile-section-anchor w-full min-w-0 space-y-4 rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
          >
            <div className="min-w-0 space-y-2">
              <p className="inline-flex min-h-[32px] items-center rounded-full border-2 border-black bg-white px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#9a2f10] lg:hidden">
                {mobileSectionNavItems[0].stepLabel}
              </p>
              <h2 className="text-2xl font-black text-black sm:text-3xl">מדביקים הודעה. מקבלים ניסוח מוכן.</h2>
              <p className="text-sm font-bold leading-6 text-neutral-700">
                כאן מתחילים: מדביקים את ההודעה כמו שהיא, בוחרים איך לענות, ותוך שניות נפתחות 3 תשובות קצרות שאפשר לשלוח מיד.
              </p>
            </div>

            {showDeepLinkPrefillBanner ? (
              <div className="flex w-full min-w-0 flex-col gap-2 rounded-[22px] border-2 border-black bg-[#d7f9ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-black text-black">{DEEP_LINK_PREFILL_BANNER_TEXT}</p>
                <button
                  type="button"
                  onClick={() => setShowDeepLinkPrefillBanner(false)}
                  className={`min-h-[38px] rounded-full border-2 border-black bg-white px-3 py-1 text-xs font-black text-black ${lightSurfaceFocusClass}`}
                >
                  סגור
                </button>
              </div>
            ) : null}

            <div className="w-full min-w-0 space-y-2 rounded-[24px] border-2 border-black bg-[#fff6d8] p-3 sm:hidden">
              <p className="text-sm font-black text-black">להתחיל מדוגמה מוכנה</p>
              <p className="text-xs font-bold leading-5 text-neutral-700">
                בחרו אחת מהדוגמאות ונמלא את הטופס אוטומטית.
              </p>
              <div className="snap-x scrollbar-none flex gap-2 overflow-x-auto pb-1">
                {examples.map((scenario) => (
                  <button
                    key={`mobile-example-${scenario.title}`}
                    type="button"
                    onClick={() => applyExample(scenario)}
                    className={`snap-start whitespace-nowrap rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-black text-black ${lightSurfaceFocusClass}`}
                  >
                    {scenario.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full min-w-0 space-y-4 rounded-[28px] border-2 border-black bg-white p-4 sm:p-5">
              <div className="rounded-[22px] border-2 border-black bg-[#fff6d8] p-3">
                <p className="text-sm font-black text-black">איך ממשיכים מכאן?</p>
                <p className="mt-1 text-xs font-bold leading-5 text-neutral-700">
                  בחרו מצב כתיבה כדי לראות רק את מה שצריך עכשיו.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {composeModeOptions.map((option) => {
                    const isSelected = composeMode === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setComposeMode(option.value)}
                        className={[
                          `min-h-[48px] rounded-2xl border-2 px-3 py-2 text-right transition ${lightSurfaceFocusClass}`,
                          isSelected
                            ? 'border-black bg-[#111111] text-[#f7ff4f]'
                            : 'border-black bg-white text-black hover:-translate-y-0.5',
                        ].join(' ')}
                      >
                        <span className="block text-sm font-black">{option.label}</span>
                        <span
                          className={[
                            'mt-1 block text-xs font-bold leading-5',
                            isSelected ? 'text-[#fffcc2]' : 'text-neutral-700',
                          ].join(' ')}
                        >
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isNoReplyMode ? (
                <div className="space-y-4 rounded-[24px] border-2 border-black bg-[#f8f4ed] p-4 motion-safe:animate-[sb-paywall-in_220ms_ease-out]">
                  <div>
                    <label htmlFor="last-outgoing-message" className="text-sm font-black text-neutral-900">
                      מה כתבתי בהודעה האחרונה?
                    </label>
                    <p className="text-xs font-bold text-neutral-700">
                      זה הטקסט האחרון ששלחת לפני שהצד השני הפסיק לענות.
                    </p>
                  </div>

                  <textarea
                    id="last-outgoing-message"
                    ref={lastOutgoingInputRef}
                    value={lastOutgoingMessage}
                    onChange={(event) =>
                      setLastOutgoingMessage(
                        event.target.value.slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH),
                      )
                    }
                    onPaste={handleMessagePaste}
                    placeholder='למשל: "היי, רק בודק/ת אם זה עדיין רלוונטי לך"'
                    maxLength={MAX_LAST_OUTGOING_MESSAGE_LENGTH}
                    className={`min-h-32 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-base leading-7 font-medium text-black outline-none transition placeholder:text-neutral-400 focus:-translate-y-0.5 focus:bg-[#fffdf6] ${lightSurfaceFocusClass}`}
                  />
                  <p className="text-xs font-bold text-neutral-700">
                    עד {MAX_LAST_OUTGOING_MESSAGE_LENGTH} תווים ({lastOutgoingMessageLength}/
                    {MAX_LAST_OUTGOING_MESSAGE_LENGTH}).
                  </p>

                  <div className="rounded-2xl border-2 border-black bg-white p-3">
                    <label
                      htmlFor="no-reply-duration-value"
                      className="text-sm font-black text-neutral-900"
                    >
                      כמה זמן לא ענו?
                    </label>
                    <p className="mt-1 text-xs font-bold text-neutral-700">
                      בוחרים מספר ויחידת זמן: דקות, שעות או ימים.
                    </p>
                    <div className="mt-2 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-2">
                      <input
                        id="no-reply-duration-value"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_NO_REPLY_DURATION_VALUE}
                        value={noReplyDurationValue}
                        onChange={(event) =>
                          setNoReplyDurationValue(
                            event.target.value
                              .replace(/[^\d]/g, '')
                              .slice(0, String(MAX_NO_REPLY_DURATION_VALUE).length),
                          )
                        }
                        placeholder="למשל 3"
                        className={`min-h-[44px] w-full rounded-xl border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none transition focus:bg-[#fffdf6] ${lightSurfaceFocusClass}`}
                      />
                      <select
                        id="no-reply-duration-unit"
                        value={noReplyDurationUnit}
                        onChange={(event) =>
                          setNoReplyDurationUnit(event.target.value as NoReplyDurationUnit)
                        }
                        className={`min-h-[44px] w-full rounded-xl border-2 border-black bg-white px-3 py-2 text-sm font-black text-black outline-none transition focus:bg-[#fffdf6] ${lightSurfaceFocusClass}`}
                      >
                        {noReplyDurationUnitOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-[24px] border-2 border-black bg-[#f8f4ed] p-4 motion-safe:animate-[sb-paywall-in_220ms_ease-out]">
                  <div className="flex flex-col items-start justify-between gap-3 min-[430px]:flex-row min-[430px]:items-center">
                    <div>
                      <label htmlFor="incoming-message" className="text-sm font-black text-neutral-900">
                        מה כתבו לך?
                      </label>
                      <p className="text-xs font-bold text-neutral-700">
                        אפשר להדביק כאן את ההודעה כמו שהיא, או לצרף צילום מסך של השיחה.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`min-h-[44px] rounded-full border-2 border-black bg-[#fff6d8] px-4 py-2 text-sm font-black text-black ${lightSurfaceFocusClass}`}
                    >
                      לצרף צילום מסך
                    </button>
                  </div>

                  <textarea
                    id="incoming-message"
                    ref={messageInputRef}
                    value={message}
                    onChange={(event) =>
                      setMessage(event.target.value.slice(0, MAX_INCOMING_MESSAGE_LENGTH))
                    }
                    onPaste={handleMessagePaste}
                    placeholder='למשל: "היי, מתאים לך שנדבר בערב?"'
                    maxLength={MAX_INCOMING_MESSAGE_LENGTH}
                    className={`min-h-36 w-full resize-none rounded-[26px] rounded-bl-[14px] border-2 border-black bg-white px-4 py-4 text-base leading-7 font-medium text-black outline-none transition placeholder:text-neutral-500 focus:bg-[#fffdf6] sm:min-h-40 sm:rounded-[28px] sm:rounded-bl-[16px] ${lightSurfaceFocusClass}`}
                  />
                  <p className="text-xs font-bold text-neutral-700">
                    עד {MAX_INCOMING_MESSAGE_LENGTH} תווים להודעה ({messageLength}/
                    {MAX_INCOMING_MESSAGE_LENGTH}).
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />

                  {imageName ? (
                    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border-2 border-black bg-[#fff6d8] px-4 py-3 min-[430px]:flex-row min-[430px]:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-black">{imageName}</p>
                        <p className="text-xs font-bold text-neutral-700">הצילום נוסף לטופס ומוכן ליצירה</p>
                      </div>
                      <button
                        type="button"
                        onClick={clearImage}
                        className={`min-h-[44px] rounded-full border-2 border-black bg-[#111111] px-3 py-2 text-xs font-black text-white ${lightSurfaceFocusClass}`}
                      >
                        להסיר
                      </button>
                    </div>
                  ) : null}

                  {imageError ? <p className="text-sm font-bold text-[#c23318]">{imageError}</p> : null}
                </div>
              )}

              <details className="group rounded-[22px] border-2 border-dashed border-black bg-[#fff6d8] transition-colors duration-200 open:bg-[#fff2bf]">
                <summary
                  className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-black text-black marker:content-none ${lightSurfaceFocusClass}`}
                >
                  <span>רקע שיחה נוסף (אופציונלי)</span>
                  <span className="text-xs transition-transform duration-200 group-open:rotate-180">⌄</span>
                </summary>
                <div className="sb-accordion-content">
                  <div className="sb-accordion-content-inner">
                    <div className="space-y-2 px-3 pb-3 pt-0.5">
                      <p className="text-xs font-bold text-neutral-700">
                        פרטים קצרים שיעזרו לדייק את הניסוח (למשל: מה היה לפני כן בשיחה).
                      </p>
                      <textarea
                        id="conversation-background"
                        value={conversationBackground}
                        onChange={(event) =>
                          setConversationBackground(
                            event.target.value.slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH),
                          )
                        }
                        placeholder='למשל: "דיברנו כמה ימים ואז השיחה נעצרה"'
                        maxLength={MAX_CONVERSATION_BACKGROUND_LENGTH}
                        className={`min-h-24 w-full rounded-[18px] border-2 border-black bg-white px-3 py-3 text-sm font-medium leading-6 text-black outline-none transition placeholder:text-neutral-400 focus:bg-[#fffdf6] ${lightSurfaceFocusClass}`}
                      />
                      <p className="text-xs font-bold text-neutral-700">
                        עד {MAX_CONVERSATION_BACKGROUND_LENGTH} תווים ({conversationBackgroundLength}/
                        {MAX_CONVERSATION_BACKGROUND_LENGTH}).
                      </p>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            <div className="grid gap-2.5 sm:gap-3">
              <ChipGroup
                title="מה המצב?"
                description="נבין את הסיטואציה כדי לנסח תשובה שמתאימה לך."
                options={contextOptions}
                primaryVisibleCount={6}
                moreOptionsLabel="עוד סיטואציות"
                value={context}
                onChange={(nextValue) => {
                  if (nextValue) {
                    trackEvent('situation_select', { value: nextValue });
                    setContext(nextValue);
                  }
                }}
              />

              <ChipGroup
                title="איך תרצו לענות?"
                description="בחרו את הווייב שתרצו לשדר בתשובה."
                options={toneOptions}
                primaryVisibleCount={5}
                moreOptionsLabel="עוד וייבים"
                value={tone}
                onChange={(nextValue) => {
                  if (nextValue) {
                    trackEvent('tone_select', { value: nextValue });
                    setTone(nextValue);
                  }
                }}
              />

              {!isNoReplyMode ? (
                <ChipGroup
                  title="להמשיך באותו כיוון?"
                  description="אופציונלי: עוזר לנו לדייק אם לזרום עם המסר או לעצור."
                  options={continuePreferenceOptions}
                  value={continuePreference}
                  onChange={(nextValue) => {
                    trackEvent('agrees_select', { value: nextValue ?? 'unset' });
                    setContinuePreference(nextValue);
                  }}
                  helperText={
                    continuePreference
                      ? 'מעולה, שמרנו את הבחירה שלך. אפשר לשנות בכל רגע.'
                      : 'אופציונלי לגמרי, אפשר להמשיך גם בלי לבחור.'
                  }
                  optional
                  allowEmpty
                />
              ) : null}
            </div>

            <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={handleMainSubmit}
                disabled={isGenerating || !isSessionReady}
                className={`inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[26px] border-2 border-black bg-gradient-to-b from-[#ff7a56] to-[#ff623d] px-6 py-3 text-base font-black text-white shadow-[0_8px_0_0_#111111] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_0_0_#111111] active:translate-y-0 active:shadow-[0_5px_0_0_#111111] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${lightSurfaceFocusClass}`}
              >
                <span className="rounded-full border-2 border-black bg-[#f7ff4f] px-2 py-0.5 text-[0.64rem] font-black uppercase tracking-[0.12em] text-black">
                  פעולה
                </span>
                {generateButtonLabel}
              </button>
              <div className="flex flex-wrap items-center justify-end gap-3 text-sm font-bold text-neutral-700">
                <p>{accountStatusLine}</p>
              </div>
            </div>

            <div className="space-y-2.5 sm:hidden">
              <button
                type="button"
                onClick={handleMainSubmit}
                disabled={isGenerating || !isSessionReady}
                className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[26px] border-2 border-black bg-gradient-to-b from-[#ff7a56] to-[#ff623d] px-5 py-3 text-base font-black text-white shadow-[0_8px_0_0_#111111] transition duration-150 active:translate-y-0 active:shadow-[0_5px_0_0_#111111] disabled:cursor-not-allowed disabled:opacity-60 ${lightSurfaceFocusClass}`}
              >
                <span className="rounded-full border-2 border-black bg-[#f7ff4f] px-2 py-0.5 text-[0.64rem] font-black uppercase tracking-[0.12em] text-black">
                  פעולה
                </span>
                {generateButtonLabel}
              </button>
              <p className="text-xs font-black text-neutral-700">{accountStatusLine}</p>
            </div>

            {paymentNotice ? (
              <p className="rounded-2xl border-2 border-black bg-[#d7f9ff] px-4 py-3 text-sm font-black text-black">
                {paymentNotice}
              </p>
            ) : null}

            {requestError ? (
              <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
                {requestError}
              </p>
            ) : null}
          </div>

          <div
            ref={resultsSectionRef}
            id="results-section"
            className="mobile-section-anchor w-full min-w-0 space-y-4 rounded-[30px] border-2 border-black bg-white p-3.5 shadow-[0_10px_0_0_#6ce8ff] sm:rounded-[36px] sm:p-5 sm:shadow-[0_12px_0_0_#6ce8ff]"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="inline-flex min-h-[32px] items-center rounded-full border-2 border-black bg-[#d7f9ff] px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-black lg:hidden">
                  {mobileSectionNavItems[1].stepLabel}
                </p>
                <h2 className="text-2xl font-black text-black sm:text-3xl">הנה מה שאפשר לשלוח</h2>
                <p className="mt-1.5 text-sm font-bold leading-6 text-neutral-700">
                  הסבר קצר ואז תשובות שמוכנות להעתקה.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="rounded-full border-2 border-black bg-[#d7f9ff] px-3 py-2 text-xs font-black text-black">
                  מוכן לשליחה
                </span>
                <div className="flex items-center gap-2 sm:hidden">
                  <button
                    type="button"
                    onClick={() =>
                      scrollToMobileSection('compose', { source: 'navigation' })
                    }
                    className={`min-h-[36px] rounded-full border-2 border-black bg-white px-3 py-1 text-[0.72rem] font-black text-black ${lightSurfaceFocusClass}`}
                  >
                    לטופס
                  </button>
                  {!isGeneratorPrimaryMode ? (
                    <button
                      type="button"
                      onClick={() =>
                        scrollToMobileSection('examples', { source: 'navigation' })
                      }
                      className={`min-h-[36px] rounded-full border-2 border-black bg-[#fff6d8] px-3 py-1 text-[0.72rem] font-black text-black ${lightSurfaceFocusClass}`}
                    >
                      לדוגמאות
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div aria-live="polite" aria-busy={isGenerating} className="space-y-3">
              {result ? (
                <div className="w-full min-w-0 space-y-3">
                <div className="w-full min-w-0 rounded-[26px] border-2 border-black bg-[#fff6d8] p-4 shadow-[0_8px_0_0_#111111]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-600">
                      מה הם כנראה מנסים להגיד
                    </p>
                    <span className={readOnlyBadgeClass}>לקריאה</span>
                  </div>
                  <p className="mt-2 text-base font-bold leading-7 text-black">{result.intent}</p>
                </div>

                <div className="w-full min-w-0 space-y-3">
                  {result.replies.map((reply, index) => (
                    <ReplyCard
                      key={`${index}-${reply}`}
                      reply={reply}
                      index={index}
                      isBusy={isGenerating}
                      isUpdating={busyReplyIndex === index}
                      copied={copiedReplyIndex === index}
                      onCopy={handleCopy}
                      onAdjust={handleReplyAction}
                    />
                  ))}
                </div>
                </div>
              ) : (
                <div className="flex w-full min-w-0 min-h-72 flex-col justify-center rounded-[28px] border-2 border-dashed border-black bg-[#f8f4ed] p-5 sm:min-h-80">
                  <h3 className="text-2xl font-black text-black">כאן יופיעו התשובות שלך</h3>
                  <p className="mt-3 max-w-md text-sm font-bold leading-6 text-neutral-700">
                    בחרו מצב כתיבה, מלאו את השדה הראשי ותוך רגע יופיעו 3 תשובות מוכנות להעתקה.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {!isGeneratorPrimaryMode ? (
          <section
            ref={examplesSectionRef}
            id="examples-section"
            className="mobile-section-anchor w-full min-w-0 rounded-[30px] border-2 border-black bg-[#d34f24] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="inline-flex min-h-[32px] items-center rounded-full border-2 border-black bg-white px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#9a2f10] lg:hidden">
                  {mobileSectionNavItems[2].stepLabel}
                </p>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-black">דוגמאות פתיחה</p>
                <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">4 מצבים שמכירים מהחיים</h2>
              </div>
              <p className="max-w-xl text-sm font-bold leading-6 text-black">
                לחיצה על כרטיס מכניסה את הדוגמה לטופס ותיתן לך נקודת פתיחה מהירה.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:[grid-template-columns:repeat(2,minmax(0,1fr))] xl:[grid-template-columns:repeat(4,minmax(0,1fr))]">
              {examples.map((scenario) => (
                <ExampleCard
                  key={scenario.title}
                  scenario={scenario}
                  onUse={applyExample}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!billingBypassEnabled ? (
          <section
            ref={plansSectionRef}
            id="plans-section"
            className="mobile-section-anchor w-full min-w-0 rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
          >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2d10]">תשלום</p>
              <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">פותחים עוד תשובות</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-neutral-700">
              התשלום נעשה כאן באתר בצורה בטוחה, קצרה וברורה.
            </p>
          </div>

          <BillingSnapshotPanel
            freeRemaining={freeRemaining}
            freeLimit={initialFreeLimit}
            dailyFreeRemaining={dailyFreeRemaining}
            dailyLimit={dailyFreeLimit}
            paidCredits={paidCredits}
            hasUnlimitedAccess={hasUnlimitedAccess}
            showDailyFreeExhaustedHelper={isBlockedOnlyByDailyFreeExhausted}
            className="mt-5"
          />

          <SubscriptionManagementPanel
            subscription={managedSubscription}
            isLoading={isSubscriptionLoading || isSubscriptionActionLoading}
            isSessionReady={isSessionReady}
            onAction={handleSubscriptionAction}
            actionError={subscriptionActionError}
            actionNotice={subscriptionActionNotice}
            className="mt-4"
          />

          <CouponRedeemPanel
            couponCode={couponCode}
            onCouponCodeChange={handleCouponCodeChange}
            onRedeemCoupon={handleRedeemCoupon}
            isRedeemingCoupon={isRedeemingCoupon}
            isSessionReady={isSessionReady}
            couponError={couponError}
            couponNotice={couponNotice}
            className="mt-4"
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border-2 border-black bg-white p-5">
              <span className="rounded-full border border-black bg-[#f7ff4f] px-3 py-1 text-xs font-black text-black">
                {CREDIT_PLAN_COPY.badge}
              </span>
              <h3 className="mt-3 text-xl font-black text-black">{CREDIT_PLAN_COPY.title}</h3>
              <p className="mt-2 text-sm font-black text-neutral-700">{CREDIT_PLAN_COPY.helper}</p>
              <p className="mt-1 text-sm font-bold text-neutral-700">{CREDIT_PLAN_COPY.body}</p>
              <p className="mt-4 text-3xl font-black text-black">{CREDIT_PLAN_COPY.price}</p>
              <button
                type="button"
                onClick={() => handleCheckout('credits_50')}
                disabled={checkoutPlan !== null || !isSessionReady}
                className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
              >
                {checkoutPlan === 'credits_50' ? 'טוען טופס תשלום...' : CREDIT_PLAN_COPY.cta}
              </button>
            </div>

            <div className="rounded-[24px] border-2 border-black bg-[#111111] p-5 text-white">
              <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-black">
                {UNLIMITED_PLAN_COPY.badge}
              </span>
              <h3 className="mt-3 text-xl font-black">{UNLIMITED_PLAN_COPY.title}</h3>
              <p className="mt-2 text-sm font-black text-white/80">{UNLIMITED_PLAN_COPY.helper}</p>
              <p className="mt-1 text-sm font-bold text-white/80">{UNLIMITED_PLAN_COPY.body}</p>
              <p className="mt-4 text-3xl font-black">{UNLIMITED_PLAN_COPY.price}</p>
              <button
                type="button"
                onClick={() => handleCheckout('unlimited_monthly')}
                disabled={checkoutPlan !== null || !isSessionReady}
                className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-white bg-[#ff623d] px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
              >
                {checkoutPlan === 'unlimited_monthly'
                  ? 'טוען טופס תשלום...'
                  : UNLIMITED_PLAN_COPY.cta}
              </button>
            </div>
          </div>

          {checkoutError ? (
            <p className="mt-4 rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
              {checkoutError}
            </p>
          ) : null}
          </section>
        ) : null}

        {!isGeneratorPrimaryMode ? (
          <section className="w-full min-w-0 rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2d10]">מדריכי תשובות</p>
                <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">מה לענות ל...</h2>
              </div>
              <p className="max-w-xl text-sm font-bold leading-6 text-neutral-700">
                דפי דוגמה קצרים למצבים אמיתיים: מה לכתוב, למה זה עובד, ו־3 תשובות מוכנות שאפשר לקחת מיד.
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {answerHubHighlights.map((item) => (
                <Link
                  key={item.slug}
                  href={`/answers/${item.slug}`}
                  className={`block cursor-pointer rounded-[22px] border-2 border-black bg-white p-4 shadow-[0_6px_0_0_#111111] transition hover:-translate-y-0.5 ${lightSurfaceFocusClass}`}
                >
                  <span className={interactiveBadgeClass}>לחיץ</span>
                  <p className="text-sm font-black leading-6 text-black">{item.query}</p>
                  <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">{item.teaser}</p>
                  <span className="mt-3 inline-block text-xs font-black text-[#9a2f10]">לעמוד המלא</span>
                </Link>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href="/answers"
                className={`inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-[#f7ff4f] px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5 ${lightSurfaceFocusClass}`}
              >
                לכל דפי &quot;מה לענות ל...&quot;
              </Link>
              <Link
                href="/#compose-section"
                className={`inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-black text-black transition hover:-translate-y-0.5 ${lightSurfaceFocusClass}`}
              >
                לפתוח את כלי התשובות
              </Link>
            </div>
          </section>
        ) : null}

        <footer className="w-full min-w-0 rounded-[24px] border-2 border-black bg-[#fff6d8] px-4 py-4 text-sm font-bold text-neutral-800 shadow-[0_8px_0_0_#111111]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {billingBypassEnabled
                ? 'כרגע SayBack פתוח לשימוש ללא הגבלה.'
                : 'התשלום מאובטח, ואנחנו לא שומרים אצלנו פרטי אשראי.'}
            </p>
            <div className="flex items-center gap-3">
              <Link href="/privacy" className={`${lightSurfaceFocusClass} rounded-full px-2 py-1 underline`}>
                מדיניות פרטיות
              </Link>
              <Link href="/terms" className={`${lightSurfaceFocusClass} rounded-full px-2 py-1 underline`}>
                תנאי שימוש
              </Link>
            </div>
          </div>
        </footer>
      </div>

      {!billingBypassEnabled ? (
        <PaywallModal
          open={showPaywall}
          onClose={closePaywall}
          onSelectPlan={handleCheckout}
          onResetCheckout={resetCheckoutSelection}
          onPaymentCompleted={handlePaymentCompleted}
          isCheckoutLoading={checkoutPlan !== null || !isSessionReady}
          checkoutPlan={checkoutPlan}
          checkoutError={checkoutError}
          checkoutSession={checkoutSession}
          freeRemaining={freeRemaining}
          freeLimit={initialFreeLimit}
          dailyFreeRemaining={dailyFreeRemaining}
          dailyLimit={dailyFreeLimit}
          paidCredits={paidCredits}
          hasUnlimitedAccess={hasUnlimitedAccess}
          showDailyFreeExhaustedHelper={isBlockedOnlyByDailyFreeExhausted}
          couponCode={couponCode}
          onCouponCodeChange={handleCouponCodeChange}
          onRedeemCoupon={handleRedeemCoupon}
          isRedeemingCoupon={isRedeemingCoupon}
          isSessionReady={isSessionReady}
          couponError={couponError}
          couponNotice={couponNotice}
        />
      ) : null}
    </main>
  );
}
