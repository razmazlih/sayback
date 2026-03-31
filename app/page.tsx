'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckoutPaymentForm } from '@/components/checkout-payment-form';
import { trackEvent } from '@/lib/analytics';
import { FirebaseClientConfigError, getFirebaseClientAuth, isFirebaseClientConfigured } from '@/lib/firebase-client';
import {
  CREDIT_PACK_MAX_REPLIES,
  CREDIT_PACK_PRICE_LABEL,
  CREDIT_PACK_REPLIES_PER_USE,
  CREDIT_PACK_USES,
} from '@/lib/pricing';
import { onIdTokenChanged, signInAnonymously } from 'firebase/auth';

type ContextOption = 'קראש' | 'אקס' | 'לקוח' | 'בוס' | 'יד2';
type ToneOption = 'עדין' | 'ישיר' | 'זורם' | 'מצחיק' | 'פלרטטני';
type ContinuePreference = 'כן' | 'לא';
type ReplyAction = 'softer' | 'sharper' | 'retry';
type CheckoutPlan = 'credits_50' | 'unlimited_monthly';
type PaidPlan = CheckoutPlan | null;
type MobileSectionId = 'compose' | 'results' | 'examples' | 'plans';
type MobileNavSectionId = Exclude<MobileSectionId, 'plans'>;

type ExampleScenario = {
  title: string;
  message: string;
  context: ContextOption;
  tone: ToneOption;
  continuePreference?: ContinuePreference | null;
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
  accessState: 'free' | 'credits' | 'unlimited' | 'blocked';
};

type CheckoutSessionState = {
  clientSecret: string;
  sessionId: string;
  plan: CheckoutPlan;
};

const FREE_LIMIT = 3;
const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const AUTH_ERROR_MESSAGE = 'לא הצלחנו לזהות משתמש. רענן את הדף ונסה שוב.';
const CREDIT_PACK_TITLE = `${CREDIT_PACK_USES} שימושים (עד ${CREDIT_PACK_MAX_REPLIES} תשובות)`;
const CREDIT_PACK_DESCRIPTION = `${CREDIT_PACK_REPLIES_PER_USE} תשובות בכל שימוש. תשלום חד-פעמי, בלי התחייבות.`;
const CREDIT_PACK_CTA = `לקנות ${CREDIT_PACK_USES} שימושים`;

const contextOptions: ContextOption[] = ['קראש', 'אקס', 'לקוח', 'בוס', 'יד2'];
const toneOptions: ToneOption[] = ['עדין', 'ישיר', 'זורם', 'מצחיק', 'פלרטטני'];
const continuePreferenceOptions: ContinuePreference[] = ['כן', 'לא'];
const mobileSectionNavItems: Array<{ id: MobileNavSectionId; label: string; stepLabel: string }> = [
  { id: 'compose', label: 'כתיבה', stepLabel: 'שלב 1' },
  { id: 'results', label: 'תשובות', stepLabel: 'שלב 2' },
  { id: 'examples', label: 'דוגמאות', stepLabel: 'שלב 3' },
];

const examples: ExampleScenario[] = [
  {
    title: 'קראש שפתאום נזכר',
    message: 'היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך',
    context: 'קראש',
    tone: 'פלרטטני',
    continuePreference: 'כן',
  },
  {
    title: 'אקס שבודק דופק',
    message: 'וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?',
    context: 'אקס',
    tone: 'ישיר',
    continuePreference: 'לא',
  },
  {
    title: 'לקוח שרוצה הנחה',
    message: 'ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו',
    context: 'לקוח',
    tone: 'עדין',
    continuePreference: 'כן',
  },
  {
    title: 'יד2 קלאסי',
    message: 'אחרון כמה? בא לקחת היום אם יש מחיר טוב',
    context: 'יד2',
    tone: 'זורם',
    continuePreference: 'כן',
  },
];

const focusRingBaseClass =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6ce8ff] focus-visible:ring-offset-2';
const lightSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#fff9ef]`;
const whiteSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-white`;
const darkSurfaceFocusClass = `${focusRingBaseClass} focus-visible:ring-offset-[#111111]`;

function isCheckoutPlan(value: string | null): value is CheckoutPlan {
  return value === 'credits_50' || value === 'unlimited_monthly';
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

function ChipGroup<T extends string>({
  title,
  description,
  options,
  value,
  onChange,
  helperText,
  optional = false,
  allowEmpty = false,
}: {
  title: string;
  description?: string;
  options: readonly T[];
  value: T | null;
  onChange: (nextValue: T | null) => void;
  helperText?: string;
  optional?: boolean;
  allowEmpty?: boolean;
}) {
  const hasSelection = value !== null;

  return (
    <section className="rounded-[22px] border-2 border-black bg-white p-3 shadow-[0_4px_0_0_#111111] sm:p-3.5">
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

      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {options.map((option) => {
          const isSelected = option === value;

          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(allowEmpty && isSelected ? null : option)}
              className={[
                `min-h-[40px] w-full rounded-full border-2 px-3.5 py-2 text-sm font-bold transition duration-150 touch-manipulation sm:min-h-[42px] sm:w-auto ${whiteSurfaceFocusClass}`,
                isSelected
                  ? 'border-black bg-[#111111] text-[#f7ff4f] shadow-[0_6px_0_0_#ff623d]'
                  : 'border-black bg-[#fffdf8] text-black hover:-translate-y-0.5 hover:bg-[#fff8da]',
              ].join(' ')}
            >
              {option}
            </button>
          );
        })}
      </div>

      {helperText ? (
        <p className="mt-1 hidden text-xs font-bold leading-5 text-neutral-600 md:block">{helperText}</p>
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
      className={`group flex min-h-44 w-full flex-col justify-between rounded-[28px] border-2 border-black bg-[#fff6d8] p-5 text-right shadow-[0_10px_0_0_#111111] transition duration-200 hover:-translate-y-1 hover:bg-[#f7ff4f] touch-manipulation ${darkSurfaceFocusClass}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs font-black text-neutral-700">
          <span className="rounded-full border border-black bg-white px-3 py-1">
            {scenario.context}
          </span>
          <span>{scenario.tone}</span>
        </div>
        <h3 className="text-lg font-black text-black">{scenario.title}</h3>
        <p className="text-sm leading-6 text-neutral-800">
          &quot;{scenario.message}&quot;
        </p>
      </div>
      <span className="mt-4 text-sm font-black text-black">להכניס לטופס</span>
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
    <article className="relative overflow-hidden rounded-[26px] border-2 border-black bg-white p-3.5 shadow-[0_8px_0_0_#111111] sm:rounded-[28px] sm:p-4 sm:shadow-[0_10px_0_0_#111111]">
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

        <details className="group min-w-[11rem] flex-1 rounded-[20px] border-2 border-dashed border-black bg-[#fff6d8] open:bg-[#fff2bf]">
          <summary
            className={`flex min-h-[42px] cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-right text-sm font-black text-black marker:content-none ${whiteSurfaceFocusClass}`}
          >
            <span>עוד כיוונונים</span>
            <span className="text-xs transition-transform duration-200 group-open:rotate-180">⌄</span>
          </summary>

          <div className="flex flex-wrap gap-1.5 px-2.5 pb-2.5">
            <button
              type="button"
              onClick={() => onAdjust(index, 'softer')}
              disabled={isBusy}
              className={`inline-flex min-h-[42px] items-center justify-center rounded-2xl border-2 border-black bg-[#d7f9ff] px-3.5 py-2 leading-5 text-black transition hover:bg-[#b8f2ff] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
            >
              תעשה את זה יותר עדין
            </button>
            <button
              type="button"
              onClick={() => onAdjust(index, 'sharper')}
              disabled={isBusy}
              className={`inline-flex min-h-[42px] items-center justify-center rounded-2xl border-2 border-black bg-[#ffd6ce] px-3.5 py-2 leading-5 text-black transition hover:bg-[#ffc5b8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
            >
              תעשה את זה יותר חד
            </button>
          </div>
        </details>
      </div>
    </article>
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
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        id="paywall-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        aria-describedby="paywall-description"
        className="max-h-[88svh] w-full max-w-md overflow-y-auto rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_10px_0_0_#111111] sm:rounded-[32px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff623d]">
              {checkoutSession ? 'שלב 2 מתוך 2' : 'שלב 1 מתוך 2'}
            </p>
            <h2 id="paywall-title" className="mt-2 text-2xl font-black text-black sm:text-3xl">
              {checkoutSession ? 'בחירת אמצעי תשלום' : 'בחירת חבילה'}
            </h2>
            <p id="paywall-description" className="mt-2 text-sm font-bold text-neutral-700">
              {checkoutSession
                ? 'בחר איך לשלם: Apple Pay/Google Pay או כרטיס אשראי.'
                : 'בחר את החבילה שמתאימה לך כדי להמשיך לתשלום.'}
            </p>
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
          {checkoutSession ? (
            <>
              <div className="rounded-[24px] border-2 border-black bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-black">
                      {checkoutSession.plan === 'credits_50'
                        ? CREDIT_PACK_TITLE
                        : 'ללא הגבלה חודשי'}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-700">
                      {checkoutSession.plan === 'credits_50'
                        ? CREDIT_PACK_DESCRIPTION
                        : 'גישה חופשית לכל התשובות, בלי לעזוב את האתר.'}
                    </p>
                  </div>
                  <p className="text-2xl font-black text-black">
                    {checkoutSession.plan === 'credits_50' ? CREDIT_PACK_PRICE_LABEL : '24.90₪'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onResetCheckout}
                  className={`mt-4 min-h-[42px] rounded-full border-2 border-black bg-[#fff6d8] px-3.5 py-2 text-sm font-black text-black transition hover:bg-[#fff2bf] ${whiteSurfaceFocusClass}`}
                >
                  לבחור מסלול אחר
                </button>
              </div>

              <CheckoutPaymentForm
                clientSecret={checkoutSession.clientSecret}
                submitLabel={
                  checkoutSession.plan === 'credits_50'
                    ? `לשלם ${CREDIT_PACK_PRICE_LABEL}`
                    : 'להפעיל ללא הגבלה'
                }
                onComplete={onPaymentCompleted}
              />
            </>
          ) : (
            <>
              <div className="rounded-[24px] border-2 border-black bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-black">{CREDIT_PACK_TITLE}</h3>
                    <p className="mt-1 text-sm text-neutral-700">{CREDIT_PACK_DESCRIPTION}</p>
                  </div>
                  <p className="text-2xl font-black text-black">{CREDIT_PACK_PRICE_LABEL}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlan('credits_50')}
                  disabled={isCheckoutLoading}
                  className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
                >
                  {checkoutPlan === 'credits_50' ? 'טוען טופס תשלום...' : CREDIT_PACK_CTA}
                </button>
              </div>

              <div className="rounded-[24px] border-2 border-black bg-[#111111] p-4 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-black">
                      הכי משתלם
                    </span>
                    <h3 className="mt-3 text-lg font-black">ללא הגבלה חודשי</h3>
                    <p className="mt-1 text-sm text-white/80">כל התשובות בלי מגבלה חודשית</p>
                  </div>
                  <p className="text-2xl font-black">24.90₪</p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectPlan('unlimited_monthly')}
                  disabled={isCheckoutLoading}
                  className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-white bg-[#ff623d] px-4 py-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
                >
                  {checkoutPlan === 'unlimited_monthly'
                    ? 'טוען טופס תשלום...'
                    : 'לפתוח חופשי'}
                </button>
              </div>

              <div className="rounded-[20px] border-2 border-black bg-white px-4 py-3 text-sm font-bold text-neutral-800">
                <p>תשלום מהיר ובטוח בתוך האתר.</p>
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

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const composeSectionRef = useRef<HTMLDivElement | null>(null);
  const resultsSectionRef = useRef<HTMLDivElement | null>(null);
  const examplesSectionRef = useRef<HTMLElement | null>(null);
  const plansSectionRef = useRef<HTMLElement | null>(null);
  const mobileNavSuppressUntilRef = useRef(0);
  const lastMobileNavClickAtRef = useRef(0);
  const [message, setMessage] = useState('');
  const [context, setContext] = useState<ContextOption>('קראש');
  const [tone, setTone] = useState<ToneOption>('זורם');
  const [continuePreference, setContinuePreference] = useState<ContinuePreference | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [freeUsed, setFreeUsed] = useState(0);
  const [freeRemaining, setFreeRemaining] = useState(FREE_LIMIT);
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
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(true);
  const [activeMobileSection, setActiveMobileSection] = useState<MobileNavSectionId>('compose');
  const [mobileNavHeight, setMobileNavHeight] = useState(0);

  const hasUnlimitedAccess = paidPlan === 'unlimited_monthly';
  const hasCreditBalance = paidCredits > 0;
  const isSessionReady = isAuthReady && Boolean(authToken) && !isBillingLoading;
  const totalFreeRemaining = useMemo(
    () => Math.max(freeRemaining + dailyFreeRemaining, 0),
    [dailyFreeRemaining, freeRemaining],
  );
  const isGenerating = isLoading || busyReplyIndex !== null;
  const generateButtonLabel = !isSessionReady
    ? 'טוען חשבון...'
    : isLoading
      ? 'מנסח...'
      : 'כפתור ההפעלה';
  const usageSummary = hasUnlimitedAccess
    ? 'מסלול ללא הגבלה פעיל'
    : hasCreditBalance
      ? `נשארו לך ${paidCredits} שימושים בחבילה`
      : totalFreeRemaining > 0
        ? `נשארו לך ${totalFreeRemaining} פניות חינם`
        : 'נגמרה המכסה החינמית';
  const mobileUsageSummary = hasUnlimitedAccess
    ? 'ללא הגבלה פעיל'
    : hasCreditBalance
      ? `${paidCredits} שימושים נשארו`
      : totalFreeRemaining > 0
        ? `${totalFreeRemaining} פניות חינם נשארו`
        : 'המכסה החינמית הסתיימה';

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

      const source = options?.source ?? 'system';
      const now = Date.now();
      let behavior = options?.behavior ?? getPreferredScrollBehavior();

      if (source === 'navigation') {
        if (now - lastMobileNavClickAtRef.current < 280) {
          behavior = 'auto';
        }

        lastMobileNavClickAtRef.current = now;
        mobileNavSuppressUntilRef.current = now + 450;
      }

      if (section !== 'plans') {
        setActiveMobileSection(section);
      }
      sectionElement.scrollIntoView({
        behavior,
        block: 'start',
      });
    },
    [],
  );

  const applyBillingSnapshot = useCallback((billing: BillingSnapshot) => {
    setFreeUsed(Math.max(0, Math.floor(billing.freeUsed)));
    setFreeRemaining(Math.max(0, Math.floor(billing.freeRemaining)));
    setDailyFreeRemaining(Math.max(0, Math.floor(billing.dailyRemaining)));
    setPaidCredits(Math.max(0, Math.floor(billing.credits)));

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

  const fetchWithAuth = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!authToken) {
      throw new Error(AUTH_ERROR_MESSAGE);
    }

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${authToken}`);

    return fetch(input, {
      ...init,
      headers,
    });
  }, [authToken]);

  const refreshBillingStatus = useCallback(async () => {
    if (!authToken) {
      if (isAuthReady) {
        setIsBillingLoading(false);
      }

      return null;
    }

    setIsBillingLoading(true);

    try {
      const response = await fetch('/api/billing/status', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = (await response.json()) as {
        error?: string;
        billing?: BillingSnapshot;
      };

      if (!response.ok || !data.billing) {
        throw new Error(data.error ?? 'לא הצלחנו לרענן מצב תשלום.');
      }

      applyBillingSnapshot(data.billing);
      return data.billing;
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'שגיאה בטעינת מצב תשלום.',
      );
      return null;
    } finally {
      setIsBillingLoading(false);
    }
  }, [applyBillingSnapshot, authToken, isAuthReady]);

  useEffect(() => {
    let isCancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function initAuth() {
      if (!isFirebaseClientConfigured()) {
        throw new FirebaseClientConfigError(
          'Firebase client config is missing in NEXT_PUBLIC_FIREBASE_*.',
        );
      }

      const auth = getFirebaseClientAuth();

      unsubscribe = onIdTokenChanged(auth, async (user) => {
        if (isCancelled) {
          return;
        }

        if (!user) {
          setAuthToken(null);
          setIsAuthReady(true);
          return;
        }

        try {
          const nextToken = await user.getIdToken();

          if (!isCancelled) {
            setAuthToken(nextToken);
            setIsAuthReady(true);
            setRequestError((currentError) =>
              currentError === AUTH_ERROR_MESSAGE ? null : currentError,
            );
          }
        } catch (error) {
          if (!isCancelled) {
            console.error('Firebase token refresh failed', error);
            setAuthToken(null);
            setRequestError(AUTH_ERROR_MESSAGE);
            setIsAuthReady(true);
          }
        }
      });

      if (!auth.currentUser) {
        await signInAnonymously(auth);
      } else {
        const nextToken = await auth.currentUser.getIdToken();
        if (!isCancelled) {
          setAuthToken(nextToken);
          setIsAuthReady(true);
        }
      }
    }

    void initAuth().catch((error) => {
      if (isCancelled) {
        return;
      }

      console.error('Firebase auth init failed', error);
      setRequestError(AUTH_ERROR_MESSAGE);
      setIsAuthReady(true);
      setIsBillingLoading(false);
    });

    return () => {
      isCancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!authToken) {
      if (isAuthReady) {
        setIsBillingLoading(false);
      }
      return;
    }

    void refreshBillingStatus();
  }, [authToken, isAuthReady, refreshBillingStatus]);

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
    const behavior = getPreferredScrollBehavior();

    if (isCompactViewport()) {
      window.requestAnimationFrame(() => {
        scrollToMobileSection('compose', { source: 'system', behavior });
        messageInputRef.current?.focus();
      });
      return;
    }

    composeSectionRef.current?.scrollIntoView({
      behavior,
      block: 'start',
    });
    messageInputRef.current?.focus();
  }, [scrollToMobileSection]);

  const finalizeSuccessfulCheckout = useCallback(async (plan: CheckoutPlan) => {
    const baselineCredits = paidCredits;

    setShowPaywall(false);
    setCheckoutPlan(null);
    setCheckoutSession(null);
    setCheckoutError(null);
    setPaymentNotice('התשלום התקבל. מעדכנים את היתרה שלך...');
    trackEvent('checkout_success', { plan });

    const didSync = await waitForBillingSync(plan, baselineCredits);

    setPaymentNotice(
      didSync
        ? plan === 'credits_50'
          ? 'התשלום התקבל והחבילה נוספה לחשבון שלך.'
          : 'התשלום התקבל ומסלול ללא הגבלה פעיל.'
        : 'התשלום נקלט. העדכון יופיע כאן תוך כמה שניות.',
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
        session?: {
          plan?: CheckoutPlan | null;
          paymentStatus?: string | null;
          status?: string | null;
        };
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error ?? 'לא הצלחנו לאמת את מצב התשלום.');
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
        setPaymentNotice('התשלום עדיין לא הושלם. אפשר לנסות שוב מתוך האתר.');
        return;
      }

      setPaymentNotice('לא הושלם תשלום חדש. אפשר לנסות שוב בכל רגע.');
    } catch (error) {
      setPaymentNotice(
        error instanceof Error ? error.message : 'לא הצלחנו לאמת את מצב התשלום.',
      );
    }
  }, [fetchWithAuth, finalizeSuccessfulCheckout]);

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
      if (!authToken || !sessionId) {
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
      setPaymentNotice('התשלום התקבל. מאמתים ומעדכנים את היתרה שלך...');
      trackEvent('checkout_success', { plan: planFromCheckout });
    } else if (checkoutStatus === 'cancelled') {
      setPaymentNotice('התשלום בוטל, אפשר לנסות שוב בכל רגע.');
    }

    if (checkoutStatus) {
      clearCheckoutParams();
    }
  }, [authToken, handleReturnedCheckout]);

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
    if (showPaywall) {
      setMobileNavHeight(0);
      return undefined;
    }

    const navElement = mobileNavRef.current;
    if (!navElement) {
      setMobileNavHeight(0);
      return undefined;
    }

    let frameId: number | null = null;

    const syncMobileNavHeight = () => {
      const navDisplay = window.getComputedStyle(navElement).display;
      const nextHeight =
        navDisplay === 'none' ? 0 : Math.ceil(navElement.getBoundingClientRect().height);

      setMobileNavHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncMobileNavHeight();
      });
    };

    syncMobileNavHeight();
    window.addEventListener('resize', scheduleSync);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', scheduleSync);

        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(navElement);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleSync);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [showPaywall]);

  useEffect(() => {
    if (!isCompactViewport()) {
      return undefined;
    }

    const sections: Array<{ id: MobileNavSectionId; element: HTMLElement | null }> = [
      { id: 'compose', element: composeSectionRef.current },
      { id: 'results', element: resultsSectionRef.current },
      { id: 'examples', element: examplesSectionRef.current },
    ];

    const availableSections = sections.filter(
      (section): section is { id: MobileNavSectionId; element: HTMLElement } =>
        section.element instanceof HTMLElement,
    );

    if (availableSections.length === 0) {
      return undefined;
    }

    let frameId: number | null = null;

    const syncActiveSectionFromScroll = () => {
      frameId = null;

      if (Date.now() < mobileNavSuppressUntilRef.current) {
        return;
      }

      const probeY = window.innerHeight * 0.38;
      let nearestSection: MobileNavSectionId = availableSections[0].id;
      let nearestDistance = Number.POSITIVE_INFINITY;

      availableSections.forEach((section) => {
        const distance = Math.abs(section.element.getBoundingClientRect().top - probeY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestSection = section.id;
        }
      });

      setActiveMobileSection((currentSection) =>
        currentSection === nearestSection ? currentSection : nearestSection,
      );
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(syncActiveSectionFromScroll);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

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
    setShowPaywall(true);
    setCheckoutSession(null);
    setCheckoutError(null);
    trackEvent('paywall_open', {
      used: freeUsed,
      remaining: totalFreeRemaining,
      daily_remaining: dailyFreeRemaining,
    });
  }

  async function handleCheckout(plan: CheckoutPlan) {
    setShowPaywall(true);

    if (!authToken) {
      setCheckoutError(AUTH_ERROR_MESSAGE);
      return;
    }

    setCheckoutPlan(plan);
    setCheckoutSession(null);
    setCheckoutError(null);
    setPaymentNotice(null);

    trackEvent('checkout_started', { plan });

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
        throw new Error(data.error ?? 'לא הצלחנו לטעון את טופס התשלום. נסה שוב.');
      }

      setCheckoutSession({
        clientSecret: data.clientSecret,
        sessionId: data.sessionId,
        plan,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'משהו השתבש בחיבור לתשלום.';
      setCheckoutError(message);
      trackEvent('checkout_failed', { plan, message });
    } finally {
      setCheckoutPlan(null);
    }
  }

  async function handlePaymentCompleted() {
    if (!checkoutSession) {
      return;
    }

    await finalizeSuccessfulCheckout(checkoutSession.plan);
  }

  async function runGeneration(
    payload: GenerateRequest,
    options?: { replyIndex?: number },
  ) {
    if (!authToken) {
      setRequestError(AUTH_ERROR_MESSAGE);
      return;
    }

    setRequestError(null);
    setImageError(null);

    if (typeof options?.replyIndex === 'number') {
      setBusyReplyIndex(options.replyIndex);
    } else {
      setIsLoading(true);
    }

    trackEvent('generate', {
      action: payload.action ?? 'initial',
      context: payload.context,
      tone: payload.tone,
      continue_preference: payload.continuePreference ?? 'unspecified',
      has_image: Boolean(payload.imageBase64),
      has_text: Boolean(payload.message.trim()),
    });

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
        openPaywall();
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? 'משהו נתקע בדרך. נסה שוב בעוד רגע.');
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
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'משהו השתבש. נסה שוב בעוד רגע.',
      );
    } finally {
      setIsLoading(false);
      setBusyReplyIndex(null);
    }
  }

  async function handleMainSubmit() {
    const trimmedMessage = message.trim();

    if (!trimmedMessage && !imageBase64) {
      setRequestError('צריך להדביק הודעה או להעלות צילום מסך כדי לייצר תשובה.');

      if (isCompactViewport()) {
        scrollToMobileSection('compose', { source: 'system' });
      } else {
        messageInputRef.current?.focus();
      }

      return;
    }

    await runGeneration({
      message: trimmedMessage,
      imageBase64,
      context,
      tone,
      continuePreference,
    });
  }

  async function handleReplyAction(index: number, action: ReplyAction) {
    if (!result?.replies[index]) {
      return;
    }

    const trimmedMessage = message.trim();

    await runGeneration(
      {
        message: trimmedMessage,
        imageBase64,
        context,
        tone,
        continuePreference,
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
      trackEvent('copy', { index, context, tone });
    } catch {
      setRequestError('ההעתקה נכשלה. נסה שוב.');
    }
  }

  function applyExample(scenario: ExampleScenario) {
    setMessage(scenario.message);
    setContext(scenario.context);
    setTone(scenario.tone);
    setContinuePreference(scenario.continuePreference ?? null);
    setRequestError(null);
    setResult(null);

    if (isCompactViewport()) {
      window.requestAnimationFrame(() => {
        scrollToMobileSection('compose', { source: 'system' });
      });
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen overflow-x-clip bg-[#111111] px-3 pb-0 pt-3 text-right text-black sm:px-6 sm:py-6 sm:pb-6"
      style={mobileNavHeight > 0 ? { paddingBottom: `${mobileNavHeight}px` } : undefined}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
        <section className="overflow-hidden rounded-[30px] border-2 border-black bg-[#f7ff4f] shadow-[0_10px_0_0_#ff623d] sm:rounded-[36px] sm:shadow-[0_12px_0_0_#ff623d]">
          <div className="relative px-4 py-5 sm:px-8 sm:py-8">
            <div className="absolute -left-10 top-0 h-36 w-36 rounded-full bg-[#ff623d] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-[#6ce8ff] blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3 sm:space-y-4">
                <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-black">
                  מה עונים?
                </div>
                <div className="space-y-2.5 sm:space-y-3">
                  <h1 className="text-[2.25rem] font-black leading-[1.02] tracking-tight text-black sm:text-6xl">
                    לענות חכם,
                    <br />
                    להישמע טבעי
                  </h1>
                  <p className="max-w-xl text-[0.98rem] font-bold leading-7 text-neutral-900 sm:text-lg">
                    פשוט מעלים צילום מסך או מדביקים הודעה, בוחרים את הסגנון שמתאים לכם,
                    ומקבלים תוך רגע 3 תשובות קצרות שנשמעות אמיתיות, זורמות ומשכנעות.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 sm:w-auto">
                <div className="rounded-[24px] border-2 border-black bg-white px-4 py-3.5 shadow-[0_6px_0_0_#111111]">
                  {hasUnlimitedAccess ? (
                    <>
                      <p className="text-xs font-black text-neutral-600">מסלול פעיל</p>
                      <p className="mt-2 text-2xl font-black text-black">ללא הגבלה</p>
                      <p className="text-sm font-bold text-neutral-700">אפשר להמשיך בלי תקרת שימוש</p>
                    </>
                  ) : hasCreditBalance ? (
                    <>
                      <p className="text-xs font-black text-neutral-600">יתרה בתשלום</p>
                      <p className="mt-2 text-3xl font-black text-black">{paidCredits}</p>
                      <p className="text-sm font-bold text-neutral-700">שימושים נשארו בחבילה</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-black text-neutral-600">
                        {dailyFreeRemaining > 0 && freeRemaining === 0 ? 'יתרה יומית' : 'חינם'}
                      </p>
                      <p className="mt-2 text-3xl font-black text-black">{totalFreeRemaining}</p>
                      <p className="text-sm font-bold text-neutral-700">
                        {dailyFreeRemaining > 0 && freeRemaining === 0
                          ? 'פנייה חינמית מתחדשת כל יום'
                          : `מתוך ${FREE_LIMIT} פניות`}
                      </p>
                    </>
                  )}
                </div>
                <div className="rounded-[24px] border-2 border-black bg-[#111111] px-4 py-3.5 text-white shadow-[0_6px_0_0_#111111]">
                  <p className="text-xs font-black text-white/70">פרטיות</p>
                  <p className="mt-2 text-sm font-black leading-6">אנחנו לא שומרים את ההודעות שלך</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {paymentNotice ? (
          <section className="rounded-[28px] border-2 border-black bg-[#d7f9ff] px-5 py-4 shadow-[0_8px_0_0_#111111]">
            <p className="text-sm font-black text-black">{paymentNotice}</p>
          </section>
        ) : null}

        {!isSessionReady ? (
          <section className="rounded-[28px] border-2 border-black bg-[#fff6d8] px-5 py-4 shadow-[0_8px_0_0_#111111]">
            <p className="text-sm font-black text-black">
              מחברים אותך לחשבון מאובטח ומעדכנים מצב תשלום...
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-5">
          <div
            ref={composeSectionRef}
            id="compose-section"
            className="mobile-section-anchor space-y-4 rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
          >
            <div className="space-y-2">
              <p className="inline-flex min-h-[32px] items-center rounded-full border-2 border-black bg-white px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#ff623d] lg:hidden">
                {mobileSectionNavItems[0].stepLabel}
              </p>
              <h2 className="text-2xl font-black text-black sm:text-3xl">תן את ההודעה. אנחנו נביא את הניסוח.</h2>
              <p className="text-sm font-bold leading-6 text-neutral-700">
                אפשר להדביק הודעה, להעלות צילום מסך, ואז לדייק את התשובה לפי הסיטואציה, הסגנון והכיוון שלך.
              </p>
            </div>

            <div className="space-y-4 rounded-[28px] border-2 border-black bg-white p-4 sm:p-5">
              <div className="flex flex-col items-start justify-between gap-3 min-[430px]:flex-row min-[430px]:items-center">
                <div>
                  <label htmlFor="incoming-message" className="text-sm font-black text-neutral-900">
                    מה שלחו לך?
                  </label>
                  <p className="text-xs font-bold text-neutral-700">הדבק הודעה או העלה צילום מסך של הצ&apos;אט</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`min-h-[44px] rounded-full border-2 border-black bg-[#fff6d8] px-4 py-2 text-sm font-black text-black ${lightSurfaceFocusClass}`}
                >
                  העלה צילום
                </button>
              </div>

              <textarea
                id="incoming-message"
                ref={messageInputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="למשל: היי, ראיתי את ההודעה שלך. מתאים לך לדבר אחר כך?"
                className={`min-h-36 w-full rounded-[24px] border-2 border-black bg-[#f9f9f9] px-4 py-4 text-base leading-7 font-medium text-black outline-none transition placeholder:text-neutral-400 focus:-translate-y-0.5 focus:bg-[#fffdf6] sm:min-h-40 sm:rounded-[26px] ${lightSurfaceFocusClass}`}
              />

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
                    <p className="text-xs font-bold text-neutral-700">התמונה מוכנה לשליחה</p>
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

            <div className="grid gap-2.5 sm:gap-3">
              <ChipGroup
                title="מה הסיטואציה?"
                description="זה עוזר לנו לבחור ניסוח שמתאים לדינמיקה."
                options={contextOptions}
                value={context}
                onChange={(nextValue) => {
                  if (nextValue) {
                    setContext(nextValue);
                  }
                }}
              />

              <ChipGroup
                title="איך בא לך לענות?"
                description="האנרגיה הכללית של התשובה."
                options={toneOptions}
                value={tone}
                onChange={(nextValue) => {
                  if (nextValue) {
                    setTone(nextValue);
                  }
                }}
              />

              <ChipGroup
                title="מסכים/ה עם מה שנאמר?"
                description="שאלה כללית וברורה: כן אם מסכימים, לא אם לא."
                options={continuePreferenceOptions}
                value={continuePreference}
                onChange={setContinuePreference}
                helperText={
                  continuePreference
                    ? 'בחרת אם כן או לא. אפשר לשנות בכל רגע.'
                    : 'אפשר להשאיר ריק.'
                }
                optional
                allowEmpty
              />
            </div>

            <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={handleMainSubmit}
                disabled={isGenerating || !isSessionReady}
                className={`inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[26px] border-2 border-black bg-gradient-to-b from-[#ff7a56] to-[#ff623d] px-6 py-3 text-base font-black text-white shadow-[0_8px_0_0_#111111] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_0_0_#111111] active:translate-y-0 active:shadow-[0_5px_0_0_#111111] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${lightSurfaceFocusClass}`}
              >
                <span className="rounded-full border-2 border-black bg-[#f7ff4f] px-2 py-0.5 text-[0.64rem] font-black uppercase tracking-[0.12em] text-black">
                  שלב 1
                </span>
                {generateButtonLabel}
              </button>
              <div className="flex flex-wrap items-center justify-end gap-3 text-sm font-bold text-neutral-700">
                <p>{usageSummary}</p>
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
                  שלב 1
                </span>
                {generateButtonLabel}
              </button>
              <p className="text-xs font-black text-neutral-700">{mobileUsageSummary}</p>
            </div>

            {requestError ? (
              <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
                {requestError}
              </p>
            ) : null}
          </div>

          <div
            ref={resultsSectionRef}
            id="results-section"
            className="mobile-section-anchor space-y-4 rounded-[30px] border-2 border-black bg-white p-3.5 shadow-[0_10px_0_0_#6ce8ff] sm:rounded-[36px] sm:p-5 sm:shadow-[0_12px_0_0_#6ce8ff]"
          >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="inline-flex min-h-[32px] items-center rounded-full border-2 border-black bg-[#d7f9ff] px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-black lg:hidden">
                  {mobileSectionNavItems[1].stepLabel}
                </p>
                <h2 className="text-2xl font-black text-black sm:text-3xl">מה כנראה באמת קורה פה</h2>
                <p className="mt-1.5 text-sm font-bold leading-6 text-neutral-700">
                  הסבר קצר ואז תשובות שמוכנות להעתקה.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <span className="rounded-full border-2 border-black bg-[#d7f9ff] px-3 py-2 text-xs font-black text-black">
                  מוכן לוואטסאפ
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
                  <button
                    type="button"
                    onClick={() =>
                      scrollToMobileSection('examples', { source: 'navigation' })
                    }
                    className={`min-h-[36px] rounded-full border-2 border-black bg-[#fff6d8] px-3 py-1 text-[0.72rem] font-black text-black ${lightSurfaceFocusClass}`}
                  >
                    לדוגמאות
                  </button>
                </div>
              </div>
            </div>

            <div aria-live="polite" aria-busy={isGenerating} className="space-y-3">
              {result ? (
                <div className="space-y-3">
                <div className="rounded-[26px] border-2 border-black bg-[#fff6d8] p-4 shadow-[0_8px_0_0_#111111]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-600">הכוונה שלהם כנראה</p>
                  <p className="mt-2 text-base font-bold leading-7 text-black">{result.intent}</p>
                </div>

                <div className="space-y-3">
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
                <div className="flex min-h-72 flex-col justify-between rounded-[28px] border-2 border-dashed border-black bg-[#f8f4ed] p-5 sm:min-h-80">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500">עוד שניה זה מתמלא</p>
                    <h3 className="mt-3 text-2xl font-black text-black">3 תשובות קצרות, בלי עברית רובוטית</h3>
                    <p className="mt-3 max-w-md text-sm font-bold leading-6 text-neutral-700">
                      בחר סיטואציה, בחר סגנון, ואם בא לך גם סמן אם מתאים להמשיך.
                      משם ננסח עבורך תשובות שמרגישות טבעי, קצר ומדויק.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-3 text-sm font-bold text-neutral-800">
                    <div className="rounded-2xl border-2 border-black bg-white px-4 py-3">קצרות ומוכנות להעתקה</div>
                    <div className="rounded-2xl border-2 border-black bg-white px-4 py-3">מותאמות לקראש, אקס, לקוח, בוס ויד2</div>
                    <div className="rounded-2xl border-2 border-black bg-white px-4 py-3">אפשר לחדד, לרכך או לנסות שוב מתוך כל תשובה</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          ref={examplesSectionRef}
          id="examples-section"
          className="mobile-section-anchor rounded-[30px] border-2 border-black bg-[#ff623d] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex min-h-[32px] items-center rounded-full border-2 border-black bg-white px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#ff623d] lg:hidden">
                {mobileSectionNavItems[2].stepLabel}
              </p>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/80">דוגמאות פתיחה</p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">4 מצבים שמכירים מהחיים</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-white/85">
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

        <section
          ref={plansSectionRef}
          id="plans-section"
          className="mobile-section-anchor rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff623d]">תשלום</p>
              <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">פותחים עוד תשובות</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-neutral-700">
              התשלום נטען בתוך האתר שלך, בעברית, עם Stripe מאובטח. במכשיר תומך יופיעו גם Apple Pay ו-Google Pay.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border-2 border-black bg-white p-5">
              <h3 className="text-xl font-black text-black">{CREDIT_PACK_TITLE}</h3>
              <p className="mt-2 text-sm font-bold text-neutral-700">{CREDIT_PACK_DESCRIPTION}</p>
              <p className="mt-4 text-3xl font-black text-black">{CREDIT_PACK_PRICE_LABEL}</p>
              <button
                type="button"
                onClick={() => handleCheckout('credits_50')}
                disabled={checkoutPlan !== null || !isSessionReady}
                className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
              >
                {checkoutPlan === 'credits_50' ? 'טוען טופס תשלום...' : CREDIT_PACK_CTA}
              </button>
            </div>

            <div className="rounded-[24px] border-2 border-black bg-[#111111] p-5 text-white">
              <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-black">
                הכי משתלם
              </span>
              <h3 className="mt-3 text-xl font-black">ללא הגבלה חודשי</h3>
              <p className="mt-2 text-sm font-bold text-white/80">כל התשובות, כל הזמן.</p>
              <p className="mt-4 text-3xl font-black">24.90₪</p>
              <button
                type="button"
                onClick={() => handleCheckout('unlimited_monthly')}
                disabled={checkoutPlan !== null || !isSessionReady}
                className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-white bg-[#ff623d] px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${darkSurfaceFocusClass}`}
              >
                {checkoutPlan === 'unlimited_monthly'
                  ? 'טוען טופס תשלום...'
                  : 'לפתוח ללא הגבלה'}
              </button>
            </div>
          </div>

          {checkoutError ? (
            <p className="mt-4 rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
              {checkoutError}
            </p>
          ) : null}
        </section>
      </div>

      {!showPaywall ? (
        <div
          ref={mobileNavRef}
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-black bg-[#fff9ef]/95 backdrop-blur sm:hidden"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <nav aria-label="ניווט מהיר במובייל" className="grid grid-cols-3 gap-2">
              {mobileSectionNavItems.map((item) => {
                const isActive = activeMobileSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      scrollToMobileSection(item.id, { source: 'navigation' })
                    }
                    aria-pressed={isActive}
                    className={[
                      `min-h-[40px] rounded-[14px] border-2 px-2 py-1.5 text-center text-[0.68rem] font-black leading-4 transition touch-manipulation ${lightSurfaceFocusClass}`,
                      isActive
                        ? 'border-black bg-[#111111] text-[#f7ff4f]'
                        : 'border-black bg-white text-black',
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {result ? (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => scrollToMobileSection('results', { source: 'navigation' })}
                  className={`min-h-[44px] rounded-full border-2 border-black bg-[#d7f9ff] px-3 py-1.5 text-[0.72rem] font-black text-black ${lightSurfaceFocusClass}`}
                >
                  לתוצאות
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
      />
    </main>
  );
}
