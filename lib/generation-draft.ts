import type { ContextOption, ToneOption } from './generator-options';
import type { ReplyContext } from './reply-context';
import type { ContinuePreference, Goal } from './reply-direction';

/** The input that produced a set of replies, excluding result-only refine actions. */
export type GenerationDraft = ReplyContext & {
  message: string;
  imageBase64: string | null;
  context?: ContextOption;
  tone: ToneOption;
  goal?: Goal;
  continuePreference?: ContinuePreference | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: 'minutes' | 'hours' | 'days';
  lastOutgoingMessage?: string;
  conversationId?: string;
};

const scalarFields = [
  'message', 'imageBase64', 'context', 'tone', 'goal', 'continuePreference',
  'conversationBackground', 'noReplyMode', 'noReplyDurationValue',
  'noReplyDurationUnit', 'lastOutgoingMessage', 'conversationId',
  'previousOutgoingMessage', 'commitmentMode', 'commitmentDetails',
] as const satisfies ReadonlyArray<keyof GenerationDraft>;

/** Compare grammatical choices by value so reopening/resetting an editor stays fresh. */
export function areGenerationDraftsEqual(left: GenerationDraft, right: GenerationDraft) {
  return scalarFields.every((field) => Object.is(left[field], right[field])) &&
    (left.languagePreferences?.speaker ?? 'neutral') === (right.languagePreferences?.speaker ?? 'neutral') &&
    (left.languagePreferences?.recipient ?? 'neutral') === (right.languagePreferences?.recipient ?? 'neutral');
}
