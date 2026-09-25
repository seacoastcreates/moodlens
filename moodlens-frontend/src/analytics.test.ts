import {
  computeInsights,
  getLunarPhase,
  getRecommendationsForEmotion,
  TimelineEntry,
} from './analytics';

const DAY_MS = 24 * 60 * 60 * 1000;

function entry(
  daysAgo: number,
  topLabel: string,
  mode: TimelineEntry['mode'] = 'text',
  score = 0.8
): TimelineEntry {
  return {
    timestamp: Date.now() - daysAgo * DAY_MS,
    topLabel,
    scores: [{ label: topLabel, score }],
    mode,
  };
}

describe('getRecommendationsForEmotion', () => {
  it('returns undefined for no label', () => {
    expect(getRecommendationsForEmotion(undefined)).toBeUndefined();
  });

  it('returns the exact-match recommendation when the label is mapped', () => {
    const reco = getRecommendationsForEmotion('joy');
    expect(reco?.headline).toBe('Celebrate the highs');
    expect(reco?.tone).toBe('uplift');
  });

  it('is case-insensitive', () => {
    expect(getRecommendationsForEmotion('JOY')).toEqual(getRecommendationsForEmotion('joy'));
  });

  it('falls back to the positive default for an unmapped positive label', () => {
    expect(getRecommendationsForEmotion('excitement')?.headline).toBe('Lock in the uplift');
  });

  it('falls back to the negative default for an unmapped negative label', () => {
    expect(getRecommendationsForEmotion('grief')?.headline).toBe('Support your baseline');
  });

  it('falls back to the neutral default for an unrecognized label', () => {
    expect(getRecommendationsForEmotion('confusion')?.headline).toBe('Take a micro reset');
  });
});

describe('computeInsights', () => {
  it('returns an empty bundle for no entries', () => {
    const bundle = computeInsights([]);
    expect(bundle.entriesAnalyzed).toBe(0);
    expect(bundle.distribution).toEqual([]);
    expect(bundle.todaySummary).toBeUndefined();
  });

  it('summarizes today\'s dominant mood', () => {
    const bundle = computeInsights([entry(0, 'joy'), entry(0, 'joy'), entry(0, 'sadness')]);
    expect(bundle.entriesAnalyzed).toBe(3);
    expect(bundle.todayMood).toBe('joy');
    expect(bundle.todaySummary).toContain('joy');
  });

  it('builds a distribution that sums to 100%', () => {
    const bundle = computeInsights([
      entry(0, 'joy'),
      entry(1, 'joy'),
      entry(2, 'sadness'),
      entry(3, 'sadness'),
    ]);
    const total = bundle.distribution.reduce((sum, d) => sum + d.percent, 0);
    expect(total).toBe(100);
  });

  it('raises a predictive alert after three consecutive negative entries', () => {
    const bundle = computeInsights([entry(0, 'sadness'), entry(1, 'sadness'), entry(2, 'sadness')]);
    expect(bundle.alert).toMatch(/sadness/i);
  });

  it('does not raise an alert when recent entries are mixed', () => {
    const bundle = computeInsights([entry(0, 'joy'), entry(1, 'sadness'), entry(2, 'joy')]);
    expect(bundle.alert).toBeUndefined();
  });

  it('asks for more entries before offering a weekly trend with under 4 in the window', () => {
    const bundle = computeInsights([entry(0, 'joy'), entry(1, 'joy')]);
    expect(bundle.trendMessage).toMatch(/log a few more days/i);
  });

  it('attaches a recommendation based on the most recent entry', () => {
    const bundle = computeInsights([entry(0, 'anger'), entry(1, 'joy')]);
    expect(bundle.recommendation?.headline).toBe(getRecommendationsForEmotion('anger')?.headline);
  });

  it('does not surface a month message without enough spread across months', () => {
    const bundle = computeInsights([entry(0, 'sadness'), entry(1, 'sadness')]);
    expect(bundle.monthMessage).toBeUndefined();
  });

  it('does not surface a lunar message without enough entries in any phase', () => {
    const bundle = computeInsights([entry(0, 'sadness')]);
    expect(bundle.lunarMessage).toBeUndefined();
  });

  it('surfaces a heads-up when today\'s weekday skews negative and there are enough total entries', () => {
    const entries: TimelineEntry[] = [
      // Same weekday as "today" (exact multiples of 7 days ago), all heavy.
      entry(0, 'sadness'),
      entry(7, 'sadness'),
      entry(14, 'sadness'),
    ];
    // Filler on other days to clear the 30-entry minimum without erasing the signal.
    // Skip 7 and 14 - those daysAgo are already used above for the negative signal.
    for (let i = 1; i <= 29; i++) {
      if (i === 7 || i === 14) continue;
      entries.push(entry(i, 'joy'));
    }
    const bundle = computeInsights(entries);
    expect(bundle.entriesAnalyzed).toBe(30);
    expect(bundle.headsUp).toMatch(/heads up/i);
  });

  it('does not surface a heads-up below the minimum entry count, even if today looks heavy', () => {
    const bundle = computeInsights([entry(0, 'sadness'), entry(7, 'sadness'), entry(14, 'sadness')]);
    expect(bundle.headsUp).toBeUndefined();
  });
});

describe('getLunarPhase', () => {
  it('identifies a known full moon (Jan 6, 2023 23:08 UTC)', () => {
    expect(getLunarPhase(Date.UTC(2023, 0, 6, 23, 8, 0))).toBe('Full Moon');
  });

  it('identifies a known new moon (Jan 21, 2023 20:53 UTC)', () => {
    expect(getLunarPhase(Date.UTC(2023, 0, 21, 20, 53, 0))).toBe('New Moon');
  });

  it('is periodic across a full synodic month', () => {
    const start = Date.UTC(2023, 0, 6, 23, 8, 0);
    const oneCycleLater = start + 29.530588853 * DAY_MS;
    expect(getLunarPhase(oneCycleLater)).toBe(getLunarPhase(start));
  });
});
