import { MAX_LAST_OUTGOING_MESSAGE_LENGTH } from "./message-limits";

export type GrammaticalGender = "neutral" | "masculine" | "feminine";
export type LanguagePreferences = {
  speaker: GrammaticalGender;
  recipient: GrammaticalGender;
};
export type CommitmentMode = "ask" | "defer" | "provided";
export type ReplyContext = {
  languagePreferences?: LanguagePreferences;
  previousOutgoingMessage?: string;
  commitmentMode?: CommitmentMode;
  commitmentDetails?: string;
};

export const MAX_COMMITMENT_DETAILS_LENGTH = 180;

type ReplyContextInput = {
  languagePreferences?: unknown;
  previousOutgoingMessage?: unknown;
  commitmentMode?: unknown;
  commitmentDetails?: unknown;
  noReplyMode?: unknown;
};

function grammaticalGender(value: unknown): GrammaticalGender {
  if (value === undefined) return "neutral";
  if (value === "neutral" || value === "masculine" || value === "feminine") return value;
  throw new Error("בחירת לשון הפנייה לא תקינה.");
}

function boundedText(value: unknown, maximum: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${label} צריך להכיל בין 1 ל-${maximum} תווים.`);
  }
  return value.trim();
}

/** Request-only context. Call before consuming a use; never persist this object. */
export function normalizeReplyContext(input: ReplyContextInput): ReplyContext {
  const result: ReplyContext = {};
  if (input.languagePreferences !== undefined) {
    const preferences = input.languagePreferences;
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences) ||
      Object.keys(preferences).some((key) => key !== "speaker" && key !== "recipient")) {
      throw new Error("בחירת לשון הפנייה לא תקינה.");
    }
    const values = preferences as Record<string, unknown>;
    result.languagePreferences = {
      speaker: grammaticalGender(values.speaker),
      recipient: grammaticalGender(values.recipient),
    };
  }

  const previousOutgoingMessage = boundedText(
    input.previousOutgoingMessage, MAX_LAST_OUTGOING_MESSAGE_LENGTH, "ההודעה ששלחת",
  );
  if (previousOutgoingMessage !== undefined) {
    if (input.noReplyMode !== undefined && input.noReplyMode !== false) {
      throw new Error('אפשר לציין הודעה קודמת רק כשכבר התקבלה תשובה, לא במצב "מחכה לתשובה".');
    }
    result.previousOutgoingMessage = previousOutgoingMessage;
  }

  const mode = input.commitmentMode;
  if (mode !== undefined && mode !== "ask" && mode !== "defer" && mode !== "provided") {
    throw new Error("בחירת אופן התשובה לגבי מועד או מחיר לא תקינה.");
  }
  const details = boundedText(input.commitmentDetails, MAX_COMMITMENT_DETAILS_LENGTH, "הפרטים שאישרת");
  if (mode === "provided" && !details) {
    throw new Error("צריך לציין את המועד או המחיר שאפשר להציע בשמך.");
  }
  if (details !== undefined && mode !== "provided") {
    throw new Error("פרטים מאושרים אפשר לצרף רק כשבוחרים לציין מועד או מחיר.");
  }
  if (mode !== undefined) result.commitmentMode = mode;
  if (details !== undefined) result.commitmentDetails = details;
  return result;
}

/** A conservative UI hint, not a safety gate: AI must avoid commitments in every request. */
export function getMissingCommitmentKind(message: string): "time" | "price" | null {
  const text = message.trim();
  if (!text) return null;
  const priceQuestion = /(?:כמה\s+(?:זה\s+)?עולה|מה\s+(?:המחיר|העלות)|מהו\s+המחיר|באיזה\s+מחיר|הצעת\s+מחיר)/u;
  const amount = /(?:\d[\d,.]*\s*(?:₪|ש[״"]?ח|שקל(?:ים)?|דולר)|[₪$]\s*\d)/u;
  const commercialOffer = /(?:מחיר|עלות|עולה|תשל|לשלם|למכור|מוכר|לקנות|קונה|להוריד|הנחה|אפשר|מתאים|סוגר|נסגור|תסכים|מסכימ|\?)/u;
  if (priceQuestion.test(text) || (amount.test(text) && commercialOffer.test(text))) return "price";
  const scheduling = /(?:נדבר|לדבר|ניפגש|נפגש|להיפגש|להפגש|פגישה|לקבוע|להגיע|תגיע|תגיעי|מתאים|פנוי|פנויה|לסיים|תגיש|תסיים|למסור|מוכן|מוכנה|זמין|זמינה)/u;
  const timeQuestion = /(?:מתי|באיזו\s+שעה|באיזה\s+יום|לאיזו\s+שעה|לאיזה\s+יום)/u;
  const timeOffer = /(?:היום|מחר|מחרתיים|בערב|בבוקר|בצהריים|בלילה|השבוע|בשעה|ב[־-]?\d{1,2}(?::\d{2})?|יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))/u;
  const convenient = /(?:^|[\s,.!?])נוח(?:ה)?(?=$|[\s,.!?])/u;
  const spokenHour = /(?:^|\s)(?:ב[־-]?|בשעה\s+)(?:אחת|שתיים|שתים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר|אחת[־ -]עשרה|שתיים[־ -]עשרה|שתים[־ -]עשרה)(?=$|[\s,.!?])/u;
  const possibleProposal = /^(?:(?:אז|אולי|האם)\s+)?אפשר(?:י)?(?:\s|$)/u;
  const hasExplicitTime = timeOffer.test(text) || spokenHour.test(text);
  if (possibleProposal.test(text) && hasExplicitTime) return "time";
  return (scheduling.test(text) || convenient.test(text)) &&
    (timeQuestion.test(text) || hasExplicitTime) ? "time" : null;
}
