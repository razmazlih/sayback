import {
  MAX_CONVERSATION_BACKGROUND_LENGTH,
  MAX_INCOMING_MESSAGE_LENGTH,
  MAX_LAST_OUTGOING_MESSAGE_LENGTH,
  MAX_NO_REPLY_DURATION_VALUE,
} from "@/lib/message-limits";

const CONTEXT_OPTIONS = [
  "קראש",
  "אקס",
  "ידיד",
  "לקוח",
  "בוס",
  "יד2",
  "בן/בת זוג",
  "דייט",
  "קולגה",
  "משפחה",
  "שותף/ה לדירה",
  "שכנים",
] as const;
const TONE_OPTIONS = [
  "עדין",
  "ישיר",
  "זורם",
  "מצחיק",
  "פלרטטני",
  "אסרטיבי",
  "רגוע",
  "רשמי",
  "קליל",
  "ענייני",
] as const;
const CONTINUE_PREFERENCE_OPTIONS = ["כן", "לא"] as const;
export const GOAL_OPTIONS = [
  "להמשיך שיחה",
  "לקבוע זמן",
  "לבקש הבהרה",
  "להציב גבול",
  "לסגור בנימוס",
  "להתמקח / לקדם סגירה",
  "תזכורת עדינה",
  "בדיקת סטטוס",
  "שחרור מכבד",
] as const;
const FOLLOW_UP_GOAL_OPTIONS = ["תזכורת עדינה", "בדיקת סטטוס", "שחרור מכבד"] as const;
const REPLY_ACTION_OPTIONS = ["softer", "sharper", "retry"] as const;
const NO_REPLY_DURATION_UNITS = ["minutes", "hours", "days"] as const;

const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const FREE_AI_MODE_ENABLED = process.env.LOCAL_FREE_AI?.trim().toLowerCase() === "true";
const MAX_MESSAGE_LENGTH = MAX_INCOMING_MESSAGE_LENGTH;
const MAX_IMAGE_LENGTH = 10_000_000;

type ContextOption = (typeof CONTEXT_OPTIONS)[number];
type ToneOption = (typeof TONE_OPTIONS)[number];
type ContinuePreferenceOption = (typeof CONTINUE_PREFERENCE_OPTIONS)[number];
export type GoalOption = (typeof GOAL_OPTIONS)[number];
type FollowUpGoalOption = (typeof FOLLOW_UP_GOAL_OPTIONS)[number];
type ReplyActionOption = (typeof REPLY_ACTION_OPTIONS)[number];
type NoReplyDurationUnit = (typeof NO_REPLY_DURATION_UNITS)[number];

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
  goal?: string;
  continuePreference?: string | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: string;
  lastOutgoingMessage?: string;
  refineInstruction?: string;
  action?: string;
  sourceReply?: string;
}

export interface GenerateRepliesResult {
  intent: string;
  replies: [string, string, string];
}

export type AIModelSource = "api" | "local";

export interface GenerateRepliesWithModelSourceResult {
  result: GenerateRepliesResult;
  modelSource: AIModelSource;
}

type PresetExampleReply = {
  message: string;
  context: ContextOption;
  tone: ToneOption;
  continuePreference: ContinuePreferenceOption;
  result: GenerateRepliesResult;
};

const PRESET_EXAMPLE_REPLIES: readonly PresetExampleReply[] = [
  {
    message: "היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך",
    context: "קראש",
    tone: "פלרטטני",
    continuePreference: "כן",
    result: {
      intent: "להחזיר עניין ולהשאיר את השיחה קלילה ומסקרנת.",
      replies: [
        "חח נו, יפה שנזכרת. מה גרם לזה דווקא עכשיו?",
        "אני מקבלת מחשבות יפות כאלה. מה איתך השבוע?",
        "טוב, זה פתיח לא רע בכלל. מה קורה אצלך?",
      ],
    },
  },
  {
    message: "וואלה עברתי ליד המקום שלנו ונזכרתי בך. איך את?",
    context: "אקס",
    tone: "ישיר",
    continuePreference: "לא",
    result: {
      intent: "לענות בנימוס אבל לשמור על גבול ברור ולא לעודד בלבול.",
      replies: [
        "אני בסדר, תודה. מעדיפה להשאיר את זה מאחורינו.",
        "תודה ששאלת, הכול טוב. לא נראה לי נכון לפתוח את זה שוב.",
        "אני מעריכה את ההודעה, אבל עדיף לי לא לחזור לשם.",
      ],
    },
  },
  {
    message: "ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו",
    context: "לקוח",
    tone: "עדין",
    continuePreference: "כן",
    result: {
      intent: "לשמור על שירות טוב, להסביר גבול ולקרב לסגירה בלי להישבר מיד במחיר.",
      replies: [
        "מבין אותך. כרגע זה המחיר הכי מדויק שאני יכול לתת, והוא כבר כולל את מה שסיכמנו.",
        "אשמח לסגור איתך, אבל זה המחיר הנכון עבור העבודה. אם מתאים לך, אני ממשיך איתך עכשיו.",
        "רוצה לעזור לך להתקדם מהר, פשוט לא נכון לי לרדת בעוד 20%. אם תרצה, אני זמין לסגור בתנאים ששלחתי.",
      ],
    },
  },
  {
    message: "אחרון כמה? בא לקחת היום אם יש מחיר טוב",
    context: "יד2",
    tone: "זורם",
    continuePreference: "כן",
    result: {
      intent: "לשמור על עניין מצד הקונה, אבל להבהיר מחיר ותנאי סגירה.",
      replies: [
        "אם אתה רציני להיום, המחיר הסופי הוא כמו במודעה ואפשר לתאם איסוף.",
        "אפשר היום, המחיר נשאר כמו שפרסמתי. אם מתאים לך, שולח מיקום.",
        "יש גמישות קטנה רק מול קונה שסוגר היום. אם רלוונטי לך, נתקדם.",
      ],
    },
  },
] as const;

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
  const generated = await generateRepliesWithModelSource(input);
  return generated.result;
}

export async function generateRepliesWithModelSource(
  input: GenerateRepliesInput,
): Promise<GenerateRepliesWithModelSourceResult> {
  const message = normalizeMessage(input.message);
  const context = normalizeContext(input.context);
  const tone = normalizeTone(input.tone);
  const goal = normalizeGoal(input.goal);
  const continuePreference = normalizeContinuePreference(input.continuePreference);
  const conversationBackground = normalizeOptionalText(
    input.conversationBackground,
    MAX_CONVERSATION_BACKGROUND_LENGTH,
  );
  const noReplyMode = normalizeNoReplyMode(input.noReplyMode);
  const noReplyDurationValue = normalizeNoReplyDurationValue(input.noReplyDurationValue);
  const noReplyDurationUnit = normalizeNoReplyDurationUnit(input.noReplyDurationUnit);
  const lastOutgoingMessage = normalizeOptionalText(
    input.lastOutgoingMessage,
    MAX_LAST_OUTGOING_MESSAGE_LENGTH,
  );
  const action = normalizeAction(input.action);
  const sourceReply = normalizeOptionalText(input.sourceReply, 220);
  const refineInstruction = buildRefineInstruction({
    explicitInstruction: normalizeOptionalText(input.refineInstruction, 220),
    action,
    sourceReply,
  });
  const imageUrl = normalizeImage(input.imageBase64);

  if (input.refineInstruction !== undefined && !normalizeOptionalText(input.refineInstruction, 220)) {
    throw new AIRequestError("כתבו מה תרצו לשנות בניסוח.", 400);
  }

  if (noReplyMode) {
    if (goal && !FOLLOW_UP_GOAL_OPTIONS.includes(goal as FollowUpGoalOption)) {
      throw new AIRequestError('המטרה שנבחרה לא מתאימה למצב "מחכה לתשובה".', 400);
    }

    if (imageUrl) {
      throw new AIRequestError(
        'במצב "מחכה לתשובה" אפשר לשלוח טקסט בלבד, בלי צילום מסך.',
        400,
      );
    }

    if (!lastOutgoingMessage) {
      throw new AIRequestError(
        'לא קיבלתי את ההודעה האחרונה ששלחת במצב "מחכה לתשובה".',
        400,
      );
    }

    if (!noReplyDurationUnit || !noReplyDurationValue) {
      throw new AIRequestError(
        'במצב "מחכה לתשובה" חייבים לציין כמה זמן מחכים לתגובה (מספר + יחידה).',
        400,
      );
    }
  } else if (!message && !imageUrl) {
    throw new AIRequestError(
      "צריך לשלוח הודעה או צילום מסך.",
      400,
    );
  }

  if (!noReplyMode && goal && FOLLOW_UP_GOAL_OPTIONS.includes(goal as FollowUpGoalOption)) {
    throw new AIRequestError('מטרת פולו־אפ זמינה רק במצב "מחכה לתשובה".', 400);
  }

  const presetResult = findPresetExampleResult({
    message,
    context,
    tone,
    goal,
    continuePreference,
    action,
    sourceReply,
    refineInstruction,
    imageUrl,
    conversationBackground,
    noReplyMode,
    noReplyDurationValue,
    noReplyDurationUnit,
    lastOutgoingMessage,
  });

  if (FREE_AI_MODE_ENABLED) {
    if (presetResult) {
      return {
        result: presetResult,
        modelSource: "local",
      };
    }

    return {
      result: generateFreeReplies({
        message,
        context,
        tone,
        goal,
        continuePreference,
        conversationBackground,
        noReplyMode,
        noReplyDurationValue,
        noReplyDurationUnit,
        lastOutgoingMessage,
        action,
        sourceReply,
        refineInstruction,
      }),
      modelSource: "local",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new AIRequestError(
      "כרגע אי אפשר ליצור תשובות. נסו שוב בעוד רגע.",
      500,
    );
  }

  try {
    const result = await generateRepliesViaOpenAI({
      apiKey,
      message,
      imageUrl,
      context,
      tone,
      goal,
      continuePreference,
      conversationBackground,
      noReplyMode,
      noReplyDurationValue,
      noReplyDurationUnit,
      lastOutgoingMessage,
      refineInstruction,
    });

    return {
      result,
      modelSource: "api",
    };
  } catch (error) {
    if (error instanceof AIRequestError) {
      throw error;
    }

    throw new AIRequestError("לא הצלחנו ליצור תשובות כרגע. נסו שוב.", 502);
  }
}

async function generateRepliesViaOpenAI({
  apiKey,
  message,
  imageUrl,
  context,
  tone,
  goal,
  continuePreference,
  conversationBackground,
  noReplyMode,
  noReplyDurationValue,
  noReplyDurationUnit,
  lastOutgoingMessage,
  refineInstruction,
}: {
  apiKey: string;
  message?: string;
  imageUrl?: string;
  context?: ContextOption;
  tone?: ToneOption;
  goal?: GoalOption;
  continuePreference?: ContinuePreferenceOption;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  refineInstruction?: string;
}): Promise<GenerateRepliesResult> {
  const reasoning = DEFAULT_MODEL === "chat-latest"
    ? { effort: "medium" }
    : DEFAULT_MODEL.startsWith("gpt-5")
      ? { effort: "none" }
      : undefined;
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      store: false,
      ...(reasoning ? { reasoning } : {}),
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
            goal,
            continuePreference,
            conversationBackground,
            noReplyMode,
            noReplyDurationValue,
            noReplyDurationUnit,
            lastOutgoingMessage,
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
      upstreamMessage || "לא הצלחנו ליצור תשובות כרגע. נסו שוב.",
      status,
    );
  }

  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new AIRequestError("לא התקבלה תשובה. נסו שוב.", 502);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AIRequestError("לא הצלחנו לקרוא את התשובה. נסו שוב.", 502);
  }

  return validateResponseShape(parsed);
}

function generateFreeReplies({
  message,
  context,
  tone,
  goal,
  continuePreference,
  conversationBackground,
  noReplyMode,
  noReplyDurationValue,
  noReplyDurationUnit,
  lastOutgoingMessage,
  action,
  sourceReply,
  refineInstruction,
}: {
  message?: string;
  context?: ContextOption;
  tone?: ToneOption;
  goal?: GoalOption;
  continuePreference?: ContinuePreferenceOption;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  action?: ReplyActionOption;
  sourceReply?: string;
  refineInstruction?: string;
}): GenerateRepliesResult {
  const intent = buildFreeIntent({
    message,
    context,
    goal,
    noReplyMode,
    noReplyDurationValue,
    noReplyDurationUnit,
  });
  const effectiveTone =
    action === "softer" ? "עדין" : action === "sharper" ? "ישיר" : (tone ?? "זורם");

  const replies = buildFreeReplies({
    tone: effectiveTone,
    context,
    message,
    goal,
    continuePreference,
    conversationBackground,
    noReplyMode,
    noReplyDurationValue,
    noReplyDurationUnit,
    lastOutgoingMessage,
    action,
    sourceReply,
    refineInstruction,
  });

  return { intent, replies };
}

function buildFreeIntent({
  message,
  context,
  goal,
  noReplyMode,
  noReplyDurationValue,
  noReplyDurationUnit,
}: {
  message?: string;
  context?: ContextOption;
  goal?: GoalOption;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
}): string {
  if (noReplyMode && noReplyDurationValue && noReplyDurationUnit) {
    if (goal === "שחרור מכבד") {
      return "לסיים את הפולו־אפ בכבוד, בלי ליצור לחץ נוסף.";
    }
    if (goal === "בדיקת סטטוס") {
      return "לבדוק סטטוס בצורה קצרה, ישירה ומכבדת.";
    }
    return `הצד השני שקט כבר ${formatNoReplyDuration(noReplyDurationValue, noReplyDurationUnit)}, וצריך הודעת המשך קצרה שמניעה תשובה בלי לחץ.`;
  }

  const goalIntent: Partial<Record<GoalOption, string>> = {
    "להמשיך שיחה": "להמשיך את השיחה בצורה טבעית ונעימה.",
    "לקבוע זמן": "לקדם תיאום ברור לזמן או למפגש.",
    "לבקש הבהרה": "לבקש הבהרה ישירה בלי להישמע מאשים/ה.",
    "להציב גבול": "לנסח גבול ברור ומכבד.",
    "לסגור בנימוס": "לסיים את השיחה בנימוס ובבהירות.",
    "להתמקח / לקדם סגירה": "לקדם סגירה תוך שמירה על תנאים ברורים.",
  };
  if (goal && goalIntent[goal]) {
    return goalIntent[goal];
  }

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
  goal,
  continuePreference,
  conversationBackground,
  noReplyMode,
  noReplyDurationValue,
  noReplyDurationUnit,
  lastOutgoingMessage,
  action,
  sourceReply,
  refineInstruction,
}: {
  tone: ToneOption;
  context?: ContextOption;
  message?: string;
  goal?: GoalOption;
  continuePreference?: ContinuePreferenceOption;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  action?: ReplyActionOption;
  sourceReply?: string;
  refineInstruction?: string;
}): [string, string, string] {
  if (
    noReplyMode &&
    lastOutgoingMessage &&
    noReplyDurationValue &&
    noReplyDurationUnit
  ) {
    return buildNoReplyFreeReplies({
      tone,
      context,
      noReplyDurationValue,
      noReplyDurationUnit,
      lastOutgoingMessage,
      conversationBackground,
      goal,
    });
  }

  const goalReplies: Partial<Record<GoalOption, [string, string, string]>> = {
    "להמשיך שיחה": ["מעניין, ספר/י לי עוד.", "סבבה, בא לי להמשיך את השיחה הזאת.", "מה קורה איתך מאז?"],
    "לקבוע זמן": ["נשמע טוב. מתאים לך לקבוע זמן השבוע?", "בוא/י נסגור זמן שנוח לשנינו.", "אני פנוי/ה ב___ או ב___, מה עובד לך?"],
    "לבקש הבהרה": ["רק כדי להבין, למה בדיוק התכוונת?", "אפשר לחדד לי מה את/ה מציע/ה?", "אני רוצה לוודא שהבנתי נכון — תסביר/י רגע?"],
    "להציב גבול": ["חשוב לי לשמור על הגבול הזה, אז זה לא מתאים לי.", "אני מבין/ה, אבל זה לא עובד לי בצורה הזאת.", "מעדיף/ה שנשמור על זה ברור ומכבד מכאן."],
    "לסגור בנימוס": ["תודה שכתבת. מבחינתי אפשר לסגור את זה כאן.", "מעריך/ה את ההודעה, אבל לא נכון לי להמשיך בזה.", "תודה, מאחל/ת לך טוב בהמשך."],
    "להתמקח / לקדם סגירה": ["אם זה מתאים בתנאים שסיכמנו, אפשר לסגור היום.", "אשמח להתקדם, זה המחיר או התנאי הנכון מבחינתי.", "יש גמישות קטנה רק אם סוגרים עכשיו. מתאים?"],
  };
  if (goal && goalReplies[goal] && !sourceReply) {
    return goalReplies[goal];
  }

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
    אסרטיבי: [
      "חשוב לי להיות ברור/ה: כרגע זה פחות מתאים לי.",
      "אני בוחר/ת בקו הזה, ואם מתאים לך נמשיך ממנו.",
      "בוא/י נשמור את זה קצר וברור כדי להתקדם.",
    ],
    רגוע: [
      "תודה שכתבת, ניקח את זה בנחת ונראה מה מתאים.",
      "קיבלתי אותך, חוזר/ת אליך ברוגע בהמשך.",
      "אפשר להמשיך בכיף ובלי לחץ.",
    ],
    רשמי: [
      "תודה על הפנייה. אחזור עם תשובה מסודרת בהקדם.",
      "קיבלתי את ההודעה ואעדכן לאחר בדיקה קצרה.",
      "מאשר/ת קבלה, ואשיב בצורה מסודרת בהמשך.",
    ],
    קליל: [
      "סבבה לגמרי, נמשיך בקליל.",
      "קיבלתי, זורם לי להתקדם בלי כבדות.",
      "יאללה, נשאיר את זה פשוט ונמשיך.",
    ],
    ענייני: [
      "קיבלתי. הנה התשובה הקצרה: כרגע לא.",
      "מעולה, בוא/י נסגור החלטה ונמשיך.",
      "כדי להתקדם, צריך תשובה ברורה עכשיו.",
    ],
  };

  const replies = [...baseRepliesByTone[tone]] as [string, string, string];

  if (sourceReply) {
    replies[0] = refineFreeReply(sourceReply, refineInstruction, action);
  } else if (continuePreference === "לא") {
    const repliesByTone: Record<ToneOption, string> = {
      עדין: "תודה שכתבת, אבל פחות מתאים לי ואני לא מסכים/ה עם זה כרגע.",
      ישיר: "לא, אני לא מסכים/ה עם זה.",
      זורם: "לא, זה פחות מתאים לי.",
      מצחיק: "לא, הפעם אני בצד של ה'לא'.",
      פלרטטני: "חמוד/ה, אבל על זה אני לא זורם/ת.",
      אסרטיבי: "לא, זה הגבול שלי כרגע.",
      רגוע: "לא כרגע, מעדיף/ה לשמור על זה רגוע.",
      רשמי: "לא, זה לא מתאפשר כרגע.",
      קליל: "לא הפעם, נשמור את זה פשוט.",
      ענייני: "לא, זה לא מתאים לתנאים כרגע.",
    };

    replies[0] = repliesByTone[tone];
  } else if (continuePreference === "כן") {
    const repliesByTone: Record<ToneOption, string> = {
      עדין: "כן, זה מקובל עליי.",
      ישיר: "כן, אני מסכים/ה עם זה.",
      זורם: "כן, זורם לי.",
      מצחיק: "כן, חתמתי בלב על 'כן'.",
      פלרטטני: "כן, זה לגמרי עובד לי.",
      אסרטיבי: "כן, זה מתאים לי ואפשר להתקדם.",
      רגוע: "כן, מתאים לי להמשיך בקצב רגוע.",
      רשמי: "כן, מאשר/ת ואפשר להתקדם.",
      קליל: "כן, לגמרי, ממשיכים.",
      ענייני: "כן, מאשר/ת וממשיכים לשלב הבא.",
    };

    replies[0] = repliesByTone[tone];
  } else if (message && tone === "ישיר" && message.includes("?")) {
    replies[0] = "כן, התשובה שלי היא לא.";
  }

  return replies;
}

function refineFreeReply(
  sourceReply: string,
  refineInstruction?: string,
  action?: ReplyActionOption,
) {
  const instruction = refineInstruction?.toLowerCase() ?? '';

  if (instruction.includes('בלי אימוג׳י') || instruction.includes('בלי אימוג׳')) {
    return sourceReply.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s{2,}/g, ' ').trim();
  }

  if (instruction.includes('עם אימוג׳י') || instruction.includes('עם אימוג׳')) {
    return /[\p{Extended_Pictographic}]/u.test(sourceReply) ? sourceReply : `${sourceReply} 🙂`;
  }

  if (instruction.includes('קצר')) {
    return sourceReply.split(/[.!?]/)[0]?.trim() || sourceReply;
  }

  if (action === 'softer') {
    return `היי, ${sourceReply}`;
  }

  if (action === 'sharper') {
    return sourceReply.replace(/(אולי|נראה לי|בערך)\s*/g, '').trim();
  }

  return `${sourceReply} — ${instruction || 'בניסוח קצת אחר'}`;
}

function buildNoReplyFreeReplies({
  tone,
  context,
  goal,
  noReplyDurationValue,
  noReplyDurationUnit,
  lastOutgoingMessage,
  conversationBackground,
}: {
  tone: ToneOption;
  context?: ContextOption;
  goal?: GoalOption;
  noReplyDurationValue: number;
  noReplyDurationUnit: NoReplyDurationUnit;
  lastOutgoingMessage: string;
  conversationBackground?: string;
}): [string, string, string] {
  const duration = formatNoReplyDuration(noReplyDurationValue, noReplyDurationUnit);
  const openingByTone: Record<ToneOption, string> = {
    עדין: "היי, רק מעלה את זה שוב בעדינות :)",
    ישיר: "היי, מרים/ה את זה שוב כדי לסגור.",
    זורם: "היי, קופץ/ת לעדכן ולבדוק אם זה עדיין רלוונטי.",
    מצחיק: "היי, פינג קטן לפני שאני מאשים/ה את הוואטסאפ :)",
    פלרטטני: "היי, פינג קטן ממני כי נעלמת לי קצת ;) ",
    אסרטיבי: "היי, מעלה את זה שוב כדי שנתקדם.",
    רגוע: "היי, רק תזכורת קטנה בלי לחץ.",
    רשמי: "שלום, מבקש/ת לוודא שההודעה התקבלה.",
    קליל: "היי, רק קפיצה קטנה לבדוק שזה עדיין רלוונטי.",
    ענייני: "היי, פולו-אפ קצר כדי לסגור סטטוס.",
  };
  const contextSuffix =
    context === "לקוח"
      ? "אם עדיין רלוונטי, אפשר לסגור את זה היום."
      : context === "בוס"
        ? "אם תרצה/י, אעדכן מיד מה צריך ממני כדי להתקדם."
        : "אם זה עדיין מתאים לך, אשמח להמשיך.";
  const goalSuffix =
    goal === "שחרור מכבד"
      ? "אם זה כבר לא רלוונטי, הכול טוב ואפשר לשחרר."
      : goal === "בדיקת סטטוס"
        ? "אשמח לעדכון קצר על הסטטוס כשמתאפשר."
        : contextSuffix;
  const backgroundSuffix = conversationBackground
    ? "זוכר/ת את מה שדיברנו קודם, אז רק רציתי לבדוק אם מתקדם."
    : "רק בודק/ת איפה זה עומד.";
  const compactLastOutgoing =
    lastOutgoingMessage.length > 90
      ? `${lastOutgoingMessage.slice(0, 87).trim()}...`
      : lastOutgoingMessage;

  return [
    `${openingByTone[tone]} עברו כבר ${duration}. ${goalSuffix}`,
    `שולח/ת תזכורת קצרה אחרי ${duration} בלי מענה. ${backgroundSuffix}`,
    `ההודעה האחרונה שלי הייתה: "${compactLastOutgoing}". אם זה עדיין פתוח, נמשיך מכאן?`,
  ];
}

function formatNoReplyDuration(value: number, unit: NoReplyDurationUnit) {
  if (unit === "minutes") {
    return `${value} דקות`;
  }

  if (unit === "hours") {
    return `${value} שעות`;
  }

  return `${value} ימים`;
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
    "- if no-reply mode is enabled, write follow-up messages after silence without sounding needy",
    "- keep self-respect if the incoming message is rude or manipulative",
    "- do not wrap replies in quotes",
  ].join("\n");
}

function buildInputContent({
  message,
  imageUrl,
  context,
  tone,
  goal,
  continuePreference,
  conversationBackground,
  noReplyMode,
  noReplyDurationValue,
  noReplyDurationUnit,
  lastOutgoingMessage,
  refineInstruction,
}: {
  message?: string;
  imageUrl?: string;
  context?: ContextOption;
  tone?: ToneOption;
  goal?: GoalOption;
  continuePreference?: ContinuePreferenceOption;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  refineInstruction?: string;
}): InputContentItem[] {
  const noReplyDurationText =
    noReplyMode && noReplyDurationValue && noReplyDurationUnit
      ? formatNoReplyDuration(noReplyDurationValue, noReplyDurationUnit)
      : "לא צוין";
  const details = [
    `הקשר: ${context ?? "כללי"}`,
    `טון רצוי: ${tone ?? "זורם"}`,
    `מטרת התשובה: ${goal ?? "לא צוין"}`,
    `מסכים/ה עם מה שנאמר: ${continuePreference ?? "לא צוין"}`,
    `מצב לא ענה הרבה זמן: ${noReplyMode ? "כן" : "לא"}`,
    `משך זמן ללא מענה: ${noReplyDurationText}`,
    lastOutgoingMessage
      ? `הודעה אחרונה שהמשתמש שלח:\n"""\n${lastOutgoingMessage}\n"""`
      : null,
    conversationBackground
      ? `רקע שיחה נוסף:\n"""\n${conversationBackground}\n"""`
      : null,
    refineInstruction ? `שינוי מבוקש: ${refineInstruction}` : null,
    message
      ? `הודעה שהמשתמש קיבל:\n"""\n${message}\n"""`
      : noReplyMode
        ? "אין הודעה חדשה שהתקבלה כרגע, צריך לנסח הודעת המשך אחרי חוסר מענה."
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
    throw new AIRequestError(`הטקסט ארוך מדי. אפשר עד ${maxLength} תווים.`, 400);
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

  throw new AIRequestError("הסיטואציה שנבחרה לא תקינה.", 400);
}

function normalizeTone(value?: string): ToneOption | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if ((TONE_OPTIONS as readonly string[]).includes(value)) {
    return value as ToneOption;
  }

  throw new AIRequestError("הסגנון שנבחר לא תקין.", 400);
}

function normalizeGoal(value?: string): GoalOption | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string" && (GOAL_OPTIONS as readonly string[]).includes(value)) {
    return value as GoalOption;
  }

  throw new AIRequestError("המטרה שנבחרה לא תקינה.", 400);
}

function normalizeContinuePreference(
  value?: string | null,
): ContinuePreferenceOption | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AIRequestError("בחירת ההסכמה לא תקינה.", 400);
  }

  if ((CONTINUE_PREFERENCE_OPTIONS as readonly string[]).includes(value)) {
    return value as ContinuePreferenceOption;
  }

  throw new AIRequestError("בחירת ההסכמה לא תקינה.", 400);
}

function normalizeNoReplyMode(value?: boolean): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new AIRequestError("מצב הכתיבה לא תקין.", 400);
  }

  return value;
}

function normalizeNoReplyDurationValue(value?: number): number | undefined {
  if (value == null) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_NO_REPLY_DURATION_VALUE
  ) {
    throw new AIRequestError(
      `משך הזמן לא תקין. הזינו מספר שלם בין 1 ל-${MAX_NO_REPLY_DURATION_VALUE}.`,
      400,
    );
  }

  return value;
}

function normalizeNoReplyDurationUnit(value?: string): NoReplyDurationUnit | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if ((NO_REPLY_DURATION_UNITS as readonly string[]).includes(value)) {
    return value as NoReplyDurationUnit;
  }

  throw new AIRequestError("יחידת הזמן לא תקינה.", 400);
}

function normalizeAction(value?: string): ReplyActionOption | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if ((REPLY_ACTION_OPTIONS as readonly string[]).includes(value)) {
    return value as ReplyActionOption;
  }

  throw new AIRequestError("פעולת השיפור לא תקינה.", 400);
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
    throw new AIRequestError("התמונה גדולה מדי.", 413);
  }

  if (normalized.startsWith("data:image/")) {
    return normalized;
  }

  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    throw new AIRequestError("פורמט התמונה לא תקין.", 400);
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
    throw new AIRequestError("לא הצלחנו לבנות תשובות תקינות. נסו שוב.", 502);
  }

  const intent = Reflect.get(value, "intent");
  const replies = Reflect.get(value, "replies");

  if (typeof intent !== "string" || !intent.trim()) {
    throw new AIRequestError("לא הצלחנו לבנות תשובות תקינות. נסו שוב.", 502);
  }

  if (!Array.isArray(replies) || replies.length !== 3) {
    throw new AIRequestError("לא הצלחנו לבנות 3 תשובות תקינות. נסו שוב.", 502);
  }

  const normalizedReplies = replies.map((reply) => {
    if (typeof reply !== "string" || !reply.trim()) {
      throw new AIRequestError("אחת מהתשובות לא תקינה. נסו שוב.", 502);
    }

    return reply.trim();
  });

  return {
    intent: intent.trim(),
    replies: normalizedReplies as [string, string, string],
  };
}

function findPresetExampleResult({
  message,
  context,
  tone,
  goal,
  continuePreference,
  conversationBackground,
  noReplyMode,
  noReplyDurationValue,
  noReplyDurationUnit,
  lastOutgoingMessage,
  action,
  sourceReply,
  refineInstruction,
  imageUrl,
}: {
  message?: string;
  context?: ContextOption;
  tone?: ToneOption;
  goal?: GoalOption;
  continuePreference?: ContinuePreferenceOption;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: NoReplyDurationUnit;
  lastOutgoingMessage?: string;
  action?: ReplyActionOption;
  sourceReply?: string;
  refineInstruction?: string;
  imageUrl?: string;
}): GenerateRepliesResult | null {
  if (
    !message ||
    imageUrl ||
    goal ||
    action ||
    sourceReply ||
    refineInstruction ||
    conversationBackground ||
    noReplyMode ||
    noReplyDurationValue ||
    noReplyDurationUnit ||
    lastOutgoingMessage
  ) {
    return null;
  }

  if (!context || !tone || !continuePreference) {
    return null;
  }

  const preset = PRESET_EXAMPLE_REPLIES.find((candidate) => {
    return (
      candidate.message === message &&
      candidate.context === context &&
      candidate.tone === tone &&
      candidate.continuePreference === continuePreference
    );
  });

  if (!preset) {
    return null;
  }

  return {
    intent: preset.result.intent,
    replies: [...preset.result.replies] as [string, string, string],
  };
}
