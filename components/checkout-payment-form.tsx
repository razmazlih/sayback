'use client';

import { useEffect, useState } from 'react';
import type {
  AvailablePaymentMethods,
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementReadyEvent,
} from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
const stripePromise = PUBLISHABLE_KEY
  ? loadStripe(PUBLISHABLE_KEY, { locale: 'he' })
  : Promise.resolve(null);

type CheckoutPaymentFormProps = {
  clientSecret: string;
  submitLabel: string;
  onComplete: () => void;
};

type PaymentPath = 'wallet' | 'card';
type WalletAvailability = 'unknown' | 'available' | 'unavailable';
const WALLET_READY_TIMEOUT_MS = 4500;

export function CheckoutPaymentForm({
  clientSecret,
  submitLabel,
  onComplete,
}: CheckoutPaymentFormProps) {
  if (!PUBLISHABLE_KEY) {
    return (
      <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
        כרגע לא ניתן לפתוח את התשלום. נסה שוב בעוד רגע.
      </p>
    );
  }

  return (
    <CheckoutElementsProvider
      key={clientSecret}
      stripe={stripePromise}
      options={{
        clientSecret,
      }}
    >
      <CheckoutPaymentFormInner submitLabel={submitLabel} onComplete={onComplete} />
    </CheckoutElementsProvider>
  );
}

function CheckoutPaymentFormInner({
  submitLabel,
  onComplete,
}: Omit<CheckoutPaymentFormProps, 'clientSecret'>) {
  const checkoutState = useCheckout();
  const [paymentPath, setPaymentPath] = useState<PaymentPath>('wallet');
  const [walletAvailability, setWalletAvailability] = useState<WalletAvailability>('unknown');
  const [walletLabel, setWalletLabel] = useState('Apple Pay / Google Pay');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didInitializeEmail, setDidInitializeEmail] = useState(false);

  const normalizedFullName = fullName.trim();
  const normalizedEmail = email.trim();
  const hasValidEmail = isValidEmail(normalizedEmail);
  const hasValidFullName = normalizedFullName.length >= 2;
  const hasRequiredDetails = hasValidEmail && hasValidFullName;
  const lockedCheckoutEmail =
    checkoutState.type === 'success'
      ? (checkoutState.checkout.email?.trim() ?? '')
      : '';
  const isEmailLocked = lockedCheckoutEmail.length > 0;

  useEffect(() => {
    if (checkoutState.type !== 'success' || didInitializeEmail) {
      return;
    }

    const checkoutEmail = checkoutState.checkout.email?.trim() ?? '';
    if (checkoutEmail) {
      setEmail(checkoutEmail);
    }
    setDidInitializeEmail(true);
  }, [checkoutState, didInitializeEmail]);

  useEffect(() => {
    if (paymentPath !== 'wallet' || walletAvailability !== 'unknown') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setWalletAvailability('unavailable');
      setPaymentPath('card');
    }, WALLET_READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [paymentPath, walletAvailability]);

  async function confirmCheckout(args?: {
    expressCheckoutConfirmEvent?: StripeExpressCheckoutElementConfirmEvent;
  }) {
    if (checkoutState.type !== 'success') {
      return;
    }

    if (!normalizedFullName) {
      setSubmitError('צריך להזין שם מלא לפני התשלום.');
      return;
    }

    if (!hasValidFullName) {
      setSubmitError('צריך להזין שם מלא תקין.');
      return;
    }

    if (!normalizedEmail) {
      setSubmitError('צריך להזין כתובת אימייל לפני התשלום.');
      return;
    }

    if (!hasValidEmail) {
      setSubmitError('כתובת האימייל לא תקינה.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const emailForConfirm = isEmailLocked ? lockedCheckoutEmail : normalizedEmail;

      const result = await checkoutState.checkout.confirm({
        redirect: 'if_required',
        expressCheckoutConfirmEvent: args?.expressCheckoutConfirmEvent,
        email: emailForConfirm,
      });

      if (result.type === 'error') {
        setSubmitError(mapCheckoutError(result.error.message));
        return;
      }

      onComplete();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? mapCheckoutError(error.message) : 'לא הצלחנו להשלים את התשלום.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleExpressReady(event: StripeExpressCheckoutElementReadyEvent) {
    const methods = event.availablePaymentMethods;
    const hasAppleOrGoogle = hasAppleOrGoogleWallet(methods);

    setWalletAvailability(hasAppleOrGoogle ? 'available' : 'unavailable');
    setWalletLabel(getWalletLabel(methods));

    if (!hasAppleOrGoogle) {
      setPaymentPath('card');
    }
  }

  if (checkoutState.type === 'loading') {
    return (
      <div className="rounded-[24px] border-2 border-black bg-white px-4 py-6 text-center text-sm font-bold text-neutral-700">
        טוען את שדות התשלום המאובטחים...
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return (
      <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
        {mapCheckoutError(checkoutState.error.message)}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border-2 border-black bg-white p-3">
        <label htmlFor="checkout-full-name" className="text-xs font-black uppercase tracking-[0.16em] text-neutral-600">
          שם מלא
        </label>
        <input
          id="checkout-full-name"
          type="text"
          autoComplete="name"
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value);
            setSubmitError(null);
          }}
          placeholder="ישראל ישראלי"
          className="mt-2 min-h-[48px] w-full rounded-2xl border-2 border-black bg-white px-3 text-base font-bold text-black placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6ce8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        />
        {!hasValidFullName && normalizedFullName ? (
          <p className="mt-2 text-xs font-bold text-[#a03a24]">השם קצר מדי. הזן שם מלא.</p>
        ) : null}
      </div>

      <div className="rounded-[24px] border-2 border-black bg-white p-3">
        <label htmlFor="checkout-email" className="text-xs font-black uppercase tracking-[0.16em] text-neutral-600">
          כתובת אימייל לקבלת אישור תשלום
        </label>
        <input
          id="checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          value={email}
          readOnly={isEmailLocked}
          onChange={(event) => {
            setEmail(event.target.value);
            setSubmitError(null);
          }}
          placeholder="name@example.com"
          className="mt-2 min-h-[48px] w-full rounded-2xl border-2 border-black bg-white px-3 text-base font-bold text-black placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6ce8ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        />
        {!hasValidEmail && normalizedEmail ? (
          <p className="mt-2 text-xs font-bold text-[#a03a24]">האימייל לא תקין. בדוק שוב.</p>
        ) : null}
        {isEmailLocked ? (
          <p className="mt-2 text-xs font-bold text-neutral-600">האימייל נקבע אוטומטית מהחשבון שלך.</p>
        ) : null}
      </div>

      {walletAvailability === 'available' ? (
        <div className="rounded-[24px] border-2 border-black bg-white p-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-600">בחירת אמצעי תשלום</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setPaymentPath('wallet');
              }}
              className={[
                'min-h-[48px] rounded-2xl border-2 px-3 py-2 text-right transition',
                paymentPath === 'wallet'
                  ? 'border-black bg-[#d7f9ff] shadow-[0_4px_0_0_#111111]'
                  : 'border-black bg-white hover:bg-[#f7f7f7]',
              ].join(' ')}
            >
              <p className="text-sm font-black text-black">{walletLabel}</p>
              <p className="mt-0.5 text-xs font-bold text-neutral-700">תשלום מהיר בלחיצה</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setPaymentPath('card');
              }}
              className={[
                'min-h-[48px] rounded-2xl border-2 px-3 py-2 text-right transition',
                paymentPath === 'card'
                  ? 'border-black bg-[#fff6d8] shadow-[0_4px_0_0_#111111]'
                  : 'border-black bg-white hover:bg-[#f7f7f7]',
              ].join(' ')}
            >
              <p className="text-sm font-black text-black">כרטיס אשראי</p>
              <p className="mt-0.5 text-xs font-bold text-neutral-700">הקלדה ידנית של פרטי הכרטיס</p>
            </button>
          </div>
        </div>
      ) : null}

      {paymentPath === 'wallet' && walletAvailability !== 'unavailable' ? (
        <div className="space-y-2 rounded-[24px] border-2 border-black bg-white p-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-neutral-600">
            תשלום מהיר
          </p>
          <div className={hasRequiredDetails ? '' : 'pointer-events-none opacity-60'}>
            <ExpressCheckoutElement
              onReady={handleExpressReady}
              options={{
                buttonHeight: undefined,
                buttonTheme: undefined,
                buttonType: undefined,
                layout: undefined,
                paymentMethodOrder: undefined,
                paymentMethods: {
                  applePay: 'always',
                  googlePay: 'always',
                  amazonPay: 'never',
                  link: 'never',
                  paypal: 'never',
                  klarna: 'never',
                },
              }}
              onConfirm={(event) => {
                void confirmCheckout({
                  expressCheckoutConfirmEvent: event,
                });
              }}
            />
          </div>
          {!hasRequiredDetails ? (
            <div className="rounded-2xl border-2 border-black bg-[#fff6d8] px-3 py-3 text-sm font-bold text-black">
              כדי לשלם ב-{walletLabel}, צריך להזין קודם שם מלא ואימייל תקין.
            </div>
          ) : null}
        </div>
      ) : null}

      {paymentPath === 'card' ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmCheckout();
          }}
        >
          <div className="rounded-[24px] border-2 border-black bg-white p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-neutral-600">
              פרטי אשראי
            </p>
            <PaymentElement />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !hasRequiredDetails}
            className="min-h-[48px] w-full rounded-2xl border-2 border-black bg-[#f7ff4f] px-4 py-3 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'מעבד תשלום...' : submitLabel}
          </button>
        </form>
      ) : null}

      {paymentPath === 'wallet' && walletAvailability === 'unknown' ? (
        <div className="rounded-2xl border-2 border-black bg-white px-3 py-2 text-xs font-bold text-neutral-700">
          בודקים זמינות Apple Pay / Google Pay במכשיר. אם לא מזוהה ארנק נעבור אוטומטית לכרטיס אשראי.
        </div>
      ) : null}

      {walletAvailability === 'unavailable' ? (
        <div className="rounded-2xl border-2 border-black bg-[#fff6d8] px-3 py-2 text-xs font-bold text-black">
          Apple Pay / Google Pay לא זמינים במכשיר הזה, אז המשכנו ישירות לאשראי ידני.
        </div>
      ) : null}

      {submitError ? (
        <p className="rounded-2xl border-2 border-black bg-[#ffd6ce] px-4 py-3 text-sm font-bold text-black">
          {submitError}
        </p>
      ) : null}

      <p className="px-1 text-xs font-bold leading-5 text-neutral-600">אפשר לעבור בין אמצעי התשלום בכל רגע.</p>
    </div>
  );
}

function mapCheckoutError(message: string) {
  if (!message) {
    return 'לא הצלחנו להשלים את התשלום.';
  }

  if (message.includes('email address is required')) {
    return 'צריך להזין כתובת אימייל כדי לאשר את התשלום.';
  }

  if (message.includes('cannot update the email')) {
    return 'לא ניתן לשנות אימייל בעמוד הזה. ממשיכים עם האימייל של החשבון.';
  }

  if (message.includes('invalidEmail') || message.toLowerCase().includes('invalid email')) {
    return 'כתובת האימייל לא תקינה.';
  }

  if (message.includes('publishable key')) {
    return 'כרגע לא ניתן להשלים תשלום. נסה שוב בעוד רגע.';
  }

  return message;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasAppleOrGoogleWallet(methods: AvailablePaymentMethods | undefined) {
  return Boolean(methods?.applePay || methods?.googlePay);
}

function getWalletLabel(
  methods: AvailablePaymentMethods | undefined,
) {
  if (!methods) {
    return 'Apple Pay / Google Pay';
  }

  if (methods.applePay && methods.googlePay) {
    return 'Apple Pay / Google Pay';
  }

  if (methods.applePay) {
    return 'Apple Pay';
  }

  if (methods.googlePay) {
    return 'Google Pay';
  }

  return 'Apple Pay / Google Pay';
}
