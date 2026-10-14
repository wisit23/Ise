// Each dimension contributes once, regardless of how many values were selected.
const RULES = [
  { key: "category", weight: 4, label: "หมวดที่คุณสนใจ" },
  { key: "style", weight: 3, label: "สไตล์ที่คุณชอบ" },
  { key: "brand", weight: 2, label: "แบรนด์ที่คุณชอบ" },
  { key: "size", weight: 5, label: "ไซซ์ที่คุณเลือกในหมวดนี้" },
  {
    key: "search",
    weight: 6,
    behavioral: true,
    label: "คล้ายสิ่งที่คุณค้นหาล่าสุด",
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
  const matched = RULES.filter((rule) => matches[rule.key]);
  return {
    score: matched.reduce(
      (sum, rule) =>
        sum + (rule.behavioral ? Number(matches[rule.key]) : rule.weight),
      0,
    ),
    reasons: matched.map((rule) => rule.label),
  };
}

module.exports = { RULES, normalizeProfile, hasPreferences, explanation };
