'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  MAX_CONVERSATION_LABEL_LENGTH,
  type ConversationProfile,
} from '@/lib/conversation-profile-types';
import type { ContextOption, ToneOption } from '@/lib/generator-options';

const focusClass =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';

export function SavedConversationsRow({
  profiles,
  activeId,
  disabled,
  error,
  onSelect,
  onClear,
  onManage,
  onRetry,
}: {
  profiles: ConversationProfile[];
  activeId: string | null;
  disabled: boolean;
  error: string | null;
  onSelect: (profile: ConversationProfile) => void;
  onClear: () => void;
  onManage: () => void;
  onRetry: () => void;
}) {
  if (profiles.length === 0 && !error) {
    return null;
  }

  if (profiles.length === 0 && error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e2d7c8] bg-[#fff9ef] px-3 py-2">
        <p className="text-xs font-bold text-[#6d6259]">לא הצלחנו לטעון את השיחות השמורות.</p>
        <button type="button" onClick={onRetry} className={`min-h-[40px] text-xs font-black text-[#8f371e] ${focusClass}`}>
          לנסות שוב
        </button>
      </div>
    );
  }

  return (
    <section aria-label="שיחות שמורות" className="min-w-0 rounded-[20px] border border-[#e2d7c8] bg-[#fff9ef] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-[#241d18]">ממשיכים שיחה?</p>
        <button
          type="button"
          onClick={onManage}
          disabled={disabled}
          className={`min-h-[40px] rounded-full px-2 text-xs font-black text-[#8f371e] disabled:opacity-50 ${focusClass}`}
        >
          ניהול
        </button>
      </div>
      <div className="scrollbar-none mt-1 flex snap-x gap-2 overflow-x-auto pb-1" dir="rtl">
        {profiles.map((profile) => {
          const active = profile.id === activeId;
          return (
            <button
              key={profile.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(profile)}
              className={[
                `min-h-[42px] shrink-0 snap-start rounded-full border px-3 py-1.5 text-sm font-black transition disabled:opacity-50 ${focusClass}`,
                active
                  ? 'border-[#ff623d] bg-[#fff0ea] text-[#7a2d19] shadow-[0_6px_14px_rgba(255,98,61,0.12)]'
                  : 'border-[#ded2c3] bg-white text-[#241d18]',
              ].join(' ')}
            >
              {profile.label}
            </button>
          );
        })}
        {activeId ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className={`min-h-[42px] shrink-0 rounded-full px-2 text-xs font-black text-[#6d6259] disabled:opacity-50 ${focusClass}`}
          >
            בלי שיחה שמורה ×
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs font-bold text-[#9a3412]">{error}</p> : null}
    </section>
  );
}

export function SaveConversationDialog({
  open,
  context,
  tone,
  busy,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  context: ContextOption | null;
  tone: ToneOption;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleClose() {
    setLabel('');
    onClose();
  }

  useDialogLifecycle(open, handleClose);

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = label.trim();
    if (!normalized || busy) return;
    await onSave(normalized);
  }

  return (
    <DialogShell title="שמירת שיחה" onClose={handleClose} closeDisabled={busy}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="conversation-label" className="text-lg font-black text-[#181411]">איך לקרוא לשיחה?</label>
          <input
            ref={inputRef}
            id="conversation-label"
            value={label}
            onChange={(event) => setLabel(event.target.value.slice(0, MAX_CONVERSATION_LABEL_LENGTH))}
            maxLength={MAX_CONVERSATION_LABEL_LENGTH}
            autoComplete="off"
            placeholder="למשל: נועה, הלקוח מהפייסבוק, הבוס"
            className={`mt-2 min-h-14 w-full rounded-2xl border border-[#ded2c3] bg-white px-4 text-base font-bold text-[#241d18] placeholder:text-[#9b8f83] ${focusClass}`}
          />
        </div>
        <p className="rounded-2xl border border-[#f7cf76] bg-[#fff6d8] px-3 py-2.5 text-sm font-bold leading-6 text-[#5b4d42]">
          נשמור רק את סוג הקשר והווייב — לא את ההודעות שלך.
        </p>
        <div className="flex flex-wrap gap-2 text-xs font-black text-[#5b4d42]">
          <span className="rounded-full border border-[#e2d7c8] bg-white px-3 py-1.5">מצב: {context ?? 'לא הוגדר'}</span>
          <span className="rounded-full border border-[#e2d7c8] bg-white px-3 py-1.5">וייב: {tone}</span>
        </div>
        {error ? <p role="alert" className="text-sm font-bold text-[#9a3412]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || label.trim().length === 0}
          className={`min-h-14 w-full rounded-full bg-[#ff5a2a] px-5 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}
        >
          {busy ? 'שומרים...' : 'שמור שיחה'}
        </button>
      </form>
    </DialogShell>
  );
}

export function ManageConversationsDialog({
  open,
  profiles,
  busyId,
  error,
  onClose,
  onRename,
  onDelete,
}: {
  open: boolean;
  profiles: ConversationProfile[];
  busyId: string | null;
  error: string | null;
  onClose: () => void;
  onRename: (profile: ConversationProfile, label: string) => Promise<void>;
  onDelete: (profile: ConversationProfile) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleClose() {
    setEditingId(null);
    setConfirmDeleteId(null);
    setDraft('');
    onClose();
  }

  useDialogLifecycle(open, handleClose);

  if (!open) return null;

  return (
    <DialogShell title="ניהול שיחות שמורות" onClose={handleClose} closeDisabled={busyId !== null}>
      <div className="max-h-[64vh] space-y-2 overflow-y-auto pb-1">
        {profiles.length === 0 ? (
          <p className="rounded-2xl bg-[#fff9ef] p-4 text-sm font-bold text-[#6d6259]">אין עדיין שיחות שמורות.</p>
        ) : profiles.map((profile) => {
          const editing = editingId === profile.id;
          const confirmingDelete = confirmDeleteId === profile.id;
          const busy = busyId === profile.id;
          return (
            <div key={profile.id} className="rounded-2xl border border-[#e2d7c8] bg-white p-3">
              {editing ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!draft.trim() || busy) return;
                    await onRename(profile, draft.trim());
                    setEditingId(null);
                  }}
                  className="flex gap-2"
                >
                  <input
                    aria-label={`שם חדש עבור ${profile.label}`}
                    autoFocus
                    value={draft}
                    maxLength={MAX_CONVERSATION_LABEL_LENGTH}
                    onChange={(event) => setDraft(event.target.value.slice(0, MAX_CONVERSATION_LABEL_LENGTH))}
                    className={`min-h-[44px] min-w-0 flex-1 rounded-xl border border-[#ded2c3] px-3 font-bold ${focusClass}`}
                  />
                  <button disabled={busy || !draft.trim()} className={`min-h-[44px] rounded-full bg-[#181411] px-3 text-xs font-black text-white disabled:opacity-50 ${focusClass}`}>
                    שמירה
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#241d18]">{profile.label}</p>
                    <p className="mt-0.5 text-xs font-bold text-[#7a6e64]">{profile.context ?? 'ללא מצב'} · {profile.tone}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => { setEditingId(profile.id); setDraft(profile.label); setConfirmDeleteId(null); }}
                      className={`min-h-[40px] rounded-full px-2 text-xs font-black text-[#5b4d42] disabled:opacity-50 ${focusClass}`}
                    >
                      שינוי שם
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => confirmingDelete ? void onDelete(profile) : setConfirmDeleteId(profile.id)}
                      className={`min-h-[40px] rounded-full px-2 text-xs font-black text-[#a62b18] disabled:opacity-50 ${focusClass}`}
                    >
                      {busy ? 'מוחקים...' : confirmingDelete ? 'כן, למחוק' : 'מחיקה'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-[#9a3412]">{error}</p> : null}
    </DialogShell>
  );
}

function DialogShell({
  title,
  children,
  onClose,
  closeDisabled,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !closeDisabled) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-t-[28px] border border-[#e2d7c8] bg-[#fffdf8] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-18px_60px_rgba(24,20,17,0.2)] sm:rounded-[28px] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#181411]">{title}</h2>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label="סגירה" style={{ minWidth: 44 }} className={`min-h-[44px] rounded-full border border-[#e2d7c8] bg-white text-lg font-black text-[#5b4d42] disabled:opacity-50 ${focusClass}`}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useDialogLifecycle(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);
}
