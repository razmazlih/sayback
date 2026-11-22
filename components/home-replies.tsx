import { useEffect, useRef, useState } from 'react';
import { DisclosurePanel } from '@/components/disclosure-panel';
import { whiteSurfaceFocusClass } from '@/components/home-focus-styles';
import { trackEvent } from '@/lib/analytics';

export type ReplyAction = 'softer' | 'sharper' | 'retry';

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
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#e2d7c8] bg-[#fff6e8] px-2 py-2 text-xs leading-5 text-[#5b3d29] transition hover:bg-[#f6ead8] disabled:cursor-not-allowed disabled:opacity-60 ${whiteSurfaceFocusClass}`}
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
        className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-50 ${copied ? 'bg-[#fff6e8] text-[#5b3d29]' : 'bg-[#241d18] text-white hover:bg-[#463b33]'} ${whiteSurfaceFocusClass}`}
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
      className={`sb-reply-card relative w-full min-w-0 rounded-[24px] border bg-[#fffdfa] p-4 shadow-[0_4px_16px_rgba(49,23,13,0.04)] transition-colors sm:p-5 ${copied && !isEditing ? 'border-[#d6b58e] ring-1 ring-[#e2d7c8]' : 'border-[#e2d7c8]'}`}
    >
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="flex items-center gap-2 text-sm font-bold text-[#6d6259]">
          <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f3e9df] text-xs tabular-nums text-[#7a2d19]">{index + 1}</span>
          תשובה {index + 1}
        </h3>
        <span role="status" className="text-xs font-bold text-[#795637]">
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
          }} className={`mt-3 min-h-11 rounded-xl border border-[#e2d7c8] bg-white px-3 text-sm font-bold text-[#5b3d29] disabled:opacity-50 ${whiteSurfaceFocusClass}`}>להחזיר את הנוסח הקודם</button>
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

export function LoadingReplies({ isNoReplyMode }: { isNoReplyMode: boolean }) {
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
