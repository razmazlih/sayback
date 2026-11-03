'use client';

import { useEffect, useRef, useState } from 'react';
import type { CommitmentMode, GrammaticalGender, LanguagePreferences } from '@/lib/reply-context';
import { MAX_COMMITMENT_DETAILS_LENGTH } from '@/lib/reply-context';
import { MAX_INCOMING_MESSAGE_LENGTH, MAX_LAST_OUTGOING_MESSAGE_LENGTH } from '@/lib/message-limits';

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#247663] focus-visible:ring-offset-2';

export function LanguagePreferenceControls({ value, onChange }: {
  value: LanguagePreferences;
  onChange: (value: LanguagePreferences) => void;
}) {
  return (
    <details className="rounded-2xl border border-[#e2d7c8] bg-white p-3">
      <summary className={`min-h-11 cursor-pointer rounded-xl py-3 text-sm font-bold text-[#463b33] ${focus}`}>לשון הפנייה · לבחירה</summary>
      <p className="mb-3 text-xs leading-5 text-[#6d6259]">בלי בחירה נעדיף ניסוח שאינו תלוי במגדר. הבחירה נשארת רק כל עוד הדף פתוח.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['speaker', 'recipient'] as const).map((side) => (
          <label key={side} className="grid gap-1 text-sm font-bold text-[#463b33]">
            {side === 'speaker' ? 'איך לנסח בשמך?' : 'איך לפנות לצד השני?'}
            <select value={value[side]} onChange={(event) => onChange({ ...value, [side]: event.target.value as GrammaticalGender })} className={`min-h-11 w-full rounded-xl border border-[#ded2c3] bg-white px-3 text-sm ${focus}`}>
              <option value="neutral">ללא העדפה</option>
              <option value="masculine">לשון זכר</option>
              <option value="feminine">לשון נקבה</option>
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}

export function CommitmentControls({ kind, mode, details, onChange }: {
  kind: 'time' | 'price';
  mode: CommitmentMode;
  details: string;
  onChange: (mode: CommitmentMode, details: string) => void;
}) {
  return (
    <fieldset className="sb-motion-panel rounded-2xl border border-[#e2d7c8] bg-[#f8f3eb] p-3">
      <legend className="px-1 text-sm font-bold text-[#463b33]">{kind === 'time' ? 'יש מועד שמתאים לך?' : 'יש מחיר שמתאים לך?'}</legend>
      <p className="mb-2 text-xs leading-5 text-[#6d6259]">אפשר להמשיך בלי לבחור. לא נאשר בשמך מועד או מחיר.</p>
      <div className="flex flex-wrap gap-2">
        {([['ask', 'לבקש פרטים'], ['defer', 'בלי להתחייב'], ['provided', 'יש לי פרטים']] as const).map(([option, label]) => (
          <button key={option} type="button" aria-pressed={mode === option} onClick={() => onChange(option, option === 'provided' ? details : '')} className={`min-h-11 rounded-xl border px-3 text-xs font-bold ${mode === option ? 'border-[#78b9a9] bg-[#e3fbf7] text-[#123a36]' : 'border-[#ded2c3] bg-white text-[#5b4d42]'} ${focus}`}>{label}</button>
        ))}
      </div>
      {mode === 'provided' ? (
        <label className="sb-motion-panel mt-3 grid gap-1 text-sm font-bold text-[#463b33]">
          מה אפשר להציע בשמך?
          <input id="commitment-details" value={details} onChange={(event) => onChange('provided', event.target.value)} maxLength={MAX_COMMITMENT_DETAILS_LENGTH} placeholder={kind === 'time' ? 'למשל: יום חמישי בשעה 18:00' : 'למשל: 250 ש״ח, בלי משלוח'} className={`min-h-11 min-w-0 rounded-xl border border-[#ded2c3] bg-white px-3 text-base font-normal ${focus}`} />
        </label>
      ) : null}
    </fieldset>
  );
}

export function ContinueConversationDialog({ suggestedReply, onCancel, onContinue }: {
  suggestedReply: string;
  onCancel: () => void;
  onContinue: (sentMessage: string, incomingMessage: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const sentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [sent, setSent] = useState(suggestedReply);
  const [incoming, setIncoming] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    sentInputRef.current?.focus();
    return () => {
      dialog?.close();
      // React may remove the dialog before passive cleanup, preventing native focus restoration.
      // Continuing replaces the results, so only restore an opener that is still available.
      if (opener?.isConnected && !opener.closest('[inert]') && opener.getClientRects().length) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="continue-title" aria-describedby="continue-help" onCancel={(event) => { event.preventDefault(); onCancel(); }} dir="rtl" className="sb-motion-dialog m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-[24px] border border-[#e2d7c8] bg-[#fffdfa] p-5 text-right text-[#241d18] shadow-xl backdrop:bg-black/40">
      <form onSubmit={(event) => { event.preventDefault(); if (sent.trim() && sent.trim().length <= MAX_LAST_OUTGOING_MESSAGE_LENGTH && incoming.trim()) onContinue(sent.trim(), incoming.trim()); }}>
        <h2 id="continue-title" className="text-xl font-black">ענו לך? ממשיכים מכאן</h2>
        <p id="continue-help" className="mt-2 text-sm leading-6 text-[#6d6259]">בדקו מה נשלח בפועל — העתקה אינה שליחה. ההקשר זמני, ונמחק עם ״הודעה חדשה״.</p>
        <label className="mt-4 grid gap-2 text-sm font-bold">
          מה שלחת בפועל?
          <textarea ref={sentInputRef} value={sent} onChange={(event) => setSent(event.target.value)} maxLength={MAX_LAST_OUTGOING_MESSAGE_LENGTH} required className={`min-h-24 w-full rounded-2xl border border-[#ded2c3] bg-white p-3 text-base font-normal leading-7 ${focus}`} />
        </label>
        {sent.trim().length > MAX_LAST_OUTGOING_MESSAGE_LENGTH ? <p role="alert" className="mt-2 text-sm text-[#b42318]">ההודעה ארוכה מדי. אפשר לצרף עד {MAX_LAST_OUTGOING_MESSAGE_LENGTH} תווים; השאירו את החלק הרלוונטי להמשך.</p> : null}
        <label className="mt-4 grid gap-2 text-sm font-bold">
          מה ענו לך?
          <textarea value={incoming} onChange={(event) => setIncoming(event.target.value)} maxLength={MAX_INCOMING_MESSAGE_LENGTH} required className={`min-h-24 w-full rounded-2xl border border-[#ded2c3] bg-white p-3 text-base font-normal leading-7 ${focus}`} />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={!sent.trim() || sent.trim().length > MAX_LAST_OUTGOING_MESSAGE_LENGTH || !incoming.trim()} className={`min-h-12 flex-1 rounded-2xl bg-[#241d18] px-4 py-3 text-sm font-bold text-white disabled:opacity-50 ${focus}`}>להשתמש בהמשך הזה</button>
          <button type="button" onClick={onCancel} className={`min-h-12 rounded-2xl border border-[#ded2c3] px-4 py-3 text-sm font-bold ${focus}`}>ביטול</button>
        </div>
      </form>
    </dialog>
  );
}
