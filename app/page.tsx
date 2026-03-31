'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { trackEvent } from '@/lib/analytics';
import { FirebaseClientConfigError, getFirebaseClientAuth, isFirebaseClientConfigured } from '@/lib/firebase-client';
import { onIdTokenChanged, signInAnonymously } from 'firebase/auth';

type ContextOption = 'קראש' | 'אקס' | 'לקוח' | 'בוס' | 'יד2';
type ToneOption = 'עדין' | 'ישיר' | 'זורם' | 'מצחיק' | 'פלרטטני';
type ReplyAction = 'softer' | 'sharper' | 'retry';
type CheckoutPlan = 'credits_50' | 'unlimited_monthly';
type PaidPlan = CheckoutPlan | null;

type ExampleScenario = {
  title: string;
  message: string;
  context: ContextOption;
  tone: ToneOption;
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
  action?: ReplyAction;
  sourceReply?: string;
};

type BillingSnapshot = {
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  credits: number;
  hasUnlimited: boolean;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  accessState: 'free' | 'credits' | 'unlimited' | 'blocked';
};

const FREE_LIMIT = 3;
const AUTH_ERROR_MESSAGE = 'לא הצלחנו לזהות משתמש. רענן את הדף ונסה שוב.';

const contextOptions: ContextOption[] = ['קראש', 'אקס', 'לקוח', 'בוס', 'יד2'];
const toneOptions: ToneOption[] = ['עדין', 'ישיר', 'זורם', 'מצחיק', 'פלרטטני'];

const examples: ExampleScenario[] = [
  {
    title: 'קראש שפתאום נזכר',
    message: 'היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך',
    context: 'קראש',
    tone: 'פלרטטני',
  },
  {
    title: 'אקס שבודק דופק',
    message: 'וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?',
    context: 'אקס',
    tone: 'ישיר',
  },
  {
    title: 'לקוח שרוצה הנחה',
    message: 'ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו',
    context: 'לקוח',
    tone: 'עדין',
  },
  {
    title: 'יד2 קלאסי',
    message: 'אחרון כמה? בא לקחת היום אם יש מחיר טוב',
    context: 'יד2',
    tone: 'זורם',
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

function ChipGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly T[];
  value: T;
  onChange: (nextValue: T) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-black text-neutral-900">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option === value;

          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option)}
              className={[
                `min-h-[44px] rounded-full border-2 px-4 py-2.5 text-sm font-bold transition duration-150 touch-manipulation ${lightSurfaceFocusClass}`,
                isSelected
                  ? 'border-black bg-[#111111] text-[#f7ff4f] shadow-[0_6px_0_0_#ff623d]'
                  : 'border-black bg-white text-black hover:-translate-y-0.5 hover:bg-[#fff8da]',
              ].join(' ')}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
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
      className={`group flex min-h-44 w-[84vw] max-w-sm shrink-0 snap-start flex-col justify-between rounded-[28px] border-2 border-black bg-[#fff6d8] p-5 text-right shadow-[0_10px_0_0_#111111] transition duration-200 hover:-translate-y-1 hover:bg-[#f7ff4f] touch-manipulation md:w-full md:max-w-none ${darkSurfaceFocusClass}`}
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
    <article className="relative overflow-hidden rounded-[28px] border-2 border-black bg-white p-4 shadow-[0_8px_0_0_#111111] sm:rounded-[30px] sm:p-5 sm:shadow-[0_10px_0_0_#111111]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded-full border border-black bg-[#f7ff4f] px-3 py-1 text-xs font-black text-black">
          אפשרות {index + 1}
        </span>
        {isUpdating ? (
          <span className="text-xs font-bold text-neutral-700">מעדכן...</span>
        ) : null}
      </div>

      <p className="min-h-24 text-base leading-7 font-bold text-neutral-900">{reply}</p>

      <div className="mt-5 grid grid-cols-1 gap-2 text-sm font-bold sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onCopy(reply, index)}
          className={`min-h-[46px] rounded-2xl border-2 border-black bg-[#111111] px-3 py-3 leading-5 text-[#f7ff4f] transition hover:bg-[#222222] ${whiteSurfaceFocusClass}`}
        >
          {copied ? 'הועתק' : 'העתק'}
        </button>
        <button
          type="button"
          onClick={() => onAdjust(index, 'softer')}
          disabled={isBusy}
          className={`min-h-[46px] rounded-2xl border-2 border-black bg-[#d7f9ff] px-3 py-3 leading-5 text-black transition hover:bg-[#b8f2ff] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
        >
          תעשה את זה יותר עדין
        </button>
        <button
          type="button"
          onClick={() => onAdjust(index, 'sharper')}
          disabled={isBusy}
          className={`min-h-[46px] rounded-2xl border-2 border-black bg-[#ffd6ce] px-3 py-3 leading-5 text-black transition hover:bg-[#ffc5b8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
        >
          תעשה את זה יותר חד
        </button>
        <button
          type="button"
          onClick={() => onAdjust(index, 'retry')}
          disabled={isBusy}
          className={`min-h-[46px] rounded-2xl border-2 border-dashed border-black bg-[#fff6d8] px-3 py-3 leading-5 text-black transition hover:bg-[#f8ebc1] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
        >
          נסה שוב
        </button>
      </div>
    </article>
  );
}

function PaywallModal({
  open,
  onClose,
  onSelectPlan,
  isCheckoutLoading,
  checkoutPlan,
  checkoutError,
}: {
  open: boolean;
  onClose: () => void;
  onSelectPlan: (plan: CheckoutPlan) => void;
  isCheckoutLoading: boolean;
  checkoutPlan: CheckoutPlan | null;
  checkoutError: string | null;
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
              נגמרו הנסיונות
            </p>
            <h2 id="paywall-title" className="mt-2 text-2xl font-black text-black sm:text-3xl">
              פותחים עוד תשובות
            </h2>
            <p id="paywall-description" className="mt-2 text-sm font-bold text-neutral-700">
              תשלום מאובטח דרך Stripe. ברוב המכשירים יוצגו גם Apple Pay ו-Google Pay.
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
          <div className="rounded-[24px] border-2 border-black bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-black">50 שימושים (עד 150 תשובות)</h3>
                <p className="mt-1 text-sm text-neutral-700">3 תשובות בכל שימוש. בוסט בלי התחייבות.</p>
              </div>
              <p className="text-2xl font-black text-black">9.90₪</p>
            </div>
            <button
              type="button"
              onClick={() => onSelectPlan('credits_50')}
              disabled={isCheckoutLoading}
              className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
            >
              {checkoutPlan === 'credits_50' ? 'מעביר לתשלום מאובטח...' : 'לבחור במסלול הזה'}
            </button>
          </div>

          <div className="rounded-[24px] border-2 border-black bg-[#111111] p-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs font-black">
                  הכי משתלם
                </span>
                <h3 className="mt-3 text-lg font-black">ללא הגבלה חודשי</h3>
                <p className="mt-1 text-sm text-white/80">לוואטסאפ, אינסטגרם, דייטים ולקוחות</p>
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
                ? 'מעביר לתשלום מאובטח...'
                : 'לפתוח חופשי'}
            </button>
          </div>

          <div className="rounded-[20px] border-2 border-black bg-white px-4 py-3 text-sm font-bold text-neutral-800">
            <p>תשלום מהיר: Apple Pay, Google Pay וכל כרטיס אשראי.</p>
          </div>

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
  const [message, setMessage] = useState('');
  const [context, setContext] = useState<ContextOption>('קראש');
  const [tone, setTone] = useState<ToneOption>('זורם');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [freeUsed, setFreeUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [busyReplyIndex, setBusyReplyIndex] = useState<number | null>(null);
  const [copiedReplyIndex, setCopiedReplyIndex] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paidPlan, setPaidPlan] = useState<PaidPlan>(null);
  const [paidCredits, setPaidCredits] = useState(0);
  const [checkoutPlan, setCheckoutPlan] = useState<CheckoutPlan | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(true);

  const hasUnlimitedAccess = paidPlan === 'unlimited_monthly';
  const hasCreditBalance = paidCredits > 0;
  const isSessionReady = isAuthReady && Boolean(authToken) && !isBillingLoading;
  const freeRemaining = useMemo(
    () => Math.max(FREE_LIMIT - freeUsed, 0),
    [freeUsed],
  );
  const isGenerating = isLoading || busyReplyIndex !== null;
  const generateButtonLabel = !isSessionReady
    ? 'טוען חשבון...'
    : isLoading
      ? 'מנסח...'
      : 'תביא 3 תשובות';
  const usageSummary = hasUnlimitedAccess
    ? 'מסלול ללא הגבלה פעיל'
    : hasCreditBalance
      ? `נשארו לך ${paidCredits} שימושים בחבילה`
      : `נשארו לך ${freeRemaining} פניות חינם`;
  const mobileUsageSummary = hasUnlimitedAccess
    ? 'ללא הגבלה פעיל'
    : hasCreditBalance
      ? `${paidCredits} שימושים נשארו`
      : `${freeRemaining} פניות חינם נשארו`;

  function applyBillingSnapshot(billing: BillingSnapshot) {
    setFreeUsed(Math.max(0, Math.floor(billing.freeUsed)));
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
  }

  async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}) {
    if (!authToken) {
      throw new Error(AUTH_ERROR_MESSAGE);
    }

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${authToken}`);

    return fetch(input, {
      ...init,
      headers,
    });
  }

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
          return;
        }

        const nextToken = await user.getIdToken();

        if (!isCancelled) {
          setAuthToken(nextToken);
          setIsAuthReady(true);
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

    let isCancelled = false;

    async function loadBillingStatus() {
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

        if (!isCancelled) {
          applyBillingSnapshot(data.billing);
        }
      } catch (error) {
        if (!isCancelled) {
          setRequestError(
            error instanceof Error ? error.message : 'שגיאה בטעינת מצב תשלום.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsBillingLoading(false);
        }
      }
    }

    void loadBillingStatus();
    return () => {
      isCancelled = true;
    };
  }, [authToken, isAuthReady]);

  useEffect(() => {

    const searchParams = new URLSearchParams(window.location.search);
    const checkoutStatus = searchParams.get('checkout');
    const planFromCheckout = searchParams.get('plan');

    if (checkoutStatus === 'success' && isCheckoutPlan(planFromCheckout)) {
      setShowPaywall(false);
      setPaymentNotice('התשלום התקבל. מאמתים ומעדכנים את היתרה שלך...');
      trackEvent('checkout_success', { plan: planFromCheckout });
    } else if (checkoutStatus === 'cancelled') {
      setPaymentNotice('התשלום בוטל, אפשר לנסות שוב בכל רגע.');
    }

    if (checkoutStatus) {
      searchParams.delete('checkout');
      searchParams.delete('plan');
      searchParams.delete('session_id');
      const nextQuery = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }, []);

  useEffect(() => {
    if (copiedReplyIndex === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedReplyIndex(null);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [copiedReplyIndex]);

  function openPaywall() {
    setShowPaywall(true);
    setCheckoutError(null);
    trackEvent('paywall_open', {
      used: freeUsed,
      remaining: freeRemaining,
    });
  }

  async function handleCheckout(plan: CheckoutPlan) {
    if (!authToken) {
      setCheckoutError(AUTH_ERROR_MESSAGE);
      return;
    }

    setCheckoutPlan(plan);
    setCheckoutError(null);

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
        error?: string;
        url?: string;
      };

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? 'לא הצלחנו לפתוח עמוד תשלום. נסה שוב.');
      }

      window.location.assign(data.url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'משהו השתבש בחיבור לתשלום.';
      setCheckoutError(message);
      trackEvent('checkout_failed', { plan, message });
    } finally {
      setCheckoutPlan(null);
    }
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
      return;
    }

    await runGeneration({
      message: trimmedMessage,
      imageBase64,
      context,
      tone,
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
    setRequestError(null);
    setResult(null);
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#111111] px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 text-right text-black sm:px-6 sm:py-6 sm:pb-6"
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
                      <p className="text-xs font-black text-neutral-600">חינם</p>
                      <p className="mt-2 text-3xl font-black text-black">{freeRemaining}</p>
                      <p className="text-sm font-bold text-neutral-700">מתוך 3 פניות</p>
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
          <div className="space-y-5 rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-black sm:text-3xl">תן את ההודעה. אנחנו נביא את הניסוח.</h2>
              <p className="text-sm font-bold leading-6 text-neutral-700">
                אפשר להדביק הודעה, להעלות צילום מסך, או לשלב ביניהם.
              </p>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-black text-neutral-900">מה שלחו לך?</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="למשל: היי, ראיתי את ההודעה שלך. מתאים לך לדבר אחר כך?"
                className={`min-h-36 w-full rounded-[26px] border-2 border-black bg-white px-4 py-4 text-base leading-7 font-medium text-black outline-none transition placeholder:text-neutral-400 focus:-translate-y-0.5 focus:bg-[#fffdf6] sm:min-h-40 sm:rounded-[28px] ${lightSurfaceFocusClass}`}
              />
            </label>

            <div className="space-y-3 rounded-[28px] border-2 border-dashed border-black bg-[#fff6d8] p-4">
              <div className="flex flex-col items-start justify-between gap-3 min-[430px]:flex-row min-[430px]:items-center">
                <div>
                  <p className="text-sm font-black text-black">או צילום מסך של הצ&apos;אט</p>
                  <p className="text-xs font-bold text-neutral-700">נוח במיוחד לוואטסאפ ואינסטגרם</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`min-h-[44px] rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-black text-black ${lightSurfaceFocusClass}`}
                >
                  העלה צילום
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

              {imageName ? (
                <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border-2 border-black bg-white px-4 py-3 min-[430px]:flex-row min-[430px]:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-black">{imageName}</p>
                    <p className="text-xs font-bold text-neutral-600">התמונה מוכנה לשליחה</p>
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

            <ChipGroup
              title="מה הסיטואציה?"
              options={contextOptions}
              value={context}
              onChange={setContext}
            />

            <ChipGroup
              title="איזה vibe אתה רוצה?"
              options={toneOptions}
              value={tone}
              onChange={setTone}
            />

            <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={handleMainSubmit}
                disabled={isGenerating || !isSessionReady}
                className={`min-h-[52px] rounded-[24px] border-2 border-black bg-[#ff623d] px-5 py-4 text-base font-black text-white shadow-[0_8px_0_0_#111111] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${lightSurfaceFocusClass}`}
              >
                {generateButtonLabel}
              </button>
              <div className="flex flex-wrap items-center justify-end gap-3 text-sm font-bold text-neutral-700">
                <p>{usageSummary}</p>
              </div>
            </div>

            {requestError ? (
              <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
                {requestError}
              </p>
            ) : null}
          </div>

          <div className="space-y-5 rounded-[30px] border-2 border-black bg-white p-4 shadow-[0_10px_0_0_#6ce8ff] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#6ce8ff]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-black sm:text-3xl">מה כנראה באמת קורה פה</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-neutral-700">
                  הסבר קצר ואז תשובות שמוכנות להעתקה.
                </p>
              </div>
              <span className="rounded-full border-2 border-black bg-[#d7f9ff] px-3 py-2 text-xs font-black text-black">
                מוכן לוואטסאפ
              </span>
            </div>

            <div aria-live="polite" aria-busy={isGenerating} className="space-y-4">
              {result ? (
                <div className="space-y-4">
                <div className="rounded-[28px] border-2 border-black bg-[#fff6d8] p-5 shadow-[0_8px_0_0_#111111]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-600">הכוונה שלהם כנראה</p>
                  <p className="mt-3 text-base font-bold leading-7 text-black">{result.intent}</p>
                </div>

                <div className="space-y-4">
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
                      בחר סיטואציה, בחר טון, ותן לנו לנסח עבורך תשובות שמרגישות טבעי,
                      קצר, ומדויק.
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

        <section className="rounded-[30px] border-2 border-black bg-[#ff623d] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/80">דוגמאות פתיחה</p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">4 מצבים שמכירים מהחיים</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-white/85">
              לחיצה על כרטיס מכניסה את הדוגמה לטופס ותיתן לך נקודת פתיחה מהירה.
            </p>
          </div>

          <div className="-mx-1 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0 md:[grid-template-columns:repeat(2,minmax(0,1fr))] xl:[grid-template-columns:repeat(4,minmax(0,1fr))]">
            {examples.map((scenario) => (
              <ExampleCard
                key={scenario.title}
                scenario={scenario}
                onUse={applyExample}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border-2 border-black bg-[#fff9ef] p-4 shadow-[0_10px_0_0_#111111] sm:rounded-[36px] sm:p-6 sm:shadow-[0_12px_0_0_#111111]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff623d]">תשלום</p>
              <h2 className="mt-2 text-2xl font-black text-black sm:text-3xl">פותחים עוד תשובות</h2>
            </div>
            <p className="max-w-xl text-sm font-bold leading-6 text-neutral-700">
              תשלום מאובטח דרך Stripe. במסך התשלום, במכשיר תומך, יופיעו גם Apple Pay ו-Google Pay.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border-2 border-black bg-white p-5">
              <h3 className="text-xl font-black text-black">50 שימושים (עד 150 תשובות)</h3>
              <p className="mt-2 text-sm font-bold text-neutral-700">3 תשובות בכל שימוש. תשלום חד-פעמי, בלי התחייבות.</p>
              <p className="mt-4 text-3xl font-black text-black">9.90₪</p>
              <button
                type="button"
                onClick={() => handleCheckout('credits_50')}
                disabled={checkoutPlan !== null || !isSessionReady}
                className={`mt-4 min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
              >
                {checkoutPlan === 'credits_50' ? 'מעביר לתשלום מאובטח...' : 'לקנות 50 שימושים'}
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
                  ? 'מעביר לתשלום מאובטח...'
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
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-black bg-[#fff9ef]/95 backdrop-blur sm:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleMainSubmit}
              disabled={isGenerating || !isSessionReady}
              className={`min-h-[52px] w-full rounded-2xl border-2 border-black bg-[#ff623d] px-4 py-3 text-base font-black text-white shadow-[0_6px_0_0_#111111] transition disabled:cursor-not-allowed disabled:opacity-60 ${lightSurfaceFocusClass}`}
            >
              {generateButtonLabel}
            </button>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-xs leading-5 font-black text-neutral-700">
                {mobileUsageSummary}
              </p>
              {!hasUnlimitedAccess ? (
                <button
                  type="button"
                  onClick={openPaywall}
                  aria-haspopup="dialog"
                  aria-controls="paywall-dialog"
                  className={`min-h-[44px] shrink-0 rounded-full border-2 border-black bg-white px-3 py-1.5 text-[0.7rem] font-black text-black ${lightSurfaceFocusClass}`}
                >
                  מסלולים
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSelectPlan={handleCheckout}
        isCheckoutLoading={checkoutPlan !== null || !isSessionReady}
        checkoutPlan={checkoutPlan}
        checkoutError={checkoutError}
      />
    </main>
  );
}
