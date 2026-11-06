export type DirectionField = 'tone' | 'context' | 'goal' | 'language' | 'continue' | 'background';

export const INCOMING_GOAL_OPTIONS = [
  'להמשיך שיחה',
  'לקבוע זמן',
  'לבקש הבהרה',
  'להציב גבול',
  'לסגור בנימוס',
  'להתמקח / לקדם סגירה',
] as const;
export const NO_REPLY_GOAL_OPTIONS = ['תזכורת עדינה', 'בדיקת סטטוס', 'שחרור מכבד'] as const;
export const CONTINUE_PREFERENCE_OPTIONS = ['כן', 'לא'] as const;

export type IncomingGoal = (typeof INCOMING_GOAL_OPTIONS)[number];
export type NoReplyGoal = (typeof NO_REPLY_GOAL_OPTIONS)[number];
export type Goal = IncomingGoal | NoReplyGoal;
export type ContinuePreference = (typeof CONTINUE_PREFERENCE_OPTIONS)[number];
