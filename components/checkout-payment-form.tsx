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
const WALLET_READY_TIMEOUT_MS = 9000;

export function CheckoutPaymentForm({
  clientSecret,
  submitLabel,
  onComplete,
}: CheckoutPaymentFormProps) {
  if (!PUBLISHABLE_KEY) {
    return (
      <p role="alert" className="rounded-2xl border border-[#e2d7c8] bg-[#fff0ea] px-4 py-3 text-sm font-medium text-[#181411]">
        לא הצלחנו לפתוח תשלום כרגע. נסו שוב בעוד רגע.
      </p>
    );
  }

  return (
    <CheckoutElementsProvider
      key={clientSecret}
      stripe={stripePromise}
      options={{
        clientSecret,
        elementsOptions: {
          appearance: {
            variables: {
              fontSizeBase: '16px',
              colorPrimary: '#ff5a2a',
              colorText: '#181411',
              colorBackground: '#fffdfa',
              colorDanger: '#7a2d19',
              borderRadius: '12px',
            },
          },
        },
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
  const [walletLabel, setWalletLabel] = useState('אפל פיי / גוגל פיי');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!isEmailLocked || lockedCheckoutEmail === email) {
      return;
    }

    setEmail(lockedCheckoutEmail);
  }, [email, isEmailLocked, lockedCheckoutEmail]);

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
      setSubmitError('כדי להמשיך צריך להזין שם מלא.');
      return;
    }

    if (!hasValidFullName) {
      setSubmitError('נא להזין שם מלא תקין.');
      return;
    }

    if (!normalizedEmail) {
      setSubmitError('כדי להמשיך צריך להזין אימייל.');
      return;
    }

    if (!hasValidEmail) {
      setSubmitError('כתובת האימייל לא תקינה.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (!isEmailLocked) {
        const updateResult = await checkoutState.checkout.updateEmail(normalizedEmail);

        if (updateResult.type === 'error') {
          if (!isSessionManagedEmailError(updateResult.error.message)) {
            setSubmitError(mapCheckoutError(updateResult.error.message));
            return;
          }
        }
      }

      const result = await checkoutState.checkout.confirm({
        redirect: 'if_required',
        expressCheckoutConfirmEvent: args?.expressCheckoutConfirmEvent,
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

  function handleExpressLoadError(message: string) {
    setWalletAvailability('unavailable');
    setPaymentPath('card');
    setSubmitError(mapCheckoutError(message));
  }

  if (checkoutState.type === 'loading') {
    return (
      <div role="status" className="rounded-[20px] border border-[#e2d7c8] bg-white px-4 py-6 text-center text-sm font-medium text-neutral-700">
        רגע, מכינים את התשלום...
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return (
      <p role="alert" className="rounded-2xl border border-[#e2d7c8] bg-[#fff0ea] px-4 py-3 text-sm font-medium text-[#181411]">
        {mapCheckoutError(checkoutState.error.message)}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[20px] border border-[#e2d7c8] bg-white p-3">
        <label htmlFor="checkout-full-name" className="text-xs font-semibold text-neutral-600">
          שם מלא
        </label>
        <input
          id="checkout-full-name"
          type="text"
          autoComplete="name"
          aria-required="true"
          aria-invalid={Boolean(normalizedFullName) && !hasValidFullName}
          aria-describedby={!hasValidFullName && normalizedFullName ? 'checkout-name-error' : undefined}
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value);
            setSubmitError(null);
          }}
          placeholder="ישראל ישראלי"
          className="mt-2 min-h-[48px] w-full rounded-2xl border border-[#e2d7c8] bg-white px-3 text-base font-medium text-[#181411] placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a2a] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        />
        {!hasValidFullName && normalizedFullName ? (
          <p id="checkout-name-error" className="mt-2 text-xs font-medium text-[#a03a24]">השם קצר מדי. הזן שם מלא.</p>
        ) : null}
      </div>

      <div className="rounded-[20px] border border-[#e2d7c8] bg-white p-3">
        <label htmlFor="checkout-email" className="text-xs font-semibold text-neutral-600">
          אימייל לקבלת אישור תשלום
        </label>
        <input
          id="checkout-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          aria-required="true"
          aria-invalid={Boolean(normalizedEmail) && !hasValidEmail}
          aria-describedby={!hasValidEmail && normalizedEmail ? 'checkout-email-error' : isEmailLocked ? 'checkout-email-hint' : undefined}
          value={email}
          readOnly={isEmailLocked}
          onChange={(event) => {
            setEmail(event.target.value);
            setSubmitError(null);
          }}
          className="mt-2 min-h-[48px] w-full rounded-2xl border border-[#e2d7c8] bg-white px-3 text-base font-medium text-[#181411] placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a2a] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        />
        {!hasValidEmail && normalizedEmail ? (
          <p id="checkout-email-error" className="mt-2 text-xs font-medium text-[#a03a24]">האימייל לא תקין. בדוק שוב.</p>
        ) : null}
        {isEmailLocked ? (
          <p id="checkout-email-hint" className="mt-2 text-xs font-medium text-neutral-600">האימייל נמשך אוטומטית מהחשבון שלך.</p>
        ) : null}
      </div>

      {walletAvailability === 'available' ? (
        <div className="rounded-[20px] border border-[#e2d7c8] bg-white p-3">
          <p className="text-xs font-semibold text-neutral-600">בחירת אמצעי תשלום</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={paymentPath === 'wallet'}
              onClick={() => {
                setSubmitError(null);
                setPaymentPath('wallet');
              }}
              className={[
                'min-h-[48px] rounded-2xl border px-3 py-2 text-right transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a2a]',
                paymentPath === 'wallet'
                  ? 'border-[#ff5a2a] bg-[#fff0ea]'
                  : 'border-[#e2d7c8] bg-white hover:bg-[#fffdfa]',
              ].join(' ')}
            >
              <p className="text-sm font-semibold text-[#181411]">{walletLabel}</p>
              <p className="mt-0.5 text-xs font-medium text-neutral-700">תשלום מהיר</p>
            </button>

            <button
              type="button"
              aria-pressed={paymentPath === 'card'}
              onClick={() => {
                setSubmitError(null);
                setPaymentPath('card');
              }}
              className={[
                'min-h-[48px] rounded-2xl border px-3 py-2 text-right transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a2a]',
                paymentPath === 'card'
                  ? 'border-[#ff5a2a] bg-[#fff0ea]'
                  : 'border-[#e2d7c8] bg-white hover:bg-[#fffdfa]',
              ].join(' ')}
            >
              <p className="text-sm font-semibold text-[#181411]">כרטיס אשראי</p>
              <p className="mt-0.5 text-xs font-medium text-neutral-700">תשלום בכרטיס</p>
            </button>
          </div>
        </div>
      ) : null}

      {paymentPath === 'wallet' && walletAvailability !== 'unavailable' ? (
        <div className="space-y-2 rounded-[20px] border border-[#e2d7c8] bg-white p-3">
          <p className="text-xs font-semibold text-neutral-600">
            תשלום מהיר
          </p>
          <div className={hasRequiredDetails ? '' : 'pointer-events-none opacity-60'}>
            <ExpressCheckoutElement
              onReady={handleExpressReady}
              onLoadError={(event) => {
                handleExpressLoadError(event.error.message ?? '');
              }}
              options={{
                buttonHeight: undefined,
                buttonTheme: undefined,
                buttonType: undefined,
                layout: undefined,
                paymentMethodOrder: ['apple_pay', 'google_pay'],
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
            <div className="rounded-2xl border border-[#e2d7c8] bg-[#fffdfa] px-3 py-3 text-sm font-medium text-[#181411]">
              כדי לשלם עם {walletLabel}, צריך קודם להזין שם מלא ואימייל תקין.
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
          <div className="rounded-[20px] border border-[#e2d7c8] bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-neutral-600">
              פרטי אשראי
            </p>
            <PaymentElement />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !hasRequiredDetails}
            className="min-h-[48px] w-full rounded-2xl border border-[#e2d7c8] bg-[#ff5a2a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6d6259] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff5a2a] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'מעבד תשלום...' : submitLabel}
          </button>
        </form>
      ) : null}

      {paymentPath === 'wallet' && walletAvailability === 'unknown' ? (
        <div className="rounded-2xl border border-[#e2d7c8] bg-white px-3 py-2 text-xs font-medium text-neutral-700">
          בודקים אם אפשר לשלם בתשלום מהיר במכשיר הזה. אם לא, נעבור אוטומטית לכרטיס אשראי.
        </div>
      ) : null}

      {walletAvailability === 'unavailable' ? (
        <div className="rounded-2xl border border-[#e2d7c8] bg-[#fffdfa] px-3 py-2 text-xs font-medium text-[#181411]">
          תשלום מהיר לא זמין כרגע במכשיר הזה. אפשר להמשיך בכרטיס אשראי.
        </div>
      ) : null}

      {submitError ? (
        <p role="alert" className="rounded-2xl border border-[#e2d7c8] bg-[#fff0ea] px-4 py-3 text-sm font-medium text-[#181411]">
          {submitError}
        </p>
      ) : null}

      <p className="px-1 text-xs font-medium leading-5 text-neutral-600">אפשר לעבור בין אמצעי התשלום בכל רגע.</p>
    </div>
  );
}

function isSessionManagedEmailError(message: string) {
  return (
    message.includes('cannot set the `email` in confirm()') ||
    message.includes('cannot update the email') ||
    message.includes('customer_email') ||
    message.includes('already set on the Checkout Session')
  );
}

function mapCheckoutError(message: string) {
  if (!message) {
    return 'לא הצלחנו להשלים את התשלום.';
  }

  const lower = message.toLowerCase();

  if (message.includes('email address is required')) {
    return 'כדי להמשיך צריך להזין אימייל.';
  }

  if (isSessionManagedEmailError(message)) {
    return 'האימייל כבר מוגדר לתשלום הזה.';
  }

  if (message.includes('invalidEmail') || lower.includes('invalid email')) {
    return 'כתובת האימייל לא תקינה.';
  }

  if (message.includes('publishable key')) {
    return 'כרגע לא ניתן להשלים תשלום. נסה שוב בעוד רגע.';
  }

  if (
    lower.includes('payment method domain') ||
    lower.includes('register your domain') ||
    lower.includes('domain is not registered')
  ) {
    return 'לא הצלחנו להפעיל תשלום מהיר כרגע. אפשר להמשיך בכרטיס אשראי.';
  }

  if (lower.includes('https')) {
    return 'תשלום מהיר לא זמין כרגע. אפשר להמשיך בכרטיס אשראי.';
  }

  return 'לא הצלחנו להשלים את התשלום. נסו שוב.';
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
    return 'אפל פיי / גוגל פיי';
  }

  if (methods.applePay && methods.googlePay) {
    return 'אפל פיי / גוגל פיי';
  }

  if (methods.applePay) {
    return 'אפל פיי';
  }

  if (methods.googlePay) {
    return 'גוגל פיי';
  }

  return 'אפל פיי / גוגל פיי';
}
