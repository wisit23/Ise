const { badRequest } = require("@reloop/shared");
const repository = require("./interestAudienceRepository");
const authClient = require("./authAudienceClient");
const orderClient = require("./orderAudienceClient");
const { recencyWeight } = require("../recommendations/behaviorRepository");
const {
  INTEREST_SCORE_BANDS,
  INTEREST_SCORE_MAX,
  normalizeInterestCriteria,
  scoreInterest,
  maximumScoreFor,
  bandForScore,
} = require("./interestScore");

const DAY_MS = 86400000;
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 180;

function parseDate(value, fallback, label) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${label} ไม่ถูกต้อง`);
  return date;
}

function parseRange(input = {}, now = new Date()) {
  const to = parseDate(input.to, now, "วันเวลาสิ้นสุด");
  const from = parseDate(
    input.from,
    new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * DAY_MS),
    "วันเวลาเริ่มต้น",
  );
  if (from >= to) throw badRequest("วันเวลาเริ่มต้นต้องอยู่ก่อนวันเวลาสิ้นสุด");
  if (to.getTime() - from.getTime() > MAX_LOOKBACK_DAYS * DAY_MS) {
    throw badRequest(`ช่วงข้อมูลต้องไม่เกิน ${MAX_LOOKBACK_DAYS} วัน`);
  }
  return { from, to };
}

function parseScoreRange(input, maximum) {
  const minScore = input.minScore === undefined ? 1 : Number(input.minScore);
  const maxScore =
    input.maxScore === undefined ? maximum : Number(input.maxScore);
  if (
    !Number.isFinite(minScore) ||
    !Number.isFinite(maxScore) ||
    !Number.isInteger(minScore) ||
    !Number.isInteger(maxScore) ||
    minScore < 0 ||
    maxScore > INTEREST_SCORE_MAX ||
    minScore > maxScore
  ) {
    throw badRequest("ช่วงคะแนนไม่ถูกต้อง");
  }
  return { minScore, maxScore };
}

function normalizeAudienceCriteria(input = {}, now = new Date()) {
  let target;
  try {
    target = normalizeInterestCriteria(input);
  } catch (error) {
    throw badRequest(error.message);
  }
  const maximum = maximumScoreFor(target);
  const range = parseRange(input, now);
  return {
    ...target,
    ...parseScoreRange(input, maximum),
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
}

function groupByUser(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const values = grouped.get(row.userId) || [];
    values.push(row);
    grouped.set(row.userId, values);
  }
  return grouped;
}

async function loadDataset({ from, to }, dependencies = {}) {
  const audienceRepository = dependencies.repository || repository;
  const audienceAuthClient = dependencies.authClient || authClient;
  const audienceOrderClient = dependencies.orderClient || orderClient;
  const [profiles, searches, likes, purchases] = await Promise.all([
    audienceAuthClient.listBuyerProfiles(),
    audienceRepository.listSearchSignals({ from, to }),
    audienceRepository.listLikeSignals({ from, to }),
    audienceOrderClient.listPurchases({ from, to }),
  ]);
  const purchaseSignals = await audienceRepository.hydratePurchaseSignals(
    purchases,
  );
  const searchesByUser = groupByUser(searches);
  const likesByUser = groupByUser(likes);
  const purchasesByUser = groupByUser(purchaseSignals);
  const referenceTime = to.getTime();
  return profiles.map(({ userId, profile }) => ({
    userId,
    profile,
    behavior: {
      searches: (searchesByUser.get(userId) || []).map((row) => ({
        query: row.query,
        weight: recencyWeight(row.searchedAt, 6, referenceTime),
        occurredAt: row.searchedAt,
      })),
      likes: (likesByUser.get(userId) || []).map((row) => ({
        profile: row.profile,
        weight: recencyWeight(row.occurredAt, 8, referenceTime),
        occurredAt: row.occurredAt,
      })),
      purchases: (purchasesByUser.get(userId) || []).map((row) => ({
        profile: row.profile,
        weight: recencyWeight(row.occurredAt, 10, referenceTime),
        occurredAt: row.occurredAt,
      })),
    },
  }));
}

function hasSignalForDimension(entry, dimension, criteria) {
  return scoreInterest({
    profile: entry.profile,
    behavior: entry.behavior,
    criteria: { [dimension]: criteria[dimension] },
  }).score > 0;
}

function matchesAllInterestCriteria(entry, criteriaInput) {
  const criteria = normalizeInterestCriteria(criteriaInput);
  return Object.keys(DIMENSION_FIELDS)
    .filter((dimension) => criteria[dimension])
    .every((dimension) =>
      hasSignalForDimension(entry, dimension, criteria),
    );
}

function scoreDataset(dataset, criteria) {
  const normalizedCriteria = normalizeInterestCriteria(criteria);
  return dataset.map((entry) => ({
    userId: entry.userId,
    ...(matchesAllInterestCriteria(entry, normalizedCriteria)
      ? scoreInterest({
          profile: entry.profile,
          behavior: entry.behavior,
          criteria: normalizedCriteria,
        })
      : {
          score: 0,
          sources: { profile: 0, search: 0, like: 0, purchase: 0 },
        }),
  }));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rounded(value) {
  return Number(Number(value || 0).toFixed(2));
}

function summarizeScores(rows, criteria) {
  const relevant = rows.filter((row) => row.score > 0);
  const eligible = rows.filter(
    (row) => row.score >= criteria.minScore && row.score <= criteria.maxScore,
  );
  const scores = relevant.map((row) => row.score);
  const distribution = INTEREST_SCORE_BANDS.map((band) => ({
    ...band,
    count: rows.filter((row) => bandForScore(row.score).key === band.key)
      .length,
  }));
  const sourceCounts = { profile: 0, search: 0, like: 0, purchase: 0 };
  for (const row of relevant) {
    for (const key of Object.keys(sourceCounts)) {
      if (row.sources[key] > 0) sourceCounts[key] += 1;
    }
  }
  return {
    totalCustomers: rows.length,
    interestedCustomers: relevant.length,
    eligibleCustomers: eligible.length,
    minimumObserved: scores.length ? rounded(Math.min(...scores)) : 0,
    maximumObserved: scores.length ? rounded(Math.max(...scores)) : 0,
    averageScore: scores.length
      ? rounded(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : 0,
    medianScore: rounded(median(scores)),
    maximumPossible: maximumScoreFor(criteria),
    globalMaximum: INTEREST_SCORE_MAX,
    scoreRange: { min: criteria.minScore, max: criteria.maxScore },
    distribution,
    sourceCounts,
    eligible,
  };
}

async function preview(input, dependencies = {}) {
  const criteria = normalizeAudienceCriteria(input);
  const dataset = await loadDataset(
    { from: new Date(criteria.from), to: new Date(criteria.to) },
    dependencies,
  );
  const summary = summarizeScores(scoreDataset(dataset, criteria), criteria);
  const { eligible, ...publicSummary } = summary;
  return { criteria, ...publicSummary };
}

async function options(dependencies = {}) {
  const audienceRepository = dependencies.repository || repository;
  const dimensions = await audienceRepository.listDimensions();
  return {
    dimensions: marketingDimensionsFrom(dimensions),
    scoreBands: INTEREST_SCORE_BANDS,
    globalMaximum: INTEREST_SCORE_MAX,
    defaultLookbackDays: DEFAULT_LOOKBACK_DAYS,
    maximumLookbackDays: MAX_LOOKBACK_DAYS,
  };
}

async function snapshot(input, dependencies = {}) {
  const criteria = normalizeAudienceCriteria(input);
  const dataset = await loadDataset(
    { from: new Date(criteria.from), to: new Date(criteria.to) },
    dependencies,
  );
  const summary = summarizeScores(scoreDataset(dataset, criteria), criteria);
  return {
    criteria,
    members: summary.eligible.map(({ userId, score }) => ({ userId, score })),
    eligibleCustomers: summary.eligibleCustomers,
  };
}

const DIMENSION_FIELDS = Object.freeze({
  category: "categories",
  brand: "brands",
  style: "styles",
});

function marketingDimensionsFrom(dimensions = {}) {
  return Object.fromEntries(
    Object.values(DIMENSION_FIELDS).map((field) => [
      field,
      dimensions[field] || [],
    ]),
  );
}

function cleanDashboardFilters(input = {}) {
  return Object.fromEntries(
    Object.keys(DIMENSION_FIELDS)
      .map((key) => [key, typeof input[key] === "string" ? input[key].trim() : ""])
      .filter(([, value]) => value),
  );
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return rounded(((current - previous) / previous) * 100);
}

function rankDimension(dataset, values, dimension, baseCriteria = {}) {
  return values.map((value) => {
    const criteria = { ...baseCriteria, [dimension]: value };
    const dimensionKeys = new Set([dimension]);
    const remainingCriteria = Object.fromEntries(
      Object.entries(baseCriteria).filter(([key]) => !dimensionKeys.has(key)),
    );
    const dimensionCriteria = { [dimension]: value };
    const matchingScores = dataset.flatMap((entry) => {
      const matchesRemainingCriteria = !Object.keys(remainingCriteria).length ||
        matchesAllInterestCriteria(entry, remainingCriteria);
      if (!matchesRemainingCriteria) return [];

      if (!matchesAllInterestCriteria(entry, dimensionCriteria)) return [];

      return [scoreInterest({
        profile: entry.profile,
        behavior: entry.behavior,
        criteria,
      }).score];
    });
    return {
      value,
      interestedCustomers: matchingScores.length,
      averageScore: matchingScores.length
        ? rounded(
            matchingScores.reduce((sum, score) => sum + score, 0) /
              matchingScores.length,
          )
        : 0,
      maximumObserved: matchingScores.length
        ? rounded(Math.max(...matchingScores))
        : 0,
    };
  }).filter(Boolean).sort(
    (a, b) =>
      b.interestedCustomers - a.interestedCustomers ||
      b.averageScore - a.averageScore ||
      a.value.localeCompare(b.value, "th"),
  );
}

function behaviorForDate(behavior, dateKey) {
  const sameDay = (signal) =>
    new Date(signal.occurredAt).toISOString().slice(0, 10) === dateKey;
  return {
    searches: behavior.searches.filter(sameDay),
    likes: behavior.likes.filter(sameDay),
    purchases: behavior.purchases.filter(sameDay),
  };
}

const BEHAVIOR_SOURCE_FIELDS = Object.freeze({
  search: "searches",
  like: "likes",
  purchase: "purchases",
});

function behaviorOnly(entry, source) {
  const selectedField = BEHAVIOR_SOURCE_FIELDS[source];
  return {
    profile: {},
    behavior: Object.fromEntries(
      Object.values(BEHAVIOR_SOURCE_FIELDS).map((field) => [
        field,
        field === selectedField ? entry.behavior[field] : [],
      ]),
    ),
  };
}

function hasBehaviorSignal(entry, criteria = null) {
  if (!criteria || !Object.keys(criteria).length) {
    return Object.values(entry.behavior).some((signals) => signals.length > 0);
  }
  return matchesAllInterestCriteria(
    { profile: {}, behavior: entry.behavior },
    criteria,
  );
}

function countBehaviorCustomers(dataset, criteria = null) {
  return Object.fromEntries(
    Object.keys(BEHAVIOR_SOURCE_FIELDS).map((source) => [
      source,
      dataset.filter((entry) => hasBehaviorSignal(behaviorOnly(entry, source), criteria)).length,
    ]),
  );
}

function buildTrend(dataset, criteria, from, to) {
  const result = [];
  for (
    let timestamp = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );
    timestamp <= to.getTime();
    timestamp += DAY_MS
  ) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const dailyDataset = dataset.map((entry) => ({
      ...entry,
      profile: {},
      behavior: behaviorForDate(entry.behavior, date),
    }));
    result.push({
      date,
      interestedCustomers: dailyDataset.filter((entry) =>
        hasBehaviorSignal(entry, criteria),
      ).length,
      ...countBehaviorCustomers(dailyDataset, criteria),
    });
  }
  return result;
}

function filterDatasetBySignal(dataset, signal) {
  if (!signal || signal === "all") return dataset;
  const supported = ["profile", "search", "like", "purchase"];
  if (!supported.includes(signal)) throw badRequest("แหล่งสัญญาณไม่ถูกต้อง");
  return dataset.map((entry) => ({
    ...entry,
    profile: signal === "profile" ? entry.profile : {},
    behavior: {
      searches: signal === "search" ? entry.behavior.searches : [],
      likes: signal === "like" ? entry.behavior.likes : [],
      purchases: signal === "purchase" ? entry.behavior.purchases : [],
    },
  }));
}

function countCustomersWithSignals(dataset, criteria = null) {
  if (criteria && Object.keys(criteria).length) {
    return scoreDataset(dataset, criteria).filter((row) => row.score > 0).length;
  }
  return dataset.filter(
    (entry) =>
      Object.values(entry.profile).some(
        (values) => Array.isArray(values) && values.length > 0,
      ) ||
      Object.values(entry.behavior).some(
        (signals) => Array.isArray(signals) && signals.length > 0,
      ),
  ).length;
}

async function insights(input = {}, dependencies = {}) {
  const range = parseRange(input);
  const duration = range.to.getTime() - range.from.getTime();
  const previousRange = {
    from: new Date(range.from.getTime() - duration),
    to: new Date(range.from.getTime() - 1),
  };
  const audienceRepository = dependencies.repository || repository;
  const [dimensions, rawCurrentDataset, rawPreviousDataset] = await Promise.all([
    audienceRepository.listDimensions(),
    loadDataset(range, dependencies),
    loadDataset(previousRange, dependencies),
  ]);
  const marketingDimensions = marketingDimensionsFrom(dimensions);
  const signal = input.signal || "all";
  const currentDataset = filterDatasetBySignal(rawCurrentDataset, signal);
  const previousDataset = filterDatasetBySignal(rawPreviousDataset, signal);
  const viewBy = Object.hasOwn(DIMENSION_FIELDS, input.viewBy)
    ? input.viewBy
    : "category";
  const filters = cleanDashboardFilters(input);
  const rankingFor = (dimension) => {
    const candidateValues = filters[dimension]
      ? [filters[dimension]]
      : marketingDimensions[DIMENSION_FIELDS[dimension]] || [];
    const currentRanking = rankDimension(
      currentDataset,
      candidateValues,
      dimension,
      filters,
    );
    const previousRanking = new Map(
      rankDimension(previousDataset, candidateValues, dimension, filters).map(
        (row) => [row.value, row],
      ),
    );
    return currentRanking.slice(0, 12).map((row) => ({
      ...row,
      changePercent: percentChange(
        row.interestedCustomers,
        previousRanking.get(row.value)?.interestedCustomers || 0,
      ),
    }));
  };
  const rankings = Object.fromEntries(
    Object.keys(DIMENSION_FIELDS).map((dimension) => [
      dimension,
      rankingFor(dimension),
    ]),
  );
  const ranking = rankings[viewBy];
  const topFor = (dimension) => {
    const values = filters[dimension]
      ? [filters[dimension]]
      : marketingDimensions[DIMENSION_FIELDS[dimension]];
    const current = rankDimension(
      currentDataset,
      values,
      dimension,
      filters,
    )[0];
    if (!current || current.interestedCustomers <= 0) return null;
    const previous = rankDimension(
      previousDataset,
      [current.value],
      dimension,
      filters,
    )[0];
    return {
      ...current,
      changePercent: percentChange(
        current.interestedCustomers,
        previous?.interestedCustomers || 0,
      ),
    };
  };
  const selectedCriteria = Object.keys(filters).length
    ? filters
    : ranking[0]?.interestedCustomers > 0
      ? { [viewBy]: ranking[0].value }
      : null;
  const selectedSummary = selectedCriteria
    ? summarizeScores(
        scoreDataset(currentDataset, selectedCriteria),
        {
          ...selectedCriteria,
          minScore: 1,
          maxScore: maximumScoreFor(selectedCriteria),
        },
      )
    : null;
  if (selectedSummary) delete selectedSummary.eligible;
  const interestedCustomers = countCustomersWithSignals(
    currentDataset,
    Object.keys(filters).length ? filters : null,
  );
  const previousInterestedCustomers = countCustomersWithSignals(
    previousDataset,
    Object.keys(filters).length ? filters : null,
  );
  const trendCriteria = Object.keys(filters).length ? filters : null;

  return {
    filters: {
      ...filters,
      viewBy,
      signal,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
    updatedAt: new Date().toISOString(),
    totalCustomers: currentDataset.length,
    interestedCustomers,
    interestedCustomersChangePercent: percentChange(
      interestedCustomers,
      previousInterestedCustomers,
    ),
    topCategory: topFor("category"),
    topBrand: topFor("brand"),
    topStyle: topFor("style"),
    ranking,
    rankings,
    categoryRanking: rankings.category,
    brandRanking: rankings.brand,
    selected: selectedCriteria
      ? { criteria: selectedCriteria, ...selectedSummary }
      : null,
    behaviorSummary: countBehaviorCustomers(currentDataset, trendCriteria),
    trend: signal !== "profile"
      ? buildTrend(currentDataset, trendCriteria, range.from, range.to)
      : [],
    dimensions: marketingDimensions,
    scoreBands: INTEREST_SCORE_BANDS,
    globalMaximum: INTEREST_SCORE_MAX,
  };
}

module.exports = {
  DEFAULT_LOOKBACK_DAYS,
  MAX_LOOKBACK_DAYS,
  parseRange,
  normalizeAudienceCriteria,
  loadDataset,
  scoreDataset,
  summarizeScores,
  preview,
  options,
  snapshot,
  insights,
};
