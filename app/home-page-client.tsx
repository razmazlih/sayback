'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ClipboardEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import dynamic from 'next/dynamic';
import Image, { type StaticImageData } from 'next/image';
import {
  ConversationMemoryDialog,
  ManageConversationsDialog,
  SaveConversationDialog,
  SavedConversationsRow,
} from '@/components/conversation-memory';
import { trackEvent } from '@/lib/analytics';
import { captureAndStoreAttribution } from '@/lib/attribution';
import type { ConversationProfile } from '@/lib/conversation-profile-types';
import { buildHomeDeepLink, parseHomeDeeplinkParams } from '@/lib/home-deeplink';
import {
  CONTEXT_OPTIONS,
  FREE_CONTEXT_OPTION_COUNT,
  FREE_TONE_OPTION_COUNT,
  TONE_OPTIONS,
  resolveConversationDefaultsForAccess,
  type ContextOption,
  type ToneOption,
} from '@/lib/generator-options';
import {
  MAX_CONVERSATION_BACKGROUND_LENGTH,
  MAX_INCOMING_MESSAGE_LENGTH,
  MAX_LAST_OUTGOING_MESSAGE_LENGTH,
  MAX_NO_REPLY_DURATION_VALUE,
} from '@/lib/message-limits';
import {
  CREDIT_PACK_PRICE_LABEL,
} from '@/lib/pricing';
import bossBriefcaseIllustration from '@/public/option-illustrations/boss-briefcase.webp';
import clientHandshakeIllustration from '@/public/option-illustrations/client-handshake.webp';
import crushHeartIllustration from '@/public/option-illustrations/crush-heart.webp';
import dateCoffeeIllustration from '@/public/option-illustrations/date-coffee.webp';
import directTargetIllustration from '@/public/option-illustrations/direct-target.webp';
import exBrokenHeartIllustration from '@/public/option-illustrations/ex-broken-heart.webp';
import flirtySparkleHeartIllustration from '@/public/option-illustrations/flirty-sparkle-heart.webp';
import flowWaveIllustration from '@/public/option-illustrations/flow-wave.webp';
import friendHighFiveIllustration from '@/public/option-illustrations/friend-high-five.webp';
import funnySmileIllustration from '@/public/option-illustrations/funny-smile.webp';
import gentleFeatherIllustration from '@/public/option-illustrations/gentle-feather.webp';
import yad2PriceTagIllustration from '@/public/option-illustrations/yad2-price-tag.webp';

type ContinuePreference = 'כן' | 'לא';
type IncomingGoal =
  | 'להמשיך שיחה'
  | 'לקבוע זמן'
  | 'לבקש הבהרה'
  | 'להציב גבול'
  | 'לסגור בנימוס'
  | 'להתמקח / לקדם סגירה';
type NoReplyGoal = 'תזכורת עדינה' | 'בדיקת סטטוס' | 'שחרור מכבד';
type Goal = IncomingGoal | NoReplyGoal;
type ComposeMode = 'incoming' | 'no_reply';
type NoReplyDurationUnit = 'minutes' | 'hours' | 'days';
type ReplyAction = 'softer' | 'sharper' | 'retry';
type SubscriptionAction = 'cancel_next_charge' | 'resume_renewal';
type CheckoutPlan = 'credits_50' | 'unlimited_monthly';
type PaidPlan = CheckoutPlan | null;
type AuthEmailIntent = 'checkout' | 'recover';
type MobileSectionId = 'compose' | 'results' | 'examples' | 'plans';
type MobileNavSectionId = Exclude<MobileSectionId, 'plans'>;
type MobilePrimaryView = 'compose' | 'results';
type ExampleId = 'crush-comeback' | 'ex-check-in' | 'client-discount' | 'yad2-classic';

type ExampleScenario = {
  id: ExampleId;
  title: string;
  message: string;
  context: ContextOption;
  tone: ToneOption;
  goal?: IncomingGoal;
  continuePreference?: ContinuePreference | null;
};

type HomeDeepLinkPrefill = {
  hasValidState: boolean;
  shouldFocusMessage: boolean;
  mode?: ComposeMode;
  exampleId?: ExampleId;
  context?: ContextOption;
  tone?: ToneOption;
  continuePreference?: ContinuePreference;
};

type ClientProductEventName =
  | 'page_view_home'
  | 'generator_input_start'
  | 'reply_copy'
  | 'conversation_selected'
  | 'paywall_view';

type GenerateResponse = {
  intent: string;
  replies: string[];
  billing?: BillingSnapshot;
  personalizationApplied?: boolean;
  savedConversationUnavailable?: boolean;
};

type GenerateRequest = {
  message: string;
  imageBase64: string | null;
  context?: ContextOption;
  tone: ToneOption;
  goal?: Goal;
  continuePreference?: ContinuePreference | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  refineInstruction?: string;
  action?: ReplyAction;
  sourceReply?: string;
  conversationId?: string;
};

type SuccessfulConversationDefaults = {
  context: ContextOption | null;
  tone: ToneOption;
  lastIntent: string;
};

type ConversationDefaults = Omit<SuccessfulConversationDefaults, 'lastIntent'>;

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
  accountEmail?: string | null;
  isRecoverableAccount?: boolean;
  nextConsumptionSource?: 'initial_free' | 'daily_free' | 'credits' | 'unlimited' | 'blocked';
  dailyResetAt?: string | null;
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
const GENERATOR_FLOW_VERSION = 'simplified_v1' as const;
const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const MIN_LOADING_DISPLAY_MS = 1200;
const AUTH_EMAIL_STORAGE_KEY = 'sayback.auth.email';
const AUTH_EMAIL_INTENT_STORAGE_KEY = 'sayback.auth.intent';
const AUTH_EMAIL_PLAN_STORAGE_KEY = 'sayback.auth.checkoutPlan';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_LINK_QUERY_KEYS = [
  'apiKey',
  'oobCode',
  'mode',
  'continueUrl',
  'lang',
  'sb_auth_intent',
  'sb_auth_plan',
] as const;
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
const MONTHLY_LOCK_COPY = {
  context: {
    title: 'הסיטואציות המורחבות שמורות למסלול החודשי',
    body: 'אפשר לעבור עליהן כאן, ולפתוח בחירה בפועל עם מנוי ללא הגבלה חודשי.',
  },
  tone: {
    title: 'הווייבים המורחבים נפתחים במסלול החודשי',
    body: 'כל הווייבים מוצגים כדי להתרשם. כדי להשתמש בוייבים המתקדמים צריך מנוי חודשי.',
  },
  conversationBackground: {
    badge: 'גישה בלעדית לחודשי',
    title: 'רקע שיחה נוסף נפתח רק במסלול ללא הגבלה חודשי',
    body: 'הפיצ׳ר הזה מוסיף שכבת הקשר עמוקה יותר ומחזיר תשובות מדויקות ואישיות יותר.',
    cta: 'לפתוח חודשי ללא הגבלה',
  },
} as const;
const DEEP_LINK_PREFILL_BANNER_TEXT = 'מילאנו לך התחלה. אפשר לערוך לפני שמייצרים.';
const contextOptions: ContextOption[] = [...CONTEXT_OPTIONS];
const toneOptions: ToneOption[] = [...TONE_OPTIONS];
const incomingGoalOptions: IncomingGoal[] = [
  'להמשיך שיחה',
  'לקבוע זמן',
  'לבקש הבהרה',
  'להציב גבול',
  'לסגור בנימוס',
  'להתמקח / לקדם סגירה',
];
const noReplyGoalOptions: NoReplyGoal[] = ['תזכורת עדינה', 'בדיקת סטטוס', 'שחרור מכבד'];
const continuePreferenceOptions: ContinuePreference[] = ['כן', 'לא'];
const customRefinePresets = [
  'קצר יותר',
  'טבעי יותר',
  'עם אימוג׳י',
  'בלי אימוג׳י',
  'להציב גבול',
  'לקבוע זמן',
] as const;
const CONTEXT_PRIMARY_VISIBLE_COUNT = FREE_CONTEXT_OPTION_COUNT;
const TONE_PRIMARY_VISIBLE_COUNT = FREE_TONE_OPTION_COUNT;
const freeContextOptions = contextOptions.slice(0, CONTEXT_PRIMARY_VISIBLE_COUNT);
const freeToneOptions = toneOptions.slice(0, TONE_PRIMARY_VISIBLE_COUNT);
const monthlyOnlyContextOptions = contextOptions.slice(CONTEXT_PRIMARY_VISIBLE_COUNT);
const monthlyOnlyToneOptions = toneOptions.slice(TONE_PRIMARY_VISIBLE_COUNT);
const contextOptionIllustrations: Partial<Record<ContextOption, StaticImageData>> = {
  קראש: crushHeartIllustration,
  אקס: exBrokenHeartIllustration,
  ידיד: friendHighFiveIllustration,
  לקוח: clientHandshakeIllustration,
  בוס: bossBriefcaseIllustration,
  יד2: yad2PriceTagIllustration,
  דייט: dateCoffeeIllustration,
};
const toneOptionIllustrations: Partial<Record<ToneOption, StaticImageData>> = {
  עדין: gentleFeatherIllustration,
  ישיר: directTargetIllustration,
  זורם: flowWaveIllustration,
  מצחיק: funnySmileIllustration,
  פלרטטני: flirtySparkleHeartIllustration,
};
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
    goal: 'להמשיך שיחה',
    continuePreference: 'כן',
  },
  {
    id: 'ex-check-in',
    title: 'אקס שבודק דופק',
    message: 'וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?',
    context: 'אקס',
    tone: 'ישיר',
    goal: 'לסגור בנימוס',
    continuePreference: 'לא',
  },
  {
    id: 'client-discount',
    title: 'לקוח שרוצה הנחה',
    message: 'ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו',
    context: 'לקוח',
    tone: 'עדין',
    goal: 'להתמקח / לקדם סגירה',
    continuePreference: 'כן',
  },
  {
    id: 'yad2-classic',
    title: 'יד2 קלאסי',
    message: 'אחרון כמה? בא לקחת היום אם יש מחיר טוב',
    context: 'יד2',
    tone: 'זורם',
    goal: 'להתמקח / לקדם סגירה',
    continuePreference: 'כן',
  },
];

const exampleIds = examples.map((scenario) => scenario.id);

const focusRingBaseClass =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#20d6c7]/40 focus-visible:ring-offset-2';
const lightSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#f7f3ec]`;
const whiteSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-white`;
const darkSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#181411]`;
const interactiveBadgeClass =
  'inline-flex min-h-[28px] items-center rounded-full border border-[#d8cab9] bg-[#181411] px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#fffdfa]';
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

  if (lower.includes('recoverable_email_required') || lower.includes('צריך להתחבר עם אימייל')) {
    return 'לפני תשלום צריך לשמור גישה עם אימייל, כדי שתוכלו לשחזר את הרכישה גם ממכשיר אחר.';
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

function subscribeToHydration() {
  return () => {};
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

function formatShortDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return EMAIL_PATTERN.test(normalizeEmailInput(value));
}

function getAuthLinkIntentFromUrl() {
  const intent = readAuthLinkParam('sb_auth_intent');
  return intent === 'checkout' ? 'checkout' : 'recover';
}

function getAuthLinkPlanFromUrl() {
  const plan = readAuthLinkParam('sb_auth_plan');
  return isCheckoutPlan(plan) ? plan : null;
}

function readAuthLinkParam(name: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const directValue = params.get(name);

  if (directValue) {
    return directValue;
  }

  const continueUrl = params.get('continueUrl');

  if (!continueUrl) {
    return null;
  }

  try {
    return new URL(continueUrl, window.location.origin).searchParams.get(name);
  } catch {
    return null;
  }
}

function stripAuthLinkParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);

  for (const key of AUTH_LINK_QUERY_KEYS) {
    params.delete(key);
  }

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
}

function readFirebaseErrorCode(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null;
}

function parseHomeDeepLinkPrefill(searchParams: URLSearchParams): HomeDeepLinkPrefill {
  const parsed = parseHomeDeeplinkParams(searchParams, {
    examples: exampleIds,
    situations: CONTEXT_OPTIONS,
    tones: TONE_OPTIONS,
    agrees: continuePreferenceOptions,
  });

  return {
    hasValidState: parsed.hasPrefill,
    shouldFocusMessage: parsed.shouldFocusMessage,
    mode: parsed.prefill.mode ?? undefined,
    exampleId: parsed.prefill.example ?? undefined,
    context: parsed.prefill.situation ?? undefined,
    tone: parsed.prefill.tone ?? undefined,
    continuePreference: parsed.prefill.agrees ?? undefined,
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
  primaryColumns = 2,
  moreOptionsLabel = 'עוד אפשרויות',
  lockedOptions = [],
  lockedOptionsPreviewLabel = 'פרימיום',
  lockedOptionsHint,
  lockedOptionsNoticeTitle,
  lockedOptionsNoticeBody,
  lockedOptionsNoticeCta = 'לפתוח ללא הגבלה חודשי',
  showMoreOptionsSearch = true,
  onLockedOptionsNoticeCtaClick,
  headerAlign = 'center',
  illustrations,
  warmOptionCards = false,
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
  primaryColumns?: 2 | 3;
  moreOptionsLabel?: string;
  lockedOptions?: readonly T[];
  lockedOptionsPreviewLabel?: string;
  lockedOptionsHint?: string;
  lockedOptionsNoticeTitle?: string;
  lockedOptionsNoticeBody?: string;
  lockedOptionsNoticeCta?: string;
  showMoreOptionsSearch?: boolean;
  onLockedOptionsNoticeCtaClick?: () => void;
  headerAlign?: 'center' | 'right';
  illustrations?: Partial<Record<T, StaticImageData>>;
  warmOptionCards?: boolean;
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
  const hasLockedOptions = lockedOptions.length > 0;
  const lockedOptionsSet = useMemo(() => new Set(lockedOptions), [lockedOptions]);
  const lockedExtraOptionsCount = useMemo(
    () => extraOptions.filter((option) => lockedOptionsSet.has(option)).length,
    [extraOptions, lockedOptionsSet],
  );
  const moreOptionsDialogTitleId = useId();
  const moreOptionsDialogDescriptionId = useId();
  const groupTitleId = useId();
  const [isMoreOptionsDialogOpen, setIsMoreOptionsDialogOpen] = useState(false);
  const [isMoreOptionsDialogClosing, setIsMoreOptionsDialogClosing] = useState(false);
  const [moreOptionsSearchTerm, setMoreOptionsSearchTerm] = useState('');
  const [showLockedOptionsNotice, setShowLockedOptionsNotice] = useState(false);
  const closeMoreOptionsDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMoreOptionsDialog = () => {
    if (closeMoreOptionsDialogTimerRef.current !== null) {
      clearTimeout(closeMoreOptionsDialogTimerRef.current);
      closeMoreOptionsDialogTimerRef.current = null;
    }

    setShowLockedOptionsNotice(false);
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

  const closeMoreOptionsDialogImmediately = useCallback(() => {
    if (closeMoreOptionsDialogTimerRef.current !== null) {
      clearTimeout(closeMoreOptionsDialogTimerRef.current);
      closeMoreOptionsDialogTimerRef.current = null;
    }

    setIsMoreOptionsDialogClosing(false);
    setIsMoreOptionsDialogOpen(false);
  }, []);

  const filteredMoreOptions = useMemo(() => {
    if (!showMoreOptionsSearch) {
      return options;
    }

    const normalizedSearchTerm = moreOptionsSearchTerm.trim().toLowerCase();

    if (!normalizedSearchTerm) {
      return options;
    }

    return options.filter((option) => option.toLowerCase().includes(normalizedSearchTerm));
  }, [options, moreOptionsSearchTerm, showMoreOptionsSearch]);

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

  const canClearSelection = allowEmpty && hasSelection;
  const isHeaderRightAligned = headerAlign === 'right';

  const renderOption = (option: T, mode: 'inline' | 'dialog' = 'inline') => {
    const isSelected = option === value;
    const isLockedOption = lockedOptionsSet.has(option);
    const shouldCloseDialogOnSelect = mode === 'dialog';
    const illustration = illustrations?.[option];
    const usesWarmOptionCards = warmOptionCards || illustrations !== undefined;

    return (
      <button
        key={option}
        type="button"
        aria-pressed={isSelected}
        aria-disabled={isLockedOption}
        onClick={() => {
          if (isLockedOption) {
            setShowLockedOptionsNotice(true);
            return;
          }

          onChange(allowEmpty && isSelected ? null : option);

          if (shouldCloseDialogOnSelect) {
            closeMoreOptionsDialog();
          }
        }}
        className={[
          usesWarmOptionCards
            ? `sb-option-card group relative w-full rounded-[18px] border-2 px-2.5 py-1.5 text-center font-bold touch-manipulation ${whiteSurfaceFocusClass}`
            : `w-full rounded-full border px-3.5 py-2 text-center font-bold transition duration-150 touch-manipulation ${whiteSurfaceFocusClass}`,
          usesWarmOptionCards
            ? mode === 'dialog'
              ? 'min-h-[48px] text-sm sm:w-auto sm:min-w-36'
              : primaryColumns === 3
                ? 'min-h-[44px] text-[0.76rem] sm:text-sm'
                : 'min-h-[48px] text-[0.82rem] sm:text-sm'
            : mode === 'dialog'
              ? 'min-h-[44px] text-sm sm:w-auto'
              : 'min-h-[40px] text-sm sm:min-h-[42px]',
          usesWarmOptionCards
            ? isLockedOption
              ? 'sb-option-card--locked'
              : isSelected
                ? 'sb-option-card--selected'
                : 'sb-option-card--default'
            : isLockedOption
              ? 'border-[#4a3320] bg-[#2b211a] text-[#f7e2ab] hover:-translate-y-0.5 hover:brightness-110'
              : isSelected
                ? 'border-[#181411] bg-[#181411] text-white shadow-[0_10px_20px_rgba(24,20,17,0.14)]'
                : 'border-[#ded2c3] bg-[#fffdfa] text-[#241d18] hover:-translate-y-0.5 hover:bg-[#f8f3eb]',
        ].join(' ')}
      >
        <span
          className={[
            'flex w-full items-center gap-2',
            isLockedOption ? 'justify-between' : 'justify-center',
          ].join(' ')}
        >
          <span className="inline-flex min-w-0 items-center justify-center gap-1.5 sm:gap-2">
            {illustration ? (
              <Image
                src={illustration}
                width={primaryColumns === 3 ? 24 : 32}
                height={primaryColumns === 3 ? 24 : 32}
                alt=""
                aria-hidden="true"
                draggable={false}
                className={[
                  primaryColumns === 3
                    ? 'sb-option-card__illustration size-6 shrink-0 object-contain'
                    : 'sb-option-card__illustration size-8 shrink-0 object-contain',
                  isSelected ? 'sb-option-card__illustration--selected' : '',
                ].join(' ')}
              />
            ) : null}
            <span>{option}</span>
          </span>
          {isLockedOption ? (
            <span
              className={[
                'rounded-full border px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.08em]',
                usesWarmOptionCards
                  ? 'border-[#d8ad52] bg-white/75 text-[#6b4610]'
                  : 'border-[#f7cf76] bg-[#1d1608] text-[#ffe7b2]',
              ].join(' ')}
            >
              {lockedOptionsPreviewLabel}
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <section
      role="group"
      aria-labelledby={groupTitleId}
      className={[
        'w-full min-w-0 rounded-[22px] border border-[#e2d7c8] bg-white shadow-[0_10px_26px_rgba(49,23,13,0.06)] sm:p-3.5',
        primaryColumns === 3 ? 'p-2.5' : 'p-3',
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center gap-2',
          canClearSelection ? 'justify-between' : isHeaderRightAligned ? 'justify-start' : 'justify-center',
        ].join(' ')}
      >
        <div
          className={[
            'flex flex-wrap items-center gap-1.5',
            isHeaderRightAligned ? 'justify-start text-right' : 'justify-center text-center',
          ].join(' ')}
        >
          <p id={groupTitleId} className="text-[0.92rem] font-black text-[#241d18] sm:text-[0.95rem]">
            {title}
          </p>
          <span
            className={[
              'rounded-full border px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-[0.12em]',
              optional ? 'border-[#e4d8c8] bg-[#f8f3eb] text-[#5b4d42]' : 'border-[#b8e7df] bg-[#e3fbf7] text-[#123a36]',
            ].join(' ')}
          >
            {optional ? 'אופציונלי' : 'לבחירה'}
          </span>
        </div>

        {canClearSelection ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`min-h-[32px] rounded-full border border-[#ded2c3] bg-[#f8f3eb] px-2.5 py-1 text-[0.68rem] font-black text-[#5b4d42] transition hover:bg-[#efe5d8] ${whiteSurfaceFocusClass}`}
          >
            נקה
          </button>
        ) : null}
      </div>

      {description ? (
        <p className="mt-1 hidden text-xs font-bold leading-5 text-[#6d6259] md:block">{description}</p>
      ) : null}

      <div className="mt-2 space-y-2">
        <div className={primaryColumns === 3 ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
          {primaryOptions.map((option) => renderOption(option, 'inline'))}
        </div>

        {hasMoreOptions ? (
          <div
            className={[
              'overflow-hidden rounded-[18px] border border-[#e2d7c8] bg-[#f8f3eb]',
              primaryColumns === 3 ? 'p-1.5' : 'p-2',
            ].join(' ')}
          >
            <div
              className={[
                'flex items-center justify-between',
                primaryColumns === 3 ? 'gap-1.5' : 'flex-wrap gap-2.5',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={openMoreOptionsDialog}
                className={`inline-flex min-h-[36px] items-center justify-center gap-2 rounded-full bg-[#181411] px-3.5 py-1.5 text-xs font-black text-white transition hover:-translate-y-0.5 ${primaryColumns === 3 ? 'w-full' : ''} ${whiteSurfaceFocusClass}`}
              >
                <span>{primaryColumns === 3 ? `${moreOptionsLabel} חודשיים` : moreOptionsLabel}</span>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[0.62rem] text-[#181411]">
                  +{extraOptions.length}
                </span>
              </button>

              {primaryColumns === 3 ? null : selectedFromMoreOptions && value ? (
                <span className="rounded-full border border-[#ded2c3] bg-white px-2.5 py-1 text-xs font-black text-[#241d18]">
                  נבחר מתוך עוד: {value}
                </span>
              ) : hasLockedOptions && lockedExtraOptionsCount > 0 ? (
                <span className="rounded-full border border-[#d8ad52] bg-[#1c1507] px-2.5 py-1 text-xs font-black text-[#f7db96]">
                  עוד {lockedExtraOptionsCount} אפשרויות פרימיום למנוי חודשי
                </span>
              ) : (
                <span className="text-xs font-black text-[#5b4d42]">
                  עוד {extraOptions.length} אפשרויות זמינות בלחיצה
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {helperText ? (
        <p className="mt-1 hidden text-xs font-bold leading-5 text-[#6d6259] md:block">{helperText}</p>
      ) : null}

      {hasLockedOptions && lockedOptionsHint ? (
        <p className="mt-1 hidden text-xs font-bold leading-5 text-[#6d6259] md:block">{lockedOptionsHint}</p>
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
                  {hasLockedOptions
                    ? 'אפשר לעבור על כל האפשרויות. בחירה באפשרויות פרימיום נפתחת במסלול ללא הגבלה.'
                    : 'בחרו בנוחות את האופציה שמתאימה בדיוק. לחיצה על אופציה סוגרת ושומרת בחירה.'}
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
                {showMoreOptionsSearch ? (
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
                ) : null}

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

                {hasLockedOptions && showLockedOptionsNotice ? (
                  <div className="rounded-[22px] border-2 border-[#d8ad52] bg-[radial-gradient(circle_at_top,_#5a4617_0%,_#1f1709_56%,_#0b0905_100%)] p-3.5 text-[#fdf3d4] shadow-[0_14px_28px_-14px_rgba(0,0,0,0.9)] motion-safe:animate-[sb-paywall-in_220ms_ease-out]">
                    <p className="text-[0.64rem] font-black uppercase tracking-[0.18em] text-[#f8d67f]">
                      פרימיום חודשי
                    </p>
                    <p className="mt-1 text-sm font-black text-[#fff1cc]">
                      {lockedOptionsNoticeTitle ?? 'האופציות המורחבות פתוחות במסלול החודשי'}
                    </p>
                    <p className="mt-1 text-xs font-bold leading-5 text-[#fceaca]/85">
                      {lockedOptionsNoticeBody ??
                        'פותחים מנוי חודשי ונהנים מגישה מלאה לכל האפשרויות המתקדמות.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        closeMoreOptionsDialogImmediately();
                        onLockedOptionsNoticeCtaClick?.();
                      }}
                      className={`mt-3 inline-flex min-h-[40px] items-center justify-center rounded-full border-2 border-[#2a1e09] bg-gradient-to-b from-[#f9e4a8] to-[#e9bf5f] px-3.5 py-2 text-xs font-black text-[#2b1d04] shadow-[0_4px_0_0_#2a1d07] transition hover:-translate-y-0.5 hover:brightness-105 ${whiteSurfaceFocusClass}`}
                    >
                      {lockedOptionsNoticeCta}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function HomeHero({
  onStart,
  ctaLabel,
  accountStatusLine,
}: {
  onStart: () => void;
  ctaLabel: string;
  accountStatusLine: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#e2d7c8] bg-[#fffdfa] px-4 py-3 shadow-[0_20px_60px_rgba(49,23,13,0.12)] sm:rounded-[34px] sm:px-6 sm:py-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#ff5a2a] via-[#ffb089] to-[#20d6c7]" aria-hidden="true" />
      <div className="relative flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2 sm:space-y-3">
          <div className="flex items-center justify-center lg:justify-start">
            <SayBackBrand />
          </div>
          <div className="max-w-3xl text-center lg:text-right">
            <h1 className="text-[3.25rem] leading-none font-black text-[#181411] sm:text-[4.5rem] lg:text-[5.5rem]">
              מה לענות עכשיו?
            </h1>
            <p className="mx-auto mt-1.5 max-w-2xl text-sm font-bold leading-6 text-[#5b4d42] sm:mt-2 sm:text-lg sm:leading-7 lg:mx-0">
              מדביקים הודעה, בוחרים וייב, ומקבלים 3 תשובות קצרות בעברית.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:gap-2 lg:w-auto lg:min-w-72">
          <button
            type="button"
            onClick={onStart}
            className={`inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#ff5a2a] px-5 py-2.5 text-base font-black text-white shadow-[0_14px_26px_rgba(255,90,42,0.26)] transition hover:-translate-y-0.5 hover:bg-[#f04d1f] active:translate-y-0 sm:min-h-[52px] sm:px-6 sm:py-3 lg:w-auto ${lightSurfaceFocusClass}`}
          >
            {ctaLabel}
          </button>
          <p className="text-center text-xs font-bold leading-5 text-[#6d6259] lg:text-right">
            {accountStatusLine}
          </p>
        </div>
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:gap-2">
        {['3 שימושים חינם', 'לא שומרים הודעות', 'עברית טבעית'].map((item) => (
          <div
            key={item}
            className="flex min-h-[42px] items-center justify-center rounded-[16px] border border-[#e4d8c8] bg-[#f8f3eb] px-2 py-2 text-center text-xs leading-4 font-black text-[#2c241f] sm:rounded-[18px] sm:px-3 sm:py-2.5 sm:text-sm"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function GeneratorHeader({ accountStatusLine }: { accountStatusLine: string }) {
  return (
    <header className="rounded-[24px] border border-[#e2d7c8] bg-[#fffdfa] px-4 py-3 shadow-[0_14px_38px_rgba(49,23,13,0.09)] sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SayBackBrand compact />
            <span className="text-[0.68rem] font-black text-[#8f371e]">3 תשובות. בלי להסתבך.</span>
          </div>
          <h1 className="mt-2 text-[1.9rem] leading-tight font-black text-[#181411] sm:text-[2.4rem]">
            מה לענות עכשיו?
          </h1>
          <p className="mt-1 text-sm font-bold leading-5 text-[#5b4d42] sm:text-base sm:leading-6">
            מדביקים הודעה ומקבלים 3 תשובות קצרות וטבעיות.
          </p>
        </div>
        <span className="mt-1 hidden shrink-0 rounded-full border border-[#e4d8c8] bg-[#f8f3eb] px-3 py-1.5 text-xs font-bold text-[#6d6259] sm:inline-flex">
          {accountStatusLine}
        </span>
      </div>
    </header>
  );
}

function SayBackBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2" aria-label="SayBack">
      <Image
        src="/favicon.svg"
        alt=""
        width={compact ? 32 : 40}
        height={compact ? 32 : 40}
        className={`${compact ? 'size-8' : 'size-9 sm:size-10'} shrink-0`}
        priority={!compact}
      />
      <span
        className={`${
          compact ? 'text-base tracking-[0.08em]' : 'text-lg tracking-[0.1em] sm:text-xl'
        } font-black text-[#181411]`}
      >
        SayBack
      </span>
    </div>
  );
}

function QuickStartStrip() {
  return (
    <section
      aria-label="איך מתחילים בדקה"
      className="w-full min-w-0 rounded-[26px] border border-[#e2d7c8] bg-[#fffdfa] p-4 shadow-[0_14px_38px_rgba(49,23,13,0.08)] sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a45334]">ברוכים הבאים</p>
          <h2 className="mt-1 text-2xl font-black text-[#181411] sm:text-3xl">שלושה צעדים לתשובה מוכנה</h2>
        </div>
        <p className="max-w-xl text-sm font-bold leading-6 text-[#6d6259]">
          קצר, ישיר, ובעיקר בנוי כדי להגיע לתשובה הראשונה מהר.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {quickStartSteps.map((step) => (
          <article
            key={step.step}
            className="rounded-[20px] border border-[#e4d8c8] bg-[#fbf7f1] p-3.5"
          >
            <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#a45334]">
              {step.step}
            </p>
            <h3 className="mt-2 text-base font-black text-[#181411]">{step.title}</h3>
            <p className="mt-1.5 text-sm font-bold leading-6 text-[#6d6259]">{step.body}</p>
          </article>
        ))}
      </div>
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
      className={`group flex min-h-44 w-full cursor-pointer touch-manipulation flex-col justify-between rounded-[22px] border border-[#e4d8c8] bg-[#fbf7f1] p-4 text-right shadow-[0_10px_24px_rgba(49,23,13,0.06)] transition duration-200 hover:-translate-y-0.5 hover:border-[#ffc4b5] hover:bg-[#fff8ef] ${lightSurfaceFocusClass}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs font-black text-[#5b4d42]">
          <span className="rounded-full border border-[#ded2c3] bg-white px-3 py-1 text-[#463b33]">
            {scenario.context}
          </span>
          <div className="flex items-center gap-2">
            <span>{scenario.tone}</span>
            <span className={interactiveBadgeClass}>לחיץ</span>
          </div>
        </div>
        <h3 className="text-lg font-black text-[#181411]">{scenario.title}</h3>
        <p className="text-sm leading-6 text-[#5b4d42]">
          &quot;{scenario.message}&quot;
        </p>
      </div>
      <span className="mt-4 text-sm font-black text-[#7a2d19]">לחיצה אחת, והדוגמה נכנסת לטופס</span>
    </button>
  );
}

function ReplyRefineMenu({
  index,
  isBusy,
  onAdjust,
  onCustomAdjust,
}: {
  index: number;
  isBusy: boolean;
  onAdjust: (index: number, action: ReplyAction) => void;
  onCustomAdjust: (index: number, instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState('');

  const submitCustomAdjustment = () => {
    const nextInstruction = instruction.trim();
    if (!nextInstruction) {
      return;
    }

    onCustomAdjust(index, nextInstruction);
  };

  return (
    <details className="group w-full min-w-0 rounded-[18px] border border-dashed border-[#d8cab9] bg-[#f8f3eb] transition-colors duration-200 open:bg-[#fff8ef] sm:w-auto sm:flex-1 sm:min-w-[11rem]">
      <summary
        className={`flex min-h-[42px] cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-right text-sm font-black text-[#241d18] marker:content-none ${whiteSurfaceFocusClass}`}
      >
        <span>לשפר ניסוח</span>
        <span className="text-xs transition-transform duration-200 group-open:rotate-180">⌄</span>
      </summary>

      <div className="sb-accordion-content">
        <div className="sb-accordion-content-inner">
          <div className="px-2.5 pb-2.5 pt-0.5">
            <p className="mb-2 text-xs font-bold leading-5 text-[#6d6259]">
              כל שיפור משתמש בשימוש אחד.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onAdjust(index, 'softer')}
                disabled={isBusy}
                className={`inline-flex min-h-[42px] items-center justify-center rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3.5 py-2 leading-5 text-[#123a36] transition hover:bg-[#cef6ef] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                עדין יותר
              </button>
              <button
                type="button"
                onClick={() => onAdjust(index, 'sharper')}
                disabled={isBusy}
                className={`inline-flex min-h-[42px] items-center justify-center rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3.5 py-2 leading-5 text-[#6f2414] transition hover:bg-[#ffe2d8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                חד יותר
              </button>
              <button
                type="button"
                onClick={() => onAdjust(index, 'retry')}
                disabled={isBusy}
                className={`inline-flex min-h-[42px] items-center justify-center rounded-full border border-[#ded2c3] bg-white px-3.5 py-2 leading-5 text-[#241d18] transition hover:bg-[#f8f3eb] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                ניסוח חדש
              </button>
            </div>
            <div className="mt-3 border-t border-[#e2d7c8] pt-3">
              <label htmlFor={`custom-refine-${index}`} className="text-xs font-black text-[#241d18]">
                מה לשנות?
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {customRefinePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setInstruction(preset);
                      trackEvent('custom_refine_preset_select', { index, preset });
                    }}
                    className={`min-h-[34px] rounded-full border border-[#ded2c3] bg-white px-2.5 py-1 text-xs font-black text-[#5b4d42] transition hover:bg-[#fff8ef] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  id={`custom-refine-${index}`}
                  value={instruction}
                  onFocus={() => trackEvent('custom_refine_open', { index })}
                  onChange={(event) => setInstruction(event.target.value.slice(0, 220))}
                  placeholder="למשל: שיהיה קצר וחם יותר"
                  className={`min-h-[42px] min-w-0 flex-1 rounded-xl border border-[#ded2c3] bg-white px-3 py-2 text-sm font-bold text-[#241d18] outline-none ${whiteSurfaceFocusClass}`}
                />
                <button
                  type="button"
                  disabled={isBusy || !instruction.trim()}
                  onClick={submitCustomAdjustment}
                  className={`min-h-[42px] shrink-0 rounded-xl bg-[#181411] px-3 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                >
                  שפר
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

function ReplyActions({
  index,
  copied,
  displayedReply,
  isEditing,
  draftReply,
  setIsEditing,
  onCopy,
  onShare,
  onEdit,
}: {
  index: number;
  copied: boolean;
  displayedReply: string;
  isEditing: boolean;
  draftReply: string;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  onCopy: (reply: string, index: number) => void;
  onShare: (reply: string, index: number) => void;
  onEdit: (reply: string, index: number) => void;
}) {
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(displayedReply)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => onCopy(displayedReply, index)}
        className={`inline-flex min-h-[42px] items-center justify-center rounded-full bg-[#181411] px-4 py-2 leading-5 text-white shadow-[0_10px_20px_rgba(24,20,17,0.16)] transition hover:-translate-y-0.5 hover:bg-[#2c241f] ${whiteSurfaceFocusClass}`}
      >
        {copied ? 'הועתק' : 'העתק'}
      </button>

      <button
        type="button"
        onClick={() => {
          if (isEditing) {
            onEdit(draftReply, index);
          }
          setIsEditing((current) => !current);
        }}
        className={`inline-flex min-h-[42px] items-center justify-center rounded-full border px-3.5 py-2 leading-5 transition ${
          isEditing
            ? 'border-[#b8e7df] bg-[#e3fbf7] text-[#123a36] hover:bg-[#cef6ef]'
            : 'border-[#ded2c3] bg-white text-[#6d6259] hover:bg-[#f8f3eb]'
        } ${whiteSurfaceFocusClass}`}
      >
        {isEditing ? 'שמור עריכה' : 'ערוך'}
      </button>

      <button
        type="button"
        onClick={() => onShare(displayedReply, index)}
        className={`inline-flex min-h-[42px] items-center justify-center rounded-full border border-[#e2d7c8] bg-transparent px-3.5 py-2 leading-5 text-[#6d6259] transition hover:bg-[#f8f3eb] ${whiteSurfaceFocusClass}`}
      >
        שתף
      </button>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackEvent('reply_share', { index, method: 'whatsapp' })}
        className={`inline-flex min-h-[42px] items-center justify-center rounded-full border border-[#e2d7c8] bg-transparent px-3.5 py-2 leading-5 text-[#6d6259] transition hover:bg-[#f8f3eb] ${whiteSurfaceFocusClass}`}
      >
        וואטסאפ
      </a>
    </>
  );
}

function ReplyCard({
  reply,
  index,
  onCopy,
  onShare,
  onAdjust,
  onCustomAdjust,
  onEdit,
  isBusy,
  isUpdating,
  copied,
}: {
  reply: string;
  index: number;
  onCopy: (reply: string, index: number) => void;
  onShare: (reply: string, index: number) => void;
  onAdjust: (index: number, action: ReplyAction) => void;
  onCustomAdjust: (index: number, instruction: string) => void;
  onEdit: (reply: string, index: number) => void;
  isBusy: boolean;
  isUpdating: boolean;
  copied: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftReply, setDraftReply] = useState(reply);
  const [lastReply, setLastReply] = useState(reply);

  if (lastReply !== reply) {
    setLastReply(reply);
    setDraftReply(reply);
    setIsEditing(false);
  }

  const displayedReply = isEditing ? draftReply : reply;

  return (
    <article className={`sb-reply-card sb-reply-card--${index + 1} relative w-full min-w-0 overflow-hidden rounded-[24px] border border-[#ded2c3] bg-[#fffdfa] p-3.5 pr-5 shadow-[0_12px_30px_rgba(49,23,13,0.07)] sm:p-4 sm:pr-5`}>
      <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-[#ff5a2a] via-[#ff8b67] to-[#ffc4b5]" aria-hidden="true" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-[#e4d8c8] bg-[#f8f3eb] px-3 py-1 text-xs font-black text-[#7a6e64]">
          אפשרות {index + 1}
        </span>
        {isUpdating ? (
          <span className="rounded-full bg-[#e3fbf7] px-2.5 py-1 text-xs font-bold text-[#123a36]">מעדכן...</span>
        ) : null}
      </div>

      {isEditing ? (
        <textarea
          value={draftReply}
          onChange={(event) => setDraftReply(event.target.value)}
          className={`min-h-28 w-full resize-none rounded-[20px] border border-[#ded2c3] bg-white px-3 py-3 text-[1.05rem] leading-8 font-black text-[#241d18] outline-none sm:text-lg ${whiteSurfaceFocusClass}`}
        />
      ) : (
        <p className="text-[1.05rem] leading-8 font-black text-[#241d18] sm:text-lg">
          <span className="sr-only">{reply}</span>
          <span aria-hidden="true" key={reply}>
            {reply.split(/(\s+)/).map((segment, segmentIndex) =>
              /^\s+$/.test(segment) ? (
                segment
              ) : (
                <span
                  key={`${segment}-${segmentIndex}`}
                  className="sb-reply-word"
                  style={{ animationDelay: `${180 + index * 150 + Math.floor(segmentIndex / 2) * 95}ms` }}
                >
                  {segment}
                </span>
              ),
            )}
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm font-bold">
        <ReplyActions
          index={index}
          copied={copied}
          displayedReply={displayedReply}
          isEditing={isEditing}
          draftReply={draftReply}
          setIsEditing={setIsEditing}
          onCopy={onCopy}
          onShare={onShare}
          onEdit={onEdit}
        />
        <ReplyRefineMenu
          index={index}
          isBusy={isBusy}
          onAdjust={onAdjust}
          onCustomAdjust={onCustomAdjust}
        />
      </div>
    </article>
  );
}

const LOADING_REPLY_STATUSES = [
  'קוראים את הווייב',
  'מלטשים ניסוח טבעי',
  'בוחרים 3 אפשרויות טובות',
] as const;

const LOADING_REPLY_PREVIEWS = [
  'מבינים את ההודעה ואת הכיוון...',
  'מכוונים את הטון שירגיש טבעי...',
  'בוחרים שלוש תשובות טובות...',
] as const;

function LoadingReplies({ isNoReplyMode }: { isNoReplyMode: boolean }) {
  const title = isNoReplyMode ? 'מכינים פולו־אפ קצר' : 'מרכיבים לך תשובות טובות';
  const description = isNoReplyMode
    ? 'בודקים מה שלחת, כמה זמן עבר, ואיך להחזיר את השיחה בלי לחץ.'
    : 'מנסחים עכשיו 3 תשובות קצרות וטבעיות שאפשר להעתיק מיד.';

  return (
    <div className="sb-replies-loading w-full min-w-0 space-y-3">
      <div className="sb-result-intent-card sb-loading-intent relative overflow-hidden rounded-[24px] border border-[#e2d7c8] bg-[#f8f3eb] p-4 shadow-[0_14px_36px_rgba(49,23,13,0.07)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a6e64]">בדיוק בשבילך</p>
              <span className="sb-loading-block h-6 w-16 rounded-full" aria-hidden="true" />
            </div>
            <h3 className="mt-2 text-xl font-black text-[#181411] sm:text-2xl">{title}</h3>
            <p className="mt-1 text-sm font-bold leading-6 text-[#6d6259]">{description}</p>
          </div>
          <div className="inline-flex min-h-[36px] min-w-[154px] shrink-0 items-center self-start rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-xs font-black text-[#7a2d19] sm:self-auto">
            <span className="sb-loading-pulse-dot ml-2 h-2 w-2 rounded-full bg-[#ff5a2a]" aria-hidden="true" />
            <span className="sb-loading-status-stack" aria-hidden="true">
              {LOADING_REPLY_STATUSES.map((status, index) => (
                <span
                  className={`sb-loading-status-text sb-loading-status-text--${index + 1}`}
                  key={status}
                >
                  {status}
                </span>
              ))}
            </span>
            <span className="sr-only">מכינים שלוש תשובות. הפעולה עדיין מתבצעת.</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
          <span className="sb-loading-block h-[40px] w-20 rounded-full" />
          <span className="sb-loading-block h-[40px] w-24 rounded-full" />
          <span className="sb-loading-block h-[40px] w-20 rounded-full" />
        </div>
        <span className="sb-loading-block mt-3 block h-4 w-52 max-w-full rounded-full" aria-hidden="true" />
      </div>

      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <article
            key={index}
            className={`sb-reply-loading-card sb-reply-loading-card--${index + 1} relative overflow-hidden rounded-[24px] border border-[#ded2c3] bg-[#fffdfa] p-3.5 pr-5 shadow-[0_12px_30px_rgba(49,23,13,0.06)] sm:p-4 sm:pr-5`}
          >
            <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-[#ff5a2a] via-[#ff8b67] to-[#ffc4b5]" />
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full border border-[#e4d8c8] bg-[#f8f3eb] px-3 py-1 text-xs font-black text-[#7a6e64]">אפשרות {index + 1}</span>
              <span className="sb-loading-block h-6 w-16 rounded-full" />
            </div>
            <p className="mt-4 text-[1.05rem] leading-8 font-black text-[#8c8075] sm:text-lg">
              {LOADING_REPLY_PREVIEWS[index].split(/(\s+)/).map((segment, segmentIndex) =>
                /^\s+$/.test(segment) ? (
                  segment
                ) : (
                  <span
                    key={`${segment}-${segmentIndex}`}
                    className="sb-loading-word"
                    style={{ animationDelay: `${420 + index * 320 + Math.floor(segmentIndex / 2) * 170}ms` }}
                  >
                    {segment}
                  </span>
                ),
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="sb-loading-block h-[42px] w-20 rounded-full" />
              <span className="sb-loading-block h-[42px] w-[76px] rounded-full" />
              <span className="sb-loading-block h-[42px] w-16 rounded-full" />
              <span className="sb-loading-block h-[42px] w-20 rounded-full" />
              <span className="sb-loading-block h-[42px] w-full rounded-[18px] sm:min-w-[11rem] sm:flex-1" />
            </div>
          </article>
        ))}
      </div>
    </div>
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
    <div className={`w-full min-w-0 rounded-[22px] border border-[#e2d7c8] bg-[#f8f3eb] p-3 ${className}`.trim()}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#a45334]">מה נשאר לך בחשבון</p>
      <div className="mt-2 grid gap-2">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className={`rounded-2xl border border-[#e2d7c8] px-3 py-2 ${row.bgClass}`}
          >
            <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#7a6e64]">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-bold text-[#241d18]">{row.value}</p>
          </div>
        ))}
      </div>

      {showDailyFreeExhaustedHelper ? (
        <p className="mt-2 rounded-2xl border border-[#e2d7c8] bg-white px-3 py-2 text-sm font-bold text-[#241d18]">
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
    <div className={`w-full min-w-0 rounded-[22px] border border-[#e2d7c8] bg-white p-3 ${className}`.trim()}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#a45334]">ניהול מנוי חודשי</p>
      <p className="mt-1 text-sm font-bold text-[#241d18]">{statusLine}</p>
      <p className="mt-2 text-xs font-bold text-[#6d6259]">
        אפשר לעצור רק את החיוב הבא, ועדיין להמשיך להשתמש עד סוף התקופה.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {subscription?.canCancel ? (
          <button
            type="button"
            onClick={() => onAction('cancel_next_charge')}
            disabled={!canSubmitAction}
            className={`min-h-[42px] rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3.5 py-2 text-sm font-black text-[#7a2d19] transition hover:bg-[#ffe2d8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isLoading ? 'מעדכנים...' : 'לעצור את החיוב הבא'}
          </button>
        ) : null}

        {subscription?.canResume ? (
          <button
            type="button"
            onClick={() => onAction('resume_renewal')}
            disabled={!canSubmitAction}
            className={`min-h-[42px] rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3.5 py-2 text-sm font-black text-[#123a36] transition hover:bg-[#cef6ef] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isLoading ? 'מעדכנים...' : 'להפעיל חידוש אוטומטי'}
          </button>
        ) : null}
      </div>

      {actionNotice ? (
        <p className="mt-2 rounded-2xl border border-[#b8e7df] bg-[#e3fbf7] px-3 py-2 text-sm font-bold text-[#123a36]">
          {actionNotice}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-2 rounded-2xl border border-[#ffc4b5] bg-[#fff0ea] px-3 py-2 text-sm font-bold text-[#7a2d19]">
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
      className={`w-full min-w-0 rounded-[22px] border border-[#e2d7c8] bg-white p-3 ${className}`.trim()}
    >
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#a45334]">הזן קוד קופון</p>
      <p className="mt-1 text-sm font-bold text-[#6d6259]">
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
          className={`min-h-[44px] w-full rounded-2xl border border-[#ded2c3] bg-white px-3 py-2 text-base font-black uppercase text-[#241d18] placeholder:text-[#9b8f83] ${whiteSurfaceFocusClass}`}
        />
        <button
          type="submit"
          disabled={!canRedeem}
          className={`min-h-[44px] shrink-0 rounded-full bg-[#181411] px-4 py-2 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
        >
          {isRedeemingCoupon ? 'מממשים...' : 'לממש קופון'}
        </button>
      </form>

      {couponNotice ? (
        <p className="mt-2 rounded-2xl border border-[#b8e7df] bg-[#e3fbf7] px-3 py-2 text-sm font-bold text-[#123a36]">
          {couponNotice}
        </p>
      ) : null}

      {couponError ? (
        <p className="mt-2 rounded-2xl border border-[#ffc4b5] bg-[#fff0ea] px-3 py-2 text-sm font-bold text-[#7a2d19]">
          {couponError}
        </p>
      ) : null}
    </div>
  );
}

type AccountCenterPanelProps = {
  accountEmail: string | null;
  isRecoverableAccount: boolean;
  authEmailInput: string;
  onAuthEmailInputChange: (value: string) => void;
  onStartEmailLink: (intent: AuthEmailIntent, plan?: CheckoutPlan | null) => void;
  isSendingAuthEmail: boolean;
  isCompletingEmailLink: boolean;
  pendingEmailCompletion: boolean;
  authEmailNotice: string | null;
  authEmailError: string | null;
  isSessionReady: boolean;
  isBillingLoading: boolean;
  accountStatusLine: string;
  nextConsumptionSource: BillingSnapshot['nextConsumptionSource'];
  dailyResetAt: string | null;
  paidCredits: number;
  hasUnlimitedAccess: boolean;
  managedSubscription: ManagedSubscriptionState | null;
  onRefreshBilling: () => void;
  className?: string;
  compact?: boolean;
};

function AccountCenterPanel({
  accountEmail,
  isRecoverableAccount,
  authEmailInput,
  onAuthEmailInputChange,
  onStartEmailLink,
  isSendingAuthEmail,
  isCompletingEmailLink,
  pendingEmailCompletion,
  authEmailNotice,
  authEmailError,
  isSessionReady,
  isBillingLoading,
  accountStatusLine,
  nextConsumptionSource,
  dailyResetAt,
  paidCredits,
  hasUnlimitedAccess,
  managedSubscription,
  onRefreshBilling,
  className = '',
  compact = false,
}: AccountCenterPanelProps) {
  const emailInputId = useId();
  const dailyResetLabel = formatShortDateTime(dailyResetAt);
  const nextUseLabel = isBillingLoading
    ? 'בודקים מאיפה יגיע השימוש הבא.'
    : nextConsumptionSource === 'unlimited'
      ? 'השימוש הבא יגיע מהמסלול החודשי.'
      : nextConsumptionSource === 'credits'
        ? 'השימוש הבא ירד מיתרת הקרדיטים.'
        : nextConsumptionSource === 'initial_free'
          ? 'השימוש הבא ירד משימושי ההיכרות.'
          : nextConsumptionSource === 'daily_free'
            ? 'השימוש הבא ירד מהחינם היומי.'
            : 'אין כרגע שימושים זמינים.';
  const subscriptionLabel = isBillingLoading
    ? 'בודקים מצב חבילה ומנוי.'
    : managedSubscription
      ? managedSubscription.cancelAtPeriodEnd
        ? 'החיוב הבא מבוטל, והמנוי פעיל עד סוף התקופה.'
        : 'המנוי מתחדש אוטומטית.'
      : hasUnlimitedAccess
        ? 'מסלול ללא הגבלה פעיל.'
        : paidCredits > 0
          ? `נשארו ${paidCredits} שימושים בחבילה.`
          : null;

  return (
    <section
      className={[
        'w-full min-w-0 rounded-[24px] border border-[#e2d7c8] bg-white p-3.5 shadow-[0_12px_30px_rgba(49,23,13,0.06)]',
        compact ? 'sm:p-4' : 'sm:p-5',
        className,
      ].join(' ').trim()}
      aria-label="החשבון שלי"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#a45334]">החשבון שלי</p>
          <h2 className={compact ? 'mt-1 text-xl font-black text-[#181411]' : 'mt-1 text-2xl font-black text-[#181411]'}>
            הגישה והתשלום במקום אחד
          </h2>
          <p className="mt-1 text-sm font-bold leading-6 text-[#6d6259]">{accountStatusLine}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {hasUnlimitedAccess || managedSubscription ? (
            <a
              href="#plans-section"
              className={`inline-flex min-h-[42px] items-center rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3.5 py-2 text-xs font-black text-[#123a36] transition hover:bg-[#cef6ef] ${whiteSurfaceFocusClass}`}
            >
              ניהול מנוי
            </a>
          ) : null}
          <button
            type="button"
            onClick={onRefreshBilling}
            disabled={!isSessionReady || isBillingLoading}
            className={`min-h-[42px] rounded-full border border-[#ded2c3] bg-[#f8f3eb] px-3.5 py-2 text-xs font-black text-[#241d18] transition hover:bg-[#efe5d8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isBillingLoading ? 'מרעננים...' : 'רענון מצב חשבון'}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-[18px] border border-[#b8e7df] bg-[#e3fbf7] px-3 py-2">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#4f6d68]">גישה</p>
          <p className="mt-1 text-sm font-black text-[#123a36]">{nextUseLabel}</p>
          {dailyResetLabel && nextConsumptionSource === 'blocked' ? (
            <p className="mt-1 text-xs font-bold text-[#4f6d68]">החינם היומי יתחדש סביב {dailyResetLabel}.</p>
          ) : null}
        </div>
        <div className="rounded-[18px] border border-[#e2d7c8] bg-[#f8f3eb] px-3 py-2">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#7a6e64]">שחזור גישה</p>
          <p className="mt-1 text-sm font-black text-[#241d18]">
            {isRecoverableAccount && accountEmail ? accountEmail : 'עדיין לא נשמר אימייל לשחזור.'}
          </p>
        </div>
        <div className="rounded-[18px] border border-[#e2d7c8] bg-white px-3 py-2">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#7a6e64]">מנוי וחבילות</p>
          <p className="mt-1 text-sm font-black text-[#241d18]">{subscriptionLabel ?? 'אין חבילה או מנוי פעיל כרגע.'}</p>
        </div>
      </div>

      {!isRecoverableAccount ? (
        <form
          className="mt-3 rounded-[20px] border border-[#e2d7c8] bg-[#fbf7f1] p-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onStartEmailLink('checkout', null);
          }}
        >
          <label htmlFor={emailInputId} className="text-sm font-black text-[#241d18]">
            שמירת גישה באימייל
          </label>
          <p className="mt-1 text-xs font-bold leading-5 text-[#6d6259]">
            לפני תשלום שולחים קישור חד־פעמי לאימייל. כך הקרדיטים והמנוי נשמרים גם אם מחליפים מכשיר.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id={emailInputId}
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              value={authEmailInput}
              onChange={(event) => onAuthEmailInputChange(event.target.value)}
              placeholder="name@example.com"
              className={`min-h-[44px] w-full rounded-2xl border border-[#ded2c3] bg-white px-3 py-2 text-left text-sm font-bold text-[#241d18] placeholder:text-[#9b8f83] ${whiteSurfaceFocusClass}`}
            />
            <button
              type="submit"
              disabled={isSendingAuthEmail || isCompletingEmailLink}
              className={`min-h-[44px] shrink-0 rounded-full bg-[#181411] px-4 py-2 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
            >
              {isCompletingEmailLink
                ? 'מחברים...'
                : pendingEmailCompletion
                  ? 'השלמת חיבור'
                  : isSendingAuthEmail
                    ? 'שולחים...'
                    : 'שליחת קישור'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onStartEmailLink('recover', null)}
            disabled={isSendingAuthEmail || isCompletingEmailLink}
            className={`mt-2 min-h-[38px] rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-black text-[#241d18] transition hover:bg-[#f8f3eb] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            כבר שילמת? התחבר/י לשחזור גישה
          </button>
        </form>
      ) : null}

      {authEmailNotice ? (
        <p className="mt-2 rounded-2xl border border-[#b8e7df] bg-[#e3fbf7] px-3 py-2 text-sm font-bold text-[#123a36]">
          {authEmailNotice}
        </p>
      ) : null}

      {authEmailError ? (
        <p className="mt-2 rounded-2xl border border-[#ffc4b5] bg-[#fff0ea] px-3 py-2 text-sm font-bold text-[#7a2d19]">
          {authEmailError}
        </p>
      ) : null}
    </section>
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
  resumePlan,
  onResumeCheckout,
  accountEmail,
  isRecoverableAccount,
  authEmailInput,
  onAuthEmailInputChange,
  onStartEmailLink,
  isSendingAuthEmail,
  isCompletingEmailLink,
  pendingEmailCompletion,
  authEmailNotice,
  authEmailError,
  accountStatusLine,
  nextConsumptionSource,
  dailyResetAt,
  managedSubscription,
  onRefreshBilling,
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
  resumePlan: CheckoutPlan | null;
  onResumeCheckout: (plan: CheckoutPlan) => void;
  accountEmail: string | null;
  isRecoverableAccount: boolean;
  authEmailInput: string;
  onAuthEmailInputChange: (value: string) => void;
  onStartEmailLink: (intent: AuthEmailIntent, plan?: CheckoutPlan | null) => void;
  isSendingAuthEmail: boolean;
  isCompletingEmailLink: boolean;
  pendingEmailCompletion: boolean;
  authEmailNotice: string | null;
  authEmailError: string | null;
  accountStatusLine: string;
  nextConsumptionSource: BillingSnapshot['nextConsumptionSource'];
  dailyResetAt: string | null;
  managedSubscription: ManagedSubscriptionState | null;
  onRefreshBilling: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const selectedPlanCopy = checkoutSession
    ? checkoutSession.plan === 'credits_50'
      ? CREDIT_PLAN_COPY
      : UNLIMITED_PLAN_COPY
    : null;
  const shouldShowUnlimitedPlanOption = !hasUnlimitedAccess;
  const canStartCheckout = isSessionReady && isRecoverableAccount && !isSendingAuthEmail && !isCompletingEmailLink;

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#181411]/60 p-3 motion-safe:animate-[sb-fade-in_220ms_ease-out] sm:items-center sm:p-4"
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
        className="max-h-[88svh] w-full max-w-md overflow-y-auto rounded-[30px] border border-[#e2d7c8] bg-[#fffdfa] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_28px_80px_rgba(24,20,17,0.28)] motion-safe:animate-[sb-paywall-in_260ms_ease-out] sm:rounded-[32px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a45334]">
              {!isRecoverableAccount
                ? 'שלב 1 מתוך 3'
                : checkoutSession
                  ? 'שלב 3 מתוך 3'
                  : 'שלב 2 מתוך 3'}
            </p>
            <h2 id="paywall-title" className="mt-2 text-2xl font-black text-[#181411] sm:text-3xl">
              {PAYWALL_TITLE}
            </h2>
            <p id="paywall-description" className="mt-2 text-sm font-bold text-[#6d6259]">
              {PAYWALL_BODY}
            </p>
            {checkoutSession ? (
              <p className="mt-1 text-xs font-bold text-[#6d6259]">
                בוחרים את דרך התשלום שנוחה לכם וממשיכים מיד.
              </p>
            ) : !isRecoverableAccount ? (
              <p className="mt-1 text-xs font-bold text-[#6d6259]">
                קודם שומרים גישה עם אימייל, ואז אפשר לבחור מסלול ולשלם.
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={`min-h-[44px] rounded-full border border-[#ded2c3] bg-white px-3 py-2 text-sm font-bold text-[#241d18] ${whiteSurfaceFocusClass}`}
          >
            סגור
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <AccountCenterPanel
            accountEmail={accountEmail}
            isRecoverableAccount={isRecoverableAccount}
            authEmailInput={authEmailInput}
            onAuthEmailInputChange={onAuthEmailInputChange}
            onStartEmailLink={onStartEmailLink}
            isSendingAuthEmail={isSendingAuthEmail}
            isCompletingEmailLink={isCompletingEmailLink}
            pendingEmailCompletion={pendingEmailCompletion}
            authEmailNotice={authEmailNotice}
            authEmailError={authEmailError}
            isSessionReady={isSessionReady}
            isBillingLoading={false}
            accountStatusLine={accountStatusLine}
            nextConsumptionSource={nextConsumptionSource}
            dailyResetAt={dailyResetAt}
            paidCredits={paidCredits}
            hasUnlimitedAccess={hasUnlimitedAccess}
            managedSubscription={managedSubscription}
            onRefreshBilling={onRefreshBilling}
            compact
            className="shadow-none"
          />

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
              {resumePlan ? (
                <div className="rounded-[22px] border-2 border-black bg-[#d7f9ff] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b2d10]">תשלום פתוח</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-black">
                    אפשר להמשיך את התשלום האחרון, לבחור מסלול אחר, או לרענן את מצב החשבון אם כבר שילמתם.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onResumeCheckout(resumePlan)}
                      disabled={isCheckoutLoading || !canStartCheckout}
                      className={`min-h-[42px] rounded-full border-2 border-black bg-[#f7ff4f] px-3.5 py-2 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                    >
                      להמשיך תשלום
                    </button>
                    <button
                      type="button"
                      onClick={onResetCheckout}
                      className={`min-h-[42px] rounded-full border-2 border-black bg-white px-3.5 py-2 text-sm font-black text-black transition hover:bg-[#fff6d8] ${whiteSurfaceFocusClass}`}
                    >
                      לבחור מסלול אחר
                    </button>
                  </div>
                </div>
              ) : null}

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
                  disabled={isCheckoutLoading || !canStartCheckout}
                  className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                >
                  {!isRecoverableAccount
                    ? 'קודם שומרים גישה באימייל'
                    : checkoutPlan === 'credits_50'
                      ? 'טוען טופס תשלום...'
                      : CREDIT_PLAN_COPY.cta}
                </button>
              </div>

              {shouldShowUnlimitedPlanOption ? (
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
                    disabled={isCheckoutLoading || !canStartCheckout}
                    className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-white bg-[#ff623d] px-4 py-3 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
                  >
                    {!isRecoverableAccount
                      ? 'קודם שומרים גישה באימייל'
                      : checkoutPlan === 'unlimited_monthly'
                        ? 'טוען טופס תשלום...'
                        : UNLIMITED_PLAN_COPY.cta}
                  </button>
                </div>
              ) : null}

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
  initialBillingBypassEnabled = false,
}: {
  mode?: HomePageClientMode;
  initialBillingBypassEnabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastOutgoingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const advancedOptionsRef = useRef<HTMLDetailsElement | null>(null);
  const toneOptionsRef = useRef<HTMLDetailsElement | null>(null);
  const composeSectionRef = useRef<HTMLDivElement | null>(null);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const examplesSectionRef = useRef<HTMLElement | null>(null);
  const plansSectionRef = useRef<HTMLElement | null>(null);
  const hasTrackedQuotaBadgeViewRef = useRef(false);
  const hasTrackedBillingStatusViewRef = useRef(false);
  const hasTrackedGeneratorInputStartRef = useRef(false);
  const hasTrackedAdvancedOpenRef = useRef(false);
  const hasRecordedProductLandingRef = useRef(false);
  const productEventCounterRef = useRef(0);
  const recordProductEventRef = useRef<(
    eventName: ClientProductEventName,
    metadata: Record<string, string | number | boolean | null>,
  ) => void>(() => {});
  const personalizationActiveRef = useRef(false);
  const pageLoadedAtRef = useRef<number | null>(null);
  const inputStartedAtRef = useRef<number | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>('incoming');
  const [mobilePrimaryView, setMobilePrimaryView] = useState<MobilePrimaryView>('compose');
  const [message, setMessage] = useState('');
  const [lastOutgoingMessage, setLastOutgoingMessage] = useState('');
  const [noReplyDurationValue, setNoReplyDurationValue] = useState('');
  const [noReplyDurationUnit, setNoReplyDurationUnit] = useState<NoReplyDurationUnit>('hours');
  const [conversationBackground, setConversationBackground] = useState('');
  const [context, setContext] = useState<ContextOption | null>(null);
  const [tone, setTone] = useState<ToneOption>('זורם');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [continuePreference, setContinuePreference] = useState<ContinuePreference | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showDeepLinkPrefillBanner, setShowDeepLinkPrefillBanner] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [hasSentFirstGeneration, setHasSentFirstGeneration] = useState(false);
  const [freeUsed, setFreeUsed] = useState(0);
  const [initialFreeLimit, setInitialFreeLimit] = useState(FREE_LIMIT);
  const [freeRemaining, setFreeRemaining] = useState(FREE_LIMIT);
  const [dailyFreeLimit, setDailyFreeLimit] = useState(1);
  const [dailyFreeRemaining, setDailyFreeRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [busyReplyIndex, setBusyReplyIndex] = useState<number | null>(null);
  const [copiedReplyIndex, setCopiedReplyIndex] = useState<number | null>(null);
  const [hasCopiedAllReplies, setHasCopiedAllReplies] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paidPlan, setPaidPlan] = useState<PaidPlan>(null);
  const [paidCredits, setPaidCredits] = useState(0);
  const [checkoutPlan, setCheckoutPlan] = useState<CheckoutPlan | null>(null);
  const [checkoutResumePlan, setCheckoutResumePlan] = useState<CheckoutPlan | null>(null);
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
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [isRecoverableAccount, setIsRecoverableAccount] = useState(false);
  const [nextConsumptionSource, setNextConsumptionSource] =
    useState<BillingSnapshot['nextConsumptionSource']>(
      initialBillingBypassEnabled ? 'unlimited' : 'initial_free',
    );
  const [dailyResetAt, setDailyResetAt] = useState<string | null>(null);
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authEmailNotice, setAuthEmailNotice] = useState<string | null>(null);
  const [authEmailError, setAuthEmailError] = useState<string | null>(null);
  const [isSendingAuthEmail, setIsSendingAuthEmail] = useState(false);
  const [isCompletingEmailLink, setIsCompletingEmailLink] = useState(false);
  const [pendingEmailCompletion, setPendingEmailCompletion] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(true);
  const [billingBypassEnabled, setBillingBypassEnabled] = useState(initialBillingBypassEnabled);
  const [conversationProfiles, setConversationProfiles] = useState<ConversationProfile[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationProfilesError, setConversationProfilesError] = useState<string | null>(null);
  const [conversationNotice, setConversationNotice] = useState<string | null>(null);
  const [conversationDialog, setConversationDialog] = useState<'save' | 'manage' | 'memory' | null>(null);
  const [conversationManageEditId, setConversationManageEditId] = useState<string | null>(null);
  const [conversationMutationError, setConversationMutationError] = useState<string | null>(null);
  const [isSavingConversation, setIsSavingConversation] = useState(false);
  const [conversationBusyId, setConversationBusyId] = useState<string | null>(null);
  const [lastSuccessfulConversationDefaults, setLastSuccessfulConversationDefaults] =
    useState<SuccessfulConversationDefaults | null>(null);
  const authRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const authTokenPromiseRef = useRef<Promise<string> | null>(null);
  const hasLoadedConversationProfilesRef = useRef(false);
  const hasHydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const isGeneratorPrimaryMode = mode === 'generator';

  const hasUnlimitedAccess = billingBypassEnabled || paidPlan === 'unlimited_monthly';
  const hasMonthlyFeatureAccess = paidPlan === 'unlimited_monthly' && !billingBypassEnabled;
  const shouldShowMonthlyFeatureOptions = !hasUnlimitedAccess || hasMonthlyFeatureAccess;
  const shouldShowConversationBackground = !hasUnlimitedAccess || hasMonthlyFeatureAccess;
  const isConversationBackgroundLocked = !isBillingLoading && !hasMonthlyFeatureAccess;
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
  const trimmedMessage = message.trim();
  const trimmedLastOutgoingMessage = lastOutgoingMessage.trim();
  const parsedNoReplyDuration = Number.parseInt(noReplyDurationValue, 10);
  const generateButtonLabel = isLoading
    ? 'מכינים 3 תשובות...'
    : isNoReplyMode
      ? 'קבלו 3 פולו-אפים לשליחה'
      : 'תנו לי 3 תשובות';
  const canReturnToGeneratorFromResults =
    isGeneratorPrimaryMode && mobilePrimaryView === 'results' && Boolean(result) && !isGenerating;
  const heroGenerateCtaLabel = 'יאללה, מתחילים לענות';
  const heroStartUsingCtaLabel = 'התחילו להשתמש עכשיו';
  const mobileComposeHelper = useMemo(() => {
    if (isNoReplyMode) {
      if (!trimmedLastOutgoingMessage) {
        return {
          title: 'שלב 1 מתוך 2: מה עוד צריך למלא?',
          body: 'כתבו את ההודעה האחרונה ששלחתם כדי שנוכל לבנות פולו-אפ מדויק.',
          tone: 'warning',
        } as const;
      }

      if (
        !Number.isInteger(parsedNoReplyDuration) ||
        parsedNoReplyDuration < 1 ||
        parsedNoReplyDuration > MAX_NO_REPLY_DURATION_VALUE
      ) {
        return {
          title: 'שלב 1 מתוך 2: חסר זמן המתנה',
          body: 'בחרו מספר תקין של דקות/שעות/ימים כדי שננסח תשובה מתאימה.',
          tone: 'warning',
        } as const;
      }

      return {
        title: 'מעולה. שלב 1 הושלם',
        body: 'אפשר ללחוץ על הכפתור ולקבל מיד 3 תשובות פולו-אפ קצרות.',
        tone: 'ready',
      } as const;
    }

    if (!trimmedMessage && !imageBase64) {
      return {
        title: 'שלב 1 מתוך 2: הדביקו הודעה או צילום מסך',
        body: 'ברגע שיש טקסט או צילום, נוכל להציע 3 תשובות מוכנות.',
        tone: 'warning',
      } as const;
    }

    return {
      title: 'מעולה. שלב 1 הושלם',
      body: 'עכשיו לוחצים על הכפתור ומקבלים 3 תשובות קצרות לשליחה.',
      tone: 'ready',
    } as const;
  }, [imageBase64, isNoReplyMode, parsedNoReplyDuration, trimmedLastOutgoingMessage, trimmedMessage]);
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
  const canShowMobileResults = Boolean(result) || isGenerating;
  const activeConversation = conversationProfiles.find(
    (profile) => profile.id === activeConversationId,
  ) ?? null;

  useEffect(() => {
    if (isBillingLoading || hasMonthlyFeatureAccess) {
      return;
    }

    if (context && monthlyOnlyContextOptions.includes(context)) {
      setContext(null);
    }

    if (monthlyOnlyToneOptions.includes(tone)) {
      setTone('זורם');
    }
  }, [context, hasMonthlyFeatureAccess, isBillingLoading, tone]);

  useEffect(() => {
    if (isBillingLoading || hasMonthlyFeatureAccess || conversationBackground.length === 0) {
      return;
    }

    setConversationBackground('');
  }, [conversationBackground, hasMonthlyFeatureAccess, isBillingLoading]);

  useEffect(() => {
    pageLoadedAtRef.current = window.performance.now();
    trackEvent('page_view_home', {
      flow_version: isGeneratorPrimaryMode ? GENERATOR_FLOW_VERSION : undefined,
    });
  }, [isGeneratorPrimaryMode]);

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

      if (section === 'compose' || section === 'results') {
        setMobilePrimaryView(section);
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

  const handleReturnToGenerator = useCallback(() => {
    setMobilePrimaryView('compose');

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        composeSectionRef.current?.scrollIntoView({
          behavior: getPreferredScrollBehavior(),
          block: 'start',
        });
      });
    });
  }, []);

  const handleHeroStartUsingClick = useCallback(() => {
    trackEvent('hero_cta_click', { cta_text: heroStartUsingCtaLabel, target: 'incoming_message' });
    setComposeMode('incoming');
    setMobilePrimaryView('compose');
    setRequestError(null);
    scrollToComposeSection();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    });
  }, [heroStartUsingCtaLabel, scrollToComposeSection]);

  const markGeneratorInputStart = useCallback(
    (source: 'typing' | 'paste' | 'screenshot') => {
      if (hasTrackedGeneratorInputStartRef.current) {
        return;
      }

      const startedAt = window.performance.now();
      hasTrackedGeneratorInputStartRef.current = true;
      inputStartedAtRef.current = startedAt;
      trackEvent('generator_input_start', {
        source,
        compose_mode: composeMode,
        flow_version: GENERATOR_FLOW_VERSION,
      });
      void recordProductEventRef.current('generator_input_start', {
        source,
        compose_mode: composeMode,
        flow_version: GENERATOR_FLOW_VERSION,
      });
    },
    [composeMode],
  );

  const handleComposeModeChange = useCallback(
    (nextMode: ComposeMode) => {
      if (nextMode === composeMode) {
        return;
      }

      trackEvent('compose_mode_change', {
        from_mode: composeMode,
        to_mode: nextMode,
        flow_version: GENERATOR_FLOW_VERSION,
      });
      setComposeMode(nextMode);
      setGoal(null);
      setRequestError(null);
    },
    [composeMode],
  );

  const handleAdvancedOptionsToggle = useCallback(
    (event: React.SyntheticEvent<HTMLDetailsElement>) => {
      if (!event.currentTarget.open || hasTrackedAdvancedOpenRef.current) {
        return;
      }

      hasTrackedAdvancedOpenRef.current = true;
      trackEvent('generator_advanced_open', {
        compose_mode: composeMode,
        flow_version: GENERATOR_FLOW_VERSION,
      });
    },
    [composeMode],
  );

  function getActivationTimingPayload() {
    const now = window.performance.now();

    return {
      flow_version: GENERATOR_FLOW_VERSION,
      time_from_page_load_ms:
        pageLoadedAtRef.current === null
          ? undefined
          : Math.max(0, Math.round(now - pageLoadedAtRef.current)),
      time_from_input_start_ms:
        inputStartedAtRef.current === null
          ? undefined
          : Math.max(0, Math.round(now - inputStartedAtRef.current)),
    };
  }

  function getGenerationAnalyticsTimingPayload(generationMode: 'initial' | 'refine') {
    return generationMode === 'initial'
      ? getActivationTimingPayload()
      : { flow_version: GENERATOR_FLOW_VERSION };
  }

  useEffect(() => {
    const deepLinkPrefill = parseHomeDeepLinkPrefill(new URLSearchParams(window.location.search));

    if (!deepLinkPrefill.hasValidState) {
      return;
    }

    const nextComposeMode = deepLinkPrefill.mode ?? 'incoming';
    const scenarioFromExample = nextComposeMode === 'incoming' && deepLinkPrefill.exampleId
      ? examples.find((scenario) => scenario.id === deepLinkPrefill.exampleId)
      : null;

    setComposeMode(nextComposeMode);
    setMessage((scenarioFromExample?.message ?? '').slice(0, MAX_INCOMING_MESSAGE_LENGTH));
    setLastOutgoingMessage('');
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('hours');
    setConversationBackground('');
    setContext(deepLinkPrefill.context ?? scenarioFromExample?.context ?? null);
    setTone(deepLinkPrefill.tone ?? scenarioFromExample?.tone ?? 'זורם');
    setGoal(scenarioFromExample?.goal ?? null);
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
      compose_mode: nextComposeMode,
      has_context: Boolean(deepLinkPrefill.context),
      has_tone: Boolean(deepLinkPrefill.tone),
      has_continue_preference: Boolean(deepLinkPrefill.continuePreference),
    });

    window.requestAnimationFrame(() => {
      scrollToComposeSection();

      if (nextComposeMode === 'no_reply') {
        lastOutgoingInputRef.current?.focus();
      } else if (deepLinkPrefill.shouldFocusMessage || deepLinkPrefill.mode === 'incoming') {
        messageInputRef.current?.focus();
      }
    });
  }, [scrollToComposeSection]);

  const applyBillingSnapshot = useCallback((billing: BillingSnapshot) => {
    const hasBillingBypass = billing.billingBypassEnabled === true || initialBillingBypassEnabled;

    setFreeUsed(Math.max(0, Math.floor(billing.freeUsed)));
    setInitialFreeLimit(Math.max(0, Math.floor(billing.freeLimit)));
    setFreeRemaining(Math.max(0, Math.floor(billing.freeRemaining)));
    setDailyFreeLimit(Math.max(0, Math.floor(billing.dailyLimit)));
    setDailyFreeRemaining(Math.max(0, Math.floor(billing.dailyRemaining)));
    setPaidCredits(Math.max(0, Math.floor(billing.credits)));
    setSubscriptionStatus(billing.subscriptionStatus);
    setBillingBypassEnabled(hasBillingBypass);
    setAccountEmail(billing.accountEmail?.trim() || null);
    setIsRecoverableAccount(Boolean(billing.isRecoverableAccount || billing.accountEmail));
    setNextConsumptionSource(
      billing.nextConsumptionSource ?? (billing.accessState === 'blocked' ? 'blocked' : 'initial_free'),
    );
    setDailyResetAt(billing.dailyResetAt ?? null);
    if (billing.accountEmail) {
      setAuthEmailInput((currentValue) => currentValue || billing.accountEmail?.trim() || '');
    }

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
  }, [initialBillingBypassEnabled]);

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

  const recordProductEvent = useCallback(async (
    eventName: ClientProductEventName,
    metadata: Record<string, string | number | boolean | null>,
  ) => {
    try {
      const attribution = captureAndStoreAttribution(
        window.localStorage,
        new URLSearchParams(window.location.search),
      );
      productEventCounterRef.current += 1;
      const dedupeKey = `${eventName}:${Date.now().toString(36)}:${productEventCounterRef.current}`;
      await fetchWithAuth('/api/product-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, metadata, dedupeKey, attribution }),
      });
    } catch (error) {
      console.error('Failed to record product event', error);
    }
  }, [fetchWithAuth]);
  recordProductEventRef.current = recordProductEvent;

  useEffect(() => {
    if (!isAuthReady || hasRecordedProductLandingRef.current) return;
    hasRecordedProductLandingRef.current = true;
    void recordProductEvent('page_view_home', {
      flow_version: isGeneratorPrimaryMode ? GENERATOR_FLOW_VERSION : 'standard',
    });
  }, [isAuthReady, isGeneratorPrimaryMode, recordProductEvent]);

  const refreshConversationProfiles = useCallback(async () => {
    if (!isAuthReady) {
      return;
    }

    try {
      const response = await fetchWithAuth('/api/conversations', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        conversations?: ConversationProfile[];
        error?: string;
      };

      if (!response.ok || !Array.isArray(data.conversations)) {
        throw new Error(data.error ?? 'לא הצלחנו לטעון את השיחות השמורות.');
      }

      setConversationProfiles(data.conversations.slice(0, 20));
      setConversationProfilesError(null);
      setActiveConversationId((currentId) =>
        currentId && data.conversations?.some((profile) => profile.id === currentId)
          ? currentId
          : null,
      );
    } catch (error) {
      setConversationProfilesError(
        mapApiErrorMessage(
          error instanceof Error ? error.message : 'לא הצלחנו לטעון את השיחות השמורות.',
        ),
      );
    }
  }, [fetchWithAuth, isAuthReady]);

  useEffect(() => {
    if (!isAuthReady || hasLoadedConversationProfilesRef.current) {
      return;
    }

    hasLoadedConversationProfilesRef.current = true;
    void refreshConversationProfiles();
  }, [isAuthReady, refreshConversationProfiles]);

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

  const completeEmailLinkFromUrl = useCallback(async (emailOverride?: string) => {
    const [{ EmailAuthProvider, isSignInWithEmailLink, linkWithCredential, signInWithEmailLink }, { auth }] =
      await Promise.all([
        import('firebase/auth'),
        getClientFirebaseAuth(),
      ]);
    const currentUrl = window.location.href;

    if (!isSignInWithEmailLink(auth, currentUrl)) {
      return false;
    }

    const storedEmail = window.localStorage.getItem(AUTH_EMAIL_STORAGE_KEY);
    const normalizedEmail = normalizeEmailInput(emailOverride ?? storedEmail ?? authEmailInput);

    if (!isValidEmail(normalizedEmail)) {
      setPendingEmailCompletion(true);
      setAuthEmailNotice('זיהינו קישור אימייל. כדי להשלים את החיבור, הזינו את אותו אימייל שאליו נשלח הקישור.');
      setAuthEmailError(null);
      return false;
    }

    setIsCompletingEmailLink(true);
    setAuthEmailError(null);

    try {
      await auth.authStateReady();
      const intent = getAuthLinkIntentFromUrl();
      const planFromUrl = getAuthLinkPlanFromUrl();
      const storedPlan = window.localStorage.getItem(AUTH_EMAIL_PLAN_STORAGE_KEY);
      const pendingPlan = planFromUrl ?? (isCheckoutPlan(storedPlan) ? storedPlan : null);
      const credential = EmailAuthProvider.credentialWithLink(normalizedEmail, currentUrl);
      const currentUser = auth.currentUser;
      const userCredential = intent === 'checkout' && currentUser
        ? await linkWithCredential(currentUser, credential).catch(async (error) => {
            const code = readFirebaseErrorCode(error);

            if (
              code === 'auth/credential-already-in-use' ||
              code === 'auth/email-already-in-use' ||
              code === 'auth/provider-already-linked'
            ) {
              return signInWithEmailLink(auth, normalizedEmail, currentUrl);
            }

            throw error;
          })
        : await signInWithEmailLink(auth, normalizedEmail, currentUrl);
      const nextToken = await userCredential.user.getIdToken(true);

      syncAuthState(nextToken);
      void fetchWithAuth('/api/identity/link', { method: 'POST' }).catch((linkError) => {
        console.error('Failed to link the current browser visitor to the account', linkError);
      });
      setAccountEmail(normalizedEmail);
      setIsRecoverableAccount(true);
      setAuthEmailInput(normalizedEmail);
      setPendingEmailCompletion(false);
      setAuthEmailNotice(
        intent === 'checkout'
          ? pendingPlan
            ? 'האימייל חובר לחשבון. אפשר להמשיך לתשלום שבחרתם.'
            : 'האימייל חובר לחשבון. עכשיו אפשר לבחור מסלול ולשלם.'
          : 'התחברתם עם האימייל. מצב החשבון יתעדכן מיד.',
      );
      trackEvent('email_link_complete', {
        intent,
        plan: pendingPlan ?? 'none',
      });
      if (intent === 'recover') {
        trackEvent('recovery_sign_in', {
          plan: pendingPlan ?? 'none',
        });
      }

      window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, normalizedEmail);
      window.localStorage.removeItem(AUTH_EMAIL_INTENT_STORAGE_KEY);
      window.localStorage.removeItem(AUTH_EMAIL_PLAN_STORAGE_KEY);
      stripAuthLinkParamsFromUrl();

      await refreshBillingStatus();

      if (intent === 'checkout') {
        setShowPaywall(true);
      }

      return true;
    } catch (error) {
      setAuthEmailNotice(null);
      setAuthEmailError(
        mapApiErrorMessage(error instanceof Error ? error.message : 'לא הצלחנו להשלים את חיבור האימייל.'),
      );
      trackEvent('email_link_error', {
        intent: getAuthLinkIntentFromUrl(),
        reason: readFirebaseErrorCode(error) ?? 'unknown',
      });
      return false;
    } finally {
      setIsCompletingEmailLink(false);
    }
  }, [authEmailInput, fetchWithAuth, getClientFirebaseAuth, refreshBillingStatus, syncAuthState]);

  const handleAuthEmailInputChange = useCallback((value: string) => {
    setAuthEmailInput(value);
    setAuthEmailError(null);
    if (!pendingEmailCompletion) {
      setAuthEmailNotice(null);
    }
  }, [pendingEmailCompletion]);

  const startAuthEmailLink = useCallback(async (intent: AuthEmailIntent, plan: CheckoutPlan | null = null) => {
    const normalizedEmail = normalizeEmailInput(authEmailInput);

    if (!isValidEmail(normalizedEmail)) {
      setAuthEmailError('צריך להזין אימייל תקין לשחזור הגישה.');
      setAuthEmailNotice(null);
      return;
    }

    if (pendingEmailCompletion) {
      await completeEmailLinkFromUrl(normalizedEmail);
      return;
    }

    setIsSendingAuthEmail(true);
    setAuthEmailError(null);
    setAuthEmailNotice(null);

    try {
      const [{ sendSignInLinkToEmail }, { auth }] = await Promise.all([
        import('firebase/auth'),
        getClientFirebaseAuth(),
      ]);

      if (intent === 'checkout') {
        await ensureAuthenticatedUser(true);
      }

      const params = new URLSearchParams();
      params.set('sb_auth_intent', intent);

      if (plan) {
        params.set('sb_auth_plan', plan);
      }

      const actionUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

      await sendSignInLinkToEmail(auth, normalizedEmail, {
        url: actionUrl,
        handleCodeInApp: true,
      });

      window.localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, normalizedEmail);
      window.localStorage.setItem(AUTH_EMAIL_INTENT_STORAGE_KEY, intent);
      if (plan) {
        window.localStorage.setItem(AUTH_EMAIL_PLAN_STORAGE_KEY, plan);
      } else {
        window.localStorage.removeItem(AUTH_EMAIL_PLAN_STORAGE_KEY);
      }

      setAuthEmailNotice(
        intent === 'checkout'
          ? 'שלחנו קישור לאימייל. פתחו אותו כדי לשמור את הגישה לפני התשלום.'
          : 'שלחנו קישור התחברות. פתחו אותו כדי לשחזר את הקרדיטים או המנוי.',
      );
      trackEvent('email_link_start', {
        intent,
        plan: plan ?? 'none',
      });
    } catch (error) {
      setAuthEmailError(
        mapApiErrorMessage(error instanceof Error ? error.message : 'לא הצלחנו לשלוח קישור אימייל.'),
      );
      trackEvent('email_link_error', {
        intent,
        plan: plan ?? 'none',
        reason: readFirebaseErrorCode(error) ?? 'unknown',
      });
    } finally {
      setIsSendingAuthEmail(false);
    }
  }, [
    authEmailInput,
    completeEmailLinkFromUrl,
    ensureAuthenticatedUser,
    getClientFirebaseAuth,
    pendingEmailCompletion,
  ]);

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

  const handleManualBillingRefresh = useCallback(() => {
    trackEvent('billing_refresh_click', {
      access_state: accessState,
    });
    void refreshBillingStatus();
    if (subscriptionStatus) {
      void refreshManagedSubscription();
    }
  }, [accessState, refreshBillingStatus, refreshManagedSubscription, subscriptionStatus]);

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

        setAccountEmail(user.email?.trim() || null);
        setIsRecoverableAccount(Boolean(user.email));
        if (user.email) {
          setAuthEmailInput((currentValue) => currentValue || user.email || '');
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
    if (!isAuthReady) {
      return;
    }

    void completeEmailLinkFromUrl();
  }, [completeEmailLinkFromUrl, isAuthReady]);

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
        setShowPaywall(true);
        setCheckoutSession(null);
        setCheckoutResumePlan(resolvedPlan && isCheckoutPlan(resolvedPlan) ? resolvedPlan : null);
        setCheckoutError('התשלום עוד לא הושלם. אפשר להמשיך תשלום או לבחור מסלול אחר.');
        setPaymentNotice('התשלום עוד לא הושלם. פתחנו לך את אפשרויות התשלום כאן.');
        trackEvent('checkout_return_open', {
          plan: resolvedPlan ?? 'unknown',
        });
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
      setShowPaywall(true);
      setCheckoutResumePlan(isCheckoutPlan(planFromCheckout) ? planFromCheckout : null);
      setPaymentNotice('התשלום בוטל, אפשר לנסות שוב בכל רגע.');
      trackEvent('checkout_return_cancelled', {
        plan: isCheckoutPlan(planFromCheckout) ? planFromCheckout : 'unknown',
      });
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
    if (!hasCopiedAllReplies) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setHasCopiedAllReplies(false);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [hasCopiedAllReplies]);

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

  useEffect(() => {
    if (!hasUnlimitedAccess) {
      return;
    }

    setShowPaywall(false);
    setCheckoutError(null);
    setCheckoutPlan((currentPlan) =>
      currentPlan === 'unlimited_monthly' ? null : currentPlan,
    );
    setCheckoutSession((currentSession) =>
      currentSession?.plan === 'unlimited_monthly' ? null : currentSession,
    );
  }, [hasUnlimitedAccess]);

  useDocumentScrollLock(showPaywall);

  function closePaywall() {
    setShowPaywall(false);
    setCheckoutPlan(null);
    setCheckoutSession(null);
    setCheckoutResumePlan(null);
    setCheckoutError(null);
  }

  function resetCheckoutSelection() {
    setCheckoutSession(null);
    setCheckoutResumePlan(null);
    setCheckoutError(null);
  }

  function openPaywall() {
    if (billingBypassEnabled || hasUnlimitedAccess) {
      return;
    }

    setShowPaywall(true);
    setCheckoutSession(null);
    setCheckoutResumePlan(null);
    setCheckoutError(null);
    void recordProductEvent('paywall_view', {
      used: initialFreeLimit - freeRemaining,
      remaining: freeRemaining,
      daily_remaining: dailyFreeRemaining,
      access_state: accessState,
    });
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

      trackEvent('coupon_redeem_success', {
        status: data.redemption.status ?? 'unknown',
        granted_uses: data.redemption.grantedUses ?? 0,
      });

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
      trackEvent('coupon_redeem_error', {
        reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      });
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
      trackEvent('subscription_action', {
        action,
        status: data.subscription?.status ?? 'unknown',
      });
    } catch (error) {
      setSubscriptionActionError(
        mapApiErrorMessage(
          error instanceof Error
            ? error.message
            : 'לא הצלחנו לעדכן את הגדרות המנוי. נסה שוב בעוד רגע.',
        ),
      );
      trackEvent('subscription_action', {
        action,
        status: 'error',
      });
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

    if (plan === 'unlimited_monthly' && hasUnlimitedAccess) {
      setShowPaywall(false);
      setCheckoutPlan(null);
      setCheckoutSession(null);
      setCheckoutError(null);
      return;
    }

    if (!isRecoverableAccount) {
      setShowPaywall(true);
      setCheckoutSession(null);
      setCheckoutError('לפני תשלום צריך לשמור גישה עם אימייל, כדי שהרכישה לא תאבד.');
      await startAuthEmailLink('checkout', plan);
      return;
    }

    setShowPaywall(true);

    setCheckoutPlan(plan);
    setCheckoutSession(null);
    setCheckoutResumePlan(null);
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
      trackEvent('checkout_failed', {
        plan,
        reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      });
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

  async function handleResumeCheckout(plan: CheckoutPlan) {
    trackEvent('checkout_resume', { plan });
    await handleCheckout(plan);
  }

  function handleConversationSelect(profile: ConversationProfile) {
    if (isGenerating || isBillingLoading) {
      return;
    }

    const resolvedDefaults = resolveConversationDefaultsForAccess(
      profile.context,
      profile.tone,
      hasMonthlyFeatureAccess,
    );
    const { contextLocked, toneLocked } = resolvedDefaults;

    setActiveConversationId(profile.id);
    setContext(resolvedDefaults.context);
    setTone(resolvedDefaults.tone);
    setConversationNotice(
      contextLocked || toneLocked
        ? 'חלק מההגדרות בשיחה הזו זמינות במסלול החודשי. השארנו ברירת מחדל זמינה.'
        : null,
    );
    setMobilePrimaryView('compose');
    trackEvent('conversation_selected', {
      access_state: accessState,
      compose_mode: composeMode,
      context: contextLocked ? 'locked' : (profile.context ?? 'unspecified'),
      tone: toneLocked ? 'locked' : profile.tone,
      profile_count: conversationProfiles.length,
      locked_context: contextLocked,
      locked_tone: toneLocked,
    });
    void recordProductEvent('conversation_selected', {
      compose_mode: composeMode,
      context: contextLocked ? 'locked' : (profile.context ?? 'unspecified'),
      tone: toneLocked ? 'locked' : profile.tone,
      profile_count: conversationProfiles.length,
      locked_context: contextLocked,
      locked_tone: toneLocked,
    });
  }

  function handleConversationClear() {
    setActiveConversationId(null);
    setConversationNotice(null);
  }

  function openConversationMemory(profile: ConversationProfile) {
    setActiveConversationId(profile.id);
    setConversationMutationError(null);
    setConversationDialog('memory');
    trackEvent('conversation_memory_view', {
      access_state: accessState,
      compose_mode: composeMode,
      has_memory_note: Boolean(profile.memoryNote),
      has_last_intent: Boolean(profile.lastIntent),
    });
  }

  function openConversationManagement() {
    setConversationMutationError(null);
    setConversationManageEditId(null);
    setConversationDialog('manage');
    trackEvent('conversation_manage_open', {
      access_state: accessState,
      profile_count: conversationProfiles.length,
    });
    void refreshConversationProfiles();
  }

  function openConversationSave() {
    if (!lastSuccessfulConversationDefaults || activeConversation) {
      return;
    }

    setConversationMutationError(null);
    setConversationDialog('save');
    trackEvent('conversation_save_click', {
      access_state: accessState,
      compose_mode: composeMode,
      context: lastSuccessfulConversationDefaults.context ?? 'unspecified',
      tone: lastSuccessfulConversationDefaults.tone,
      profile_count: conversationProfiles.length,
    });
  }

  async function saveConversation(label: string, memoryNote: string | null) {
    if (!lastSuccessfulConversationDefaults || isSavingConversation) {
      return;
    }

    setIsSavingConversation(true);
    setConversationMutationError(null);

    try {
      const response = await fetchWithAuth('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          context: lastSuccessfulConversationDefaults.context,
          tone: lastSuccessfulConversationDefaults.tone,
          memoryNote,
        }),
      });
      const data = (await response.json()) as { conversation?: ConversationProfile; error?: string };

      if (!response.ok || !data.conversation) {
        throw new Error(data.error ?? 'לא הצלחנו לשמור את השיחה.');
      }

      setConversationProfiles((profiles) => [
        data.conversation!,
        ...profiles.filter((profile) => profile.id !== data.conversation!.id),
      ].slice(0, 20));
      setActiveConversationId(data.conversation.id);
      setLastSuccessfulConversationDefaults(null);
      setConversationDialog(null);
      setConversationProfilesError(null);
      trackEvent('conversation_saved', {
        access_state: accessState,
        compose_mode: composeMode,
        context: data.conversation.context ?? 'unspecified',
        tone: data.conversation.tone,
        profile_count: Math.min(conversationProfiles.length + 1, 20),
        has_memory_note: Boolean(memoryNote),
      });
    } catch (error) {
      setConversationMutationError(
        mapApiErrorMessage(error instanceof Error ? error.message : 'לא הצלחנו לשמור את השיחה.'),
      );
    } finally {
      setIsSavingConversation(false);
    }
  }

  async function updateConversation(profile: ConversationProfile, label: string, memoryNote: string | null) {
    if (conversationBusyId) return;
    setConversationBusyId(profile.id);
    setConversationMutationError(null);
    try {
      const response = await fetchWithAuth(`/api/conversations/${encodeURIComponent(profile.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'update', label, memoryNote }),
      });
      const data = (await response.json()) as { conversation?: ConversationProfile; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error ?? 'שינוי השם נכשל.');
      setConversationProfiles((profiles) =>
        profiles.map((item) => item.id === profile.id ? data.conversation! : item),
      );
      const changedLabel = label !== profile.label;
      const changedMemory = memoryNote !== profile.memoryNote;
      if (changedLabel) {
        trackEvent('conversation_renamed', {
          access_state: accessState,
          profile_count: conversationProfiles.length,
        });
      }
      if (changedMemory) {
        trackEvent('conversation_memory_edit', {
          access_state: accessState,
          profile_count: conversationProfiles.length,
          has_memory_note: Boolean(memoryNote),
        });
      }
    } catch (error) {
      setConversationMutationError(
        mapApiErrorMessage(error instanceof Error ? error.message : 'שינוי השם נכשל.'),
      );
    } finally {
      setConversationBusyId(null);
    }
  }

  async function deleteConversation(profile: ConversationProfile) {
    if (conversationBusyId) return;
    setConversationBusyId(profile.id);
    setConversationMutationError(null);
    try {
      const response = await fetchWithAuth(`/api/conversations/${encodeURIComponent(profile.id)}`, {
        method: 'DELETE',
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'מחיקת השיחה נכשלה.');
      setConversationProfiles((profiles) => profiles.filter((item) => item.id !== profile.id));
      if (activeConversationId === profile.id) {
        setActiveConversationId(null);
        setConversationNotice(null);
      }
      trackEvent('conversation_deleted', {
        access_state: accessState,
        profile_count: Math.max(conversationProfiles.length - 1, 0),
      });
    } catch (error) {
      setConversationMutationError(
        mapApiErrorMessage(error instanceof Error ? error.message : 'מחיקת השיחה נכשלה.'),
      );
    } finally {
      setConversationBusyId(null);
    }
  }

  async function clearAllConversations() {
    if (conversationBusyId) return;
    setConversationBusyId('__all__');
    setConversationMutationError(null);
    try {
      const response = await fetchWithAuth('/api/conversations', {
        method: 'DELETE',
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? 'מחיקת השיחות השמורות נכשלה.');
      }
      setConversationProfiles([]);
      setActiveConversationId(null);
      setConversationDialog(null);
      setConversationManageEditId(null);
      setConversationNotice('כל השיחות השמורות נמחקו.');
    } catch (error) {
      setConversationMutationError(
        mapApiErrorMessage(
          error instanceof Error ? error.message : 'מחיקת השיחות השמורות נכשלה.',
        ),
      );
    } finally {
      setConversationBusyId(null);
    }
  }

  function recordSuccessfulConversationGeneration(
    conversationId: string | null,
    defaults: ConversationDefaults,
    lastIntent: string,
    payloadComposeMode: ComposeMode,
  ) {
    setLastSuccessfulConversationDefaults({ ...defaults, lastIntent });

    if (!conversationId) {
      return;
    }

    trackEvent('conversation_reused_generate', {
      access_state: accessState,
      compose_mode: payloadComposeMode,
      context: defaults.context ?? 'unspecified',
      tone: defaults.tone,
      profile_count: conversationProfiles.length,
    });

    void refreshConversationProfiles();
  }

  async function runGeneration(
    payload: GenerateRequest,
    options?: {
      replyIndex?: number;
      conversationIdForReuse?: string | null;
      normalDefaults?: ConversationDefaults;
    },
  ) {
    setRequestError(null);
    setImageError(null);

    const generationMode = payload.action ? 'refine' : 'initial';
    const payloadComposeMode = payload.noReplyMode ? 'no_reply' : 'incoming';
    const payloadHasBackground = Boolean(payload.conversationBackground?.trim());
    const payloadHasLastOutgoing = Boolean(payload.lastOutgoingMessage?.trim());

    const requestedReplyIndex = options?.replyIndex;
    const isReplyUpdate = typeof requestedReplyIndex === 'number';
    const loadingStartedAt = isReplyUpdate ? null : window.performance.now();

    if (isReplyUpdate) {
      setBusyReplyIndex(requestedReplyIndex);
    } else {
      setHasSentFirstGeneration(true);
      setIsLoading(true);

      if (isCompactViewport()) {
        setMobilePrimaryView('results');
        window.requestAnimationFrame(() => {
          scrollToMobileSection('results', { source: 'system' });
        });
      }
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
          ...getGenerationAnalyticsTimingPayload(generationMode),
          mode: generationMode,
          action: payload.action ?? 'initial',
          compose_mode: payloadComposeMode,
          context: payload.context ?? 'unspecified',
          tone: payload.tone,
          goal: payload.goal ?? 'unspecified',
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

      if (!nextIntent || nextReplies.length !== 3) {
        throw new Error('לא קיבלתי תשובות תקינות. נסה שוב.');
      }
      personalizationActiveRef.current = data.personalizationApplied === true;
      if (data.savedConversationUnavailable === true) {
        setActiveConversationId(null);
        setConversationNotice('השיחה השמורה כבר לא זמינה, אז המשכנו בלי ההקשר שלה.');
        void refreshConversationProfiles();
      }

      const replyIndex = requestedReplyIndex;

      if (typeof replyIndex !== 'number' && loadingStartedAt !== null) {
        const remainingLoadingTime = MIN_LOADING_DISPLAY_MS - (window.performance.now() - loadingStartedAt);

        if (remainingLoadingTime > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingLoadingTime));
        }
      }

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
          ...getGenerationAnalyticsTimingPayload(generationMode),
          mode: generationMode,
          action: payload.action ?? 'initial',
          compose_mode: payloadComposeMode,
          context: payload.context ?? 'unspecified',
          tone: payload.tone,
          goal: payload.goal ?? 'unspecified',
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

      if (options?.normalDefaults) {
        recordSuccessfulConversationGeneration(
          options.conversationIdForReuse ?? null,
          options.normalDefaults,
          nextIntent,
          payloadComposeMode,
        );
      }

      if (isCompactViewport()) {
        setMobilePrimaryView('results');
        window.requestAnimationFrame(() => {
          scrollToMobileSection('results', { source: 'system' });
        });
      }

      trackEvent('generate_success', {
        ...getGenerationAnalyticsTimingPayload(generationMode),
        mode: generationMode,
        action: payload.action ?? 'initial',
        compose_mode: payloadComposeMode,
        context: payload.context ?? 'unspecified',
        tone: payload.tone,
        goal: payload.goal ?? 'unspecified',
        continue_preference: payload.continuePreference ?? 'unspecified',
        has_image: Boolean(payload.imageBase64),
        has_text: Boolean(payload.message.trim()),
        has_background: payloadHasBackground,
        has_last_outgoing: payloadHasLastOutgoing,
        has_saved_conversation: Boolean(payload.conversationId),
        no_reply_duration_value: payload.noReplyDurationValue ?? null,
        no_reply_duration_unit: payload.noReplyDurationUnit ?? null,
      });
    } catch (error) {
      trackEvent('generate_error', {
        ...getGenerationAnalyticsTimingPayload(generationMode),
        mode: generationMode,
        action: payload.action ?? 'initial',
        compose_mode: payloadComposeMode,
        context: payload.context ?? 'unspecified',
        tone: payload.tone,
        goal: payload.goal ?? 'unspecified',
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

      if (!isReplyUpdate && isCompactViewport()) {
        setMobilePrimaryView('compose');
        window.requestAnimationFrame(() => {
          scrollToMobileSection('compose', { source: 'system' });
        });
      }
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
    const allowedConversationBackground = hasMonthlyFeatureAccess
      ? conversationBackground.trim().slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH)
      : '';
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
      ...getActivationTimingPayload(),
      context: context ?? 'unspecified',
      tone,
      goal: goal ?? 'unspecified',
      compose_mode: composeMode,
      continue_preference: effectiveContinuePreference ?? 'unspecified',
      has_image: !isNoReplyMode && Boolean(imageBase64),
      has_text: !isNoReplyMode && Boolean(trimmedMessage),
      has_background: Boolean(allowedConversationBackground),
      has_last_outgoing: Boolean(trimmedLastOutgoingMessage),
      has_saved_conversation: Boolean(activeConversationId),
      no_reply_duration_value: Number.isInteger(parsedNoReplyDuration) ? parsedNoReplyDuration : null,
      no_reply_duration_unit: isNoReplyMode ? noReplyDurationUnit : null,
    });

    await runGeneration({
      message: isNoReplyMode ? '' : trimmedMessage,
      imageBase64: isNoReplyMode ? null : imageBase64,
      context: context ?? undefined,
      tone,
      goal: goal ?? undefined,
      continuePreference: effectiveContinuePreference,
      conversationBackground: allowedConversationBackground || undefined,
      noReplyMode: isNoReplyMode,
      noReplyDurationValue: isNoReplyMode ? parsedNoReplyDuration : undefined,
      noReplyDurationUnit: isNoReplyMode ? noReplyDurationUnit : undefined,
      lastOutgoingMessage: isNoReplyMode ? trimmedLastOutgoingMessage : undefined,
      conversationId: activeConversationId ?? undefined,
    }, {
        conversationIdForReuse: activeConversationId,
        normalDefaults: { context, tone },
    },
    );
  }

  async function handleReplyAction(index: number, action: ReplyAction) {
    if (!result?.replies[index]) {
      return;
    }

    const effectiveContinuePreference = isNoReplyMode ? null : continuePreference;
    const trimmedMessage = message.trim().slice(0, MAX_INCOMING_MESSAGE_LENGTH);
    const trimmedLastOutgoingMessage = lastOutgoingMessage
      .trim()
      .slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH);
    const allowedConversationBackground = hasMonthlyFeatureAccess
      ? conversationBackground.trim().slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH)
      : '';
    const parsedNoReplyDuration = Number.parseInt(noReplyDurationValue, 10);

    trackEvent('refine_click', {
      action,
      index,
      context,
      tone,
      goal,
      compose_mode: composeMode,
      continue_preference: effectiveContinuePreference ?? 'unspecified',
      has_image: !isNoReplyMode && Boolean(imageBase64),
      has_text: !isNoReplyMode && Boolean(trimmedMessage),
      has_background: Boolean(allowedConversationBackground),
      has_last_outgoing: Boolean(trimmedLastOutgoingMessage),
    });

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
        context: context ?? undefined,
        tone,
        goal: goal ?? undefined,
        continuePreference: effectiveContinuePreference,
        conversationBackground: allowedConversationBackground || undefined,
        noReplyMode: isNoReplyMode,
        noReplyDurationValue:
          isNoReplyMode && Number.isInteger(parsedNoReplyDuration)
            ? parsedNoReplyDuration
            : undefined,
        noReplyDurationUnit: isNoReplyMode ? noReplyDurationUnit : undefined,
        lastOutgoingMessage: isNoReplyMode ? trimmedLastOutgoingMessage : undefined,
        action,
        sourceReply: result.replies[index],
        conversationId: activeConversationId ?? undefined,
      },
      { replyIndex: index },
    );
  }

  async function handleCustomReplyAdjustment(index: number, refineInstruction: string) {
    if (!result?.replies[index] || !refineInstruction.trim()) {
      return;
    }

    trackEvent('custom_refine_submit', { index });
    const trimmedMessage = message.trim().slice(0, MAX_INCOMING_MESSAGE_LENGTH);
    const trimmedLastOutgoingMessage = lastOutgoingMessage
      .trim()
      .slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH);
    const parsedNoReplyDuration = Number.parseInt(noReplyDurationValue, 10);
    const allowedConversationBackground = hasMonthlyFeatureAccess
      ? conversationBackground.trim().slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH)
      : '';

    await runGeneration(
      {
        message: isNoReplyMode ? '' : trimmedMessage,
        imageBase64: isNoReplyMode ? null : imageBase64,
        context: context ?? undefined,
        tone,
        goal: goal ?? undefined,
        continuePreference: isNoReplyMode ? null : continuePreference,
        conversationBackground: allowedConversationBackground || undefined,
        noReplyMode: isNoReplyMode,
        noReplyDurationValue:
          isNoReplyMode && Number.isInteger(parsedNoReplyDuration)
            ? parsedNoReplyDuration
            : undefined,
        noReplyDurationUnit: isNoReplyMode ? noReplyDurationUnit : undefined,
        lastOutgoingMessage: isNoReplyMode ? trimmedLastOutgoingMessage : undefined,
        refineInstruction: refineInstruction.trim().slice(0, 220),
        sourceReply: result.replies[index],
        conversationId: activeConversationId ?? undefined,
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
      markGeneratorInputStart('screenshot');
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
      setHasCopiedAllReplies(false);
      trackEvent('reply_copy', {
        index,
        context,
        tone,
        has_saved_conversation: Boolean(activeConversationId),
      });
      const hasEmoji = /[\p{Extended_Pictographic}\uFE0F]/u.test(reply);
      void fetchWithAuth('/api/my-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reply_copied',
          lengthBucket: reply.trim().length <= 70 ? 'short' : 'medium',
          hasEmoji,
        }),
      }).catch((error) => console.error('Failed to record My Voice copy signal', error));
      void recordProductEvent('reply_copy', {
        index,
        context: context ?? 'unspecified',
        tone,
        has_saved_conversation: Boolean(activeConversationId),
        has_personalization: personalizationActiveRef.current,
      });
    } catch {
      setRequestError('ההעתקה נכשלה. נסה שוב.');
    }
  }

  async function handleShare(reply: string, index: number) {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text: reply });
        trackEvent('reply_share', { index, method: 'native' });
        return;
      }

      await navigator.clipboard.writeText(reply);
      setCopiedReplyIndex(index);
      setHasCopiedAllReplies(false);
      trackEvent('reply_share', { index, method: 'clipboard_fallback' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setRequestError('השיתוף לא הצליח. אפשר להעתיק את התשובה ידנית.');
    }
  }

  function handleReplyEdit(reply: string, index: number) {
    const normalizedReply = reply.trim();

    if (!normalizedReply) {
      setRequestError('אי אפשר לשמור תשובה ריקה.');
      return;
    }

    setResult((currentResult) => {
      if (!currentResult || !currentResult.replies[index]) {
        return currentResult;
      }

      const replies = [...currentResult.replies];
      replies[index] = normalizedReply;

      return {
        ...currentResult,
        replies,
      };
    });
    setRequestError(null);
    trackEvent('reply_edit', {
      index,
      length: normalizedReply.length,
    });
  }

  async function handleCopyAllReplies() {
    if (!result || result.replies.length !== 3) {
      return;
    }

    try {
      const replyText = result.replies.map((reply, index) => `${index + 1}. ${reply}`).join('\n');
      await navigator.clipboard.writeText(replyText);
      setCopiedReplyIndex(null);
      setHasCopiedAllReplies(true);
      trackEvent('reply_copy_all', {
        reply_count: result.replies.length,
        has_saved_conversation: Boolean(activeConversationId),
      });
    } catch {
      setRequestError('העתקת כל התשובות נכשלה. נסה שוב.');
    }
  }

  async function handleGenerateMoreReplies() {
    trackEvent('generate_more_click', {
      compose_mode: composeMode,
      access_state: accessState,
    });
    await handleMainSubmit();
  }

  function handleNewMessage() {
    trackEvent('result_new_message', {
      compose_mode: composeMode,
    });
    setResult(null);
    setRequestError(null);
    setImageError(null);
    setImageBase64(null);
    setImageName(null);
    setMessage('');
    setLastOutgoingMessage('');
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('hours');
    setConversationBackground('');
    const savedDefaults = resolveConversationDefaultsForAccess(
      activeConversation?.context ?? null,
      activeConversation?.tone ?? 'זורם',
      hasMonthlyFeatureAccess,
    );
    setContext(savedDefaults.context);
    setTone(savedDefaults.tone);
    setGoal(null);
    setContinuePreference(null);
    setCopiedReplyIndex(null);
    setHasCopiedAllReplies(false);
    setLastSuccessfulConversationDefaults(null);
    setMobilePrimaryView('compose');
    if (advancedOptionsRef.current) {
      advancedOptionsRef.current.open = false;
    }
    scrollToComposeSection();
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
    setGoal(scenario.goal ?? null);
    setContinuePreference(scenario.continuePreference ?? null);
    setShowDeepLinkPrefillBanner(false);
    setRequestError(null);
    setResult(null);
    setActiveConversationId(null);
    setConversationNotice(null);
    setLastSuccessfulConversationDefaults(null);

    const nextUrl = buildHomeDeepLink(
      {
        mode: 'incoming',
        example: scenario.id,
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

    markGeneratorInputStart('paste');
    trackEvent('message_paste', {
      pasted_chars: pastedText.length,
    });
  }

  function handleIncomingMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextMessage = event.target.value.slice(0, MAX_INCOMING_MESSAGE_LENGTH);
    setMessage(nextMessage);

    if (nextMessage.trim()) {
      markGeneratorInputStart('typing');
    }
  }

  function handleLastOutgoingMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextMessage = event.target.value.slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH);
    setLastOutgoingMessage(nextMessage);

    if (nextMessage.trim()) {
      markGeneratorInputStart('typing');
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-clip bg-[#fff9ef] px-3 pb-24 pt-3 text-right text-[#181411] sm:px-6 sm:py-6 sm:pb-6"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5">
        {isGeneratorPrimaryMode ? (
          <GeneratorHeader accountStatusLine={accountStatusLine} />
        ) : (
          <HomeHero
            onStart={handleHeroStartUsingClick}
            ctaLabel={heroGenerateCtaLabel}
            accountStatusLine={accountStatusLine}
          />
        )}

        <section className="grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-5">
          {hasHydrated && !isGeneratorPrimaryMode ? (
            <div className="flex items-center justify-between gap-2 rounded-[20px] border border-[#e2d7c8] bg-white p-1.5 shadow-[0_10px_28px_rgba(49,23,13,0.08)] lg:hidden">
              <button
                type="button"
                onClick={() => setMobilePrimaryView('compose')}
                aria-pressed={mobilePrimaryView === 'compose'}
                className={[
                  `min-h-[42px] flex-1 rounded-[14px] px-3 py-2 text-sm font-black transition ${lightSurfaceFocusClass}`,
                  mobilePrimaryView === 'compose'
                    ? 'bg-[#181411] text-white shadow-[0_8px_18px_rgba(24,20,17,0.16)]'
                    : 'bg-transparent text-[#5b4d42]',
                ].join(' ')}
              >
                שלב 1: מילוי
              </button>
              <button
                type="button"
                onClick={() => {
                  if (canShowMobileResults) {
                    setMobilePrimaryView('results');
                  }
                }}
                aria-pressed={mobilePrimaryView === 'results'}
                disabled={!canShowMobileResults}
                className={[
                  `min-h-[42px] flex-1 rounded-[14px] px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${lightSurfaceFocusClass}`,
                  mobilePrimaryView === 'results'
                    ? 'bg-[#181411] text-white shadow-[0_8px_18px_rgba(24,20,17,0.16)]'
                    : 'bg-transparent text-[#5b4d42]',
                ].join(' ')}
              >
                {canShowMobileResults ? 'שלב 2: תשובות' : 'תשובות אחרי יצירה'}
              </button>
            </div>
          ) : null}

          <div
            ref={composeSectionRef}
            id="compose-section"
            className={[
              'mobile-section-anchor w-full min-w-0 rounded-[28px] border border-[#e2d7c8] bg-[#fffdfa] shadow-[0_20px_55px_rgba(49,23,13,0.1)] sm:rounded-[32px]',
              isGeneratorPrimaryMode ? 'space-y-3 p-2.5 sm:p-4' : 'space-y-4 p-4 sm:p-5',
              mobilePrimaryView === 'compose' ? 'block' : 'hidden lg:block',
            ].join(' ')}
          >
            {!isGeneratorPrimaryMode ? <div className="min-w-0 space-y-2">
              <p className="inline-flex min-h-[32px] items-center rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#8f371e] lg:hidden">
                {mobileSectionNavItems[0].stepLabel}
              </p>
              <h2 className="text-2xl font-black text-[#181411] sm:text-3xl">מדביקים הודעה. מקבלים ניסוח מוכן.</h2>
              <p className="text-sm font-bold leading-6 text-[#6d6259]">
                מדביקים כמו שזה, בוחרים וייב, ומקבלים 3 תשובות קצרות לשליחה.
              </p>
            </div> : null}

            {!isGeneratorPrimaryMode ? <div
              className={[
                'sm:hidden rounded-[20px] border px-3.5 py-3',
                mobileComposeHelper.tone === 'ready'
                  ? 'border-[#b8e7df] bg-[#e3fbf7]'
                  : 'border-[#ffc4b5] bg-[#fff0ea]',
              ].join(' ')}
            >
              <p className="text-sm font-black text-[#241d18]">{mobileComposeHelper.title}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-[#5b4d42]">{mobileComposeHelper.body}</p>
            </div> : null}

            {showDeepLinkPrefillBanner ? (
              <div className="flex w-full min-w-0 flex-col gap-2 rounded-[22px] border border-[#b8e7df] bg-[#e3fbf7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-black text-[#123a36]">{DEEP_LINK_PREFILL_BANNER_TEXT}</p>
                <button
                  type="button"
                  onClick={() => setShowDeepLinkPrefillBanner(false)}
                  className={`min-h-[38px] rounded-full border border-[#b8e7df] bg-white px-3 py-1 text-xs font-black text-[#123a36] ${lightSurfaceFocusClass}`}
                >
                  סגור
                </button>
              </div>
            ) : null}

            {!isGeneratorPrimaryMode ? <div className="w-full min-w-0 space-y-2 rounded-[22px] border border-[#e2d7c8] bg-[#f8f3eb] p-3 sm:hidden">
              <p className="text-sm font-black text-[#241d18]">להתחיל מדוגמה מוכנה</p>
              <p className="text-xs font-bold leading-5 text-[#6d6259]">
                בחרו אחת מהדוגמאות ונמלא את הטופס אוטומטית.
              </p>
              <div className="snap-x scrollbar-none flex gap-2 overflow-x-auto pb-1">
                {examples.map((scenario) => (
                  <button
                    key={`mobile-example-${scenario.title}`}
                    type="button"
                    onClick={() => applyExample(scenario)}
                    className={`snap-start whitespace-nowrap rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-black text-[#241d18] ${lightSurfaceFocusClass}`}
                  >
                    {scenario.title}
                  </button>
                ))}
              </div>
            </div> : null}

            <SavedConversationsRow
              profiles={conversationProfiles}
              activeId={activeConversationId}
              disabled={isGenerating || isBillingLoading}
              error={conversationProfilesError}
              onSelect={handleConversationSelect}
              onClear={handleConversationClear}
              onManage={openConversationManagement}
              onViewMemory={openConversationMemory}
              onRetry={() => void refreshConversationProfiles()}
            />

            {conversationNotice ? (
              <p className="rounded-2xl border border-[#f0df9d] bg-[#fff6d8] px-3 py-2 text-xs font-bold leading-5 text-[#5b4d42]">
                {conversationNotice}
              </p>
            ) : null}

            <div className="w-full min-w-0 space-y-3 rounded-[24px] border border-[#e2d7c8] bg-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:space-y-4 sm:p-5">
              {isGeneratorPrimaryMode ? (
                <div className="flex min-h-[46px] items-center justify-between gap-2 rounded-[16px] border border-[#e4d8c8] bg-[#fff9ef] px-3 py-1.5">
                  <p className="min-w-0 text-sm font-black text-[#241d18]">
                    {isNoReplyMode ? 'כותבים פולו־אפ' : 'עונים להודעה שקיבלת'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleComposeModeChange(isNoReplyMode ? 'incoming' : 'no_reply')}
                    className={`min-h-[44px] shrink-0 rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1.5 text-xs font-black text-[#7a2d19] transition hover:bg-[#ffe3da] ${lightSurfaceFocusClass}`}
                  >
                    {isNoReplyMode ? 'חזרה לתשובה' : 'לא ענו? פולו־אפ'}
                  </button>
                </div>
              ) : (
              <div className="rounded-[20px] border border-[#e4d8c8] bg-[#f8f3eb] p-3">
                <p className="text-sm font-black text-[#241d18]">איך ממשיכים מכאן?</p>
                <p className="mt-1 text-xs font-bold leading-5 text-[#6d6259]">
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
                        onClick={() => handleComposeModeChange(option.value)}
                        className={[
                          `min-h-[48px] rounded-2xl border px-3 py-2 text-right transition ${lightSurfaceFocusClass}`,
                          isSelected
                            ? 'border-[#181411] bg-[#181411] text-white shadow-[0_10px_20px_rgba(24,20,17,0.14)]'
                            : 'border-[#ded2c3] bg-white text-[#241d18] hover:-translate-y-0.5 hover:bg-[#fffdfa]',
                        ].join(' ')}
                      >
                        <span className="block text-sm font-black">{option.label}</span>
                        <span
                          className={[
                            'mt-1 block text-xs font-bold leading-5',
                            isSelected ? 'text-[#f8f3eb]' : 'text-[#6d6259]',
                          ].join(' ')}
                        >
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              {isNoReplyMode ? (
                <div className="space-y-3 rounded-[22px] border border-[#e2d7c8] bg-[#fbf7f1] p-3 motion-safe:animate-[sb-paywall-in_220ms_ease-out] sm:space-y-4 sm:p-4">
                  <div>
                    <label htmlFor="last-outgoing-message" className="text-sm font-black text-[#241d18]">
                      מה כתבתי בהודעה האחרונה?
                    </label>
                    <p className="text-xs font-bold text-[#6d6259]">
                      זה הטקסט האחרון ששלחת לפני שהצד השני הפסיק לענות.
                    </p>
                  </div>

                  <textarea
                    id="last-outgoing-message"
                    ref={lastOutgoingInputRef}
                    value={lastOutgoingMessage}
                    onChange={handleLastOutgoingMessageChange}
                    onPaste={handleMessagePaste}
                    placeholder='למשל: "היי, רק בודק/ת אם זה עדיין רלוונטי לך"'
                    maxLength={MAX_LAST_OUTGOING_MESSAGE_LENGTH}
                    className={`min-h-32 w-full rounded-[22px] border border-[#ded2c3] bg-white px-4 py-4 text-base leading-7 font-medium text-[#241d18] outline-none transition placeholder:text-[#9b8f83] focus:-translate-y-0.5 focus:bg-[#fffdfa] ${lightSurfaceFocusClass}`}
                  />
                  <p className="text-xs font-bold text-[#6d6259]">
                    עד {MAX_LAST_OUTGOING_MESSAGE_LENGTH} תווים ({lastOutgoingMessageLength}/
                    {MAX_LAST_OUTGOING_MESSAGE_LENGTH}).
                  </p>

                  <div className="rounded-2xl border border-[#e2d7c8] bg-white p-3">
                    <label
                      htmlFor="no-reply-duration-value"
                      className="text-sm font-black text-[#241d18]"
                    >
                      כמה זמן לא ענו?
                    </label>
                    <p className="mt-1 text-xs font-bold text-[#6d6259]">
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
                        className={`min-h-[44px] w-full rounded-xl border border-[#ded2c3] bg-white px-3 py-2 text-sm font-bold text-[#241d18] outline-none transition focus:bg-[#fffdfa] ${lightSurfaceFocusClass}`}
                      />
                      <select
                        id="no-reply-duration-unit"
                        aria-label="יחידת זמן ללא תשובה"
                        value={noReplyDurationUnit}
                        onChange={(event) =>
                          setNoReplyDurationUnit(event.target.value as NoReplyDurationUnit)
                        }
                        className={`min-h-[44px] w-full rounded-xl border border-[#ded2c3] bg-white px-3 py-2 text-sm font-black text-[#241d18] outline-none transition focus:bg-[#fffdfa] ${lightSurfaceFocusClass}`}
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
                <div className="space-y-3 rounded-[22px] border border-[#e2d7c8] bg-[#fbf7f1] p-3 motion-safe:animate-[sb-paywall-in_220ms_ease-out] sm:space-y-4 sm:p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <label htmlFor="incoming-message" className="text-sm font-black text-[#241d18]">
                        מה כתבו לך?
                      </label>
                      <p className="text-[11px] font-bold text-[#6d6259]">מדביקים טקסט או מצרפים צילום.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`min-h-[44px] shrink-0 rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-black text-[#241d18] transition hover:bg-[#f8f3eb] ${lightSurfaceFocusClass}`}
                    >
                      צילום מסך
                    </button>
                  </div>

                  <textarea
                    id="incoming-message"
                    ref={messageInputRef}
                    value={message}
                    onChange={handleIncomingMessageChange}
                    onPaste={handleMessagePaste}
                    placeholder='למשל: "היי, מתאים לך שנדבר בערב?"'
                    maxLength={MAX_INCOMING_MESSAGE_LENGTH}
                    className={`min-h-28 w-full resize-none rounded-[22px] rounded-bl-[14px] border border-[#ded2c3] bg-white px-4 py-3 text-base leading-7 font-medium text-[#241d18] outline-none transition placeholder:text-[#9b8f83] focus:bg-[#fffdfa] sm:min-h-40 sm:py-4 ${lightSurfaceFocusClass}`}
                  />
                  {messageLength > MAX_INCOMING_MESSAGE_LENGTH ? (
                    <p className="text-xs font-bold text-[#b42318]" role="alert">
                      עד {MAX_INCOMING_MESSAGE_LENGTH} תווים להודעה ({messageLength}/
                      {MAX_INCOMING_MESSAGE_LENGTH}).
                    </p>
                  ) : null}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />

                  {imageName ? (
                    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-[#e2d7c8] bg-[#f8f3eb] px-4 py-3 min-[430px]:flex-row min-[430px]:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#241d18]">{imageName}</p>
                        <p className="text-xs font-bold text-[#6d6259]">הצילום נוסף לטופס ומוכן ליצירה</p>
                      </div>
                      <button
                        type="button"
                        onClick={clearImage}
                        className={`min-h-[44px] rounded-full bg-[#181411] px-3 py-2 text-xs font-black text-white ${lightSurfaceFocusClass}`}
                      >
                        להסיר
                      </button>
                    </div>
                  ) : null}

                  {imageError ? <p className="text-sm font-bold text-[#c23318]">{imageError}</p> : null}
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleMainSubmit}
                  disabled={isGenerating || !isSessionReady}
                  className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[#ff5a2a] px-5 py-3 text-base font-black text-white shadow-[0_14px_26px_rgba(255,90,42,0.24)] transition duration-150 hover:bg-[#f04d1f] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${lightSurfaceFocusClass}`}
                >
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.64rem] font-black uppercase tracking-[0.12em] text-white">
                    פעולה
                  </span>
                  {generateButtonLabel}
                </button>
                <p className="text-xs font-black text-[#6d6259]">{accountStatusLine}</p>
                {paymentNotice ? (
                  <p className="rounded-2xl border border-[#b8e7df] bg-[#e3fbf7] px-4 py-3 text-sm font-black text-[#123a36]">
                    {paymentNotice}
                  </p>
                ) : null}
                {requestError ? (
                  <p
                    className="rounded-2xl border border-[#ffc4b5] bg-[#fff0ea] px-4 py-3 text-sm font-bold text-[#7a2d19]"
                    role="alert"
                  >
                    {requestError}
                  </p>
                ) : null}
              </div>

            </div>

            <div className="grid gap-2.5 sm:gap-3">
              <details
                ref={toneOptionsRef}
                className="group rounded-[20px] border border-[#e2d7c8] bg-[#f8f3eb] transition-colors duration-200 open:bg-[#fff8ef]"
              >
                <summary
                  className={`flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm text-[#241d18] marker:content-none ${lightSurfaceFocusClass}`}
                >
                  <span className="font-black">וייב: {tone}</span>
                  <span className="flex items-center gap-2 font-black text-[#8f371e]">
                    <span>שינוי</span>
                    <span className="text-xs transition-transform duration-200 group-open:rotate-180">⌄</span>
                  </span>
                </summary>
                <div className="border-t border-[#e2d7c8] px-3 pb-3 pt-2">
                  <ChipGroup
                    title="איזה וייב מתאים לך?"
                    description="זורם נבחר כברירת מחדל. אפשר לבחור וייב אחר."
                    headerAlign="right"
                    illustrations={toneOptionIllustrations}
                    options={shouldShowMonthlyFeatureOptions ? toneOptions : freeToneOptions}
                    primaryVisibleCount={TONE_PRIMARY_VISIBLE_COUNT}
                    primaryColumns={3}
                    moreOptionsLabel="עוד וייבים"
                    lockedOptions={hasUnlimitedAccess ? [] : monthlyOnlyToneOptions}
                    lockedOptionsPreviewLabel="חודשי"
                    lockedOptionsHint="הווייבים המורחבים פתוחים במסלול ללא הגבלה חודשי."
                    lockedOptionsNoticeTitle={MONTHLY_LOCK_COPY.tone.title}
                    lockedOptionsNoticeBody={MONTHLY_LOCK_COPY.tone.body}
                    lockedOptionsNoticeCta="לפתוח ללא הגבלה חודשי"
                    showMoreOptionsSearch={false}
                    onLockedOptionsNoticeCtaClick={openPaywall}
                    value={tone}
                    onChange={(nextValue) => {
                      if (nextValue) {
                        trackEvent('tone_select', { value: nextValue });
                        setTone(nextValue);
                        window.requestAnimationFrame(() => {
                          if (toneOptionsRef.current) {
                            toneOptionsRef.current.open = false;
                          }
                        });
                      }
                    }}
                  />
                </div>
              </details>

              <details
                ref={advancedOptionsRef}
                onToggle={handleAdvancedOptionsToggle}
                className="group rounded-[22px] border border-dashed border-[#d8cab9] bg-[#f8f3eb] transition-colors duration-200 open:bg-[#fff8ef]"
              >
                <summary
                  className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-black text-[#241d18] marker:content-none ${lightSurfaceFocusClass}`}
                >
                  <span className="flex items-center gap-2">
                    <span>עוד דיוק · אופציונלי</span>
                    {context || goal || continuePreference || conversationBackground ? (
                      <span className="rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-2 py-0.5 text-[10px] font-black text-[#8f371e]">
                        נבחר דיוק
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs transition-transform duration-200 group-open:rotate-180">⌄</span>
                </summary>
                <div className="sb-accordion-content">
                  <div className="sb-accordion-content-inner space-y-3 px-3 pb-3 pt-1">
                    <ChipGroup
                      title="מה המצב?"
                      description="אם זה חשוב, אפשר לציין את הסיטואציה."
                      headerAlign="right"
                      illustrations={contextOptionIllustrations}
                      options={shouldShowMonthlyFeatureOptions ? contextOptions : freeContextOptions}
                      primaryVisibleCount={CONTEXT_PRIMARY_VISIBLE_COUNT}
                      moreOptionsLabel="עוד סיטואציות"
                      lockedOptions={hasUnlimitedAccess ? [] : monthlyOnlyContextOptions}
                      lockedOptionsPreviewLabel="חודשי"
                      lockedOptionsHint="הסיטואציות המורחבות פתוחות במסלול ללא הגבלה חודשי."
                      lockedOptionsNoticeTitle={MONTHLY_LOCK_COPY.context.title}
                      lockedOptionsNoticeBody={MONTHLY_LOCK_COPY.context.body}
                      lockedOptionsNoticeCta="לפתוח ללא הגבלה חודשי"
                      showMoreOptionsSearch={false}
                      onLockedOptionsNoticeCtaClick={openPaywall}
                      optional
                      allowEmpty
                      value={context}
                      onChange={(nextValue) => {
                        if (nextValue) {
                          trackEvent('situation_select', { value: nextValue });
                        }
                        setContext(nextValue);
                      }}
                    />

                    <ChipGroup
                      title={isNoReplyMode ? 'מה המטרה של הפולו־אפ?' : 'מה המטרה שלך?'}
                      description="בחירה כאן יכולה לדייק, אבל לא נדרשת ליצירה."
                      headerAlign="right"
                      options={isNoReplyMode ? noReplyGoalOptions : incomingGoalOptions}
                      primaryVisibleCount={isNoReplyMode ? 3 : 6}
                      warmOptionCards
                      optional
                      allowEmpty
                      value={goal}
                      onChange={(nextValue) => {
                        if (nextValue) {
                          trackEvent('goal_select', { value: nextValue, compose_mode: composeMode });
                        }
                        setGoal(nextValue);
                      }}
                    />

                    {!isNoReplyMode ? (
                      <ChipGroup
                        title="רוצים להמשיך את השיחה?"
                        description="אפשר להשאיר לא מוגדר ולתת להודעה להוביל."
                        headerAlign="right"
                        options={continuePreferenceOptions}
                        primaryVisibleCount={2}
                        optional
                        allowEmpty
                        value={continuePreference}
                        onChange={(nextValue) => {
                          if (nextValue) {
                            trackEvent('agrees_select', { value: nextValue });
                          }
                          setContinuePreference(nextValue);
                        }}
                      />
                    ) : null}

                    {shouldShowConversationBackground ? (
                      <details className="group/background rounded-[20px] border border-dashed border-[#d8cab9] bg-white transition-colors duration-200 open:bg-[#fff8ef]">
                        <summary
                          className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-black text-[#241d18] marker:content-none ${lightSurfaceFocusClass}`}
                        >
                          <span className="flex items-center gap-2">
                            <span>רקע שיחה נוסף</span>
                            {isConversationBackgroundLocked ? (
                              <span className="rounded-full border border-[#d8cab9] bg-[#fff0ea] px-2 py-0.5 text-[10px] font-black text-[#8f371e]">
                                חודשי
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs transition-transform duration-200 group-open/background:rotate-180">⌄</span>
                        </summary>
                        <div className="space-y-2 px-3 pb-3">
                          {isBillingLoading ? (
                            <p className="text-xs font-bold text-[#6d6259]">
                              בודקים את מצב המנוי כדי לפתוח את ההרחבה הזאת...
                            </p>
                          ) : hasMonthlyFeatureAccess ? (
                            <>
                              <p className="text-xs font-bold text-[#6d6259]">
                                פרטים קצרים שיעזרו לדייק את הניסוח.
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
                                className={`min-h-24 w-full rounded-[18px] border border-[#ded2c3] bg-white px-3 py-3 text-sm font-medium leading-6 text-[#241d18] outline-none transition placeholder:text-[#9b8f83] focus:bg-[#fffdfa] ${lightSurfaceFocusClass}`}
                              />
                              <p className="text-xs font-bold text-[#6d6259]">
                                עד {MAX_CONVERSATION_BACKGROUND_LENGTH} תווים ({conversationBackgroundLength}/
                                {MAX_CONVERSATION_BACKGROUND_LENGTH}).
                              </p>
                            </>
                          ) : (
                            <div className="space-y-2 rounded-[18px] bg-[#181411] p-3 text-[#fff5de]">
                              <p className="text-sm font-black">{MONTHLY_LOCK_COPY.conversationBackground.title}</p>
                              <p className="text-xs font-semibold leading-5 text-[#f6deaf]">
                                {MONTHLY_LOCK_COPY.conversationBackground.body}
                              </p>
                              <button
                                type="button"
                                onClick={openPaywall}
                                className={`min-h-[42px] w-full rounded-full bg-[#ff623d] px-4 py-2 text-sm font-black text-white ${darkSurfaceFocusClass}`}
                              >
                                {MONTHLY_LOCK_COPY.conversationBackground.cta}
                              </button>
                            </div>
                          )}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              </details>
            </div>

          </div>

          <div
            ref={resultsSectionRef}
            id="results-section"
            className={[
              'mobile-section-anchor w-full min-w-0 space-y-4 rounded-[28px] border border-[#d3e4df] bg-white p-3.5 shadow-[0_20px_55px_rgba(18,58,54,0.1)] sm:rounded-[32px] sm:p-5',
              mobilePrimaryView === 'results' ? 'block' : 'hidden lg:block',
            ].join(' ')}
          >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="inline-flex min-h-[32px] items-center rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#123a36] lg:hidden">
                  {mobileSectionNavItems[1].stepLabel}
                </p>
                <h2 className="text-2xl font-black text-[#181411] sm:text-3xl">התשובות שלך</h2>
                <p className="mt-1.5 text-sm font-bold leading-6 text-[#6d6259]">
                  הסבר קצר ואז 3 תשובות מוכנות להעתקה.
                </p>
              </div>
            </div>

            <div aria-busy={isGenerating} className="space-y-3">
              <p className="sr-only" role="status" aria-live="polite">
                {isLoading
                  ? 'מכינים שלוש תשובות. הפעולה עדיין מתבצעת.'
                  : result
                    ? 'שלוש התשובות מוכנות.'
                    : 'אזור התשובות מוכן.'}
              </p>
              {result && !isLoading ? (
                <div className="sb-results-ready w-full min-w-0 space-y-3">
                <div className="sb-result-intent-card sb-result-intent-ready w-full min-w-0 rounded-[22px] border border-[#e2d7c8] bg-[#f8f3eb] p-3.5 shadow-[0_10px_28px_rgba(49,23,13,0.06)] sm:p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black tracking-[0.08em] text-[#7a6e64]">
                      {isNoReplyMode ? 'הכיוון להודעת ההמשך' : 'מה ההודעה אומרת'}
                    </p>
                    <p className="mt-1.5 text-base font-bold leading-6 text-[#241d18]">{result.intent}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#e7dccf] pt-3">
                      <button
                        type="button"
                        onClick={handleCopyAllReplies}
                        className={`min-h-[40px] rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-black text-[#241d18] transition hover:bg-[#fffdfa] ${whiteSurfaceFocusClass}`}
                      >
                        {hasCopiedAllReplies ? 'הכל הועתק' : 'העתק הכל'}
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateMoreReplies}
                        disabled={isGenerating}
                        className={`min-h-[40px] rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1.5 text-xs font-black text-[#7a2d19] transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                      >
                        עוד 3 תשובות · שימוש אחד
                      </button>
                      <button
                        type="button"
                        onClick={handleNewMessage}
                        className={`min-h-[40px] rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3 py-1.5 text-xs font-black text-[#123a36] transition hover:bg-[#cef6ef] ${whiteSurfaceFocusClass}`}
                      >
                        הודעה חדשה
                      </button>
                  </div>
                </div>

                <div className="w-full min-w-0 space-y-3">
                  {result.replies.map((reply, index) => (
                    <ReplyCard
                      key={index}
                      reply={reply}
                      index={index}
                      isBusy={isGenerating}
                      isUpdating={busyReplyIndex === index}
                      copied={copiedReplyIndex === index}
                      onCopy={handleCopy}
                      onShare={handleShare}
                      onAdjust={handleReplyAction}
                      onCustomAdjust={handleCustomReplyAdjustment}
                      onEdit={handleReplyEdit}
                    />
                  ))}
                </div>
                <div className="rounded-2xl border border-[#e2d7c8] bg-[#fffdf8] px-3 py-2.5 text-sm">
                  {activeConversation ? (
                    <p className="font-black text-[#5b4d42]">עונים ל{activeConversation.label} · SayBack זוכר את ההקשר</p>
                  ) : lastSuccessfulConversationDefaults ? (
                    <div>
                      <p className="mb-2 text-center text-xs font-bold text-[#6d6259]">מדברים שוב עם אותו אדם?</p>
                      <button
                        type="button"
                        onClick={openConversationSave}
                        className={[
                          `min-h-[42px] w-full rounded-full border px-3 py-2 text-sm font-black transition ${whiteSurfaceFocusClass}`,
                          copiedReplyIndex !== null || hasCopiedAllReplies
                            ? 'border-[#ff9c83] bg-[#fff0ea] text-[#7a2d19]'
                            : 'border-[#ded2c3] bg-white text-[#5b4d42] hover:border-[#ffb29f] hover:text-[#7a2d19]',
                        ].join(' ')}
                      >
                        זכור את השיחה לפעם הבאה
                      </button>
                    </div>
                  ) : null}
                </div>
                </div>
              ) : isLoading ? (
                <LoadingReplies isNoReplyMode={isNoReplyMode} />
              ) : (
                <div className="flex w-full min-w-0 min-h-72 flex-col justify-center rounded-[26px] border border-dashed border-[#d8cab9] bg-[#fbf7f1] p-5 sm:min-h-80">
                  <h3 className="text-2xl font-black text-[#181411]">
                    כאן יופיעו 3 תשובות מוכנות להעתקה
                  </h3>
                  <p className="mt-3 max-w-md text-sm font-bold leading-6 text-[#6d6259]">
                    בחרו מצב כתיבה, מלאו את השדה הראשי ותוך רגע יופיעו 3 תשובות מוכנות להעתקה.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMobilePrimaryView('compose');
                      scrollToMobileSection('compose', { source: 'navigation' });
                    }}
                    className={`mt-4 min-h-[44px] w-full rounded-full border border-[#ded2c3] bg-white px-4 py-2 text-sm font-black text-[#241d18] sm:hidden ${lightSurfaceFocusClass}`}
                  >
                    לחזור לשלב 1: מילוי
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {!isGeneratorPrimaryMode && !hasSentFirstGeneration ? <QuickStartStrip /> : null}

        {!isGeneratorPrimaryMode && !billingBypassEnabled ? (
          <section
            ref={plansSectionRef}
            id="plans-section"
            className="mobile-section-anchor w-full min-w-0 rounded-[28px] border border-[#e2d7c8] bg-[#fffdfa] p-4 shadow-[0_18px_48px_rgba(49,23,13,0.08)] sm:rounded-[32px] sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a45334]">חשבון ותשלום</p>
                <h2 className="mt-2 text-2xl font-black text-[#181411] sm:text-3xl">ממשיכים מכאן כשצריך</h2>
              </div>
              <p className="max-w-xl text-sm font-bold leading-6 text-[#6d6259]">
                אחרי שמילאתם הודעה, כאן רואים מה נשאר בחשבון, שומרים גישה באימייל ופותחים עוד תשובות.
              </p>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <AccountCenterPanel
                accountEmail={accountEmail}
                isRecoverableAccount={isRecoverableAccount}
                authEmailInput={authEmailInput}
                onAuthEmailInputChange={handleAuthEmailInputChange}
                onStartEmailLink={startAuthEmailLink}
                isSendingAuthEmail={isSendingAuthEmail}
                isCompletingEmailLink={isCompletingEmailLink}
                pendingEmailCompletion={pendingEmailCompletion}
                authEmailNotice={authEmailNotice}
                authEmailError={authEmailError}
                isSessionReady={isSessionReady}
                isBillingLoading={isBillingLoading}
                accountStatusLine={accountStatusLine}
                nextConsumptionSource={nextConsumptionSource}
                dailyResetAt={dailyResetAt}
                paidCredits={paidCredits}
                hasUnlimitedAccess={hasUnlimitedAccess}
                managedSubscription={managedSubscription}
                onRefreshBilling={handleManualBillingRefresh}
                compact
                className="h-full shadow-none"
              />

              <div className="min-w-0 space-y-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  <BillingSnapshotPanel
                    freeRemaining={freeRemaining}
                    freeLimit={initialFreeLimit}
                    dailyFreeRemaining={dailyFreeRemaining}
                    dailyLimit={dailyFreeLimit}
                    paidCredits={paidCredits}
                    hasUnlimitedAccess={hasUnlimitedAccess}
                    showDailyFreeExhaustedHelper={isBlockedOnlyByDailyFreeExhausted}
                    className="bg-white"
                  />

                  <CouponRedeemPanel
                    couponCode={couponCode}
                    onCouponCodeChange={handleCouponCodeChange}
                    onRedeemCoupon={handleRedeemCoupon}
                    isRedeemingCoupon={isRedeemingCoupon}
                    isSessionReady={isSessionReady}
                    couponError={couponError}
                    couponNotice={couponNotice}
                    className="bg-white"
                  />
                </div>

                <SubscriptionManagementPanel
                  subscription={managedSubscription}
                  isLoading={isSubscriptionLoading || isSubscriptionActionLoading}
                  isSessionReady={isSessionReady}
                  onAction={handleSubscriptionAction}
                  actionError={subscriptionActionError}
                  actionNotice={subscriptionActionNotice}
                />

                <div
                  className={[
                    'grid gap-3',
                    hasUnlimitedAccess ? 'md:grid-cols-1' : 'md:grid-cols-2',
                  ].join(' ')}
                >
                  <div className="rounded-[22px] border border-[#e2d7c8] bg-white p-4 shadow-[0_12px_30px_rgba(49,23,13,0.06)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-xs font-black text-[#7a2d19]">
                          {CREDIT_PLAN_COPY.badge}
                        </span>
                        <h3 className="mt-3 text-lg font-black text-[#181411]">{CREDIT_PLAN_COPY.title}</h3>
                        <p className="mt-1.5 text-sm font-black text-[#5b4d42]">{CREDIT_PLAN_COPY.helper}</p>
                        <p className="mt-1 text-sm font-bold text-[#6d6259]">{CREDIT_PLAN_COPY.body}</p>
                      </div>
                      <p className="shrink-0 text-2xl font-black text-[#181411]">{CREDIT_PLAN_COPY.price}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckout('credits_50')}
                      disabled={checkoutPlan !== null || !isSessionReady}
                      className={`mt-3 min-h-[46px] w-full rounded-full bg-[#ff5a2a] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_22px_rgba(255,90,42,0.22)] transition hover:-translate-y-0.5 hover:bg-[#f04d1f] disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                    >
                      {!isRecoverableAccount
                        ? 'שמירת גישה ואז תשלום'
                        : checkoutPlan === 'credits_50'
                          ? 'טוען טופס תשלום...'
                          : CREDIT_PLAN_COPY.cta}
                    </button>
                  </div>

                  {!hasUnlimitedAccess ? (
                    <div className="rounded-[22px] bg-[#181411] p-4 text-white shadow-[0_18px_40px_rgba(24,20,17,0.18)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-black">
                            {UNLIMITED_PLAN_COPY.badge}
                          </span>
                          <h3 className="mt-3 text-lg font-black">{UNLIMITED_PLAN_COPY.title}</h3>
                          <p className="mt-1.5 text-sm font-black text-white/80">{UNLIMITED_PLAN_COPY.helper}</p>
                          <p className="mt-1 text-sm font-bold text-white/80">{UNLIMITED_PLAN_COPY.body}</p>
                        </div>
                        <p className="shrink-0 text-2xl font-black">{UNLIMITED_PLAN_COPY.price}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCheckout('unlimited_monthly')}
                        disabled={checkoutPlan !== null || !isSessionReady}
                        className={`mt-3 min-h-[46px] w-full rounded-full bg-[#20d6c7] px-4 py-2.5 text-sm font-black text-[#102b29] transition hover:-translate-y-0.5 hover:bg-[#51e0d4] disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
                      >
                        {!isRecoverableAccount
                          ? 'שמירת גישה ואז תשלום'
                          : checkoutPlan === 'unlimited_monthly'
                            ? 'טוען טופס תשלום...'
                            : UNLIMITED_PLAN_COPY.cta}
                      </button>
                    </div>
                  ) : null}
                </div>

                {checkoutError ? (
                  <p className="rounded-2xl border border-[#ffc4b5] bg-[#fff0ea] px-4 py-3 text-sm font-bold text-[#7a2d19]">
                    {checkoutError}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {!isGeneratorPrimaryMode ? (
          <section
            ref={examplesSectionRef}
            id="examples-section"
            className="mobile-section-anchor w-full min-w-0 rounded-[28px] border border-[#e2d7c8] bg-[#fffdfa] p-4 shadow-[0_18px_48px_rgba(49,23,13,0.08)] sm:rounded-[32px] sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="inline-flex min-h-[32px] items-center rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#7a2d19] lg:hidden">
                  {mobileSectionNavItems[2].stepLabel}
                </p>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a45334]">דוגמאות פתיחה</p>
                <h2 className="mt-2 text-2xl font-black text-[#181411] sm:text-3xl">4 מצבים שמכירים מהחיים</h2>
              </div>
              <p className="max-w-xl text-sm font-bold leading-6 text-[#6d6259]">
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

        <footer className="w-full min-w-0 rounded-[24px] border border-[#e2d7c8] bg-[#fbf7f1] px-4 py-4 text-sm font-bold text-[#5b4d42]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {billingBypassEnabled
                ? 'כרגע SayBack פתוח לשימוש ללא הגבלה.'
                : 'התשלום מאובטח, ואנחנו לא שומרים אצלנו פרטי אשראי.'}
            </p>
            <div className="flex flex-wrap items-center justify-start gap-3 text-sm">
              <a className="underline decoration-2 underline-offset-2 hover:text-black" href="/privacy">
                מדיניות פרטיות
              </a>
              <a className="underline decoration-2 underline-offset-2 hover:text-black" href="/terms">
                תנאי שימוש
              </a>
            </div>
          </div>
        </footer>
      </div>

      {canReturnToGeneratorFromResults ? (
        <div className="fixed bottom-0 left-1/2 z-30 -translate-x-1/2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden">
          <button
            type="button"
            aria-controls="compose-section"
            onClick={handleReturnToGenerator}
            className={`inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#e2d7c8] bg-[#fffdfa]/95 px-4 py-2 text-sm font-black text-[#241d18] shadow-[0_8px_24px_rgba(49,23,13,0.16)] backdrop-blur transition hover:border-[#ffb29f] hover:bg-white ${lightSurfaceFocusClass}`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-[#ff623d]"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
            </svg>
            <span>עריכת ההודעה והכיוונים</span>
          </button>
        </div>
      ) : null}

      <SaveConversationDialog
        key={conversationDialog === 'save' ? 'save-open' : 'save-closed'}
        open={conversationDialog === 'save'}
        context={lastSuccessfulConversationDefaults?.context ?? null}
        tone={lastSuccessfulConversationDefaults?.tone ?? tone}
        busy={isSavingConversation}
        error={conversationMutationError}
        onClose={() => {
          if (!isSavingConversation) {
            setConversationDialog(null);
            setConversationMutationError(null);
          }
        }}
        onSave={saveConversation}
      />

      <ManageConversationsDialog
        key={conversationDialog === 'manage' ? `manage-${conversationManageEditId ?? 'open'}` : 'manage-closed'}
        open={conversationDialog === 'manage'}
        profiles={conversationProfiles}
        busyId={conversationBusyId}
        error={conversationMutationError}
        editProfile={conversationProfiles.find((profile) => profile.id === conversationManageEditId) ?? null}
        onClose={() => {
          if (!conversationBusyId) {
            setConversationDialog(null);
            setConversationMutationError(null);
          }
        }}
        onUpdate={updateConversation}
        onDelete={deleteConversation}
        onClearAll={clearAllConversations}
      />

      <ConversationMemoryDialog
        key={conversationDialog === 'memory' ? `memory-${activeConversationId}` : 'memory-closed'}
        open={conversationDialog === 'memory'}
        profile={activeConversation}
        onClose={() => setConversationDialog(null)}
        onEdit={(profile) => {
          setConversationManageEditId(profile.id);
          setConversationDialog('manage');
        }}
        onManage={openConversationManagement}
      />

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
          resumePlan={checkoutResumePlan}
          onResumeCheckout={handleResumeCheckout}
          accountEmail={accountEmail}
          isRecoverableAccount={isRecoverableAccount}
          authEmailInput={authEmailInput}
          onAuthEmailInputChange={handleAuthEmailInputChange}
          onStartEmailLink={startAuthEmailLink}
          isSendingAuthEmail={isSendingAuthEmail}
          isCompletingEmailLink={isCompletingEmailLink}
          pendingEmailCompletion={pendingEmailCompletion}
          authEmailNotice={authEmailNotice}
          authEmailError={authEmailError}
          accountStatusLine={accountStatusLine}
          nextConsumptionSource={nextConsumptionSource}
          dailyResetAt={dailyResetAt}
          managedSubscription={managedSubscription}
          onRefreshBilling={handleManualBillingRefresh}
        />
      ) : null}
    </main>
  );
}
