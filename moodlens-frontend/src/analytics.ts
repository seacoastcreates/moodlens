// src/analytics.ts

export type EmotionScore = { label: string; score: number };

export type TimelineEntry = {
  timestamp: number;
  topLabel: string;
  scores: EmotionScore[];
  mode: 'text' | 'voice';
};

export type Recommendation = {
  headline: string;
  actions: string[];
  tone: 'uplift' | 'ground' | 'balance';
};

export type InsightBundle = {
  entriesAnalyzed: number;
  todayMood?: string;
  todaySummary?: string;
  trendMessage?: string;
  monthMessage?: string;
  lunarMessage?: string;
  headsUp?: string;
  alert?: string;
  distribution: { label: string; percent: number }[];
  recommendation?: Recommendation;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// -------- Lunar phase --------
// Reference new moon: Jan 6, 2000 18:14 UTC. Synodic month length is the
// average time between new moons. Together these let us estimate the phase
// for any date without a network call - accurate to within a few hours,
// which is plenty for a "does this correlate with mood" heuristic.
const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

export const LUNAR_PHASES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const;

export type LunarPhase = (typeof LUNAR_PHASES)[number];

export function getLunarPhase(timestamp: number): LunarPhase {
  const daysSinceNewMoon = (timestamp - KNOWN_NEW_MOON_MS) / DAY_MS;
  const cyclePosition =
    ((daysSinceNewMoon % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const fraction = cyclePosition / SYNODIC_MONTH_DAYS;
  const index = Math.floor(fraction * LUNAR_PHASES.length + 0.5) % LUNAR_PHASES.length;
  return LUNAR_PHASES[index];
}

const POSITIVE_LABELS = new Set([
  'admiration',
  'amusement',
  'approval',
  'caring',
  'contentment',
  'excitement',
  'gratitude',
  'joy',
  'love',
  'optimism',
  'pride',
  'relief',
  'surprise',
]);

const NEGATIVE_LABELS = new Set([
  'anger',
  'annoyance',
  'anxiety',
  'disappointment',
  'disgust',
  'embarrassment',
  'fear',
  'frustration',
  'guilt',
  'grief',
  'nervousness',
  'pessimism',
  'remorse',
  'sadness',
  'stress',
  'tiredness',
]);

const RECOMMENDATION_MAP: Record<string, Recommendation> = {
  joy: {
    headline: 'Celebrate the highs',
    actions: [
      'Capture what made today joyful in a quick note.',
      'Share the moment with someone you care about.',
      'Schedule similar activities for the week to reinforce the momentum.',
    ],
    tone: 'uplift',
  },
  gratitude: {
    headline: 'Let gratitude ripple outward',
    actions: [
      'Write a thank-you message to someone who helped you recently.',
      'List three things you appreciated today.',
      'Plan a small act of kindness for tomorrow.',
    ],
    tone: 'uplift',
  },
  love: {
    headline: 'Lean into connection',
    actions: [
      'Reach out to a friend or loved one for a quick check-in.',
      'Plan a shared activity that energizes you both.',
      'Preserve the feeling with a short journal entry you can revisit later.',
    ],
    tone: 'uplift',
  },
  pride: {
    headline: 'Anchor this win',
    actions: [
      'Document what went well and why—it becomes a playbook for next time.',
      'Reward yourself with a mindful break or treat.',
      'Share the accomplishment with your support circle.',
    ],
    tone: 'uplift',
  },
  sadness: {
    headline: 'Create space for comfort',
    actions: [
      'Try a grounding exercise: slow inhale for 4 counts, exhale for 6 counts (5 rounds).',
      'Queue a calming playlist or guided meditation.',
      'Message someone you trust—naming the feeling can reduce its weight.',
    ],
    tone: 'ground',
  },
  stress: {
    headline: 'Ease the tension',
    actions: [
      'Step away for a 5-minute stretch or short walk.',
      'Block 15 minutes tomorrow to plan priorities—clarity lowers stress.',
      'Listen to a breathing or mini-meditation session before bed.',
    ],
    tone: 'ground',
  },
  anger: {
    headline: 'Channel the heat',
    actions: [
      'Try an active release: brisk walk, shadow boxing, or journaling “unsent letters.”',
      'Label the trigger and decide one constructive next step.',
      'Cool down with a playlist or podcast that shifts the mood.',
    ],
    tone: 'ground',
  },
  fear: {
    headline: 'Find steadiness',
    actions: [
      'List the worries, then note one small action for each.',
      'Use a body scan audio track to reset tension.',
      'Text a friend your concern—sharing often lowers fear’s volume.',
    ],
    tone: 'ground',
  },
  anxiety: {
    headline: 'Re-center gently',
    actions: [
      'Try a 4-4-4 box breath pattern for 2 minutes.',
      'Break big tasks into a “next tiny step” checklist.',
      'Play an ambient or nature soundtrack while you reset.',
    ],
    tone: 'ground',
  },
  neutral: {
    headline: 'Nudge the narrative',
    actions: [
      'Set a micro-intention for the next hour (“I’ll focus on one meaningful task”).',
      'Queue a playlist that usually lifts your energy.',
      'Capture one detail you’re curious about today.',
    ],
    tone: 'balance',
  },
  curiosity: {
    headline: 'Feed the curiosity',
    actions: [
      'Follow the question—research or journal what sparked your interest.',
      'Schedule time this week to explore it deeper.',
      'Share the curiosity with a friend for a fresh perspective.',
    ],
    tone: 'balance',
  },
};

const DEFAULT_RECOMMENDATIONS: Record<'positive' | 'negative' | 'neutral', Recommendation> = {
  positive: {
    headline: 'Lock in the uplift',
    actions: [
      'Note one highlight and what enabled it.',
      'Plan a simple repeat of whatever supported the mood.',
      'Send a quick gratitude message to keep the momentum going.',
    ],
    tone: 'uplift',
  },
  negative: {
    headline: 'Support your baseline',
    actions: [
      'Try a guided meditation or calming playlist.',
      'Move your body gently—stretching or a slow walk works.',
      'Reach out to a friend or jot down what you need most right now.',
    ],
    tone: 'ground',
  },
  neutral: {
    headline: 'Take a micro reset',
    actions: [
      'Do a 5-minute reflection on what could make today meaningful.',
      'Queue music that matches the direction you want the day to go.',
      'Plan one small treat for yourself in the next 24 hours.',
    ],
    tone: 'balance',
  },
};

export function getRecommendationsForEmotion(label: string | undefined): Recommendation | undefined {
  if (!label) return undefined;
  const key = label.toLowerCase();
  if (RECOMMENDATION_MAP[key]) return RECOMMENDATION_MAP[key];
  if (POSITIVE_LABELS.has(key)) return DEFAULT_RECOMMENDATIONS.positive;
  if (NEGATIVE_LABELS.has(key)) return DEFAULT_RECOMMENDATIONS.negative;
  return DEFAULT_RECOMMENDATIONS.neutral;
}

function isPositive(label: string) {
  return POSITIVE_LABELS.has(label.toLowerCase());
}

function isNegative(label: string) {
  return NEGATIVE_LABELS.has(label.toLowerCase());
}

function dominantLabel(labels: string[]): string | undefined {
  if (!labels.length) return undefined;
  const counts = labels.reduce<Record<string, number>>((acc, lab) => {
    acc[lab] = (acc[lab] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lab]) => lab)[0];
}

export function computeInsights(entries: TimelineEntry[]): InsightBundle {
  if (!entries.length) {
    return {
      entriesAnalyzed: 0,
      distribution: [],
    };
  }

  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const todayKey = new Date().toISOString().slice(0, 10);
  const byDay = new Map<string, TimelineEntry[]>();

  for (const entry of sorted) {
    if (!entry.timestamp || !entry.topLabel) continue;
    const key = new Date(entry.timestamp).toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(entry);
  }

  const todayEntries = byDay.get(todayKey) ?? [];
  const todayDominant = dominantLabel(todayEntries.map((e) => e.topLabel));

  const todaySummary = todayDominant
    ? formatTodaySummary(todayDominant, todayEntries)
    : todayEntries.length
    ? 'Mood mix recorded today—keep logging to clarify the pattern.'
    : undefined;

  const counts = sorted.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.topLabel;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const distribution = Object.entries(counts)
    .map(([label, count]) => ({ label, percent: Math.round((count / sorted.length) * 100) }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 5);

  const trendMessage = buildTrendMessage(sorted);
  const monthMessage = buildMonthMessage(sorted);
  const lunarMessage = buildLunarMessage(sorted);
  const headsUp = buildHeadsUpMessage(sorted);
  const alert = buildAlert(sorted);

  const latestLabel = sorted[0]?.topLabel;
  const recommendation = getRecommendationsForEmotion(latestLabel ?? todayDominant);

  return {
    entriesAnalyzed: sorted.length,
    todayMood: todayDominant,
    todaySummary,
    trendMessage,
    monthMessage,
    lunarMessage,
    headsUp,
    alert,
    distribution,
    recommendation,
  };
}

function formatTodaySummary(label: string, entries: TimelineEntry[]): string {
  const confidences: number[] = [];
  for (const entry of entries) {
    const score = entry.scores?.find((s) => s.label === entry.topLabel)?.score ?? entry.scores?.[0]?.score;
    if (typeof score === 'number') confidences.push(score);
  }
  const avgConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
    : undefined;
  return avgConfidence
    ? `Today is leaning toward ${label} (avg confidence ${avgConfidence}%).`
    : `Today is leaning toward ${label}.`;
}

type BucketStats = { neg: number; pos: number; total: number };

function computeBucketStats<T>(
  entries: TimelineEntry[],
  bucketOf: (entry: TimelineEntry) => T
): Map<T, BucketStats> {
  const stats = new Map<T, BucketStats>();
  for (const entry of entries) {
    const key = bucketOf(entry);
    if (!stats.has(key)) stats.set(key, { neg: 0, pos: 0, total: 0 });
    const bucket = stats.get(key)!;
    bucket.total += 1;
    if (isNegative(entry.topLabel)) bucket.neg += 1;
    else if (isPositive(entry.topLabel)) bucket.pos += 1;
  }
  return stats;
}

// Generic "does one bucket of entries skew positive/negative" detector, shared
// by the day-of-week, month, and lunar-phase trend messages below. Buckets
// under minSamples are ignored so a single loud entry can't drive a claim.
function strongestBucketSignal<T>(
  entries: TimelineEntry[],
  bucketOf: (entry: TimelineEntry) => T,
  minSamples = 2,
  ratioThreshold = 0.55
): { key: T; ratio: number; kind: 'positive' | 'negative' } | undefined {
  const stats = computeBucketStats(entries, bucketOf);

  let highestNeg: { key: T; ratio: number } | undefined;
  let highestPos: { key: T; ratio: number } | undefined;

  for (const [key, bucket] of stats.entries()) {
    if (bucket.total < minSamples) continue;
    const negRatio = bucket.neg / bucket.total;
    const posRatio = bucket.pos / bucket.total;
    if (!highestNeg || negRatio > highestNeg.ratio) highestNeg = { key, ratio: negRatio };
    if (!highestPos || posRatio > highestPos.ratio) highestPos = { key, ratio: posRatio };
  }

  if (highestNeg && highestNeg.ratio >= ratioThreshold) {
    return { key: highestNeg.key, ratio: highestNeg.ratio, kind: 'negative' };
  }
  if (highestPos && highestPos.ratio >= ratioThreshold) {
    return { key: highestPos.key, ratio: highestPos.ratio, kind: 'positive' };
  }
  return undefined;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildTrendMessage(entries: TimelineEntry[]): string | undefined {
  const windowed = entries.filter((entry) => Date.now() - entry.timestamp <= 14 * DAY_MS);
  if (windowed.length < 4) {
    return 'Log a few more days to unlock weekly trend insights.';
  }

  const signal = strongestBucketSignal(windowed, (e) => new Date(e.timestamp).getDay());

  if (signal?.kind === 'negative') {
    return `${DAY_NAMES[signal.key]}s have skewed toward heavier emotions—consider scheduling a lighter task or a break to soften the start.`;
  }
  if (signal?.kind === 'positive') {
    return `${DAY_NAMES[signal.key]}s consistently bring brighter moods—try bookmarking energizing activities there.`;
  }
  return 'Your mood has been fairly balanced across the week—keep noting what sustains that balance.';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Needs entries spread across multiple calendar months (any year) before it
// says anything - most new users won't see this for a while, which is fine.
function buildMonthMessage(entries: TimelineEntry[]): string | undefined {
  const signal = strongestBucketSignal(entries, (e) => new Date(e.timestamp).getMonth(), 3);
  if (signal?.kind === 'negative') {
    return `${MONTH_NAMES[signal.key]} has historically run heavier for you—worth planning extra support around that time of year.`;
  }
  if (signal?.kind === 'positive') {
    return `${MONTH_NAMES[signal.key]} has historically been a brighter month for you.`;
  }
  return undefined;
}

// There's no scientific evidence linking lunar phase to mood - this is an
// exploratory/fun lens, not a validated claim, so the copy says so.
function buildLunarMessage(entries: TimelineEntry[]): string | undefined {
  const signal = strongestBucketSignal(entries, (e) => getLunarPhase(e.timestamp));
  if (signal?.kind === 'negative') {
    return `Entries during the ${signal.key} have leaned heavier for you. There's no scientific link between lunar phase and mood, but if the pattern holds it might be worth watching.`;
  }
  if (signal?.kind === 'positive') {
    return `Entries during the ${signal.key} have leaned brighter for you. There's no scientific link between lunar phase and mood, but if the pattern holds it might be worth watching.`;
  }
  return undefined;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

// Phase-2 "predictive" feature: rather than forecasting a specific emotion (which
// would need far more data than one person generates in months, or pooling data
// across users - which breaks the privacy-first promise), this checks whether
// *today's* calendar buckets (weekday/month/lunar phase) individually match a
// pattern that has historically skewed negative in the user's own history. It's
// a nudge grounded in their own past entries, not a validated forecast, and the
// copy says so. Gated behind a much higher entry count than the individual
// trend messages so it doesn't speak with false confidence off thin data.
const MIN_ENTRIES_FOR_HEADS_UP = 30;

function buildHeadsUpMessage(entries: TimelineEntry[]): string | undefined {
  if (entries.length < MIN_ENTRIES_FOR_HEADS_UP) return undefined;

  const now = Date.now();
  const todayDay = new Date(now).getDay();
  const todayMonth = new Date(now).getMonth();
  const todayLunar = getLunarPhase(now);

  const dayBucket = computeBucketStats(entries, (e) => new Date(e.timestamp).getDay()).get(todayDay);
  const monthBucket = computeBucketStats(entries, (e) => new Date(e.timestamp).getMonth()).get(todayMonth);
  const lunarBucket = computeBucketStats(entries, (e) => getLunarPhase(e.timestamp)).get(todayLunar);

  const isHeavy = (bucket: BucketStats | undefined, minSamples: number) =>
    !!bucket && bucket.total >= minSamples && bucket.neg / bucket.total >= 0.55;

  const clauses: string[] = [];
  if (isHeavy(dayBucket, 2)) clauses.push(`it's a ${DAY_NAMES[todayDay]}`);
  if (isHeavy(monthBucket, 3)) clauses.push(`it's ${MONTH_NAMES[todayMonth]}`);
  if (isHeavy(lunarBucket, 2)) clauses.push(`the moon is in its ${todayLunar} phase`);

  if (!clauses.length) return undefined;

  const subject = clauses.length === 1 ? 'that condition has' : 'those conditions have';
  return `Heads up: ${joinWithAnd(clauses)} — ${subject} historically leaned heavier for you. This is a pattern in your own data, not a guarantee, so take it as a nudge rather than a forecast.`;
}

function buildAlert(entries: TimelineEntry[]): string | undefined {
  if (entries.length < 3) return undefined;
  const recent = entries.slice(0, 3);
  if (recent.every((e) => isNegative(e.topLabel))) {
    const dominant = dominantLabel(recent.map((e) => e.topLabel));
    return dominant
      ? `We’ve spotted ${dominant} for three entries in a row. Reach out to someone you trust or try a reset ritual that has helped in the past.`
      : 'Recent entries lean heavy—consider connecting with support or revisiting a coping strategy that works for you.';
  }

  const fiveWindow = entries.slice(0, 5);
  const counts = fiveWindow.reduce<Record<string, number>>((acc, e) => {
    const label = e.topLabel;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const [label, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (label && count >= 4 && isNegative(label)) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} has come up often in your recent entries. It might be a good time for a deeper reset, or to talk it through with someone you trust.`;
  }

  if (entries.length >= 7) {
    const first = entries[entries.length - 1];
    const last = entries[0];
    const spanDays = Math.max(
      1,
      Math.abs(
        Math.round(
          (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / DAY_MS
        )
      )
    );
    if (spanDays >= 6) {
      const negativeCount = entries.filter((e) => isNegative(e.topLabel)).length;
      if (negativeCount / entries.length >= 0.6) {
        return 'Most entries this week trended heavy. Consider scheduling restorative time or talking with someone you trust.';
      }
    }
  }

  return undefined;
}
