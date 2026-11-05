'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export function ConversationHeader({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <header className="sb-conversation-header">
      <div className="sb-topbar">
        <Link href="/" className="sb-wordmark" aria-label="SayBack — עמוד הבית">
          <Image src="/sayback-logo.png" alt="" width={40} height={40} className="sb-original-logo" />
          <span lang="en" dir="ltr">SayBack</span>
        </Link>
        <nav aria-label="ניווט ראשי" className="sb-header-nav">
          <a href="#how-it-works">איך זה עובד?</a>
          <button type="button" onClick={onOpenAccount} className="sb-account-trigger">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 17v-1a6 6 0 0 1 12 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            החשבון שלי
          </button>
        </nav>
      </div>
      <div className="sb-heading-block">
        <p className="sb-eyebrow"><span aria-hidden="true" /> קצת עזרה עם המילים</p>
        <h1>יש הודעה. <span>יש מה לענות.</span></h1>
        <p className="sb-heading-description">
          מדביקים הודעה או צילום מסך, ומקבלים 3 תשובות קצרות וטבעיות בעברית.
        </p>
      </div>
    </header>
  );
}

const DEMO_REPLIES = [
  'כן, בכיף! מתי נוח לך?',
  'מתאים לי. נקבע לשמונה?',
  'אשמח, אבל הערב קצת עמוס. מה עם מחר?',
] as const;

export function ConversationDemo() {
  const titleId = useId();

  return (
    <section className="sb-conversation-demo" aria-labelledby={titleId}>
      <div className="sb-demo-heading">
        <div>
          <p className="sb-eyebrow">ככה זה יכול להיראות</p>
          <h3 id={titleId}>אותה הודעה. שלוש אפשרויות.</h3>
        </div>
        <span className="sb-demo-label">דוגמה בלבד</span>
      </div>
      <div className="sb-demo-incoming">
        <span>ההודעה שקיבלתם</span>
        <p>היי, מתאים לך שנדבר בערב?</p>
      </div>
      <div className="sb-demo-connector" aria-hidden="true">↓</div>
      <ol className="sb-demo-replies" aria-label="שלוש תשובות לדוגמה">
        {DEMO_REPLIES.map((reply, index) => (
          <li key={reply}>
            <span className="sb-demo-reply-number" aria-hidden="true">0{index + 1}</span>
            <p>{reply}</p>
          </li>
        ))}
      </ol>
      <p className="sb-demo-note">התשובות שלכם יופיעו כאן אחרי יצירה. אתם בוחרים מה לשלוח.</p>
    </section>
  );
}

const GUIDE_STEPS = [
  { title: 'מכניסים את ההודעה', text: 'מדביקים את מה שקיבלתם או מצרפים צילום מסך.' },
  { title: 'מוצאים את הטון', text: 'אפשר להתחיל כמו שזה, או לבחור סגנון שמתאים לשיחה.' },
  { title: 'בוחרים מה לענות', text: 'מקבלים 3 אפשרויות. מעתיקים, עורכים או מבקשים ניסוח אחר.' },
] as const;

export function ConversationGuide({ billingBypassEnabled = false }: { billingBypassEnabled?: boolean }) {
  const titleId = useId();

  return (
    <section id="how-it-works" className="sb-conversation-guide" aria-labelledby={titleId}>
      <div className="sb-guide-heading">
        <p className="sb-eyebrow">מההודעה לתשובה</p>
        <h2 id={titleId}>פחות להתלבט. יותר לדבר.</h2>
      </div>
      <ol className="sb-guide-steps">
        {GUIDE_STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="sb-step-number" aria-hidden="true">0{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>
      <div className="sb-scenario-grid">
        <article className="sb-scenario sb-scenario-personal">
          <p className="sb-eyebrow">בשיחות אישיות</p>
          <h3>להגיד את זה בדרך שלכם.</h3>
          <p className="sb-scenario-message">״היה לי ממש כיף אתמול״</p>
          <p className="sb-scenario-answer">״גם לי :) אשמח שנעשה את זה שוב״</p>
          <span className="sb-scenario-caption">דוגמה לתשובה חמה, בלי לחשוב עליה חצי שעה.</span>
        </article>
        <article className="sb-scenario sb-scenario-work">
          <p className="sb-eyebrow">גם בעבודה</p>
          <h3>להיות ברורים. ולהישאר נעימים.</h3>
          <p className="sb-scenario-message">״אפשר לקבל את זה עוד היום?״</p>
          <p className="sb-scenario-answer">״אוכל לשלוח מחר בבוקר, כדי שזה יהיה מוכן כמו שצריך.״</p>
          <span className="sb-scenario-caption">דוגמה להצבת גבול, בלי לוותר על המקצועיות.</span>
        </article>
      </div>
      <div className="sb-faq">
        <h3>שאלות קטנות, תשובות ברורות</h3>
        <details>
          <summary>צריך להירשם כדי להתחיל?</summary>
          <p>אפשר להתחיל בלי להזין אימייל. כדי לשמור גישה לחשבון או לרכוש שימושים, מחברים אימייל דרך ״החשבון שלי״.</p>
        </details>
        <details>
          <summary>אפשר לצרף צילום מסך?</summary>
          <p>כן. אפשר לבחור צילום מסך של השיחה במקום להקליד את ההודעה. גודל התמונה צריך להיות עד 4MB. כדאי לבדוק שהטקסט ברור ושהצילום כולל את ההודעה שרוצים לענות עליה.</p>
        </details>
        <details>
          <summary>כמה שימושים מקבלים?</summary>
          <p>{billingBypassEnabled
            ? 'כרגע SayBack פתוח לשימוש ללא הגבלה. בכל יצירה מקבלים 3 תשובות לבחירה.'
            : 'שלושת השימושים הראשונים בחינם, ואחריהם מקבלים שימוש חינמי אחד ביום. כל יצירה מחזירה 3 תשובות; גם בקשה לניסוח מחדש צורכת שימוש. אפשר להמשיך עם 50 שימושים ב־9.90₪ בתשלום חד־פעמי, או מנוי ללא הגבלה ב־24.90₪ לחודש.'}</p>
        </details>
        <details>
          <summary>מה קורה עם ההודעות והפרטים שלי?</summary>
          <p>ההודעה או הצילום משמשים ליצירת התשובות. שמירת אדם לפעם הבאה היא פעולה נפרדת, ואפשר לערוך או למחוק את הפרטים השמורים. פירוט על עיבוד ושמירת מידע נמצא ב<a href="/privacy">מדיניות הפרטיות</a>.</p>
        </details>
      </div>
    </section>
  );
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function AccountDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    closeRef.current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert]'),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', trapFocus);
    return () => {
      dialog.removeEventListener('keydown', trapFocus);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="sb-account-dialog"
      dir="rtl"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div className="sb-account-dialog-content">
        <header className="sb-account-dialog-heading">
          <div>
            <p className="sb-eyebrow">הכול במקום אחד</p>
            <h2 id={titleId}>החשבון שלי</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="סגירת החשבון" className="sb-dialog-close">×</button>
        </header>
        <div className="sb-account-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
