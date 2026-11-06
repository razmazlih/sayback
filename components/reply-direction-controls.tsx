'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
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
const illustrations: Partial<Record<ToneOption | ContextOption, string>> = {
  'עדין': 'gentle-feather', 'ישיר': 'direct-target', 'זורם': 'flow-wave',
  'מצחיק': 'funny-smile', 'פלרטטני': 'flirty-sparkle-heart',
  'קראש': 'crush-heart', 'אקס': 'ex-broken-heart', 'ידיד': 'friend-high-five',
  'לקוח': 'client-handshake', 'בוס': 'boss-briefcase', 'יד2': 'yad2-price-tag', 'דייט': 'date-coffee',
};

export function ReplyDirectionControls(props: ReplyDirectionControlsProps) {
  const { openField, onOpenFieldChange } = props;
  const id = useId();
  const triggers = useRef<Partial<Record<DirectionField, HTMLButtonElement | null>>>({});
  const editor = useRef<HTMLDivElement | null>(null);
  const activeField = openField === 'continue' && props.isNoReplyMode
    || openField === 'background' && !props.showMonthlyOptions ? null : openField;

  useEffect(() => {
    if (activeField) {
      const target = editor.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
        ?? editor.current?.querySelector<HTMLElement>('textarea')
        ?? editor.current?.querySelector<HTMLElement>('[data-direction-option]')
        ?? editor.current?.querySelector<HTMLElement>('[data-editor-close]');
      target?.focus({ preventScroll: true });
    }
  }, [activeField]);

  function close() {
    onOpenFieldChange(null);
    if (activeField) triggers.current[activeField]?.focus({ preventScroll: true });
  }

  const summaries: Record<DirectionField, React.ReactNode> = {
    tone: props.tone,
    context: props.context,
    goal: props.goal,
    language: props.languagePreferences.speaker === 'neutral' && props.languagePreferences.recipient === 'neutral'
      ? null : <><span>בשמי: {genderLabels[props.languagePreferences.speaker]}</span><span>לצד השני: {genderLabels[props.languagePreferences.recipient]}</span></>,
    continue: props.continuePreference === 'כן' ? 'כן' : props.continuePreference === 'לא' ? 'לסיים בנעימות' : null,
    background: props.conversationBackground.trim() ? 'נוסף רקע' : null,
  };
  const fields: DirectionField[] = ['tone', 'context', 'goal', 'language'];
  if (!props.isNoReplyMode) fields.push('continue');
  if (props.showMonthlyOptions) fields.push('background');

  return (
    <div className="sb-direction" data-testid="reply-direction-controls" dir="rtl" onKeyDown={(event) => {
      if (event.key === 'Escape' && activeField) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <p className="sb-direction-heading">כיוון התשובה <span>· רק אם רוצים</span></p>
      <div className="sb-direction-bar" aria-label="כיוון לתשובה">
        {fields.map((field) => (
          <button key={field} ref={(node) => { triggers.current[field] = node; }} type="button"
            className={`sb-direction-trigger${field === 'tone' || field === 'context' || field === 'goal' ? ' sb-direction-trigger-primary' : ''}`}
            data-direction-field={field} aria-expanded={activeField === field}
            aria-controls={activeField === field ? `${id}-editor` : undefined}
            onClick={() => activeField === field ? close() : onOpenFieldChange(field)}>
            <span className="sb-direction-label">{fieldLabels[field]}<span className="sb-direction-chevron" aria-hidden="true">⌄</span></span>
            {field === 'background' && !props.hasMonthlyFeatureAccess ? <span className="sb-direction-monthly">חודשי</span> : null}
            {summaries[field] ? <span className="sb-direction-value">{summaries[field]}</span> : null}
          </button>
        ))}
      </div>
      {activeField ? (
        <div ref={editor} id={`${id}-editor`} className="sb-direction-editor" data-testid="direction-editor" data-field={activeField}
          role="region" aria-label={`עריכת ${fieldLabels[activeField]}`}>
          <DirectionEditor key={activeField} {...props} field={activeField} close={close} />
        </div>
      ) : null}
    </div>
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
        <button type="button" className="sb-direction-close" data-editor-close aria-label={`סגירת ${fieldLabels[field]}`} onClick={close}>×</button>
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
            <legend>{side === 'speaker' ? 'איך לנסח בשמך?' : 'איך לפנות לצד השני?'}</legend>
            <div className="sb-direction-options">
              {(['neutral', 'masculine', 'feminine'] as const).map((value) => (
                <button key={value} type="button" className="sb-direction-option" aria-pressed={props.languagePreferences[side] === value}
                  data-direction-option={`${side}-${value}`} onClick={() => props.onLanguagePreferencesChange({ ...props.languagePreferences, [side]: value })}>
                  {props.languagePreferences[side] === value ? <span className="sb-direction-check" aria-hidden="true">✓</span> : null}
                  {value === 'neutral' ? 'ללא העדפה' : `לשון ${genderLabels[value]}`}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="sb-direction-help">הבחירה זמנית, כל עוד הדף פתוח.</p>
      </div> : null}
      {field === 'background' && !isBackgroundLocked && !props.isBillingLoading ? <div className="sb-direction-background">
        <label htmlFor="direction-conversation-background">פרטים קצרים שיעזרו לדייק את הניסוח</label>
        <textarea id="direction-conversation-background" aria-label="רקע נוסף לשיחה" value={props.conversationBackground}
          onChange={(event) => props.onBackgroundChange(event.target.value.slice(0, MAX_CONVERSATION_BACKGROUND_LENGTH))}
          maxLength={MAX_CONVERSATION_BACKGROUND_LENGTH} placeholder="למשל: דיברנו כמה ימים ואז השיחה נעצרה" />
        <p className="sb-direction-help">{props.conversationBackground.length}/{MAX_CONVERSATION_BACKGROUND_LENGTH} תווים · רק לשיחה הזאת</p>
      </div> : null}
      {field === 'language' || field === 'background' ? <div className="sb-direction-editor-footer"><button type="button" onClick={close}>סיימתי ✓</button></div> : null}
    </>
  );
}
