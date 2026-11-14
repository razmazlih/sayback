'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  CONTEXT_OPTIONS, TONE_OPTIONS, isFreeContextOption, isFreeToneOption,
  type ContextOption, type ToneOption,
} from '@/lib/generator-options';
import type { LanguagePreferences } from '@/lib/reply-context';
import { MAX_CONVERSATION_BACKGROUND_LENGTH } from '@/lib/message-limits';
import {
  CONTINUE_PREFERENCE_OPTIONS, INCOMING_GOAL_OPTIONS, NO_REPLY_GOAL_OPTIONS,
  type ContinuePreference, type DirectionField, type Goal,
} from '@/lib/reply-direction';
import './reply-direction-controls.css';

export type ReplyDirectionControlsProps = {
  openField: DirectionField | null;
  onOpenFieldChange: (field: DirectionField | null) => void;
  tone: ToneOption;
  onToneChange: (tone: ToneOption) => void;
  context: ContextOption | null;
  onContextChange: (context: ContextOption | null) => void;
  goal: Goal | null;
  onGoalChange: (goal: Goal | null) => void;
  continuePreference: ContinuePreference | null;
  onContinuePreferenceChange: (preference: ContinuePreference | null) => void;
  languagePreferences: LanguagePreferences;
  onLanguagePreferencesChange: (preferences: LanguagePreferences) => void;
  conversationBackground: string;
  onBackgroundChange: (background: string) => void;
  isNoReplyMode: boolean;
  showMonthlyOptions: boolean;
  hasMonthlyFeatureAccess: boolean;
  isBillingLoading: boolean;
  onUpgrade: () => void;
};

const fieldLabels: Record<DirectionField, string> = {
  tone: 'סגנון', context: 'עם מי?', goal: 'מה המטרה?', language: 'לשון פנייה',
  continue: 'המשך השיחה', background: 'רקע נוסף',
};
const genderLabels = { neutral: 'ללא העדפה', masculine: 'זכר', feminine: 'נקבה' } as const;

function LanguageIcon({ kind }: { kind: 'speaker' | 'recipient' | 'masculine' | 'feminine' }) {
  return (
    <svg className="sb-language-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {kind === 'speaker' ? <><path d="M6 4h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-7l-5 4v-4a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M7 9h10M7 13h6" /></> : null}
      {kind === 'recipient' ? <><circle cx="10" cy="8" r="3.5" /><path d="M3 20v-2a7 7 0 0 1 14 0v2M17 5a3.5 3.5 0 0 1 0 7M19 15a5 5 0 0 1 2 5" /></> : null}
      {kind === 'masculine' || kind === 'feminine' ? <>
        <path d={kind === 'masculine' ? 'M6.5 11V8a5.5 5.5 0 0 1 11 0v3M7 7c3 1 5 0 6-1 1 2 3 2 4 2' : 'M6 16V8a6 6 0 0 1 12 0v8M7 8c3 0 5-1 6-3 1 2 2 3 4 3'} />
        <path d="M7 9v2a5 5 0 0 0 10 0V9M4 22a8 8 0 0 1 16 0" />
        <path d="M10 12.5c1 1 3 1 4 0" />
      </> : null}
    </svg>
  );
}
const illustrations: Partial<Record<ToneOption | ContextOption, string>> = {
  'עדין': 'gentle-feather', 'ישיר': 'direct-target', 'זורם': 'flow-wave',
  'מצחיק': 'funny-smile', 'פלרטטני': 'flirty-sparkle-heart',
  'קראש': 'crush-heart', 'אקס': 'ex-broken-heart', 'ידיד': 'friend-high-five',
  'לקוח': 'client-handshake', 'בוס': 'boss-briefcase', 'יד2': 'yad2-price-tag', 'דייט': 'date-coffee',
};

export function ReplyDirectionControls(props: ReplyDirectionControlsProps) {
  const selectedField = props.openField;
  const setSelectedField = props.onOpenFieldChange;
  const fields: DirectionField[] = ['tone', 'context', 'goal', 'language'];
  if (!props.isNoReplyMode) fields.push('continue');
  if (props.showMonthlyOptions) fields.push('background');
  const activeField = selectedField && fields.includes(selectedField) ? selectedField : 'tone';
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selectedField && !dialog.current?.open) dialog.current?.showModal();
    if (!selectedField && dialog.current?.open) dialog.current?.close();
  }, [selectedField]);
  const values: Record<DirectionField, string | null> = {
    tone: props.tone, context: props.context, goal: props.goal,
    language: props.languagePreferences.speaker === 'neutral' && props.languagePreferences.recipient === 'neutral'
      ? null : `${genderLabels[props.languagePreferences.speaker]} ← ${genderLabels[props.languagePreferences.recipient]}`,
    continue: props.continuePreference === 'לא' ? 'לסיים בנעימות' : props.continuePreference,
    background: props.conversationBackground.trim() ? 'נוסף רקע' : null,
  };



  return (
    <section className="sb-direction sb-direction-inline" data-testid="reply-direction-controls" dir="rtl" aria-label="כיוון התשובה">
      <div className="sb-direction-title"><p className="sb-direction-heading">כיוון התשובה</p><span>רק אם רוצים</span></div>
      <div className="sb-direction-tabs" role="group" aria-label="הגדרות כיוון התשובה">
        {fields.map((field) => (
          <button key={field} type="button" aria-expanded={selectedField === field} aria-haspopup="dialog"
            title={values[field] ?? fieldLabels[field]} aria-controls="reply-direction-panel" onClick={() => setSelectedField(field)}>
            <span className="sb-direction-step-label">{fieldLabels[field]}</span>
            <span className="sb-direction-step-value">{values[field] ?? '＋'}</span>
          </button>
        ))}
      </div>
      <dialog ref={dialog} id="reply-direction-panel" className="sb-direction-dialog" aria-label="בחירת כיוון התשובה" onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSelectedField(null);
      }} onCancel={() => setSelectedField(null)} onClose={() => setSelectedField(null)}>
        <div className="sb-direction-dialog-top"><span>כיוון התשובה</span><button type="button" onClick={() => setSelectedField(null)} aria-label="סגירת אפשרויות כיוון התשובה"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></button></div>
        <div className="sb-direction-section" data-field={activeField}>
        <DirectionEditor key={activeField} {...props} field={activeField} close={() => setSelectedField(null)} />
        </div>
      </dialog>
    </section>
  );
}

function DirectionEditor(props: ReplyDirectionControlsProps & { field: DirectionField; close: () => void }) {
  const { field, close } = props;
  const [lockedChoice, setLockedChoice] = useState<string | null>(null);
  const isBackgroundLocked = field === 'background' && !props.hasMonthlyFeatureAccess;

  function reset() {
    if (field === 'tone') props.onToneChange('זורם');
    if (field === 'context') props.onContextChange(null);
    if (field === 'goal') props.onGoalChange(null);
    if (field === 'continue') props.onContinuePreferenceChange(null);
    if (field === 'language') props.onLanguagePreferencesChange({ speaker: 'neutral', recipient: 'neutral' });
    if (field === 'background') props.onBackgroundChange('');
    if (field !== 'language' && field !== 'background') close();
    setLockedChoice(null);
  }

  function choice<T extends string>(value: T, selected: boolean, change: (value: T) => void, monthly = false, illustration?: string, label: string = value) {
    const locked = monthly && !props.hasMonthlyFeatureAccess;
    return (
      <button key={value} type="button" className="sb-direction-option" aria-pressed={selected}
        data-direction-option={value} data-locked={locked || undefined}
        aria-label={`${label}${monthly ? props.isBillingLoading ? ' · בדיקת מנוי' : locked ? ' · נעול לחודשי, לחצו לפרטים' : ' · חודשי' : ''}`}
        onClick={() => {
          if (locked || monthly && props.isBillingLoading) { setLockedChoice(value); return; }
          change(value); close();
        }}>
        {selected ? <span className="sb-direction-check" aria-hidden="true">✓</span> : null}
        <span className="sb-direction-option-label">
          {illustration ? <Image src={`/option-illustrations/${illustration}.webp`} width={18} height={18} alt="" unoptimized /> : null}
          {label}
        </span>
        {monthly ? <span className="sb-direction-monthly">חודשי</span> : null}
      </button>
    );
  }

  return (
    <>
      <div className="sb-direction-editor-heading">
        <h3>{fieldLabels[field]}</h3>
        <button type="button" className="sb-direction-reset" data-direction-clear onClick={reset} aria-label={field === 'tone' ? 'איפוס סגנון לזורם' : `ניקוי ${fieldLabels[field]}`}>{field === 'tone' ? 'איפוס' : 'ניקוי'}</button>

      </div>
      {lockedChoice || isBackgroundLocked || field === 'background' && props.isBillingLoading ? (
        <div className="sb-direction-notice" role="status">
          <p>{props.isBillingLoading ? 'בודקים את מצב המנוי…' : `${lockedChoice ?? 'רקע נוסף'} פתוח במסלול החודשי. הבחירה הנוכחית נשארת.`}</p>
          {!props.isBillingLoading ? <button type="button" onClick={() => { close(); props.onUpgrade(); }}>לפתוח חודשי ללא הגבלה</button> : null}
        </div>
      ) : null}
      {field === 'tone' ? <div className="sb-direction-options">{TONE_OPTIONS.filter((value) => props.showMonthlyOptions || isFreeToneOption(value)).map((value) => choice(value, props.tone === value, props.onToneChange, !isFreeToneOption(value), illustrations[value]))}</div> : null}
      {field === 'context' ? <div className="sb-direction-options">{CONTEXT_OPTIONS.filter((value) => props.showMonthlyOptions || isFreeContextOption(value)).map((value) => choice(value, props.context === value, props.onContextChange, !isFreeContextOption(value), illustrations[value]))}</div> : null}
      {field === 'goal' ? <div className="sb-direction-options sb-direction-options-wide">{(props.isNoReplyMode ? NO_REPLY_GOAL_OPTIONS : INCOMING_GOAL_OPTIONS).map((value) => choice(value, props.goal === value, props.onGoalChange))}</div> : null}
      {field === 'continue' ? <>
        <p className="sb-direction-help">להשאיר את השיחה פתוחה — לא להסכים לתוכן ההודעה.</p>
        <div className="sb-direction-options sb-direction-options-wide">{CONTINUE_PREFERENCE_OPTIONS.map((value) => choice<ContinuePreference>(value, props.continuePreference === value, props.onContinuePreferenceChange, false, undefined, value === 'כן' ? 'כן' : 'לסיים בנעימות'))}</div>
      </> : null}
      {field === 'language' ? <div className="sb-direction-language">
        {(['speaker', 'recipient'] as const).map((side) => (
          <fieldset key={side}>
            <legend><span className="sb-language-question"><LanguageIcon kind={side} />{side === 'speaker' ? 'איך לנסח את התשובה שלך?' : 'ואיך לפנות למי שמולך?'}</span></legend>
            <p className="sb-direction-help">{side === 'speaker' ? '״אני שמח״ או ״אני שמחה״?' : '״אתה״ או ״את״?'}</p>
            <div className="sb-direction-options">
              {(['masculine', 'feminine'] as const).map((value) => (
                <button key={value} type="button" className="sb-direction-option" aria-pressed={props.languagePreferences[side] === value}
                  data-direction-option={`${side}-${value}`} onClick={() => { props.onLanguagePreferencesChange({ ...props.languagePreferences, [side]: value }); close(); }}>
                  {props.languagePreferences[side] === value ? <svg className="sb-language-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg> : null}
                  <LanguageIcon kind={value} />
                  {`לשון ${genderLabels[value]}`}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="sb-direction-help">הניסוח בשמך נשמר בדפדפן לפעם הבאה. הפנייה לצד השני היא לשיחה הזאת.</p>
      </div> : null}
      {field === 'background' && !isBackgroundLocked && !props.isBillingLoading ? <div className="sb-direction-background">
        <label htmlFor="direction-conversation-background">פרטים קצרים שיעזרו לדייק את הניסוח</label>
        <textarea id="direction-conversation-background" aria-label="רקע נוסף לשיחה" value={props.conversationBackground}
          onChange={(event) => props.onBackgroundChange(event.target.value.slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH))}
          maxLength={MAX_CONVERSATION_BACKGROUND_LENGTH} placeholder="למשל: דיברנו כמה ימים ואז השיחה נעצרה" />
        <p className="sb-direction-help">{props.conversationBackground.length}/{MAX_CONVERSATION_BACKGROUND_LENGTH} תווים · רק לשיחה הזאת</p>
      </div> : null}

    </>
  );
}
