export const HOME_DEEPLINK_QUERY_KEYS = {
  example: 'example',
  message: 'message',
  situation: 'situation',
  tone: 'tone',
  agrees: 'agrees',
} as const;

export const HOME_DEEPLINK_LIMITS = {
  example: 64,
  message: 700,
  situation: 24,
  tone: 24,
  agrees: 8,
} as const;

export type HomeDeeplinkPayload<
  TExample extends string = string,
  TSituation extends string = string,
  TTone extends string = string,
  TAgrees extends string = string,
> = {
  example?: TExample | null;
  message?: string | null;
  situation?: TSituation | null;
  tone?: TTone | null;
  agrees?: TAgrees | null;
};

type SearchParamReader = Pick<URLSearchParams, 'get'>;

export type ParseHomeDeeplinkOptions<
  TExample extends string,
  TSituation extends string,
  TTone extends string,
  TAgrees extends string,
> = {
  examples: readonly TExample[];
  situations: readonly TSituation[];
  tones: readonly TTone[];
  agrees: readonly TAgrees[];
};

export type ParsedHomeDeeplink<
  TExample extends string,
  TSituation extends string,
  TTone extends string,
  TAgrees extends string,
> = {
  prefill: HomeDeeplinkPayload<TExample, TSituation, TTone, TAgrees>;
  hasPrefill: boolean;
  hasEnoughStateToScroll: boolean;
  shouldFocusMessage: boolean;
};

function sanitizeMessageParam(value: string | null, maxLength: number) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function sanitizeTokenParam(value: string | null, maxLength: number) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function getValidOption<TOption extends string>(
  value: string | null,
  options: readonly TOption[],
  maxLength: number,
) {
  const normalized = sanitizeTokenParam(value, maxLength);

  if (!normalized) {
    return null;
  }

  return options.includes(normalized as TOption) ? (normalized as TOption) : null;
}

export function parseHomeDeeplinkParams<
  TExample extends string,
  TSituation extends string,
  TTone extends string,
  TAgrees extends string,
>(
  searchParams: SearchParamReader,
  options: ParseHomeDeeplinkOptions<TExample, TSituation, TTone, TAgrees>,
): ParsedHomeDeeplink<TExample, TSituation, TTone, TAgrees> {
  const example = getValidOption(
    searchParams.get(HOME_DEEPLINK_QUERY_KEYS.example),
    options.examples,
    HOME_DEEPLINK_LIMITS.example,
  );
  const message = sanitizeMessageParam(
    searchParams.get(HOME_DEEPLINK_QUERY_KEYS.message),
    HOME_DEEPLINK_LIMITS.message,
  );
  const situation = getValidOption(
    searchParams.get(HOME_DEEPLINK_QUERY_KEYS.situation),
    options.situations,
    HOME_DEEPLINK_LIMITS.situation,
  );
  const tone = getValidOption(
    searchParams.get(HOME_DEEPLINK_QUERY_KEYS.tone),
    options.tones,
    HOME_DEEPLINK_LIMITS.tone,
  );
  const agrees = getValidOption(
    searchParams.get(HOME_DEEPLINK_QUERY_KEYS.agrees),
    options.agrees,
    HOME_DEEPLINK_LIMITS.agrees,
  );

  const hasPrefill = Boolean(example || message || situation || tone || agrees);

  return {
    prefill: {
      example,
      message,
      situation,
      tone,
      agrees,
    },
    hasPrefill,
    hasEnoughStateToScroll: hasPrefill,
    shouldFocusMessage: Boolean(message || example),
  };
}

export function buildHomeDeeplink<
  TExample extends string = string,
  TSituation extends string = string,
  TTone extends string = string,
  TAgrees extends string = string,
>(
  payload: HomeDeeplinkPayload<TExample, TSituation, TTone, TAgrees>,
  options?: { basePath?: string },
) {
  const searchParams = new URLSearchParams();
  const basePath = options?.basePath ?? '/';
  const example = sanitizeTokenParam(payload.example ?? null, HOME_DEEPLINK_LIMITS.example);
  const message = sanitizeMessageParam(payload.message ?? null, HOME_DEEPLINK_LIMITS.message);
  const situation = sanitizeTokenParam(payload.situation ?? null, HOME_DEEPLINK_LIMITS.situation);
  const tone = sanitizeTokenParam(payload.tone ?? null, HOME_DEEPLINK_LIMITS.tone);
  const agrees = sanitizeTokenParam(payload.agrees ?? null, HOME_DEEPLINK_LIMITS.agrees);

  if (example) {
    searchParams.set(HOME_DEEPLINK_QUERY_KEYS.example, example);
  }

  if (message) {
    searchParams.set(HOME_DEEPLINK_QUERY_KEYS.message, message);
  }

  if (situation) {
    searchParams.set(HOME_DEEPLINK_QUERY_KEYS.situation, situation);
  }

  if (tone) {
    searchParams.set(HOME_DEEPLINK_QUERY_KEYS.tone, tone);
  }

  if (agrees) {
    searchParams.set(HOME_DEEPLINK_QUERY_KEYS.agrees, agrees);
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// Backward-compatible export for existing imports.
export const buildHomeDeepLink = buildHomeDeeplink;
