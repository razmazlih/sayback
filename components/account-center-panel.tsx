'use client';

import { useId, type FormEvent } from 'react';
import { DirectionIcon } from './direction-choice-visuals';
import './account-center-panel.css';

export type AccountCenterPanelProps = {
  accountEmail: string | null;
  isRecoverableAccount: boolean;
  authEmailInput: string;
  onAuthEmailInputChange: (value: string) => void;
  onStartEmailLink: (intent: 'checkout' | 'recover', plan?: 'credits_50' | 'unlimited_monthly' | null) => void;
  isSendingAuthEmail: boolean;
  isCompletingEmailLink: boolean;
  pendingEmailCompletion: boolean;
  authEmailNotice: string | null;
  authEmailError: string | null;
  isSessionReady: boolean;
  isBillingLoading: boolean;
  accountStatusLine: string;
  nextConsumptionSource?: 'initial_free' | 'daily_free' | 'credits' | 'unlimited' | 'blocked';
  dailyResetAt: string | null;
  paidCredits: number;
  hasUnlimitedAccess: boolean;
  managedSubscription: { cancelAtPeriodEnd: boolean } | null;
  onRefreshBilling: () => void;
  className?: string;
  compact?: boolean;
  billingBypassEnabled?: boolean;
};

function AccountGlyph({ kind }: { kind: 'mail' | 'refresh' }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {kind === 'mail' ? <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></> : <><path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3" /></>}
    </svg>
  );
}

function shortDateTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function AccountCenterPanel({
  accountEmail, isRecoverableAccount, authEmailInput, onAuthEmailInputChange,
  onStartEmailLink, isSendingAuthEmail, isCompletingEmailLink, pendingEmailCompletion,
  authEmailNotice, authEmailError, isSessionReady, isBillingLoading, accountStatusLine,
  nextConsumptionSource, dailyResetAt, paidCredits, hasUnlimitedAccess,
  managedSubscription, onRefreshBilling, className = '', compact = false,
  billingBypassEnabled = false,
}: AccountCenterPanelProps) {
  const emailInputId = useId();
  const titleId = useId();
  const emailHelpId = useId();
  const dailyResetLabel = shortDateTime(dailyResetAt);
  const nextUseLabel = isBillingLoading
    ? 'בודקים…'
    : nextConsumptionSource === 'unlimited'
      ? billingBypassEnabled ? 'ללא הגבלה כרגע' : 'כלול במנוי החודשי'
      : nextConsumptionSource === 'credits'
        ? 'מיתרת החבילה'
        : nextConsumptionSource === 'initial_free'
          ? 'משימושי ההיכרות בחינם'
          : nextConsumptionSource === 'daily_free'
            ? 'מהשימוש החינמי היומי'
            : 'אין כרגע שימוש זמין';
  const subscriptionLabel = isBillingLoading
    ? 'בודקים…'
    : managedSubscription
      ? managedSubscription.cancelAtPeriodEnd
        ? 'פעיל עד סוף התקופה, ללא חידוש'
        : 'חודשי, מתחדש אוטומטית'
      : billingBypassEnabled
        ? 'אין צורך בתשלום כרגע'
        : hasUnlimitedAccess
          ? 'ללא הגבלה פעיל'
          : paidCredits > 0
            ? `${paidCredits} שימושים בחבילה`
            : 'ללא חבילה או מנוי';
  const emailBusy = isSendingAuthEmail || isCompletingEmailLink;

  return (
    <section className={`sb-account-center ${compact ? 'sb-account-center-compact' : ''} ${className}`.trim()} aria-labelledby={titleId}>
      <div className="sb-account-center-header">
        <div>
          <h3 id={titleId}>גישה ושחזור</h3>
          <p className="sb-account-center-status">{accountStatusLine}</p>
        </div>
        <button type="button" className="sb-account-center-refresh" onClick={onRefreshBilling} disabled={!isSessionReady || isBillingLoading} aria-label="רענון מצב חשבון">
          <AccountGlyph kind="refresh" />{isBillingLoading ? 'מרעננים…' : 'רענון'}
        </button>
      </div>

      <dl className="sb-account-center-facts">
        <div className="sb-account-center-fact sb-account-center-access">
          <dt><span className="sb-account-center-icon"><DirectionIcon name="shield" /></span>השימוש הבא</dt>
          <dd>{nextUseLabel}</dd>
          {dailyResetLabel && nextConsumptionSource === 'blocked' ? <dd className="sb-account-center-reset">החינם היומי יתחדש סביב {dailyResetLabel}.</dd> : null}
        </div>
        <div className="sb-account-center-fact">
          <dt><span className="sb-account-center-icon"><DirectionIcon name="key" /></span>שחזור גישה</dt>
          <dd>{isRecoverableAccount && accountEmail ? <bdi dir="ltr">{accountEmail}</bdi> : 'עדיין לא מחובר אימייל'}</dd>
        </div>
        <div className="sb-account-center-fact">
          <dt><span className="sb-account-center-icon"><DirectionIcon name="list" /></span>מנוי וחבילות</dt>
          <dd>{subscriptionLabel}</dd>
        </div>
      </dl>

      {!isRecoverableAccount ? (
        <form className="sb-account-center-email" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onStartEmailLink('checkout', null);
        }}>
          <div className="sb-account-center-email-title"><span className="sb-account-center-icon"><AccountGlyph kind="mail" /></span><label htmlFor={emailInputId}>שמירת החשבון באימייל</label></div>
          <p id={emailHelpId}>לפני רכישה מחברים אימייל בקישור חד־פעמי. כך הגישה נשמרת גם במכשיר אחר.</p>
          <div className="sb-account-center-email-fields">
            <input id={emailInputId} type="email" dir="ltr" inputMode="email" autoComplete="email" value={authEmailInput}
              onChange={(event) => onAuthEmailInputChange(event.target.value)} placeholder="name@example.com" aria-describedby={emailHelpId} />
            <button type="submit" className="sb-account-center-primary" disabled={emailBusy}>
              {isCompletingEmailLink ? 'מחברים…' : pendingEmailCompletion ? 'השלמת חיבור' : isSendingAuthEmail ? 'שולחים…' : 'שליחת קישור'}
            </button>
          </div>
          <button type="button" className="sb-account-center-recover" onClick={() => onStartEmailLink('recover', null)} disabled={emailBusy}>
            <DirectionIcon name="key" />כבר יש חשבון? כניסה ושחזור
          </button>
        </form>
      ) : null}

      {authEmailNotice ? <p className="sb-account-center-notice" role="status">{authEmailNotice}</p> : null}
      {authEmailError ? <p className="sb-account-center-error" role="alert">{authEmailError}</p> : null}
    </section>
  );
}
