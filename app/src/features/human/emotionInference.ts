import type { MascotFace } from './Mascot';

export type MascotEmotion =
  | 'neutral'
  | 'delighted'
  | 'proud'
  | 'concerned'
  | 'confused'
  | 'apologetic'
  | 'excited'
  | 'cautious';

export interface EmotionSignal {
  emotion: MascotEmotion;
  intensity: number; // 0-1
  source: string;
}

/**
 * How long (ms) to hold a face driven by each emotion before decaying to idle.
 * Tuned so lighter emotions feel like a soft beat and heavier ones linger.
 */
export const EMOTION_HOLD_MS: Record<MascotEmotion, number> = {
  neutral: 700,
  delighted: 900,
  proud: 1200,
  concerned: 900,
  confused: 800,
  apologetic: 700,
  excited: 1000,
  cautious: 600,
};

/**
 * How many characters of accumulated text to skip between successive scans.
 * Exported so tests can wire up the threshold without magic numbers.
 */
export const TEXT_SCAN_INTERVAL = 200;

const APOLOGY_PATTERNS = ['sorry', 'unfortunately', 'i apologize', "i can't", 'unable to'];
const EXCITEMENT_PATTERNS = ['great news', 'successfully', 'done!', 'congratulations', 'perfect'];
const CAUTION_PATTERNS = ['be careful', 'warning', 'note that', 'important:', 'caution'];

/**
 * Scans assistant text for emotional keywords/patterns.
 * Pure — no side effects, no state.
 */
export function inferEmotionFromAssistantText(text: string): EmotionSignal {
  const lower = text.toLowerCase();

  for (const pattern of APOLOGY_PATTERNS) {
    if (lower.includes(pattern)) {
      return { emotion: 'apologetic', intensity: 0.7, source: 'text:apology' };
    }
  }

  for (const pattern of EXCITEMENT_PATTERNS) {
    if (lower.includes(pattern)) {
      return { emotion: 'excited', intensity: 0.7, source: 'text:excitement' };
    }
  }

  for (const pattern of CAUTION_PATTERNS) {
    if (lower.includes(pattern)) {
      return { emotion: 'cautious', intensity: 0.6, source: 'text:caution' };
    }
  }

  return { emotion: 'neutral', intensity: 0, source: 'text:none' };
}

/**
 * Infers an emotion from an inference outcome (rounds used, tool failures).
 * Pure — no side effects, no state.
 */
export function inferEmotionFromOutcome(outcome: {
  rounds_used: number;
  hadToolFailures: boolean;
}): EmotionSignal {
  const { rounds_used, hadToolFailures } = outcome;

  if (hadToolFailures) {
    return { emotion: 'concerned', intensity: 0.6, source: 'outcome:tool_failures' };
  }
  if (rounds_used === 1) {
    return { emotion: 'delighted', intensity: 0.8, source: 'outcome:single_round' };
  }
  if (rounds_used > 1) {
    return { emotion: 'proud', intensity: 0.7, source: 'outcome:multi_round' };
  }

  return { emotion: 'neutral', intensity: 0, source: 'outcome:none' };
}

const POSITIVE_EMOJIS = new Set(['😊', '😄', '🎉', '✅', '👍', '🙌', '💪', '🎊']);
const NEGATIVE_EMOJIS = new Set(['😔', '😢', '❌', '⚠️', '😕']);

/**
 * Infers an emotion from a reaction emoji attached to a response.
 * Pure — no side effects, no state.
 */
export function inferEmotionFromReactionEmoji(emoji: string | null | undefined): EmotionSignal {
  if (!emoji) {
    return { emotion: 'neutral', intensity: 0, source: 'emoji:none' };
  }
  if (POSITIVE_EMOJIS.has(emoji)) {
    return { emotion: 'delighted', intensity: 0.9, source: 'emoji:positive' };
  }
  if (NEGATIVE_EMOJIS.has(emoji)) {
    return { emotion: 'concerned', intensity: 0.7, source: 'emoji:negative' };
  }
  return { emotion: 'neutral', intensity: 0, source: 'emoji:unrecognized' };
}

/**
 * Picks the dominant emotion from a set of signals.
 * Highest intensity non-neutral signal wins; ties break in favour of the
 * first signal in the array. If all signals are neutral, returns 'neutral'.
 *
 * Pure — no side effects, no state.
 */
export function resolveEmotion(signals: EmotionSignal[]): MascotEmotion {
  let best: EmotionSignal | null = null;
  for (const signal of signals) {
    if (signal.emotion === 'neutral') continue;
    if (best === null || signal.intensity > best.intensity) {
      best = signal;
    }
  }
  return best?.emotion ?? 'neutral';
}

/**
 * Maps a resolved emotion to the closest MascotFace, or null when the emotion
 * does not override the activity-driven face (i.e. neutral).
 *
 * Pure — no side effects, no state.
 */
export function emotionToFace(emotion: MascotEmotion): MascotFace | null {
  switch (emotion) {
    case 'neutral':
      return null;
    case 'delighted':
    case 'proud':
    case 'excited':
      return 'happy';
    case 'concerned':
    case 'apologetic':
      return 'concerned';
    case 'confused':
    case 'cautious':
      return 'confused';
  }
}
