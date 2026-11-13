'use client';

import { useId, useRef, useState } from 'react';
import './response-story.css';

const replies = [
  { label: 'בחיוב', text: 'כן, בכיף! נדבר בשמונה?', softer: 'בשמחה :) שמונה מתאים לך?' },
  { label: 'בתיאום', text: 'מתאים לי. באיזו שעה נוח לך?', softer: 'אשמח לדבר. מתי יהיה לך נוח?' },
  { label: 'עם גבול', text: 'הערב פחות מתאים לי. אפשר מחר?', softer: 'אשמח לדבר, אבל הערב קצת עמוס. מה עם מחר?' },
] as const;

/** A self-contained example: never generates, consumes credits or sends a message. */
export function ResponseStory() {
  const id = useId();
  const copyVersion = useRef(0);
  const [selected, setSelected] = useState(0);
  const [softened, setSoftened] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const response = softened ? replies[selected].softer : replies[selected].text;

  function choose(index: number) {
    copyVersion.current += 1;
    setSelected(index);
    setSoftened(false);
    setCopyStatus('');
    setManualCopy(false);
  }

  async function copy() {
    // Snapshot the text: a later selection must never claim a different reply was copied.
    const text = response;
    const version = ++copyVersion.current;
    try {
      await navigator.clipboard.writeText(text);
      if (version !== copyVersion.current) return;
      setCopyStatus(`הועתקה התשובה: ${text}`);
    } catch {
      if (version !== copyVersion.current) return;
      setManualCopy(true);
      setCopyStatus('אפשר לבחור את הטקסט ולהעתיק ידנית.');
    }
  }

  return (
    <div className="sb-response-story" aria-label="הדגמה: מהודעה לתשובה" dir="rtl">
      <div className="sb-story-intro">
        <p>לא צריך למצוא את המילים לבד.</p>
        <span>דוגמה אינטראקטיבית · ללא שימוש במכסה</span>
      </div>
      <div className="sb-story-flow">
        <section className="sb-story-scene" aria-labelledby={`${id}-incoming`}>
          <span className="sb-story-number" aria-hidden="true">01</span>
          <h3 id={`${id}-incoming`}>יש הודעה.</h3>
          <p className="sb-story-caption">מדביקים את מה שקיבלתם, גם כצילום מסך.</p>
          <div className="sb-story-incoming"><span>ההודעה שקיבלתם</span><p>היי, מתאים לך שנדבר בערב?</p></div>
        </section>
        <section className="sb-story-scene" aria-labelledby={`${id}-choices`}>
          <span className="sb-story-number" aria-hidden="true">02</span>
          <h3 id={`${id}-choices`}>שלוש דרכים לענות.</h3>
          <p className="sb-story-caption">בחרו תשובה לדוגמה. הכיוון נשאר שלכם.</p>
          <div className="sb-story-choices" role="group" aria-label="בחירת תשובה לדוגמה">
            {replies.map((reply, index) => (
              <button key={reply.label} type="button" aria-pressed={selected === index} onClick={() => choose(index)}>
                <span>{reply.label}</span><p>{reply.text}</p><span className="sb-story-check" aria-hidden="true">{selected === index ? '✓' : '○'}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="sb-story-scene" aria-labelledby={`${id}-finish`}>
          <span className="sb-story-number" aria-hidden="true">03</span>
          <h3 id={`${id}-finish`}>עוד נגיעה. וזה שלכם.</h3>
          <p className="sb-story-caption">מרככים את הניסוח, מעתיקים וחוזרים לשיחה.</p>
          <div className="sb-story-final">
            <span className="sb-story-final-label">התשובה שבחרתם</span>
            <p key={response} className="sb-story-answer">{response}</p>
            <div className="sb-story-actions">
              <button type="button" aria-pressed={softened} onClick={() => { copyVersion.current += 1; setSoftened(!softened); setCopyStatus(''); setManualCopy(false); }}>{softened ? 'חזרה לניסוח המקורי' : 'קצת יותר רך'}</button>
              <button type="button" onClick={() => void copy()}>העתקת הדוגמה <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <p role="status" className="sb-story-status">{copyStatus}</p>
          {manualCopy && <textarea aria-label="תשובה להעתקה ידנית" readOnly value={response} onFocus={(event) => event.currentTarget.select()} />}
        </section>
      </div>
      <div className="sb-story-footer"><p>שום הודעה לא נשלחת אוטומטית. אתם בוחרים מה לשלוח.</p></div>
    </div>
  );
}
