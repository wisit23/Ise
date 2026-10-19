const {
  RULES,
  normalizeProfile,
} = require("../recommendations/recommendationRules");

const SCORE_BY_KEY = Object.freeze(
  Object.fromEntries(RULES.map((rule) => [rule.key, rule.weight])),
);

const MARKETING_SCORE_KEYS = Object.freeze([
  "category",
  "style",
  "brand",
  "search",
  "like",
  "purchase",
]);

const INTEREST_SCORE_MAX = RULES.filter((rule) =>
  MARKETING_SCORE_KEYS.includes(rule.key),
).reduce(
  (total, rule) => total + rule.weight,
  0,
);

const INTEREST_SCORE_BANDS = Object.freeze([
  { key: "none", label: "ไม่มีสัญญาณ", min: 0, max: 0 },
  { key: "emerging", label: "เริ่มสนใจ", min: 1, max: 6 },
  { key: "moderate", label: "สนใจปานกลาง", min: 7, max: 14 },
  { key: "high", label: "สนใจสูง", min: 15, max: 24 },
  { key: "very_high", label: "สนใจสูงมาก", min: 25, max: 33 },
]);

const SIMILARITY_WEIGHTS = Object.freeze({
  category: 0.5,
  brand: 0.3,
  style: 0.2,
});

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeInterestCriteria(criteria = {}) {
  const normalized = {
    category: normalize(criteria.category),
    brand: normalize(criteria.brand),
    style: normalize(criteria.style),
  };
  if (normalize(criteria.size)) {
    throw new Error("ไม่รองรับไซซ์เป็นเงื่อนไขความสนใจสำหรับงาน Marketing");
  }
  if (!Object.values(normalized).some(Boolean)) {
    throw new Error("interest criteria requires at least one target value");
  }
  return normalized;
}

function includes(values, expected) {
  return Boolean(expected) && values.includes(expected);
}

function scoreProfile(profileInput, criteriaInput) {
  const profile = normalizeProfile(profileInput);
  const criteria = normalizeInterestCriteria(criteriaInput);
  let score = 0;
  if (includes(profile.categories, criteria.category)) {
    score += SCORE_BY_KEY.category;
  }
  if (includes(profile.styles, criteria.style)) {
    score += SCORE_BY_KEY.style;
  }
  if (includes(profile.brands, criteria.brand)) {
    score += SCORE_BY_KEY.brand;
  }
  return score;
}

function similarity(profileInput, criteriaInput) {
  const profile = normalizeProfile(profileInput);
  const criteria = normalizeInterestCriteria(criteriaInput);
  const dimensions = ["category", "brand", "style"].filter(
    (key) => criteria[key],
  );
  const denominator = dimensions.reduce(
    (total, key) => total + SIMILARITY_WEIGHTS[key],
    0,
  );
  if (!denominator) return 0;
  const matched = dimensions.reduce((total, key) => {
    const profileKey = key === "category" ? "categories" : `${key}s`;
    return includes(profile[profileKey], criteria[key])
      ? total + SIMILARITY_WEIGHTS[key]
      : total;
  }, 0);
  return matched / denominator;
}

function searchMatches(query, criteriaInput) {
  const criteria = normalizeInterestCriteria(criteriaInput);
  const queryText = normalize(query);
  if (!queryText) return false;
  return Object.values(criteria)
    .filter(Boolean)
    .some((target) =>
      target
        .split(/\s+/u)
        .filter(Boolean)
        .every((token) => queryText.includes(token)),
    );
}

function strongestSignal(signals, score) {
  return (Array.isArray(signals) ? signals : []).reduce(
    (best, signal) => Math.max(best, Number(score(signal)) || 0),
    0,
  );
}

function scoreInterest({ profile, behavior = {}, criteria }) {
  const normalizedCriteria = normalizeInterestCriteria(criteria);
  const profileScore = scoreProfile(profile, normalizedCriteria);
  const searchScore = strongestSignal(behavior.searches, (signal) =>
    searchMatches(signal.query, normalizedCriteria) ? signal.weight : 0,
  );
  const likeScore = strongestSignal(
    behavior.likes,
    (signal) =>
      Number(signal.weight || 0) *
      similarity(signal.profile, normalizedCriteria),
  );
  const purchaseScore = strongestSignal(
    behavior.purchases,
    (signal) =>
      Number(signal.weight || 0) *
      similarity(signal.profile, normalizedCriteria),
  );
  const score = Math.round(
    profileScore + searchScore + likeScore + purchaseScore,
  );
  return {
    score,
    sources: {
      profile: Number(profileScore.toFixed(4)),
      search: Number(searchScore.toFixed(4)),
      like: Number(likeScore.toFixed(4)),
      purchase: Number(purchaseScore.toFixed(4)),
    },
  };
}

function maximumScoreFor(criteriaInput) {
  const criteria = normalizeInterestCriteria(criteriaInput);
  const profileMaximum =
    (criteria.category ? SCORE_BY_KEY.category : 0) +
    (criteria.style ? SCORE_BY_KEY.style : 0) +
    (criteria.brand ? SCORE_BY_KEY.brand : 0);
  return profileMaximum +
    SCORE_BY_KEY.search +
    SCORE_BY_KEY.like +
    SCORE_BY_KEY.purchase;
}

function bandForScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return INTEREST_SCORE_BANDS[0];
  return (
    INTEREST_SCORE_BANDS.slice(1).find((band) => value <= band.max) ||
    INTEREST_SCORE_BANDS[INTEREST_SCORE_BANDS.length - 1]
  );
}

module.exports = {
  INTEREST_SCORE_BANDS,
  INTEREST_SCORE_MAX,
  normalizeInterestCriteria,
  scoreInterest,
  maximumScoreFor,
  bandForScore,
};
