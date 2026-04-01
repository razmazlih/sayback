const CONTEXT_OPTIONS = ["קראש", "אקס", "לקוח", "בוס", "יד2"] as const;
const TONE_OPTIONS = ["עדין", "ישיר", "זורם", "מצחיק", "פלרטטני"] as const;
const CONTINUE_PREFERENCE_OPTIONS = ["כן", "לא"] as const;
const REPLY_ACTION_OPTIONS = ["softer", "sharper", "retry"] as const;

const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const FREE_AI_MODE_ENABLED = process.env.LOCAL_FREE_AI?.trim().toLowerCase() === "true";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGE_LENGTH = 10_000_000;

type ContextOption = (typeof CONTEXT_OPTIONS)[number];
type ToneOption = (typeof TONE_OPTIONS)[number];
type ContinuePreferenceOption = (typeof CONTINUE_PREFERENCE_OPTIONS)[number];
type ReplyActionOption = (typeof REPLY_ACTION_OPTIONS)[number];

type InputContentItem =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
      detail: "auto";
    };

interface OpenAITextChunk {
  type?: string;
  text?: string;
}

interface OpenAIOutputItem {
  content?: OpenAITextChunk[];
}

interface OpenAIErrorResponse {
  error?: {
    message?: string;
    type?: string;
  };
}

interface OpenAIResponsePayload extends OpenAIErrorResponse {
  output_text?: string;
  output?: OpenAIOutputItem[];
}

export interface GenerateRepliesInput {
  message?: string;
  imageBase64?: string;
  context?: string;
  tone?: string;
  continuePreference?: string | null;
  refineInstruction?: string;
  action?: string;
  sourceReply?: string;
}

export interface GenerateRepliesResult {
  intent: string;
  replies: [string, string, string];
}

export class AIRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "replies"],
  properties: {
    intent: {
      type: "string",
      minLength: 1,
      maxLength: 220,
    },
    replies: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 220,
      },
    },
  },
} as const;

export async function generateReplies(
  input: GenerateRepliesInput,
): Promise<GenerateRepliesResult> {
  const message = normalizeMessage(input.message);
  const context = normalizeContext(input.context);
  const tone = normalizeTone(input.tone);
  const continuePreference = normalizeContinuePreference(input.continuePreference);
  const action = normalizeAction(input.action);
  const sourceReply = normalizeOptionalText(input.sourceReply, 220);
  const refineInstruction = buildRefineInstruction({
    explicitInstruction: normalizeOptionalText(input.refineInstruction, 220),
    action,
    sourceReply,
  });
  const imageUrl = normalizeImage(input.imageBase64);

  if (!message && !imageUrl) {
    throw new AIRequestError(
      "Provide either a message or a screenshot.",
      400,
    );
  }

  if (FREE_AI_MODE_ENABLED) {
    return generateFreeReplies({
      message,
      context,
      tone,
      continuePreference,
      action,
      sourceReply,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new AIRequestError(
      "OPENAI_API_KEY is not configured on the server.",
      500,
    );
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      store: false,
      reasoning: {
        effort: "low",
      },
      max_output_tokens: 350,
      instructions: buildInstructions(),
      input: [
        {
          role: "user",
          content: buildInputContent({
            message,
            imageUrl,
            context,
            tone,
            continuePreference,
            refineInstruction,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sayback_reply_suggestions",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const payload = (await safeParseJson(response)) as OpenAIResponsePayload;

  if (!response.ok) {
    const upstreamMessage = payload.error?.message?.trim();
    const status = mapOpenAIErrorStatus(response.status);
    throw new AIRequestError(
      upstreamMessage || "OpenAI request failed.",
      status,
    );
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new AIRequestError("OpenAI returned an empty response.", 502);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AIRequestError("OpenAI returned invalid JSON.", 502);
  }

  return validateResponseShape(parsed);
}

function generateFreeReplies({
  message,
  context,
  tone,
  continuePreference,
  action,
  sourceReply,
}: {
  message?: string;
  context?: ContextOption;
  tone?: ToneOption;
  continuePreference?: ContinuePreferenceOption;
  action?: ReplyActionOption;
  sourceReply?: string;
}): GenerateRepliesResult {
  const intent = buildFreeIntent(message, context);
  const effectiveTone =
    action === "softer" ? "עדין" : action === "sharper" ? "ישיר" : (tone ?? "זורם");

  const replies = buildFreeReplies({
    tone: effectiveTone,
    context,
    message,
    continuePreference,
    sourceReply,
  });

  return { intent, replies };
}

function buildFreeIntent(
  message?: string,
  context?: ContextOption,
): string {
  const normalized = message?.trim();

  if (!normalized) {
    if (context === "לקוח") {
      return "הצד השני מחכה לעדכון קצר וברור על ההמשך.";
    }

    if (context === "בוס") {
      return "הצד השני מצפה לתשובה עניינית ומהירה.";
    }

    return "הצד השני מחפש תגובה ברורה ולא להישאר בלי מענה.";
  }

  if (normalized.includes("?")) {
    return "הצד השני שואל שאלה ורוצה תשובה ישירה בלי למרוח.";
  }

  if (/סליחה|מצטער|מצטערת/.test(normalized)) {
    return "הצד השני מנסה לרכך את השיחה ולסגור פערים.";
  }

  return "הצד השני בודק איפה אתם עומדים ומחכה לכיוון ברור ממך.";
}

function buildFreeReplies({
  tone,
  context,
  message,
  continuePreference,
  sourceReply,
}: {
  tone: ToneOption;
  context?: ContextOption;
  message?: string;
  continuePreference?: ContinuePreferenceOption;
  sourceReply?: string;
}): [string, string, string] {
  const businessReplies =
    context === "לקוח"
      ? ([
          "תודה על ההודעה, חוזר/ת אליך עם תשובה מסודרת בהמשך היום.",
          "קיבלתי, אני בודק/ת את זה וחוזר/ת אליך בהקדם.",
          "מעולה, מאשר/ת קבלה ומעדכן/ת אותך כשיש סטטוס.",
        ] as [string, string, string])
      : context === "בוס"
        ? ([
            "קיבלתי, מטפל/ת בזה ומעדכן/ת בהמשך היום.",
            "תודה, אני על זה ואשלח עדכון מסודר בקרוב.",
            "מאשר/ת קבלה, חוזר/ת עם סטטוס בהקדם.",
          ] as [string, string, string])
        : undefined;

  if (businessReplies) {
    return businessReplies;
  }

  const baseRepliesByTone: Record<ToneOption, [string, string, string]> = {
    עדין: [
      "תודה שכתבת, כרגע פחות נוח לי אבל נדבר בהמשך.",
      "קיבלתי, אני צריך/ה רגע לחשוב ואחזור אליך.",
      "מעריך/ה את ההודעה, אחזור אליך כשאהיה פנוי/ה לזה.",
    ],
    ישיר: [
      "לא מתאים לי כרגע, בוא/י נעצור כאן.",
      "אני לא פנוי/ה לזה עכשיו.",
      "זה פחות הכיוון שלי כרגע.",
    ],
    זורם: [
      "קיבלתי, בוא/י נמשיך רגוע.",
      "סבבה, נדבר בערב?",
      "בול, זורם לי להמשיך מפה.",
    ],
    מצחיק: [
      "קיבלתי, המוח שלי טוען ואז חוזר אליך.",
      "יש מצב שאני עונה אחרי קפה שני, זה הנוהל.",
      "סגור, נותן/ת לדרמה שתי דקות ואז ממשיכים.",
    ],
    פלרטטני: [
      "מסוכן/ת אתה/את, עוד רגע אני נמס/ה.",
      "אהבתי את הווייב, ממשיך/ה איתך.",
      "תמשיך/י ככה ואני כבר מחכה להודעה הבאה.",
    ],
  };

  const replies = [...baseRepliesByTone[tone]] as [string, string, string];

  if (sourceReply) {
    replies[0] = sourceReply;
  } else if (continuePreference === "לא") {
    const repliesByTone: Record<ToneOption, string> = {
      עדין: "תודה שכתבת, אבל פחות מתאים לי ואני לא מסכים/ה עם זה כרגע.",
      ישיר: "לא, אני לא מסכים/ה עם זה.",
      זורם: "לא, זה פחות מתאים לי.",
      מצחיק: "לא, הפעם אני בצד של ה'לא'.",
      פלרטטני: "חמוד/ה, אבל על זה אני לא זורם/ת.",
    };

    replies[0] = repliesByTone[tone];
  } else if (continuePreference === "כן") {
    const repliesByTone: Record<ToneOption, string> = {
      עדין: "כן, זה מקובל עליי.",
      ישיר: "כן, אני מסכים/ה עם זה.",
      זורם: "כן, זורם לי.",
      מצחיק: "כן, חתמתי בלב על 'כן'.",
      פלרטטני: "כן, זה לגמרי עובד לי.",
    };

    replies[0] = repliesByTone[tone];
  } else if (message && tone === "ישיר" && message.includes("?")) {
    replies[0] = "כן, התשובה שלי היא לא.";
  }

  return replies;
}

function buildInstructions(): string {
  return [
    'You create reply suggestions for an Israeli consumer app called "SayBack".',
    "Return JSON only and match the provided schema exactly.",
    "Write every field in natural, modern Israeli Hebrew.",
    "The intent field should be one short sentence about the other side's likely intent.",
    "The replies field must contain exactly 3 distinct replies.",
    "Rules for every reply:",
    "- sound like a real Israeli person",
    "- concise and copy-ready",
    "- avoid robotic phrasing",
    "- avoid cringe, melodrama, and therapy-speak",
    "- respect the requested tone and context",
    "- keep self-respect if the incoming message is rude or manipulative",
    "- do not wrap replies in quotes",
  ].join("\n");
}

function buildInputContent({
  message,
  imageUrl,
  context,
  tone,
  continuePreference,
  refineInstruction,
}: {
  message?: string;
  imageUrl?: string;
  context?: ContextOption;
  tone?: ToneOption;
  continuePreference?: ContinuePreferenceOption;
  refineInstruction?: string;
}): InputContentItem[] {
  const details = [
    `הקשר: ${context ?? "כללי"}`,
    `טון רצוי: ${tone ?? "זורם"}`,
    `מסכים/ה עם מה שנאמר: ${continuePreference ?? "לא צוין"}`,
    refineInstruction ? `שינוי מבוקש: ${refineInstruction}` : null,
    message
      ? `הודעה שהמשתמש קיבל:\n"""\n${message}\n"""`
      : "אין טקסט מודבק. צריך להבין את השיחה לפי התמונה.",
    imageUrl ? "מצורף גם צילום מסך של השיחה." : null,
  ]
    .filter(Boolean)
    .join("\n");

  const content: InputContentItem[] = [
    {
      type: "input_text",
      text: details,
    },
  ];

  if (imageUrl) {
    content.push({
      type: "input_image",
      image_url: imageUrl,
      detail: "auto",
    });
  }

  return content;
}

function normalizeMessage(value?: string): string | undefined {
  const normalized = normalizeOptionalText(value, MAX_MESSAGE_LENGTH);
  return normalized || undefined;
}

function normalizeOptionalText(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return undefined;
  }

  if (normalized.length > maxLength) {
    throw new AIRequestError(`Text input is too long. Max ${maxLength} characters.`, 400);
  }

  return normalized;
}

function normalizeContext(value?: string): ContextOption | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if ((CONTEXT_OPTIONS as readonly string[]).includes(value)) {
    return value as ContextOption;
  }

  throw new AIRequestError("Invalid context value.", 400);
}

function normalizeTone(value?: string): ToneOption | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if ((TONE_OPTIONS as readonly string[]).includes(value)) {
    return value as ToneOption;
  }

  throw new AIRequestError("Invalid tone value.", 400);
}

function normalizeContinuePreference(
  value?: string | null,
): ContinuePreferenceOption | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AIRequestError("Invalid continue preference value.", 400);
  }

  if ((CONTINUE_PREFERENCE_OPTIONS as readonly string[]).includes(value)) {
    return value as ContinuePreferenceOption;
  }

  throw new AIRequestError("Invalid continue preference value.", 400);
}

function normalizeAction(value?: string): ReplyActionOption | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if ((REPLY_ACTION_OPTIONS as readonly string[]).includes(value)) {
    return value as ReplyActionOption;
  }

  throw new AIRequestError("Invalid action value.", 400);
}

function buildRefineInstruction({
  explicitInstruction,
  action,
  sourceReply,
}: {
  explicitInstruction?: string;
  action?: ReplyActionOption;
  sourceReply?: string;
}): string | undefined {
  if (explicitInstruction) {
    return explicitInstruction;
  }

  if (!action) {
    return sourceReply
      ? `בסס את התשובה החדשה על הטיוטה הבאה ושפר אותה: ${sourceReply}`
      : undefined;
  }

  const actionInstruction = (() => {
    if (action === "softer") {
      return "הצעה חדשה, עדינה יותר ונעימה יותר בלי לוותר על בהירות.";
    }

    if (action === "sharper") {
      return "הצעה חדשה, יותר חדה וישירה אך עדיין מכבדת.";
    }

    return "הצעה חדשה ושונה מהניסוח הקודם.";
  })();

  if (!sourceReply) {
    return actionInstruction;
  }

  return `${actionInstruction}\nטיוטה קודמת לשיפור: ${sourceReply}`;
}

function normalizeImage(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.length > MAX_IMAGE_LENGTH) {
    throw new AIRequestError("Image payload is too large.", 413);
  }

  if (normalized.startsWith("data:image/")) {
    return normalized;
  }

  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    throw new AIRequestError("Image payload must be base64 or a data URL.", 400);
  }

  return `data:image/png;base64,${normalized.replace(/\s+/g, "")}`;
}

function mapOpenAIErrorStatus(status: number) {
  if (status === 400 || status === 413 || status === 429) {
    return status;
  }

  return 502;
}

async function safeParseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: {
        message: text,
      },
    };
  }
}

function extractOutputText(payload: OpenAIResponsePayload): string | undefined {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text?.trim())
    .filter((item): item is string => Boolean(item));

  return chunks?.join("\n");
}

function validateResponseShape(value: unknown): GenerateRepliesResult {
  if (!value || typeof value !== "object") {
    throw new AIRequestError("OpenAI returned an invalid response shape.", 502);
  }

  const intent = Reflect.get(value, "intent");
  const replies = Reflect.get(value, "replies");

  if (typeof intent !== "string" || !intent.trim()) {
    throw new AIRequestError("OpenAI returned an invalid intent.", 502);
  }

  if (!Array.isArray(replies) || replies.length !== 3) {
    throw new AIRequestError("OpenAI returned an invalid replies array.", 502);
  }

  const normalizedReplies = replies.map((reply) => {
    if (typeof reply !== "string" || !reply.trim()) {
      throw new AIRequestError("OpenAI returned an invalid reply option.", 502);
    }

    return reply.trim();
  });

  return {
    intent: intent.trim(),
    replies: normalizedReplies as [string, string, string],
  };
}
