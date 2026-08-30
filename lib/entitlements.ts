export type GenerationEntitlement =
  | "unlimited"
  | "credits"
  | "initial_free"
  | "daily_free"
  | "blocked";

export function selectGenerationEntitlement(input: {
  hasUnlimited: boolean;
  credits: number;
  freeUsed: number;
  freeLimit: number;
  dailyUsed: number;
  dailyLimit: number;
}): GenerationEntitlement {
  if (input.hasUnlimited) return "unlimited";
  if (input.credits > 0) return "credits";
  if (input.freeUsed < input.freeLimit) return "initial_free";
  if (input.dailyUsed < input.dailyLimit) return "daily_free";
  return "blocked";
}
