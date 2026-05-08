import { describe, expect, it } from 'vitest';

import {
  emotionToFace,
  inferEmotionFromAssistantText,
  inferEmotionFromOutcome,
  inferEmotionFromReactionEmoji,
  resolveEmotion,
} from './emotionInference';

// ---------------------------------------------------------------------------
// inferEmotionFromAssistantText
// ---------------------------------------------------------------------------

describe('inferEmotionFromAssistantText', () => {
  it('detects "sorry" as apologetic', () => {
    const signal = inferEmotionFromAssistantText("I'm sorry, I couldn't complete that.");
    expect(signal.emotion).toBe('apologetic');
    expect(signal.intensity).toBeGreaterThan(0);
  });

  it('detects "unfortunately" as apologetic', () => {
    const signal = inferEmotionFromAssistantText('Unfortunately, the request failed.');
    expect(signal.emotion).toBe('apologetic');
  });

  it('detects "i apologize" as apologetic', () => {
    const signal = inferEmotionFromAssistantText('I apologize for the confusion.');
    expect(signal.emotion).toBe('apologetic');
  });

  it('detects "i can\'t" as apologetic', () => {
    const signal = inferEmotionFromAssistantText("I can't do that right now.");
    expect(signal.emotion).toBe('apologetic');
  });

  it('detects "unable to" as apologetic', () => {
    const signal = inferEmotionFromAssistantText('I am unable to process that.');
    expect(signal.emotion).toBe('apologetic');
  });

  it('detects "great news" as excited', () => {
    const signal = inferEmotionFromAssistantText('Great news! The task completed.');
    expect(signal.emotion).toBe('excited');
    expect(signal.intensity).toBeGreaterThan(0);
  });

  it('detects "successfully" as excited', () => {
    const signal = inferEmotionFromAssistantText('The file was successfully created.');
    expect(signal.emotion).toBe('excited');
  });

  it('detects "done!" as excited', () => {
    const signal = inferEmotionFromAssistantText('Done! Everything is set up.');
    expect(signal.emotion).toBe('excited');
  });

  it('detects "congratulations" as excited', () => {
    const signal = inferEmotionFromAssistantText('Congratulations on your achievement!');
    expect(signal.emotion).toBe('excited');
  });

  it('detects "perfect" as excited', () => {
    const signal = inferEmotionFromAssistantText('That is perfect, exactly what was needed.');
    expect(signal.emotion).toBe('excited');
  });

  it('detects "be careful" as cautious', () => {
    const signal = inferEmotionFromAssistantText('Be careful when running this command.');
    expect(signal.emotion).toBe('cautious');
    expect(signal.intensity).toBeGreaterThan(0);
  });

  it('detects "warning" as cautious', () => {
    const signal = inferEmotionFromAssistantText('Warning: this operation is irreversible.');
    expect(signal.emotion).toBe('cautious');
  });

  it('detects "note that" as cautious', () => {
    const signal = inferEmotionFromAssistantText('Note that this may take a while.');
    expect(signal.emotion).toBe('cautious');
  });

  it('detects "important:" as cautious', () => {
    const signal = inferEmotionFromAssistantText('Important: back up your data first.');
    expect(signal.emotion).toBe('cautious');
  });

  it('detects "caution" as cautious', () => {
    const signal = inferEmotionFromAssistantText('Caution should be taken here.');
    expect(signal.emotion).toBe('cautious');
  });

  it('returns neutral for generic text', () => {
    const signal = inferEmotionFromAssistantText('Here is the result of your query.');
    expect(signal.emotion).toBe('neutral');
    expect(signal.intensity).toBe(0);
  });

  it('returns neutral for empty string', () => {
    const signal = inferEmotionFromAssistantText('');
    expect(signal.emotion).toBe('neutral');
  });

  it('is case-insensitive', () => {
    expect(inferEmotionFromAssistantText('SORRY about that.').emotion).toBe('apologetic');
    expect(inferEmotionFromAssistantText('GREAT NEWS everyone!').emotion).toBe('excited');
    expect(inferEmotionFromAssistantText('WARNING: check this.').emotion).toBe('cautious');
  });

  it('prioritises apology patterns over later patterns in the same text', () => {
    // "sorry" appears before "done!" — apology wins
    const signal = inferEmotionFromAssistantText("Sorry, but it's done!");
    expect(signal.emotion).toBe('apologetic');
  });
});

// ---------------------------------------------------------------------------
// inferEmotionFromOutcome
// ---------------------------------------------------------------------------

describe('inferEmotionFromOutcome', () => {
  it('returns delighted for single-round success', () => {
    const signal = inferEmotionFromOutcome({ rounds_used: 1, hadToolFailures: false });
    expect(signal.emotion).toBe('delighted');
    expect(signal.intensity).toBe(0.8);
  });

  it('returns proud for multi-round success', () => {
    const signal = inferEmotionFromOutcome({ rounds_used: 3, hadToolFailures: false });
    expect(signal.emotion).toBe('proud');
    expect(signal.intensity).toBe(0.7);
  });

  it('returns concerned when there were tool failures', () => {
    const signal = inferEmotionFromOutcome({ rounds_used: 1, hadToolFailures: true });
    expect(signal.emotion).toBe('concerned');
    expect(signal.intensity).toBe(0.6);
  });

  it('tool failures override multi-round optimism', () => {
    const signal = inferEmotionFromOutcome({ rounds_used: 5, hadToolFailures: true });
    expect(signal.emotion).toBe('concerned');
  });

  it('returns neutral for zero rounds (edge case)', () => {
    const signal = inferEmotionFromOutcome({ rounds_used: 0, hadToolFailures: false });
    expect(signal.emotion).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// inferEmotionFromReactionEmoji
// ---------------------------------------------------------------------------

describe('inferEmotionFromReactionEmoji', () => {
  it('returns delighted for positive emoji 😊', () => {
    const signal = inferEmotionFromReactionEmoji('😊');
    expect(signal.emotion).toBe('delighted');
    expect(signal.intensity).toBe(0.9);
  });

  it('returns delighted for positive emoji 🎉', () => {
    expect(inferEmotionFromReactionEmoji('🎉').emotion).toBe('delighted');
  });

  it('returns delighted for positive emoji ✅', () => {
    expect(inferEmotionFromReactionEmoji('✅').emotion).toBe('delighted');
  });

  it('returns delighted for positive emoji 👍', () => {
    expect(inferEmotionFromReactionEmoji('👍').emotion).toBe('delighted');
  });

  it('returns delighted for positive emoji 🙌', () => {
    expect(inferEmotionFromReactionEmoji('🙌').emotion).toBe('delighted');
  });

  it('returns concerned for negative emoji 😔', () => {
    const signal = inferEmotionFromReactionEmoji('😔');
    expect(signal.emotion).toBe('concerned');
    expect(signal.intensity).toBe(0.7);
  });

  it('returns concerned for negative emoji ❌', () => {
    expect(inferEmotionFromReactionEmoji('❌').emotion).toBe('concerned');
  });

  it('returns concerned for negative emoji ⚠️', () => {
    expect(inferEmotionFromReactionEmoji('⚠️').emotion).toBe('concerned');
  });

  it('returns neutral for null', () => {
    expect(inferEmotionFromReactionEmoji(null).emotion).toBe('neutral');
  });

  it('returns neutral for undefined', () => {
    expect(inferEmotionFromReactionEmoji(undefined).emotion).toBe('neutral');
  });

  it('returns neutral for unrecognized emoji', () => {
    expect(inferEmotionFromReactionEmoji('🐶').emotion).toBe('neutral');
  });

  it('returns neutral for empty string', () => {
    expect(inferEmotionFromReactionEmoji('').emotion).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// resolveEmotion
// ---------------------------------------------------------------------------

describe('resolveEmotion', () => {
  it('picks the highest intensity non-neutral signal', () => {
    const result = resolveEmotion([
      { emotion: 'cautious', intensity: 0.6, source: 'a' },
      { emotion: 'delighted', intensity: 0.9, source: 'b' },
      { emotion: 'proud', intensity: 0.7, source: 'c' },
    ]);
    expect(result).toBe('delighted');
  });

  it('returns neutral when all signals are neutral', () => {
    const result = resolveEmotion([
      { emotion: 'neutral', intensity: 0, source: 'a' },
      { emotion: 'neutral', intensity: 0, source: 'b' },
    ]);
    expect(result).toBe('neutral');
  });

  it('returns neutral for an empty array', () => {
    expect(resolveEmotion([])).toBe('neutral');
  });

  it('breaks ties by returning the first matching signal', () => {
    const result = resolveEmotion([
      { emotion: 'excited', intensity: 0.7, source: 'first' },
      { emotion: 'proud', intensity: 0.7, source: 'second' },
    ]);
    // excited comes first and shares the top intensity — it should win
    expect(result).toBe('excited');
  });

  it('ignores neutral signals even when they appear between non-neutral ones', () => {
    const result = resolveEmotion([
      { emotion: 'neutral', intensity: 0, source: 'a' },
      { emotion: 'apologetic', intensity: 0.7, source: 'b' },
      { emotion: 'neutral', intensity: 0, source: 'c' },
    ]);
    expect(result).toBe('apologetic');
  });

  it('handles a single non-neutral signal', () => {
    expect(resolveEmotion([{ emotion: 'confused', intensity: 0.5, source: 'x' }])).toBe('confused');
  });
});

// ---------------------------------------------------------------------------
// emotionToFace
// ---------------------------------------------------------------------------

describe('emotionToFace', () => {
  it('maps neutral to null (no override)', () => {
    expect(emotionToFace('neutral')).toBeNull();
  });

  it('maps delighted to happy', () => {
    expect(emotionToFace('delighted')).toBe('happy');
  });

  it('maps proud to happy', () => {
    expect(emotionToFace('proud')).toBe('happy');
  });

  it('maps excited to happy', () => {
    expect(emotionToFace('excited')).toBe('happy');
  });

  it('maps concerned to concerned', () => {
    expect(emotionToFace('concerned')).toBe('concerned');
  });

  it('maps apologetic to concerned', () => {
    expect(emotionToFace('apologetic')).toBe('concerned');
  });

  it('maps confused to confused', () => {
    expect(emotionToFace('confused')).toBe('confused');
  });

  it('maps cautious to confused', () => {
    expect(emotionToFace('cautious')).toBe('confused');
  });
});
