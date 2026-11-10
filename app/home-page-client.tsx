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
  type FormEvent,
} from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { AccountDialog, ConversationDemo, ConversationGuide, ConversationHeader } from '@/components/conversation-experience';
import './conversation-experience.css';
import {
  ConversationMemoryDialog,
  ManageConversationsDialog,
  SaveConversationDialog,
  SavedConversationsRow,
} from '@/components/conversation-memory';
import { trackEvent } from '@/lib/analytics';
import { DisclosurePanel } from '@/components/disclosure-panel';
import { createLatestRequest } from '@/lib/latest-request';
import { createReplyHistory, recordReplyRefinement, getPreviousReply, clearReplyRevision } from '@/lib/reply-history';
import { getMissingCommitmentKind, type CommitmentMode, type LanguagePreferences, type ReplyContext } from '@/lib/reply-context';
import { CommitmentControls, ContinueConversationDialog } from '@/components/reply-context-controls';
import { ReplyDirectionControls } from '@/components/reply-direction-controls';
import { areGenerationDraftsEqual, type GenerationDraft } from '@/lib/generation-draft';
import { CONTINUE_PREFERENCE_OPTIONS, type DirectionField, type ContinuePreference, type IncomingGoal, type Goal } from '@/lib/reply-direction';
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
type ComposeMode = 'incoming' | 'no_reply';
type NoReplyDurationUnit = 'minutes' | 'hours' | 'days';
type NoReplyDurationUnitSelection = NoReplyDurationUnit | '';
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

type GenerateRequest = GenerationDraft & {
  refineInstruction?: string;
  action?: ReplyAction;
  sourceReply?: string;
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
const GENERATOR_FLOW_VERSION = 'direction_v3' as const;
const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const MIN_LOADING_DISPLAY_MS = 200;
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
const DEEP_LINK_PREFILL_BANNER_TEXT = 'מילאנו לך התחלה. אפשר לערוך לפני שמייצרים.';
const monthlyOnlyContextOptions = CONTEXT_OPTIONS.slice(FREE_CONTEXT_OPTION_COUNT);
const monthlyOnlyToneOptions = TONE_OPTIONS.slice(FREE_TONE_OPTION_COUNT);
const composeModeOptions: Array<{ value: ComposeMode; label: string; description: string }> = [
  {
    value: 'incoming',
    label: 'קיבלתי הודעה',
    description: 'קיבלת הודעה חדשה ורוצה תשובה טובה ומהירה.',
  },
  {
    value: 'no_reply',
    label: 'מחכה לתשובה',
    description: 'רוצה לשלוח הודעה נוספת לשיחה שעוד לא נענתה.',
  },
];
const noReplyDurationPresets: Array<{ label: string; value: string; unit: NoReplyDurationUnit }> = [
  { label: 'חצי שעה', value: '30', unit: 'minutes' },
  { label: '3 שעות', value: '3', unit: 'hours' },
  { label: 'יום', value: '1', unit: 'days' },
  { label: '3 ימים', value: '3', unit: 'days' },
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
  'inline-flex min-h-[28px] items-center rounded-full border border-[#d8cab9] bg-[#181411] px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#fffdfa]';
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

    return !element.hasAttribute('disabled') && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert], [aria-hidden="true"]');
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
    agrees: CONTINUE_PREFERENCE_OPTIONS,
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
            <span className="inline-flex min-h-[30px] items-center rounded-full bg-[#181411] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_10px_22px_rgba(24,20,17,0.12)] sm:min-h-[34px] sm:px-4 sm:py-1.5 sm:text-xs">
              SayBack
            </span>
          </div>
          <div className="max-w-3xl text-center lg:text-right">
            <h1 className="text-[3.25rem] leading-none font-semibold text-[#181411] sm:text-[4.5rem] lg:text-[5.5rem]">
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
            className={`inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#ff5a2a] px-5 py-2.5 text-base font-semibold text-white shadow-[0_14px_26px_rgba(255,90,42,0.26)] transition hover:-translate-y-0.5 hover:bg-[#f04d1f] active:translate-y-0 sm:min-h-[52px] sm:px-6 sm:py-3 lg:w-auto ${lightSurfaceFocusClass}`}
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
            className="flex min-h-[42px] items-center justify-center rounded-[16px] border border-[#e4d8c8] bg-[#f8f3eb] px-2 py-2 text-center text-xs leading-4 font-semibold text-[#2c241f] sm:rounded-[18px] sm:px-3 sm:py-2.5 sm:text-sm"
          >
            {item}
          </div>
        ))}
      </div>
    </section>
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a45334]">ברוכים הבאים</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#181411] sm:text-3xl">שלושה צעדים לתשובה מוכנה</h2>
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
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#a45334]">
              {step.step}
            </p>
            <h3 className="mt-2 text-base font-semibold text-[#181411]">{step.title}</h3>
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
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#5b4d42]">
          <span className="rounded-full border border-[#ded2c3] bg-white px-3 py-1 text-[#463b33]">
            {scenario.context}
          </span>
          <div className="flex items-center gap-2">
            <span>{scenario.tone}</span>
            <span className={interactiveBadgeClass}>לחיץ</span>
          </div>
        </div>
        <h3 className="text-lg font-semibold text-[#181411]">{scenario.title}</h3>
        <p className="text-sm leading-6 text-[#5b4d42]">
          &quot;{scenario.message}&quot;
        </p>
      </div>
      <span className="mt-4 text-sm font-semibold text-[#7a2d19]">לחיצה אחת, והדוגמה נכנסת לטופס</span>
    </button>
  );
}

function ReplyRefineMenu({
  index,
  isBusy,
  onAdjust,
  onCustomAdjust,
  usageHint,
}: {
  index: number;
  isBusy: boolean;
  usageHint: string;
  onAdjust: (index: number, action: ReplyAction) => void;
  onCustomAdjust: (index: number, instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const panelId = `reply-refine-${index}`;
  const customPanelId = `reply-custom-refine-${index}`;

  const submitCustomAdjustment = () => {
    const nextInstruction = instruction.trim();
    if (!nextInstruction) {
      return;
    }

    onCustomAdjust(index, nextInstruction);
  };

  return (
    <div className="w-full min-w-0 rounded-2xl">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((current) => !current)}
        className={`flex min-h-[42px] w-full items-center justify-between gap-2 px-3.5 py-2 text-right text-sm font-semibold text-[#241d18] ${whiteSurfaceFocusClass}`}
      >
        <span>לשפר ניסוח</span>
        <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
      </button>

      <DisclosurePanel open={isOpen} id={panelId}>
        <div className="px-2.5 pb-2.5 pt-0.5">
            <p className="mb-2 text-xs font-bold leading-5 text-[#6d6259]">
              ניסוח מחדש · {usageHint}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onAdjust(index, 'softer')}
                disabled={isBusy}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#b8e7df] bg-[#e3fbf7] px-2 py-2 text-xs leading-5 text-[#123a36] transition hover:bg-[#cef6ef] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                עדין יותר
              </button>
              <button
                type="button"
                onClick={() => onAdjust(index, 'sharper')}
                disabled={isBusy}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#ffc4b5] bg-[#fff0ea] px-2 py-2 text-xs leading-5 text-[#6f2414] transition hover:bg-[#ffe2d8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                חד יותר
              </button>
              <button
                type="button"
                onClick={() => onAdjust(index, 'retry')}
                disabled={isBusy}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#ded2c3] bg-white px-2 py-2 text-xs leading-5 text-[#241d18] transition hover:bg-[#f8f3eb] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                ניסוח חדש
              </button>
            </div>
            <div className="mt-2 border-t border-[#e2d7c8] pt-2">
              <button
                type="button"
                aria-expanded={isCustomOpen}
                aria-controls={customPanelId}
                onClick={() => setIsCustomOpen((current) => !current)}
                disabled={isBusy}
                className={`min-h-11 text-xs font-black text-[#5b4d42] underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
              >
                דיוק אחר
              </button>
              <DisclosurePanel open={isCustomOpen} id={customPanelId}>
                <div className="pt-2">
                  <label htmlFor={`custom-refine-${index}`} className="text-xs font-black text-[#241d18]">
                    מה לשנות? (יישלח כניסוח חדש)
                  </label>
              <div className="mt-2 flex gap-2">
                <input
                  id={`custom-refine-${index}`}
                  value={instruction}
                  onFocus={() => trackEvent('custom_refine_open', { index })}
                  onChange={(event) => setInstruction(event.target.value.slice(0, 220))}
                  placeholder="למשל: שיהיה קצר וחם יותר"
                  className={`min-h-11 min-w-0 flex-1 rounded-xl border border-[#ded2c3] bg-white px-3 py-2 text-sm font-bold text-[#241d18] outline-none ${whiteSurfaceFocusClass}`}
                />
                <button
                  type="button"
                  disabled={isBusy || !instruction.trim()}
                  onClick={submitCustomAdjustment}
                  className={`min-h-[42px] shrink-0 rounded-xl bg-[#181411] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                >
                  שפר
                </button>
              </div>
                </div>
              </DisclosurePanel>
            </div>
        </div>
      </DisclosurePanel>
    </div>
  );
}

function ReplyActions({
  index,
  copied,
  reply,
  isUpdating,
  onCopy,
  onShare,
  onStartEditing,
  onContinue,
}: {
  index: number;
  copied: boolean;
  reply: string;
  isUpdating: boolean;
  onCopy: (reply: string, index: number) => void;
  onShare: (reply: string, index: number) => void;
  onStartEditing: () => void;
  onContinue: (reply: string) => void;
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const panelId = `reply-more-${index}`;

  return (
    <>
      <button
        type="button"
        data-reply-copy
        disabled={isUpdating}
        onClick={() => onCopy(reply, index)}
        aria-label={copied ? `תשובה ${index + 1} הועתקה` : `העתק תשובה ${index + 1}`}
        className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-50 ${copied ? 'bg-[#e3fbf7] text-[#123a36]' : 'bg-[#241d18] text-white hover:bg-[#463b33]'} ${whiteSurfaceFocusClass}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
        </svg>
        <span key={String(copied)} className={copied ? 'sb-motion-feedback' : undefined}>{copied ? 'הועתקה · אפשר להדביק' : 'להעתיק את התשובה'}</span>
      </button>
      <button
        type="button"
        aria-label={`אפשרויות נוספות לתשובה ${index + 1}`}
        aria-expanded={isMoreOpen}
        aria-controls={panelId}
        disabled={isUpdating}
        onClick={() => setIsMoreOpen((current) => !current)}
        className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-[#e2d7c8] bg-white px-3 text-xl font-bold text-[#5b4d42] transition-colors hover:bg-[#f8f3eb] disabled:cursor-wait disabled:opacity-50 ${whiteSurfaceFocusClass}`}
      >
        <span aria-hidden="true">···</span>
      </button>
      <DisclosurePanel open={isMoreOpen} id={panelId} className="col-span-2">
        <div className="pt-2"><div className="flex flex-wrap gap-2 rounded-2xl bg-[#f8f3eb] p-2">
          <button type="button" disabled={isUpdating} onClick={onStartEditing} className={`min-h-11 rounded-xl px-3 text-sm font-bold text-[#463b33] hover:bg-white disabled:opacity-50 ${whiteSurfaceFocusClass}`}>
            לערוך בעצמי
          </button>
          <button type="button" disabled={isUpdating} onClick={() => onShare(reply, index)} className={`min-h-11 rounded-xl px-3 text-sm font-bold text-[#463b33] hover:bg-white disabled:opacity-50 ${whiteSurfaceFocusClass}`}>
            שיתוף
          </button>
          <button type="button" disabled={isUpdating} onClick={() => onContinue(reply)} className={`min-h-11 rounded-xl px-3 text-sm font-bold text-[#463b33] hover:bg-white disabled:opacity-50 ${whiteSurfaceFocusClass}`}>ענו לי</button>
          {isUpdating ? (
            <span aria-disabled="true" className="inline-flex min-h-11 items-center px-3 text-sm font-bold text-[#6d6259] opacity-50">וואטסאפ</span>
          ) : (
            <a href={`https://wa.me/?text=${encodeURIComponent(reply)}`} target="_blank" rel="noreferrer" onClick={() => trackEvent('reply_share', { index, method: 'whatsapp' })} className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-[#463b33] hover:bg-white ${whiteSurfaceFocusClass}`}>
              וואטסאפ
            </a>
          )}
        </div></div>
      </DisclosurePanel>
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
  previousReply,
  refineError,
  onRestore,
  onContinue,
  isBusy,
  isUpdating,
  copied,
  error,
  manualCopy,
  usageHint,
}: {
  reply: string;
  index: number;
  onCopy: (reply: string, index: number) => void;
  onShare: (reply: string, index: number) => void;
  onAdjust: (index: number, action: ReplyAction) => void;
  onCustomAdjust: (index: number, instruction: string) => void;
  onEdit: (reply: string, index: number) => boolean;
  previousReply: string | null;
  refineError: string | null;
  onRestore: (index: number) => void;
  onContinue: (reply: string) => void;
  isBusy: boolean;
  isUpdating: boolean;
  copied: boolean;
  error?: string;
  manualCopy: boolean;
  usageHint: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftReply, setDraftReply] = useState(reply);
  const [lastReply, setLastReply] = useState(reply);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const titleId = `reply-title-${index}`;

  if (lastReply !== reply) {
    setLastReply(reply);
    setDraftReply(reply);
    setIsEditing(false);
  }

  useEffect(() => {
    if (isEditing) editorRef.current?.focus();
  }, [isEditing]);

  function finishEditing(save: boolean) {
    if (save) {
      if (!draftReply.trim()) return;
      if (!onEdit(draftReply, index)) return;
    } else {
      setDraftReply(reply);
    }
    setIsEditing(false);
    window.requestAnimationFrame(() => cardRef.current?.querySelector<HTMLButtonElement>('[data-reply-copy]')?.focus());
  }

  return (
    <article
      ref={cardRef}
      aria-labelledby={titleId}
      className={`sb-reply-card relative w-full min-w-0 rounded-[24px] border bg-[#fffdfa] p-4 shadow-[0_4px_16px_rgba(49,23,13,0.04)] transition-colors sm:p-5 ${copied && !isEditing ? 'border-[#78b9a9] ring-1 ring-[#b8e7df]' : 'border-[#e2d7c8]'}`}
    >
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="flex items-center gap-2 text-sm font-bold text-[#6d6259]">
          <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f3e9df] text-xs tabular-nums text-[#7a2d19]">{index + 1}</span>
          תשובה {index + 1}
        </h3>
        <span role="status" className="text-xs font-bold text-[#246354]">
          {isUpdating ? 'מלטשים את הניסוח…' : copied && !isEditing ? 'הועתקה ללוח ✓' : previousReply && !isEditing ? 'הנוסח עודכן' : ''}
        </span>
      </div>

      {isEditing ? (
        <div className="sb-motion-panel">
          <label htmlFor={`reply-editor-${index}`} className="mb-2 block text-xs font-bold text-[#6d6259]">אפשר לדייק במילים שלך</label>
          <textarea
            ref={editorRef}
            id={`reply-editor-${index}`}
            aria-label={`עריכת תשובה ${index + 1}`}
            value={draftReply}
            onChange={(event) => setDraftReply(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') finishEditing(false); }}
            className={`min-h-36 w-full resize-y rounded-[18px] border border-[#d8cab9] bg-white px-4 py-3 text-[1.0625rem] font-medium leading-8 text-[#241d18] outline-none ${whiteSurfaceFocusClass}`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!draftReply.trim()} onClick={() => finishEditing(true)} className={`min-h-12 flex-1 rounded-2xl bg-[#241d18] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${whiteSurfaceFocusClass}`}>שמור עריכה</button>
            <button type="button" onClick={() => finishEditing(false)} className={`min-h-12 rounded-2xl border border-[#ded2c3] px-4 py-2 text-sm font-bold text-[#5b4d42] ${whiteSurfaceFocusClass}`}>ביטול</button>
          </div>
        </div>
      ) : (
        <>
          <p key={reply} dir="auto" className={`sb-motion-reply sb-reply-text whitespace-pre-wrap rounded-[18px] bg-[#f8f3eb] px-4 py-4 text-start text-[1.0625rem] font-medium leading-[1.85] text-[#241d18] [overflow-wrap:anywhere] sm:text-lg ${isUpdating ? 'opacity-55' : ''}`}>
            {reply}
          </p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
            <ReplyActions index={index} copied={copied} reply={reply} isUpdating={isUpdating} onCopy={onCopy} onShare={onShare} onContinue={onContinue} onStartEditing={() => setIsEditing(true)} />
          </div>
        </>
      )}

      {refineError ? <p role="alert" className="sb-motion-feedback mt-3 rounded-xl border border-[#efb7ad] bg-[#fff0ea] p-3 text-sm leading-6 text-[#8c2e20]">{refineError}</p> : null}

      {previousReply && !isEditing ? (
        <details className="mt-3 rounded-2xl border border-[#e2d7c8] bg-[#f8f3eb] p-3">
          <summary className={`min-h-11 cursor-pointer rounded-xl py-2 text-sm font-bold text-[#5b4d42] ${whiteSurfaceFocusClass}`}>השוואה לנוסח שלפני שיפור ה־AI</summary>
          <p dir="auto" className="whitespace-pre-wrap text-start text-base leading-7 text-[#463b33] [overflow-wrap:anywhere]">{previousReply}</p>
          <button type="button" disabled={isBusy} onClick={() => {
            onRestore(index);
            window.requestAnimationFrame(() => cardRef.current?.querySelector<HTMLButtonElement>('[data-reply-copy]')?.focus());
          }} className={`mt-3 min-h-11 rounded-xl border border-[#b8e7df] bg-white px-3 text-sm font-bold text-[#123a36] disabled:opacity-50 ${whiteSurfaceFocusClass}`}>להחזיר את הנוסח הקודם</button>
          <p className="mt-1 text-xs text-[#6d6259]">החזרה לנוסח הקודם אינה משתמשת בשימוש נוסף.</p>
        </details>
      ) : null}

      <div className="mt-3 border-t border-[#eee5da] pt-2">
        <ReplyRefineMenu index={index} isBusy={isBusy || isEditing} onAdjust={onAdjust} onCustomAdjust={onCustomAdjust} usageHint={usageHint} />
      </div>
      {error ? <p className="sb-error mt-3" role="alert">{error}</p> : null}
      {manualCopy ? (
        <div className="mt-2">
          <label htmlFor={`manual-copy-${index}`} className="text-sm">העתקה ידנית של תשובה {index + 1}</label>
          <textarea id={`manual-copy-${index}`} readOnly value={reply} onFocus={(event) => event.currentTarget.select()} className="sb-message-input mt-2 w-full" />
        </div>
      ) : null}
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
  const title = isNoReplyMode ? 'מכינים הודעת המשך' : 'מרכיבים לך תשובות טובות';
  const description = isNoReplyMode
    ? 'בודקים מה שלחת, כמה זמן עבר, ואיך להחזיר את השיחה בלי לחץ.'
    : 'מנסחים עכשיו 3 תשובות קצרות וטבעיות שאפשר להעתיק מיד.';

  return (
    <div className="sb-replies-loading w-full min-w-0 space-y-3">
      <div className="sb-result-intent-card sb-loading-intent relative overflow-hidden rounded-[24px] border border-[#e2d7c8] bg-[#f8f3eb] p-4 shadow-[0_14px_36px_rgba(49,23,13,0.07)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a6e64]">בדיוק בשבילך</p>
              <span className="sb-loading-block h-6 w-16 rounded-full" aria-hidden="true" />
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[#181411] sm:text-2xl">{title}</h3>
            <p className="mt-1 text-sm font-bold leading-6 text-[#6d6259]">{description}</p>
          </div>
          <div className="inline-flex min-h-[36px] min-w-[154px] shrink-0 items-center self-start rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-xs font-semibold text-[#7a2d19] sm:self-auto">
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
              <span className="rounded-full border border-[#e4d8c8] bg-[#f8f3eb] px-3 py-1 text-xs font-semibold text-[#7a6e64]">אפשרות {index + 1}</span>
              <span className="sb-loading-block h-6 w-16 rounded-full" />
            </div>
            <p className="mt-4 text-[1.05rem] leading-8 font-semibold text-[#8c8075] sm:text-lg">
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
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a45334]">מה נשאר לך בחשבון</p>
      <div className="mt-2 grid gap-2">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className={`rounded-2xl border border-[#e2d7c8] px-3 py-2 ${row.bgClass}`}
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a6e64]">
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
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a45334]">ניהול מנוי חודשי</p>
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
            className={`min-h-[42px] rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3.5 py-2 text-sm font-semibold text-[#7a2d19] transition hover:bg-[#ffe2d8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isLoading ? 'מעדכנים...' : 'לעצור את החיוב הבא'}
          </button>
        ) : null}

        {subscription?.canResume ? (
          <button
            type="button"
            onClick={() => onAction('resume_renewal')}
            disabled={!canSubmitAction}
            className={`min-h-[42px] rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3.5 py-2 text-sm font-semibold text-[#123a36] transition hover:bg-[#cef6ef] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
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
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a45334]">הזן קוד קופון</p>
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
          className={`min-h-[44px] w-full rounded-2xl border border-[#ded2c3] bg-white px-3 py-2 text-base font-semibold uppercase text-[#241d18] placeholder:text-[#9b8f83] ${whiteSurfaceFocusClass}`}
        />
        <button
          type="submit"
          disabled={!canRedeem}
          className={`min-h-[44px] shrink-0 rounded-full bg-[#181411] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
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
  billingBypassEnabled?: boolean;
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
  billingBypassEnabled = false,
}: AccountCenterPanelProps) {
  const emailInputId = useId();
  const dailyResetLabel = formatShortDateTime(dailyResetAt);
  const nextUseLabel = isBillingLoading
    ? 'בודקים מאיפה יגיע השימוש הבא.'
    : nextConsumptionSource === 'unlimited'
      ? billingBypassEnabled ? 'כרגע אפשר ליצור תשובות ללא הגבלה.' : 'השימוש הבא כלול במנוי החודשי.'
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
          {!compact ? <p className="text-xs font-semibold text-[#a45334]">החשבון שלי</p> : null}
          <h2 className={compact ? 'mt-1 text-xl font-semibold text-[#181411]' : 'mt-1 text-2xl font-semibold text-[#181411]'}>
            גישה ושחזור
          </h2>
          <p className="mt-1 text-sm font-bold leading-6 text-[#6d6259]">{accountStatusLine}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefreshBilling}
            disabled={!isSessionReady || isBillingLoading}
            className={`min-h-[42px] rounded-full border border-[#ded2c3] bg-[#f8f3eb] px-3.5 py-2 text-xs font-semibold text-[#241d18] transition hover:bg-[#efe5d8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isBillingLoading ? 'מרעננים...' : 'רענון מצב חשבון'}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-[18px] border border-[#b8e7df] bg-[#e3fbf7] px-3 py-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#4f6d68]">גישה</p>
          <p className="mt-1 text-sm font-semibold text-[#123a36]">{nextUseLabel}</p>
          {dailyResetLabel && nextConsumptionSource === 'blocked' ? (
            <p className="mt-1 text-xs font-bold text-[#4f6d68]">החינם היומי יתחדש סביב {dailyResetLabel}.</p>
          ) : null}
        </div>
        <div className="rounded-[18px] border border-[#e2d7c8] bg-[#f8f3eb] px-3 py-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a6e64]">שחזור גישה</p>
          <p className="mt-1 text-sm font-semibold text-[#241d18]">
            {isRecoverableAccount && accountEmail ? accountEmail : 'עדיין לא נשמר אימייל לשחזור.'}
          </p>
        </div>
        <div className="rounded-[18px] border border-[#e2d7c8] bg-white px-3 py-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a6e64]">מנוי וחבילות</p>
          <p className="mt-1 text-sm font-semibold text-[#241d18]">{subscriptionLabel ?? 'אין חבילה או מנוי פעיל כרגע.'}</p>
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
          <label htmlFor={emailInputId} className="text-sm font-semibold text-[#241d18]">
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
              className={`min-h-[44px] shrink-0 rounded-full bg-[#181411] px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
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
            className={`mt-2 min-h-[38px] rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#241d18] transition hover:bg-[#f8f3eb] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
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
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
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
        onCloseRef.current();
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
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="sb-paywall fixed inset-0 z-50 flex items-end justify-center bg-[#181411]/60 p-3 motion-safe:animate-[sb-fade-in_220ms_ease-out] sm:items-center sm:p-4"
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a45334]">
              {!isRecoverableAccount
                ? 'שלב 1 מתוך 3'
                : checkoutSession
                  ? 'שלב 3 מתוך 3'
                  : 'שלב 2 מתוך 3'}
            </p>
            <h2 id="paywall-title" className="mt-2 text-2xl font-semibold text-[#181411] sm:text-3xl">
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
                  'rounded-[24px] border border-[#ded2c3] p-4',
                  checkoutSession.plan === 'credits_50' ? 'bg-white text-black' : 'bg-[#111111] text-white',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {selectedPlanCopy ? (
                      <span
                        className={[
                          'rounded-full border px-3 py-1 text-xs font-semibold',
                          checkoutSession.plan === 'credits_50'
                            ? 'border-black bg-[#e3fbf7] text-black'
                            : 'border-white/40 bg-white/10 text-white',
                        ].join(' ')}
                      >
                        {selectedPlanCopy.badge}
                      </span>
                    ) : null}
                    <h3 className="mt-3 text-lg font-semibold">{selectedPlanCopy?.title}</h3>
                    <p className={checkoutSession.plan === 'credits_50' ? 'mt-1 text-sm font-bold text-neutral-700' : 'mt-1 text-sm font-bold text-white/80'}>
                      {selectedPlanCopy?.helper}
                    </p>
                    <p className={checkoutSession.plan === 'credits_50' ? 'mt-1 text-sm text-neutral-700' : 'mt-1 text-sm text-white/80'}>
                      {selectedPlanCopy?.body}
                    </p>
                  </div>
                  <p className="text-2xl font-semibold">
                    {selectedPlanCopy?.price}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onResetCheckout}
                  className={[
                    `mt-4 min-h-[42px] rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition ${whiteSurfaceFocusClass}`,
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
                <div className="rounded-[22px] border border-[#ded2c3] bg-[#e3fbf7] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b2d10]">תשלום פתוח</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-black">
                    אפשר להמשיך את התשלום האחרון, לבחור מסלול אחר, או לרענן את מצב החשבון אם כבר שילמתם.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onResumeCheckout(resumePlan)}
                      disabled={isCheckoutLoading || !canStartCheckout}
                      className={`min-h-[42px] rounded-full border border-[#ded2c3] bg-[#e3fbf7] px-3.5 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                    >
                      להמשיך תשלום
                    </button>
                    <button
                      type="button"
                      onClick={onResetCheckout}
                      className={`min-h-[42px] rounded-full border border-[#ded2c3] bg-white px-3.5 py-2 text-sm font-semibold text-black transition hover:bg-[#fff6d8] ${whiteSurfaceFocusClass}`}
                    >
                      לבחור מסלול אחר
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[24px] border border-[#ded2c3] bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full border border-black bg-[#e3fbf7] px-3 py-1 text-xs font-semibold text-black">
                      {CREDIT_PLAN_COPY.badge}
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-black">{CREDIT_PLAN_COPY.title}</h3>
                    <p className="mt-1 text-sm font-bold text-neutral-700">{CREDIT_PLAN_COPY.helper}</p>
                    <p className="mt-1 text-sm text-neutral-700">{CREDIT_PLAN_COPY.body}</p>
                  </div>
                  <p className="text-2xl font-semibold text-black">{CREDIT_PLAN_COPY.price}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlan('credits_50')}
                  disabled={isCheckoutLoading || !canStartCheckout}
                  className={`sb-primary-button mt-4 min-h-[48px] w-full rounded-2xl border border-[#ded2c3] bg-[#e3fbf7] px-4 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                >
                  {!isRecoverableAccount
                    ? 'קודם שומרים גישה באימייל'
                    : checkoutPlan === 'credits_50'
                      ? 'טוען טופס תשלום...'
                      : CREDIT_PLAN_COPY.cta}
                </button>
              </div>

              {shouldShowUnlimitedPlanOption ? (
                <div className="rounded-[24px] border border-[#ded2c3] bg-[#111111] p-4 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-semibold">
                        {UNLIMITED_PLAN_COPY.badge}
                      </span>
                      <h3 className="mt-3 text-lg font-semibold">{UNLIMITED_PLAN_COPY.title}</h3>
                      <p className="mt-1 text-sm font-bold text-white/80">{UNLIMITED_PLAN_COPY.helper}</p>
                      <p className="mt-1 text-sm text-white/80">{UNLIMITED_PLAN_COPY.body}</p>
                    </div>
                    <p className="text-2xl font-semibold">{UNLIMITED_PLAN_COPY.price}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectPlan('unlimited_monthly')}
                    disabled={isCheckoutLoading || !canStartCheckout}
                    className={`sb-primary-button mt-4 min-h-[48px] w-full rounded-2xl border border-[#ded2c3] bg-[#ff623d] px-4 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
                  >
                    {!isRecoverableAccount
                      ? 'קודם שומרים גישה באימייל'
                      : checkoutPlan === 'unlimited_monthly'
                        ? 'טוען טופס תשלום...'
                        : UNLIMITED_PLAN_COPY.cta}
                  </button>
                </div>
              ) : null}

              <div className="rounded-[20px] border border-[#ded2c3] bg-white px-4 py-3 text-sm font-bold text-neutral-800">
                <p>התשלום קצר, ברור ובטוח.</p>
              </div>
            </>
          )}

          {checkoutError ? (
            <p className="rounded-2xl border border-[#ded2c3] bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
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
  const [generationRequests] = useState(createLatestRequest);
  const [imageRequests] = useState(createLatestRequest);

  useEffect(() => () => {
    generationRequests.invalidate();
    imageRequests.invalidate();
  }, [generationRequests, imageRequests]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastOutgoingInputRef = useRef<HTMLTextAreaElement | null>(null);
  const noReplyDurationInputRef = useRef<HTMLInputElement | null>(null);
  const noReplyDurationUnitRef = useRef<HTMLSelectElement | null>(null);
  const [directionField, setDirectionField] = useState<DirectionField | null>(null);
  const composeSectionRef = useRef<HTMLDivElement | null>(null);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileScrollSequenceRef = useRef(0);
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
  const [languagePreferences, setLanguagePreferences] = useState<LanguagePreferences>({ speaker: 'neutral', recipient: 'neutral' });
  const [previousOutgoingMessage, setPreviousOutgoingMessage] = useState('');
  const [continueDialogReply, setContinueDialogReply] = useState<string | null>(null);
  const [commitmentChoice, setCommitmentChoice] = useState<{ message: string; mode: CommitmentMode; details: string } | null>(null);
  const [replyHistory, setReplyHistory] = useState(createReplyHistory);
  const [lastOutgoingMessage, setLastOutgoingMessage] = useState('');
  const [showCustomNoReplyDuration, setShowCustomNoReplyDuration] = useState(false);
  const [noReplyDurationValue, setNoReplyDurationValue] = useState('');
  const [noReplyDurationUnit, setNoReplyDurationUnit] = useState<NoReplyDurationUnitSelection>('');
  const [hasTriedNoReplyContinue, setHasTriedNoReplyContinue] = useState(false);
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
  const [replyError, setReplyError] = useState<{ index: number; message: string } | null>(null);
  const [replyErrors, setReplyErrors] = useState<Record<number, string>>({});
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [manualCopyIndex, setManualCopyIndex] = useState<number | null>(null);
  const [resultRequest, setResultRequest] = useState<GenerateRequest | null>(null);
  const [showAccount, setShowAccount] = useState(false);
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
  const trimmedMessage = message.trim();
  const trimmedLastOutgoingMessage = lastOutgoingMessage.trim();
  const parsedNoReplyDuration = Number.parseInt(noReplyDurationValue, 10);
  const hasValidNoReplyDuration =
    Number.isInteger(parsedNoReplyDuration) &&
    parsedNoReplyDuration >= 1 &&
    parsedNoReplyDuration <= MAX_NO_REPLY_DURATION_VALUE;
  const hasNoReplyDurationUnit = noReplyDurationUnit !== '';
  const isNoReplyReady =
    Boolean(trimmedLastOutgoingMessage) && hasValidNoReplyDuration && hasNoReplyDurationUnit;
  const generateButtonLabel = isLoading
    ? 'מכינים 3 תשובות...'
    : isNoReplyMode
      ? 'ליצור לי 3 הודעות המשך'
      : 'ליצור לי 3 תשובות';
  const heroGenerateCtaLabel = 'יאללה, מתחילים לענות';
  const heroStartUsingCtaLabel = 'התחילו להשתמש עכשיו';
  const mobileComposeHelper = useMemo(() => {
    if (isNoReplyMode) {
      if (!trimmedLastOutgoingMessage) {
        return {
          title: 'שלב 1 מתוך 2: מה עוד צריך למלא?',
          body: 'כתבו את ההודעה האחרונה ששלחתם כדי שנוכל להציע איך להמשיך.',
          tone: 'warning',
        } as const;
      }

      if (
        !hasValidNoReplyDuration ||
        !hasNoReplyDurationUnit
      ) {
        return {
          title: 'שלב 1 מתוך 2: חסר זמן המתנה',
          body: 'בחרו מספר תקין של דקות/שעות/ימים כדי שננסח תשובה מתאימה.',
          tone: 'warning',
        } as const;
      }

      return {
        title: 'מעולה. שלב 1 הושלם',
        body: 'אפשר ללחוץ על הכפתור ולקבל 3 הצעות להודעת המשך.',
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
  }, [hasNoReplyDurationUnit, hasValidNoReplyDuration, imageBase64, isNoReplyMode, trimmedLastOutgoingMessage, trimmedMessage]);
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
    : requestError ? 'החיבור לא הושלם. אפשר לנסות שוב.' : 'מכינים את החיבור המאובטח...';
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
      const sequence = ++mobileScrollSequenceRef.current;
      // Wait for the destination to become visible; a newer navigation supersedes this one.
      window.requestAnimationFrame(() => {
        if (sequence !== mobileScrollSequenceRef.current || !sectionElement.isConnected || !sectionElement.getClientRects().length) return;
        sectionElement.scrollIntoView({ behavior, block: 'start' });
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
      (messageInputRef.current ?? lastOutgoingInputRef.current)?.focus({ preventScroll: true });
    });
  }, [scrollToMobileSection]);

  const handleReturnToGenerator = useCallback(() => {
    scrollToComposeSection();
  }, [scrollToComposeSection]);

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
      generationRequests.invalidate();
      setIsLoading(false);
      setBusyReplyIndex(null);
      setResult(null);
      setReplyHistory(createReplyHistory());
      setPreviousOutgoingMessage('');
      setCommitmentChoice(null);
      setContinueDialogReply(null);
      setComposeMode(nextMode);
      setDirectionField(null);
      setGoal(null);
      setRequestError(null);
      setHasTriedNoReplyContinue(false);
    },
    [composeMode, generationRequests],
  );

  const handleDirectionFieldChange = useCallback((field: DirectionField | null) => {
    setDirectionField(field);
    if (field === null || hasTrackedAdvancedOpenRef.current) return;
    hasTrackedAdvancedOpenRef.current = true;
    trackEvent('generator_advanced_open', {
      compose_mode: composeMode,
      flow_version: GENERATOR_FLOW_VERSION,
    });
  }, [composeMode]);

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
    setShowCustomNoReplyDuration(false);
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('');
    setHasTriedNoReplyContinue(false);
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
    setResultRequest(null);
    setReplyErrors({});
    setResultsError(null);
    setManualCopyIndex(null);
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
      init.signal?.throwIfAborted();
      const token = await getFreshAuthToken({ forceRefresh, allowSilentReauth: true });
      init.signal?.throwIfAborted();
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
        setShowAccount(false);
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
        setShowAccount(false);
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
      setShowAccount(false);
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

    setShowAccount(false);
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
      setShowAccount(false);
      setShowPaywall(true);
      setCheckoutSession(null);
      setCheckoutError('לפני תשלום צריך לשמור גישה עם אימייל, כדי שהרכישה לא תאבד.');
      await startAuthEmailLink('checkout', plan);
      return;
    }

    setShowAccount(false);
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

    if (activeConversationId !== profile.id) resetMessageDraft();

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
    resetMessageDraft();
    setContext(null);
    setTone('זורם');
    setActiveConversationId(null);
    setConversationNotice(null);
  }

  function openConversationMemory(profile: ConversationProfile) {
    if (activeConversationId !== profile.id) {
      resetMessageDraft();
      const defaults = resolveConversationDefaultsForAccess(profile.context, profile.tone, hasMonthlyFeatureAccess);
      setContext(defaults.context);
      setTone(defaults.tone);
    }
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
    if (payload.commitmentMode === 'provided' && !payload.commitmentDetails) {
      setRequestError('כתבו איזה מועד או מחיר אפשר להציע, או בחרו להמשיך בלי התחייבות.');
      scrollToComposeSection();
      window.requestAnimationFrame(() => document.getElementById('commitment-details')?.focus());
      return;
    }
    const request = generationRequests.begin();
    setReplyError(null);
    setContinueDialogReply(null);
    setCopiedReplyIndex(null);
    setHasCopiedAllReplies(false);
    setIsLoading(false);
    setBusyReplyIndex(null);
    setRequestError(null);
    setImageError(null);

    const generationMode = payload.action ? 'refine' : 'initial';
    const payloadComposeMode = payload.noReplyMode ? 'no_reply' : 'incoming';
    const payloadHasBackground = Boolean(payload.conversationBackground?.trim());
    const payloadHasLastOutgoing = Boolean(payload.lastOutgoingMessage?.trim());

    const requestedReplyIndex = options?.replyIndex;
    const isReplyUpdate = typeof requestedReplyIndex === 'number';
    const loadingStartedAt = isReplyUpdate ? null : window.performance.now();
    setResultsError(null);
    setManualCopyIndex(null);
    if (isReplyUpdate) {
      setReplyErrors((current) => { const next = { ...current }; delete next[requestedReplyIndex]; return next; });
    } else {
      setReplyErrors({});
    }

    if (isReplyUpdate) {
      setBusyReplyIndex(requestedReplyIndex);
    } else {
      setHasSentFirstGeneration(true);
      setIsLoading(true);

      if (isCompactViewport()) {
        setMobilePrimaryView('results');
        window.requestAnimationFrame(() => {
          if (!request.isCurrent()) return;
          scrollToMobileSection('results', { source: 'system' });
        });
      }
    }

    try {
      const response = await fetchWithAuth('/api/generate', {
        method: 'POST',
        signal: request.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Partial<GenerateResponse> & {
        error?: string;
        billing?: BillingSnapshot;
      };

      if (!request.isCurrent()) return;

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
        if (!result && isCompactViewport()) setMobilePrimaryView('compose');
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

      const replyIndex = requestedReplyIndex;

      if (typeof replyIndex !== 'number' && loadingStartedAt !== null) {
        const minimumLoadingTime = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : MIN_LOADING_DISPLAY_MS;
        const remainingLoadingTime = minimumLoadingTime - (window.performance.now() - loadingStartedAt);

        if (remainingLoadingTime > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingLoadingTime));
        }
      }

      if (!request.isCurrent()) return;

      personalizationActiveRef.current = data.personalizationApplied === true;
      if (data.savedConversationUnavailable === true) {
        setActiveConversationId(null);
        setConversationNotice('השיחה השמורה כבר לא זמינה, אז המשכנו בלי ההקשר שלה.');
        void refreshConversationProfiles();
      }

      if (typeof replyIndex === 'number') {
        if (payload.sourceReply?.trim() === nextReplies[0].trim()) {
          throw new Error('לא התקבל נוסח שונה. הנוסח הקודם נשמר; אפשר לבקש שינוי אחר.');
        }
        if (payload.sourceReply) {
          const before = payload.sourceReply;
          setReplyHistory((history) => request.isCurrent()
            ? recordReplyRefinement(history, replyIndex, before, nextReplies[0])
            : history);
        }
        setResult((currentResult) => {
          if (!request.isCurrent() || !currentResult) return currentResult;

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

      setReplyHistory(createReplyHistory());
      setResult({
        intent: nextIntent,
        replies: nextReplies.slice(0, 3),
      });
      setResultRequest({ ...payload });
      setCopiedReplyIndex(null);
      setHasCopiedAllReplies(false);

      if (payload.previousOutgoingMessage || payload.commitmentDetails) {
        setLastSuccessfulConversationDefaults(null);
      } else if (options?.normalDefaults) {
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
          if (!request.isCurrent()) return;
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
      if (!request.isCurrent()) return;
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
      const errorMessage = mapApiErrorMessage(
        error instanceof Error ? error.message : 'משהו השתבש. נסה שוב בעוד רגע.',
      );
      if (isReplyUpdate) {
        setReplyError({ index: requestedReplyIndex, message: errorMessage });
      } else {
        setRequestError(errorMessage);
      }

      if (!isReplyUpdate && isCompactViewport()) {
        setMobilePrimaryView('compose');
        window.requestAnimationFrame(() => {
          if (!request.isCurrent()) return;
          scrollToMobileSection('compose', { source: 'system' });
        });
      }
    } finally {
      if (request.isCurrent()) {
        setIsLoading(false);
        setBusyReplyIndex(null);
      }
    }
  }

  function getReplyContextForRequest(): ReplyContext {
    const hasCommitmentQuestion = !isNoReplyMode && getMissingCommitmentKind(message) !== null;
    const choice = commitmentChoice?.message === message ? commitmentChoice : null;
    return {
      languagePreferences,
      previousOutgoingMessage: !isNoReplyMode && previousOutgoingMessage ? previousOutgoingMessage : undefined,
      commitmentMode: hasCommitmentQuestion ? choice?.mode ?? 'ask' : undefined,
      commitmentDetails: hasCommitmentQuestion && choice?.mode === 'provided' ? choice.details.trim() : undefined,
    };
  }

  function getDraftRequest(): GenerationDraft {
    return {
      ...getReplyContextForRequest(),
      message: isNoReplyMode ? '' : message.trim().slice(0, MAX_INCOMING_MESSAGE_LENGTH),
      imageBase64: isNoReplyMode ? null : imageBase64,
      context: context ?? undefined,
      tone,
      goal: goal ?? undefined,
      continuePreference: isNoReplyMode ? null : continuePreference,
      conversationBackground: hasMonthlyFeatureAccess
        ? conversationBackground.trim().slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH) || undefined
        : undefined,
      noReplyMode: isNoReplyMode,
      noReplyDurationValue: isNoReplyMode ? Number.parseInt(noReplyDurationValue, 10) : undefined,
      noReplyDurationUnit: isNoReplyMode && noReplyDurationUnit ? noReplyDurationUnit : undefined,
      lastOutgoingMessage: isNoReplyMode
        ? lastOutgoingMessage.trim().slice(0, MAX_LAST_OUTGOING_MESSAGE_LENGTH)
        : undefined,
      conversationId: activeConversationId ?? undefined,
    };
  }

  async function handleMainSubmit() {
    if (isGenerating || !isSessionReady) return;
    const draft = getDraftRequest();
    const trimmedMessage = draft.message;
    const trimmedLastOutgoingMessage = draft.lastOutgoingMessage ?? '';
    const allowedConversationBackground = draft.conversationBackground;
    const parsedNoReplyDuration = draft.noReplyDurationValue;
    const effectiveContinuePreference = draft.continuePreference;

    if (isNoReplyMode) {
      setHasTriedNoReplyContinue(true);

      if (!trimmedLastOutgoingMessage) {
        setRequestError('כדי להמשיך צריך למלא מה שלחת בהודעה האחרונה.');
        scrollToComposeSection();
        window.requestAnimationFrame(() => lastOutgoingInputRef.current?.focus());

        return;
      }

      if (!hasValidNoReplyDuration) {
        setRequestError(
          `צריך לבחור זמן תקין בין 1 ל-${MAX_NO_REPLY_DURATION_VALUE} (${noReplyDurationUnitOptions
            .map((option) => option.label)
            .join('/')}).`,
        );
        scrollToComposeSection();
        setShowCustomNoReplyDuration(true);
        window.requestAnimationFrame(() => noReplyDurationInputRef.current?.focus());

        return;
      }

      if (!hasNoReplyDurationUnit) {
        setRequestError('בחרו יחידת זמן כדי להמשיך.');
        scrollToComposeSection();
        setShowCustomNoReplyDuration(true);
        window.requestAnimationFrame(() => noReplyDurationUnitRef.current?.focus());

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

    setDirectionField(null);
    await runGeneration(draft, {
      conversationIdForReuse: activeConversationId,
      normalDefaults: { context, tone },
    });
  }

  function getResultRequestForCurrentAccess(): GenerateRequest | null {
    if (!resultRequest) return null;
    const defaults = resolveConversationDefaultsForAccess(
      resultRequest.context ?? null, resultRequest.tone, hasMonthlyFeatureAccess,
    );
    return {
      ...resultRequest,
      context: defaults.context ?? undefined,
      tone: defaults.tone,
      conversationBackground: hasMonthlyFeatureAccess ? resultRequest.conversationBackground : undefined,
    };
  }

  async function handleReplyAction(index: number, action: ReplyAction) {
    if (!result?.replies[index] || !resultRequest || isGenerating) return;
    const request = getResultRequestForCurrentAccess();
    if (!request) return;
    trackEvent('refine_click', {
      action, index, context: request.context, tone: request.tone,
      goal: request.goal,
      compose_mode: request.noReplyMode ? 'no_reply' : 'incoming',
      continue_preference: request.continuePreference ?? 'unspecified',
      has_image: Boolean(request.imageBase64), has_text: Boolean(request.message.trim()),
      has_background: Boolean(request.conversationBackground), has_last_outgoing: Boolean(request.lastOutgoingMessage),
    });
    await runGeneration({ ...request, action, sourceReply: result.replies[index] }, { replyIndex: index });
  }

  async function handleCustomReplyAdjustment(index: number, refineInstruction: string) {
    if (!result?.replies[index] || !resultRequest || !refineInstruction.trim() || isGenerating) return;
    const request = getResultRequestForCurrentAccess();
    if (!request) return;
    trackEvent('custom_refine_submit', { index });
    await runGeneration({
      ...request,
      refineInstruction: refineInstruction.trim().slice(0, 220),
      action: 'retry',
      sourceReply: result.replies[index],
    }, { replyIndex: index });
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const request = imageRequests.begin();

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
      if (!request.isCurrent()) return;
      setImageBase64(nextImageBase64);
      setImageName(file.name);
      setImageError(null);
      markGeneratorInputStart('screenshot');
      trackEvent('screenshot_upload', {
        mime_type: file.type,
        file_size_bytes: file.size,
      });
    } catch (error) {
      if (!request.isCurrent()) return;
      setImageError(error instanceof Error ? error.message : 'טעינת התמונה נכשלה');
      setImageBase64(null);
      setImageName(null);
    }
  }

  function clearImage() {
    imageRequests.invalidate();
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
      setReplyErrors((current) => { const next = { ...current }; delete next[index]; return next; });
      setManualCopyIndex(null);
      setHasCopiedAllReplies(false);
      trackEvent('reply_copy', {
        flow_version: GENERATOR_FLOW_VERSION,
        index,
        context: resultRequest?.context,
        tone: resultRequest?.tone ?? 'זורם',
        has_saved_conversation: Boolean(resultRequest?.conversationId),
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
        flow_version: GENERATOR_FLOW_VERSION,
        index,
        context: resultRequest?.context ?? 'unspecified',
        tone: resultRequest?.tone ?? 'זורם',
        has_saved_conversation: Boolean(resultRequest?.conversationId),
        has_personalization: personalizationActiveRef.current,
      });
    } catch {
      setReplyErrors((current) => ({ ...current, [index]: 'ההעתקה לא הצליחה. אפשר לבחור את הטקסט ולהעתיק ידנית.' }));
      setManualCopyIndex(index);
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
      setReplyErrors((current) => { const next = { ...current }; delete next[index]; return next; });
      setManualCopyIndex(null);
      setHasCopiedAllReplies(false);
      trackEvent('reply_share', { index, method: 'clipboard_fallback' });
      void recordProductEvent('reply_copy', { index });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setReplyErrors((current) => ({ ...current, [index]: 'השיתוף לא הצליח. אפשר להעתיק את התשובה ידנית.' }));
      setManualCopyIndex(index);
    }
  }

  function handleReplyEdit(reply: string, index: number) {
    setCopiedReplyIndex(null);
    setHasCopiedAllReplies(false);
    const normalizedReply = reply.trim();

    if (!normalizedReply) {
      setReplyErrors((current) => ({ ...current, [index]: 'אי אפשר לשמור תשובה ריקה.' }));
      return false;
    }

    setReplyError(null);
    setReplyHistory((history) => clearReplyRevision(history, index));
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
    setReplyErrors((current) => { const next = { ...current }; delete next[index]; return next; });
    trackEvent('reply_edit', { index, length: normalizedReply.length });
    return true;
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
      setResultsError(null);
      trackEvent('reply_copy_all', {
        reply_count: result.replies.length,
        has_saved_conversation: Boolean(activeConversationId),
      });
      void recordProductEvent('reply_copy', { index: 'all' });
    } catch {
      setResultsError('העתקת כל התשובות לא הצליחה. אפשר להעתיק כל תשובה בנפרד או לבחור את הטקסט ידנית.');
    }
  }

  async function handleGenerateMoreReplies() {
    trackEvent('generate_more_click', {
      compose_mode: composeMode,
      access_state: accessState,
    });
    const request = getResultRequestForCurrentAccess();
    if (request && !isGenerating) await runGeneration(request);
  }

  function cancelPendingInput() {
    setReplyError(null);
    generationRequests.invalidate();
    imageRequests.invalidate();
    setIsLoading(false);
    setBusyReplyIndex(null);
    personalizationActiveRef.current = false;
    clearImage();
  }

  function handleNewMessage() {
    trackEvent('result_new_message', { compose_mode: composeMode });
    resetMessageDraft();
  }

  function resetMessageDraft() {
    cancelPendingInput();
    setReplyHistory(createReplyHistory());
    setPreviousOutgoingMessage('');
    setCommitmentChoice(null);
    setContinueDialogReply(null);
    setResult(null);
    setResultRequest(null);
    setReplyErrors({});
    setResultsError(null);
    setManualCopyIndex(null);
    setRequestError(null);
    setImageError(null);
    setImageBase64(null);
    setImageName(null);
    setMessage('');
    setLastOutgoingMessage('');
    setShowCustomNoReplyDuration(false);
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('');
    setHasTriedNoReplyContinue(false);
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
    setDirectionField(null);
    scrollToComposeSection();
  }

  function applyExample(scenario: ExampleScenario) {
    cancelPendingInput();
    setReplyHistory(createReplyHistory());
    setPreviousOutgoingMessage('');
    setCommitmentChoice(null);
    setContinueDialogReply(null);
    trackEvent('example_click', {
      example_id: scenario.id,
      context: scenario.context,
      tone: scenario.tone,
      continue_preference: scenario.continuePreference ?? 'unspecified',
    });

    setComposeMode('incoming');
    setDirectionField(null);
    setMessage(scenario.message.slice(0, MAX_INCOMING_MESSAGE_LENGTH));
    setLastOutgoingMessage('');
    setShowCustomNoReplyDuration(false);
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('');
    setHasTriedNoReplyContinue(false);
    setConversationBackground('');
    setContext(scenario.context);
    setTone(scenario.tone);
    setGoal(scenario.goal ?? null);
    setContinuePreference(scenario.continuePreference ?? null);
    setShowDeepLinkPrefillBanner(false);
    setRequestError(null);
    setResult(null);
    setResultRequest(null);
    setReplyErrors({});
    setResultsError(null);
    setManualCopyIndex(null);
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

  function handleRestoreReply(index: number) {
    if (!result || isGenerating) return;
    const previous = getPreviousReply(replyHistory, index, result.replies[index]);
    if (previous === null) return;
    setResult((current) => {
      if (!current) return current;
      const replies = [...current.replies];
      replies[index] = previous;
      return { ...current, replies };
    });
    setReplyError(null);
    setReplyHistory((history) => clearReplyRevision(history, index));
    setCopiedReplyIndex(null);
    setHasCopiedAllReplies(false);
  }

  function handleContinueConversation(sentMessage: string, incomingMessage: string) {
    cancelPendingInput();
    setComposeMode('incoming');
    setDirectionField(null);
    setPreviousOutgoingMessage(sentMessage);
    setMessage(incomingMessage);
    setCommitmentChoice(null);
    setResult(null);
    setReplyHistory(createReplyHistory());
    setContinueDialogReply(null);
    setLastOutgoingMessage('');
    setShowCustomNoReplyDuration(false);
    setNoReplyDurationValue('');
    setNoReplyDurationUnit('');
    setConversationBackground('');
    setGoal(null);
    setContinuePreference(null);
    setRequestError(null);
    setCopiedReplyIndex(null);
    setHasCopiedAllReplies(false);
    setLastSuccessfulConversationDefaults(null);
    setMobilePrimaryView('compose');
    scrollToComposeSection();
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
    setCommitmentChoice(null);

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

  const draftRequest = getDraftRequest();
  const resultIsStale = resultRequest !== null && !areGenerationDraftsEqual(draftRequest, resultRequest);
  const usageActionHint = hasUnlimitedAccess ? 'כלול בגישה שלך' : 'שימוש אחד';

  return (
    <main
      dir="rtl"
      className="sb-experience min-h-screen overflow-x-clip bg-[#fff9ef] px-3 pb-24 pt-3 text-right text-[#181411] sm:px-6 sm:pt-6 lg:pb-6"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5">
        {isGeneratorPrimaryMode ? (
          <ConversationHeader onOpenAccount={() => setShowAccount(true)} />
        ) : (
          <HomeHero
            onStart={handleHeroStartUsingClick}
            ctaLabel={heroGenerateCtaLabel}
            accountStatusLine={accountStatusLine}
          />
        )}

        <section className="sb-workspace grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-5">
          {hasHydrated && canShowMobileResults ? (
            <div className="sb-mobile-switch lg:hidden">
              <button
                type="button"
                onClick={handleReturnToGenerator}
                aria-pressed={mobilePrimaryView === 'compose'}
                className={[
                  `min-h-[42px] flex-1 rounded-[14px] px-3 py-2 text-sm font-semibold transition ${lightSurfaceFocusClass}`,
                  mobilePrimaryView === 'compose'
                    ? 'bg-[#181411] text-white shadow-[0_8px_18px_rgba(24,20,17,0.16)]'
                    : 'bg-transparent text-[#5b4d42]',
                ].join(' ')}
              >
                עריכת ההודעה
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
                  `min-h-[42px] flex-1 rounded-[14px] px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${lightSurfaceFocusClass}`,
                  mobilePrimaryView === 'results'
                    ? 'bg-[#181411] text-white shadow-[0_8px_18px_rgba(24,20,17,0.16)]'
                    : 'bg-transparent text-[#5b4d42]',
                ].join(' ')}
              >
                התשובות
              </button>
            </div>
          ) : null}

          <div
            ref={composeSectionRef}
            id="compose-section"
            className={[
              'sb-compose-panel sb-motion-panel mobile-section-anchor w-full min-w-0 rounded-[28px] border border-[#e2d7c8] bg-[#fffdfa] shadow-[0_20px_55px_rgba(49,23,13,0.1)] sm:rounded-[32px]',
              isGeneratorPrimaryMode ? 'space-y-3 p-2.5 sm:p-4' : 'space-y-4 p-4 sm:p-5',
              mobilePrimaryView === 'compose' ? 'block' : 'hidden lg:block',
            ].join(' ')}
          >
            {!isGeneratorPrimaryMode ? <div className="min-w-0 space-y-2">
              <p className="inline-flex min-h-[32px] items-center rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#8f371e] lg:hidden">
                {mobileSectionNavItems[0].stepLabel}
              </p>
              <h2 className="text-2xl font-semibold text-[#181411] sm:text-3xl">מדביקים הודעה. מקבלים ניסוח מוכן.</h2>
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
              <p className="text-sm font-semibold text-[#241d18]">{mobileComposeHelper.title}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-[#5b4d42]">{mobileComposeHelper.body}</p>
            </div> : null}

            {showDeepLinkPrefillBanner ? (
              <div className="flex w-full min-w-0 flex-col gap-2 rounded-[22px] border border-[#b8e7df] bg-[#e3fbf7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-[#123a36]">{DEEP_LINK_PREFILL_BANNER_TEXT}</p>
                <button
                  type="button"
                  onClick={() => setShowDeepLinkPrefillBanner(false)}
                  className={`min-h-[38px] rounded-full border border-[#b8e7df] bg-white px-3 py-1 text-xs font-semibold text-[#123a36] ${lightSurfaceFocusClass}`}
                >
                  סגור
                </button>
              </div>
            ) : null}

            {!isGeneratorPrimaryMode ? <div className="w-full min-w-0 space-y-2 rounded-[22px] border border-[#e2d7c8] bg-[#f8f3eb] p-3 sm:hidden">
              <p className="text-sm font-semibold text-[#241d18]">להתחיל מדוגמה מוכנה</p>
              <p className="text-xs font-bold leading-5 text-[#6d6259]">
                בחרו אחת מהדוגמאות ונמלא את הטופס אוטומטית.
              </p>
              <div className="snap-x scrollbar-none flex gap-2 overflow-x-auto pb-1">
                {examples.map((scenario) => (
                  <button
                    key={`mobile-example-${scenario.title}`}
                    type="button"
                    onClick={() => applyExample(scenario)}
                    className={`snap-start whitespace-nowrap rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#241d18] ${lightSurfaceFocusClass}`}
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

            <div className="w-full min-w-0 space-y-4">
              {isGeneratorPrimaryMode ? (
                <div className="sb-compose-mode">
                  <p className="min-w-0 text-sm font-semibold text-[#241d18]">
                    {isNoReplyMode ? 'כותבים הודעת המשך' : 'עונים להודעה שקיבלת'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleComposeModeChange(isNoReplyMode ? 'incoming' : 'no_reply')}
                    className={`min-h-[44px] shrink-0 rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1.5 text-xs font-semibold text-[#7a2d19] transition hover:bg-[#ffe3da] ${lightSurfaceFocusClass}`}
                  >
                    {isNoReplyMode ? 'לענות להודעה שקיבלתי' : 'לשלוח הודעת המשך'}
                  </button>
                </div>
              ) : (
              <div className="rounded-[20px] border border-[#e4d8c8] bg-[#f8f3eb] p-3">
                <p className="text-sm font-semibold text-[#241d18]">איך ממשיכים מכאן?</p>
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
                        <span className="block text-sm font-semibold">{option.label}</span>
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
                <div className="sb-input-zone sb-motion-panel space-y-3">
                  <div>
                    <label htmlFor="last-outgoing-message" className="text-sm font-semibold text-[#241d18]">
                      מה שלחת לאחרונה? <span aria-hidden="true" className="text-[#c23318]">*</span>
                    </label>
                    <p className="text-xs font-bold text-[#6d6259]">
                      מדביקים את ההודעה ששלחת ושעדיין לא קיבלה תשובה.
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
                    required
                    aria-invalid={hasTriedNoReplyContinue && !trimmedLastOutgoingMessage}
                    aria-describedby={hasTriedNoReplyContinue && !trimmedLastOutgoingMessage ? 'last-outgoing-error' : undefined}
                    className={`min-h-32 w-full rounded-[22px] border bg-white px-4 py-4 text-base leading-7 font-medium text-[#241d18] outline-none transition placeholder:text-[#9b8f83] focus:-translate-y-0.5 focus:bg-[#fffdfa] ${hasTriedNoReplyContinue && !trimmedLastOutgoingMessage ? 'border-[#c23318]' : 'border-[#ded2c3]'} ${lightSurfaceFocusClass}`}
                  />
                  {hasTriedNoReplyContinue && !trimmedLastOutgoingMessage ? (
                    <p id="last-outgoing-error" className="text-xs font-bold text-[#b42318]" role="alert">
                      כתבו את ההודעה האחרונה ששלחתם כדי להמשיך.
                    </p>
                  ) : null}
                  <p className="text-xs font-bold text-[#6d6259]">
                    עד {MAX_LAST_OUTGOING_MESSAGE_LENGTH} תווים ({lastOutgoingMessageLength}/
                    {MAX_LAST_OUTGOING_MESSAGE_LENGTH}).
                  </p>

                  <fieldset className="rounded-2xl border border-[#e2d7c8] bg-[#faf7f2] p-3 sm:p-4">
                    <legend
                      className="text-sm font-semibold text-[#241d18]"
                    >
                      כמה זמן עבר מאז ששלחת? <span aria-hidden="true" className="text-[#c23318]">*</span>
                    </legend>
                    <p className="text-xs leading-5 text-[#6d6259]">גם בערך זה בסדר.</p>
                    <div className="sb-duration-presets">
                      {noReplyDurationPresets.map((preset) => {
                        const selected = !showCustomNoReplyDuration && noReplyDurationValue === preset.value && noReplyDurationUnit === preset.unit;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setNoReplyDurationValue(preset.value);
                              setNoReplyDurationUnit(preset.unit);
                              setShowCustomNoReplyDuration(false);
                              setHasTriedNoReplyContinue(false);
                            }}
                            className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold transition ${selected ? 'border-[#ff5a2a] bg-[#fff0ea] text-[#7a2d19] ring-1 ring-[#ff5a2a]' : 'border-[#ded2c3] bg-white text-[#241d18] hover:border-[#b89c83]'} ${lightSurfaceFocusClass}`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      aria-expanded={showCustomNoReplyDuration}
                      aria-controls="no-reply-custom-duration"
                      onClick={() => {
                        setShowCustomNoReplyDuration(true);
                        setHasTriedNoReplyContinue(false);
                      }}
                      className={`mt-1 min-h-[44px] rounded-lg px-1 text-xs font-semibold text-[#6d6259] underline underline-offset-4 ${lightSurfaceFocusClass}`}
                    >
                      זמן אחר
                    </button>
                    {showCustomNoReplyDuration ? (
                    <div id="no-reply-custom-duration" className="mt-1 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] gap-2">
                      <input
                        id="no-reply-duration-value"
                        ref={noReplyDurationInputRef}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_NO_REPLY_DURATION_VALUE}
                        value={noReplyDurationValue}
                        onChange={(event) => {
                          setHasTriedNoReplyContinue(false);
                          setNoReplyDurationValue(
                            event.target.value
                              .replace(/[^\d]/g, '')
                              .slice(0, String(MAX_NO_REPLY_DURATION_VALUE).length),
                          );
                        }}
                        aria-label="מספר יחידות זמן"
                        placeholder="למשל 3"
                        required
                        aria-invalid={(hasTriedNoReplyContinue || noReplyDurationValue.length > 0) && !hasValidNoReplyDuration}
                        aria-describedby={(hasTriedNoReplyContinue || noReplyDurationValue.length > 0) && !hasValidNoReplyDuration ? 'no-reply-duration-error' : undefined}
                        className={`min-h-[44px] w-full rounded-xl border bg-white px-3 py-2 text-sm font-bold text-[#241d18] outline-none transition focus:bg-[#fffdfa] ${(hasTriedNoReplyContinue || noReplyDurationValue.length > 0) && !hasValidNoReplyDuration ? 'border-[#c23318]' : 'border-[#ded2c3]'} ${lightSurfaceFocusClass}`}
                      />
                      <select
                        id="no-reply-duration-unit"
                        ref={noReplyDurationUnitRef}
                        aria-label="יחידת זמן ללא תשובה"
                        value={noReplyDurationUnit}
                        onChange={(event) => {
                          setHasTriedNoReplyContinue(false);
                          setNoReplyDurationUnit(event.target.value as NoReplyDurationUnitSelection);
                        }}
                        required
                        aria-invalid={hasTriedNoReplyContinue && !hasNoReplyDurationUnit}
                        aria-describedby={hasTriedNoReplyContinue && !hasNoReplyDurationUnit ? 'no-reply-duration-unit-error' : undefined}
                        className={`min-h-[44px] w-full rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-[#241d18] outline-none transition focus:bg-[#fffdfa] ${hasTriedNoReplyContinue && !hasNoReplyDurationUnit ? 'border-[#c23318]' : 'border-[#ded2c3]'} ${lightSurfaceFocusClass}`}
                      >
                        <option value="" disabled>בחרו יחידת זמן</option>
                        {noReplyDurationUnitOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    ) : null}
                    {(hasTriedNoReplyContinue || noReplyDurationValue.length > 0) && !hasValidNoReplyDuration ? (
                      <p id="no-reply-duration-error" className="mt-2 text-xs font-bold text-[#b42318]" role="alert">
                        הזינו מספר שלם בין 1 ל־{MAX_NO_REPLY_DURATION_VALUE}.
                      </p>
                    ) : null}
                    {hasTriedNoReplyContinue && !hasNoReplyDurationUnit ? (
                      <p id="no-reply-duration-unit-error" className="mt-2 text-xs font-bold text-[#b42318]" role="alert">
                        בחרו דקות, שעות או ימים.
                      </p>
                    ) : null}
                  </fieldset>
                </div>
              ) : (
                <div className="sb-input-zone sb-motion-panel space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <label htmlFor="incoming-message" className="text-sm font-semibold text-[#241d18]">
                        מה כתבו לך?
                      </label>
                      <p className="text-[11px] font-bold text-[#6d6259]">מדביקים טקסט או מצרפים צילום.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`min-h-[44px] shrink-0 rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#241d18] transition hover:bg-[#f8f3eb] ${lightSurfaceFocusClass}`}
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
                    aria-describedby="incoming-message-help"
                    className={`sb-message-input min-h-28 w-full resize-none rounded-[22px] rounded-bl-[14px] border border-[#ded2c3] bg-white px-4 py-3 text-base leading-7 font-medium text-[#241d18] outline-none transition placeholder:text-[#9b8f83] focus:bg-[#fffdfa] sm:min-h-40 sm:py-4 ${lightSurfaceFocusClass}`}
                  />
                  <div className="sb-input-footer" id="incoming-message-help">
                    <span>טקסט קצר או תמונה עד 4MB</span>
                    <span dir="ltr">{messageLength}/{MAX_INCOMING_MESSAGE_LENGTH}</span>
                  </div>
                  {!message.trim() && !imageBase64 ? (
                    <div className="sb-inline-examples">
                      <span>אפשר להתחיל מדוגמה:</span>
                      {examples.filter((item) => item.id !== 'ex-check-in').map((scenario) => (
                        <button type="button" key={scenario.id} onClick={() => applyExample(scenario)}>{scenario.context === 'קראש' ? 'שיחה אישית' : scenario.context === 'לקוח' ? 'הודעה מלקוח' : 'קנייה ומכירה'}</button>
                      ))}
                    </div>
                  ) : null}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />

                  {imageName && imageBase64 ? (
                    <div className="flex items-center gap-3 rounded-xl border border-[#ded2c3] p-3">
                      <Image src={imageBase64} alt="תצוגה מקדימה של צילום המסך" width={72} height={88} unoptimized className="h-22 w-18 shrink-0 rounded-lg object-contain" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{imageName}</p>
                        <div className="mt-1 flex gap-3 text-sm">
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="min-h-11 underline underline-offset-4">החלפת צילום</button>
                          <button type="button" onClick={clearImage} className="min-h-11 underline underline-offset-4">הסרת צילום</button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <p className="sb-status">ההודעה משמשת להכנת התשובות. <a href="/privacy" className="underline underline-offset-2">על הפרטיות</a></p>

                  {imageError ? <p role="alert" className="sb-error">{imageError}</p> : null}
                </div>
              )}

              {!isNoReplyMode && previousOutgoingMessage ? (
                <details className="rounded-2xl border border-[#b8e7df] bg-[#f0faf7] p-3">
                  <summary className={`min-h-11 cursor-pointer py-2 text-sm font-bold text-[#123a36] ${lightSurfaceFocusClass}`}>בהמשך למה ששלחת · הקשר זמני</summary>
                  <p dir="auto" className="whitespace-pre-wrap text-start text-sm leading-6 text-[#463b33] [overflow-wrap:anywhere]">{previousOutgoingMessage}</p>
                  <button type="button" onClick={() => setPreviousOutgoingMessage('')} className={`mt-2 min-h-11 rounded-xl px-3 text-xs font-bold underline ${lightSurfaceFocusClass}`}>להמשיך בלי ההקשר הקודם</button>
                </details>
              ) : null}

              {!isNoReplyMode && getMissingCommitmentKind(message) ? (
                <CommitmentControls
                  kind={getMissingCommitmentKind(message)!}
                  mode={commitmentChoice?.message === message ? commitmentChoice.mode : 'ask'}
                  details={commitmentChoice?.message === message ? commitmentChoice.details : ''}
                  onChange={(mode, details) => setCommitmentChoice({ message, mode, details })}
                />
              ) : null}
              <ReplyDirectionControls
                openField={directionField}
                onOpenFieldChange={handleDirectionFieldChange}
                tone={tone}
                onToneChange={(value) => {
                  trackEvent('tone_select', { value });
                  setTone(value);
                }}
                context={context}
                onContextChange={(value) => {
                  if (value) trackEvent('situation_select', { value });
                  setContext(value);
                }}
                goal={goal}
                onGoalChange={(value) => {
                  if (value) trackEvent('goal_select', { value, compose_mode: composeMode });
                  setGoal(value);
                }}
                continuePreference={continuePreference}
                onContinuePreferenceChange={(value) => {
                  if (value) trackEvent('agrees_select', { value });
                  setContinuePreference(value);
                }}
                languagePreferences={languagePreferences}
                onLanguagePreferencesChange={setLanguagePreferences}
                conversationBackground={conversationBackground}
                onBackgroundChange={setConversationBackground}
                isNoReplyMode={isNoReplyMode}
                showMonthlyOptions={shouldShowMonthlyFeatureOptions}
                hasMonthlyFeatureAccess={hasMonthlyFeatureAccess}
                isBillingLoading={isBillingLoading}
                onUpgrade={openPaywall}
              />

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleMainSubmit}
                  disabled={isGenerating || !isSessionReady || (isNoReplyMode && !isNoReplyReady)}
                  className={`sb-primary-button inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[#ff5a2a] px-5 py-3 text-base font-semibold text-white shadow-[0_14px_26px_rgba(255,90,42,0.24)] transition duration-150 hover:bg-[#f04d1f] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${lightSurfaceFocusClass}`}
                >
                  {generateButtonLabel}
                </button>
                <p className="sb-status">{accountStatusLine}</p>
                {paymentNotice ? (
                  <p className="rounded-2xl border border-[#b8e7df] bg-[#e3fbf7] px-4 py-3 text-sm font-semibold text-[#123a36]">
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

          </div>

          <div
            ref={resultsSectionRef}
            id="results-section"
            className={[
              'sb-results-panel sb-motion-panel mobile-section-anchor w-full min-w-0 space-y-4 rounded-[28px] border border-[#d3e4df] bg-white p-3.5 shadow-[0_20px_55px_rgba(18,58,54,0.1)] sm:rounded-[32px] sm:p-5',
              mobilePrimaryView === 'results' ? 'block' : 'hidden lg:block',
            ].join(' ')}
          >
            {result || isLoading ? (
              <div>
                <p className="sb-status">מכאן, המילים שלכם</p>
                <h2 className="text-2xl font-bold">התשובות שלך</h2>
                <p className="sb-status mt-1">בחרו מה מתאים לכם. אפשר לערוך לפני ששולחים.</p>
              </div>
            ) : null}
            {result && resultIsStale ? <p className="sb-draft-notice" role="status">ההודעה או ההעדפות השתנו. התשובות כאן עדיין שייכות לבקשה הקודמת; צרו תשובות חדשות כדי לעדכן.</p> : null}
            {resultsError ? <p className="sb-error" role="alert">{resultsError}</p> : null}

            {isGeneratorPrimaryMode && mobilePrimaryView === 'results' && Boolean(result) && !isGenerating ? (
              <div className="lg:hidden">
                <button
                  type="button"
                  aria-controls="compose-section"
                  onClick={handleReturnToGenerator}
                  className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#e2d7c8] bg-[#fffdfa]/95 px-4 py-2 text-sm font-black text-[#241d18] transition hover:border-[#ffb29f] hover:bg-white ${lightSurfaceFocusClass}`}
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
                    <p className="text-xs font-semibold tracking-[0.08em] text-[#7a6e64]">
                      {resultRequest?.noReplyMode ? 'הכיוון להודעת ההמשך' : 'הכיוון לשיחה'}
                    </p>
                    <p className="mt-1.5 text-base font-bold leading-6 text-[#241d18]">{result.intent}</p>
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
                      error={replyErrors[index]}
                      manualCopy={manualCopyIndex === index}
                      usageHint={usageActionHint}
                      onCopy={handleCopy}
                      onShare={handleShare}
                      onAdjust={handleReplyAction}
                      onCustomAdjust={handleCustomReplyAdjustment}
                      onEdit={handleReplyEdit}
                      previousReply={getPreviousReply(replyHistory, index, reply)}
                      refineError={replyError?.index === index ? replyError.message : null}
                      onRestore={handleRestoreReply}
                      onContinue={setContinueDialogReply}
                    />
                  ))}
                </div>
                  <div className="sb-result-toolbar">
                      <button
                        type="button"
                        onClick={handleCopyAllReplies}
                        className={`min-h-[40px] rounded-full border border-[#ded2c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#241d18] transition hover:bg-[#fffdfa] ${whiteSurfaceFocusClass}`}
                      >
                        {hasCopiedAllReplies ? 'הכל הועתק' : 'העתק הכל'}
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateMoreReplies}
                        disabled={isGenerating}
                        className={`min-h-[40px] rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1.5 text-xs font-semibold text-[#7a2d19] transition disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
                      >
                        עוד 3 תשובות · {usageActionHint}
                      </button>
                      <button
                        type="button"
                        onClick={handleNewMessage}
                        disabled={isGenerating}
                        className={`min-h-[40px] rounded-full border border-[#b8e7df] bg-[#e3fbf7] px-3 py-1.5 text-xs font-semibold text-[#123a36] transition hover:bg-[#cef6ef] ${whiteSurfaceFocusClass}`}
                      >
                        הודעה חדשה
                      </button>
                  </div>
                <div className="rounded-2xl border border-[#e2d7c8] bg-[#fffdf8] px-3 py-2.5 text-sm">
                  {activeConversation ? (
                    <p className="font-semibold text-[#5b4d42]">ממשיכים עם {activeConversation.label}</p>
                  ) : lastSuccessfulConversationDefaults ? (
                    <div>
                      <p className="mb-2 text-center text-xs font-bold text-[#6d6259]">מדברים שוב עם אותו אדם?</p>
                      <button
                        type="button"
                        onClick={openConversationSave}
                        className={[
                          `min-h-[42px] w-full rounded-full border px-3 py-2 text-sm font-semibold transition ${whiteSurfaceFocusClass}`,
                          copiedReplyIndex !== null || hasCopiedAllReplies
                            ? 'border-[#ff9c83] bg-[#fff0ea] text-[#7a2d19]'
                            : 'border-[#ded2c3] bg-white text-[#5b4d42] hover:border-[#ffb29f] hover:text-[#7a2d19]',
                        ].join(' ')}
                      >
                        לשמור לפעם הבאה
                      </button>
                    </div>
                  ) : null}
                </div>
                </div>
              ) : isLoading ? (
                <LoadingReplies isNoReplyMode={isNoReplyMode} />
              ) : (
                <ConversationDemo />
              )}
            </div>
          </div>
        </section>

        {isGeneratorPrimaryMode ? <ConversationGuide billingBypassEnabled={billingBypassEnabled} /> : !hasSentFirstGeneration ? <QuickStartStrip /> : null}

        {!billingBypassEnabled ? (
          <section ref={plansSectionRef} id="plans-section" className="sb-pricing mobile-section-anchor">
            <p className="sb-status">מתחילים בחינם. ממשיכים כשמתאים.</p>
            <h2 className="mt-2 text-3xl font-bold">עוד שיחות, פחות התלבטויות.</h2>
            <p className="sb-status mt-2">3 שימושים ראשונים בחינם, ואחריהם שימוש חינם בכל יום. בכל יצירה מקבלים 3 תשובות.</p>
            <div className="sb-pricing-grid">
              <article className="sb-plan">
                <p className="sb-status">לשיחות שבאות מדי פעם</p>
                <h3 className="mt-2 text-xl font-bold">50 שימושים</h3>
                <p className="sb-plan-price my-4 text-3xl font-bold">{CREDIT_PLAN_COPY.price} <span className="text-sm font-normal">חד־פעמי</span></p>
                <p className="text-sm leading-7">עד 150 תשובות, בלי מנוי. כולל את הסגנונות והסיטואציות הבסיסיים.</p>
                <button type="button" className="sb-primary-button mt-5 w-full px-4" disabled={checkoutPlan !== null || !isSessionReady} onClick={() => handleCheckout('credits_50')}>לקנות 50 שימושים</button>
              </article>
              <article className="sb-plan sb-plan-monthly">
                <p className="sb-status">למי שתמיד יש מה לענות</p>
                <h3 className="mt-2 text-xl font-bold">ללא הגבלה</h3>
                <p className="sb-plan-price my-4 text-3xl font-bold">{UNLIMITED_PLAN_COPY.price} <span className="text-sm font-normal">לחודש</span></p>
                <p className="text-sm leading-7">כולל סגנונות וסיטואציות מורחבים ורקע נוסף לשיחה. מתחדש מדי חודש; ניהול החידוש דרך החשבון.</p>
                <button type="button" className="sb-primary-button mt-5 w-full px-4" disabled={checkoutPlan !== null || !isSessionReady || hasMonthlyFeatureAccess} onClick={() => handleCheckout('unlimited_monthly')}>{hasMonthlyFeatureAccess ? 'המנוי שלך פעיל' : 'לבחור מסלול חודשי'}</button>
              </article>
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
                <p className="inline-flex min-h-[32px] items-center rounded-full border border-[#ffc4b5] bg-[#fff0ea] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#7a2d19] lg:hidden">
                  {mobileSectionNavItems[2].stepLabel}
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a45334]">דוגמאות פתיחה</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#181411] sm:text-3xl">4 מצבים שמכירים מהחיים</h2>
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


      {continueDialogReply !== null ? (
        <ContinueConversationDialog suggestedReply={continueDialogReply} onCancel={() => setContinueDialogReply(null)} onContinue={handleContinueConversation} />
      ) : null}
      <AccountDialog open={showAccount} onClose={() => setShowAccount(false)}>
        <div className="sb-account-content space-y-4">
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
                billingBypassEnabled={billingBypassEnabled}
                compact
                className="shadow-none"
              />
          {!billingBypassEnabled ? <>
            {hasMonthlyFeatureAccess || managedSubscription ? <SubscriptionManagementPanel
                  subscription={managedSubscription}
                  isLoading={isSubscriptionLoading || isSubscriptionActionLoading}
                  isSessionReady={isSessionReady}
                  onAction={handleSubscriptionAction}
                  actionError={subscriptionActionError}
                  actionNotice={subscriptionActionNotice}
                /> : null}
            <details className="rounded-xl border border-[#ded2c3] bg-white p-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">יש לכם קופון?</summary>
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
            </details>
            <button type="button" onClick={() => { setShowAccount(false); openPaywall(); }} className="sb-primary-button w-full px-4">לצפייה במסלולים</button>
          </> : null}
          <button type="button" onClick={() => { setShowAccount(false); openConversationManagement(); }} className="min-h-11 w-full rounded-xl border border-[#ded2c3] px-4 text-sm">ניהול אנשים שמורים</button>
        </div>
      </AccountDialog>

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
