import { useEffect, useId, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AccountCenterPanel } from '@/components/account-center-panel';
import { darkSurfaceFocusClass, lightSurfaceFocusClass, whiteSurfaceFocusClass } from '@/components/home-focus-styles';
import { CREDIT_PACK_PRICE_LABEL } from '@/lib/pricing';

export type SubscriptionAction = 'cancel_next_charge' | 'resume_renewal';
export type CheckoutPlan = 'credits_50' | 'unlimited_monthly';

export type AuthEmailIntent = 'checkout' | 'recover';

export type BillingSnapshot = {
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

export type CheckoutSessionState = {
  clientSecret: string;
  sessionId: string;
  plan: CheckoutPlan;
};

export type ManagedSubscriptionState = {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  canCancel: boolean;
  canResume: boolean;
};

const PAYWALL_TITLE = 'ממשיכים בלי להיתקע';
const PAYWALL_BODY = 'בוחרים מסלול וממשיכים לנסח תשובות מעולות בלי לעצור.';
const DAILY_FREE_EXHAUSTED_HELPER_TEXT =
  'נגמר החינם להיום. אפשר לחזור מחר, או להמשיך עכשיו עם אחד המסלולים.';
export const CREDIT_PLAN_COPY = {
  title: '50 שימושים',
  helper: 'עד 150 תשובות',
  price: CREDIT_PACK_PRICE_LABEL,
  badge: 'הכי טוב להתחלה',
  body: 'תשלום חד-פעמי, בלי התחייבות',
  cta: 'לקנות 50 שימושים',
} as const;
export const UNLIMITED_PLAN_COPY = {
  title: 'ללא הגבלה חודשי',
  helper: 'למי שרוצה לענות חופשי',
  price: '24.90₪',
  badge: 'חופשי כל החודש',
  body: 'כמה תשובות שרוצים לאורך כל החודש',
  cta: 'לפתוח ללא הגבלה',
} as const;

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
      bgClass: 'bg-[#fff6d8]',
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

export function SubscriptionManagementPanel({
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
            className={`min-h-[42px] rounded-full border border-[#e2d7c8] bg-[#fff6e8] px-3.5 py-2 text-sm font-semibold text-[#5b3d29] transition hover:bg-[#f6ead8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
          >
            {isLoading ? 'מעדכנים...' : 'להפעיל חידוש אוטומטי'}
          </button>
        ) : null}
      </div>

      {actionNotice ? (
        <p role="status" className="sb-account-feedback mt-2 rounded-2xl border border-[#e2d7c8] bg-[#fff6e8] px-3 py-2 text-sm font-bold text-[#5b3d29]">
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

export function CouponRedeemPanel({
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
        <p role="status" className="sb-account-feedback mt-2 rounded-2xl border border-[#e2d7c8] bg-[#fff6e8] px-3 py-2 text-sm font-bold text-[#5b3d29]">
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

export function PaywallModal({
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
                            ? 'border-black bg-[#fff6e8] text-black'
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
                <div className="rounded-[22px] border border-[#ded2c3] bg-[#fff6e8] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b2d10]">תשלום פתוח</p>
                  <p className="mt-1 text-sm font-bold leading-6 text-black">
                    אפשר להמשיך את התשלום האחרון, לבחור מסלול אחר, או לרענן את מצב החשבון אם כבר שילמתם.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onResumeCheckout(resumePlan)}
                      disabled={isCheckoutLoading || !canStartCheckout}
                      className={`min-h-[42px] rounded-full border border-[#ded2c3] bg-[#fff6e8] px-3.5 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
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
                    <span className="rounded-full border border-black bg-[#fff6e8] px-3 py-1 text-xs font-semibold text-black">
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
                  className={`sb-primary-button mt-4 min-h-[48px] w-full rounded-2xl border border-[#ded2c3] bg-[#fff6e8] px-4 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-70 ${lightSurfaceFocusClass}`}
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
