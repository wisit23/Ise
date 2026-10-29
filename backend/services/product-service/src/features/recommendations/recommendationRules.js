// Each dimension contributes once, regardless of how many values were selected.
const RULES = [
  { key: "category", weight: 4, label: "หมวดที่คุณสนใจ" },
  { key: "style", weight: 3, label: "สไตล์ที่คุณชอบ" },
  { key: "brand", weight: 2, label: "แบรนด์ที่คุณชอบ" },
  { key: "size", weight: 5, label: "ไซซ์ที่คุณเลือกในหมวดนี้" },
  {
    key: "search",
    weight: 3,
    behavioral: true,
    label: "คล้ายสิ่งที่คุณค้นหาล่าสุด",
  },
  {
    key: "productView",
    weight: 5,
    behavioral: true,
    label: "คล้ายสินค้าที่คุณดู",
  },
  {
    key: "videoView",
    weight: 5,
    behavioral: true,
    label: "คล้ายสินค้าจากคลิปที่คุณดู",
  },
  {
    key: "like",
    weight: 8,
    behavioral: true,
    label: "คล้ายสินค้าจากคลิปที่คุณกดใจ",
  },
  {
    key: "purchase",
    weight: 10,
    behavioral: true,
    label: "คล้ายสินค้าที่คุณซื้อ",
  },
];

// Read once at service startup; all scoring consumers use the same weights.
for (const rule of RULES) {
  const suffix = rule.key
    .replace(/[A-Z]/g, (letter) => `_${letter}`)
    .toUpperCase();
  const name = `RECOMMENDATION_WEIGHT_${suffix}`;
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") continue;
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  rule.weight = weight;
}

function weightFor(key) {
  return RULES.find((rule) => rule.key === key).weight;
}

// Repeated like / view / purchase signals add up, but never beyond this many
// times the signal's own weight, so one habit cannot swamp the whole score.
let repeatCapMultiplier = 2;
const rawRepeatCap = process.env.RECOMMENDATION_REPEAT_CAP;
if (rawRepeatCap !== undefined && rawRepeatCap.trim() !== "") {
  const multiplier = Number(rawRepeatCap);
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    throw new Error(
      "RECOMMENDATION_REPEAT_CAP must be a finite number of at least 1",
    );
  }
  repeatCapMultiplier = multiplier;
}

function repeatCapFor(key) {
  return weightFor(key) * repeatCapMultiplier;
}

function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function values(input) {
  return [
    ...new Set(
      (Array.isArray(input) ? input : []).map(normalize).filter(Boolean),
    ),
  ];
}

function normalizeProfile(profile = {}) {
  return {
    categories: values(profile.categories),
    styles: values(profile.styles),
    brands: values(profile.brands),
    // Legacy unassigned sizes cannot safely be applied across product categories.
    sizes: (Array.isArray(profile.sizes) ? profile.sizes : [])
      .map((group) => ({
        category: normalize(group?.category),
        values: values(group?.values),
      }))
      .filter((group) => group.category && group.values.length),
  };
}

function hasPreferences(profile) {
  return Object.values(profile).some((items) => items.length > 0);
}

function explanation(matches) {
  const matched = RULES.filter((rule) => rule.weight > 0 && matches[rule.key]);
  return {
    score: matched.reduce(
      (sum, rule) =>
        sum + (rule.behavioral ? Number(matches[rule.key]) : rule.weight),
      0,
    ),
    reasons: matched.map((rule) => rule.label),
  };
}

module.exports = {
  RULES,
  weightFor,
  repeatCapFor,
  normalizeProfile,
  hasPreferences,
  explanation,
};
