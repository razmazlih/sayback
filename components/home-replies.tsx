import { type ReactNode, useEffect, useRef, useState } from 'react';
import { DisclosurePanel } from '@/components/disclosure-panel';
import { whiteSurfaceFocusClass } from '@/components/home-focus-styles';
import { trackEvent } from '@/lib/analytics';

export type ReplyAction = 'softer' | 'sharper' | 'retry';

const replySurfaceClass = 'sb-reply-card relative w-full min-w-0 rounded-[24px] border bg-[#fffdfa] p-4 shadow-[0_4px_16px_rgba(49,23,13,0.04)] transition-colors sm:p-5';
const replyHeadingClass = 'mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2';
const replyTextClass = 'whitespace-pre-wrap rounded-[18px] bg-[#f8f3eb] px-4 py-4 text-start text-[1.0625rem] font-medium leading-[1.85] text-[#241d18] [overflow-wrap:anywhere] sm:text-lg';
const replyActionsClass = 'mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2';

function ReplyRefinement({
  index,
  isBusy,
  usageHint,
  onAdjust,
  onCustomAdjust,
}: {
  index: number;
  isBusy: boolean;
  usageHint: string;
  onAdjust: (index: number, action: ReplyAction) => void;
  onCustomAdjust: (index: number, instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  return (
    <fieldset disabled={isBusy} className="mt-3 min-w-0 border-t border-[#e2d7c8] pt-2">
      <legend className="px-1 text-sm font-bold">שיפור בעזרת AI</legend>
      <p className="mb-2 text-xs leading-5 text-[#6d6259]">{usageHint}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {([
          ['softer', 'עדין יותר'],
          ['sharper', 'חד יותר'],
          ['retry', 'ניסוח חדש'],
        ] as const).map(([action, label]) => (
          <button
            key={action}
            type="button"
            onClick={() => onAdjust(index, action)}
            className={`min-h-11 rounded-xl border border-[#ded2c3] bg-white px-2 text-xs font-bold text-[#463b33] hover:bg-[#f8f3eb] disabled:opacity-50 ${whiteSurfaceFocusClass}`}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const next = instruction.trim();
          if (next && !isBusy) onCustomAdjust(index, next);
        }}
      >
        <label htmlFor={`custom-refine-${index}`} className="text-sm font-bold">איך לשנות?</label>
        <div className="mt-1 flex gap-2">
          <input
            id={`custom-refine-${index}`}
            value={instruction}
            maxLength={220}
            onFocus={() => trackEvent('custom_refine_open', { index })}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="למשל, קצר וחם יותר"
            className={`min-h-11 min-w-0 flex-1 rounded-xl border border-[#ded2c3] bg-white px-3 text-sm ${whiteSurfaceFocusClass}`}
          />
          <button
            type="submit"
            disabled={isBusy || !instruction.trim()}
            className={`min-h-11 rounded-xl bg-[#241d18] px-3 text-sm font-bold text-white disabled:opacity-50 ${whiteSurfaceFocusClass}`}
          >
            לשפר
          </button>
        </div>
      </form>
    </fieldset>
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
  children,
}: {
  index: number;
  copied: boolean;
  reply: string;
  isUpdating: boolean;
  onCopy: (reply: string, index: number) => void;
  onShare: (reply: string, index: number) => void;
  onStartEditing: () => void;
  onContinue: (reply: string) => void;
  children: ReactNode;
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
        aria-label={copied ? `הועתק הנוסח של תשובה ${index + 1}` : `העתקה של תשובה ${index + 1}`}
        className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-50 ${copied ? 'bg-[#fff6e8] text-[#5b3d29]' : 'bg-[#241d18] text-white hover:bg-[#463b33]'} ${whiteSurfaceFocusClass}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
        </svg>
        <span role="status">{copied ? 'הועתק' : 'העתקה'}</span>
      </button>
      <button
        type="button"
        aria-label={`אפשרויות נוספות לתשובה ${index + 1}`}
        aria-expanded={isMoreOpen}
        aria-controls={panelId}
        disabled={isUpdating}
        onClick={() => setIsMoreOpen((current) => !current)}
        className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-[#e2d7c8] bg-white px-3 text-sm font-bold text-[#5b4d42] transition-colors hover:bg-[#f8f3eb] disabled:cursor-wait disabled:opacity-50 ${whiteSurfaceFocusClass}`}
      >
        אפשרויות
      </button>
      <DisclosurePanel open={isMoreOpen} id={panelId} className="col-span-2">
        <div className="mt-2 rounded-2xl bg-[#f8f3eb] p-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={isUpdating} onClick={onStartEditing} className={`min-h-11 rounded-xl px-3 text-sm font-bold text-[#463b33] hover:bg-white disabled:opacity-50 ${whiteSurfaceFocusClass}`}>
              עריכה שלי
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
          </div>
          {children}
        </div>
      </DisclosurePanel>
    </>
  );
}

export function ReplyCard({
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
      className={`${replySurfaceClass} ${copied && !isEditing ? 'border-[#d6b58e] ring-1 ring-[#e2d7c8]' : 'border-[#e2d7c8]'}`}
    >
      <div className={replyHeadingClass}>
        <h3 id={titleId} className="flex items-center gap-2 text-sm font-bold text-[#6d6259]">
          תשובה {index + 1}
        </h3>
        <span role="status" className="text-xs font-bold text-[#795637]">
          {isUpdating ? 'מלטשים את הניסוח…' : previousReply && !isEditing ? 'הנוסח עודכן' : ''}
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
          <p key={reply} dir="auto" className={`sb-motion-reply sb-reply-text ${replyTextClass} ${isUpdating ? 'opacity-55' : ''}`}>
            {reply}
          </p>
          <div className={replyActionsClass}>
            <ReplyActions index={index} copied={copied} reply={reply} isUpdating={isUpdating} onCopy={onCopy} onShare={onShare} onContinue={onContinue} onStartEditing={() => setIsEditing(true)}>
              <ReplyRefinement index={index} isBusy={isBusy} usageHint={usageHint} onAdjust={onAdjust} onCustomAdjust={onCustomAdjust} />
            </ReplyActions>
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
          }} className={`mt-3 min-h-11 rounded-xl border border-[#e2d7c8] bg-white px-3 text-sm font-bold text-[#5b3d29] disabled:opacity-50 ${whiteSurfaceFocusClass}`}>להחזיר את הנוסח הקודם</button>
          <p className="mt-1 text-xs text-[#6d6259]">החזרה לנוסח הקודם אינה משתמשת בשימוש נוסף.</p>
        </details>
      ) : null}

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

export function LoadingReplies() {
  return (
    <div aria-hidden="true" className="w-full min-w-0 space-y-3">
      {['78%', '58%', '68%'].map((lineWidth, index) => (
        <div key={lineWidth} className={`${replySurfaceClass} sb-reply-skeleton border-[#e2d7c8]`}>
          <div className={replyHeadingClass}>
            <span className="text-sm font-bold text-[#6d6259]">תשובה {index + 1}</span>
          </div>
          <p className={replyTextClass}>
            <span className="sb-skeleton-fill inline-block h-3 align-middle rounded-full" style={{ width: lineWidth }} />
          </p>
          <div className={replyActionsClass}>
            <span className="sb-skeleton-fill min-h-12 rounded-2xl" />
            <span className="sb-skeleton-fill grid min-h-12 place-items-center rounded-2xl border border-transparent px-3 text-sm font-bold">
              <span className="invisible">אפשרויות</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
