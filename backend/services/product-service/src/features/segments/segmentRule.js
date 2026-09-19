const { badRequest } = require("@reloop/shared");

const ALLOWED_FIELDS = [
  "favoriteCategory",
  "preferredSize",
  "sizePreference",
  "styleTag",
  "stylePreference",
  "brandPreference",
];

const ALLOWED_OPERATORS = ["eq", "neq", "in", "nin"];

function extractRules(targetSegment) {
  if (!targetSegment) return [];
  if (Array.isArray(targetSegment)) return targetSegment;
  if (typeof targetSegment === "object") {
    if (targetSegment.type === "all") return [];
    if (Array.isArray(targetSegment.rules)) return targetSegment.rules;
  }
  return [];
}

function validateSegmentRule(targetSegment) {
  if (!targetSegment) return true;

  if (typeof targetSegment === "string") {
    try {
      targetSegment = JSON.parse(targetSegment);
    } catch {
      throw badRequest("targetSegment must be valid JSON");
    }
  }

  if (typeof targetSegment !== "object") {
    throw badRequest("targetSegment must be an object or array");
  }

  if (!Array.isArray(targetSegment) && targetSegment.type === "all") {
    return true;
  }

  const rules = extractRules(targetSegment);

  for (const rule of rules) {
    if (!rule || typeof rule !== "object") {
      throw badRequest("each segment rule must be an object");
    }
    if (!rule.field || !ALLOWED_FIELDS.includes(rule.field)) {
      throw badRequest(
        `invalid segment field "${rule.field}". Allowed: ${ALLOWED_FIELDS.join(", ")}`,
      );
    }
    if (!rule.operator || !ALLOWED_OPERATORS.includes(rule.operator)) {
      throw badRequest(
        `invalid segment operator "${rule.operator}". Allowed: ${ALLOWED_OPERATORS.join(", ")}`,
      );
    }
    if (["in", "nin"].includes(rule.operator)) {
      if (!Array.isArray(rule.value) || rule.value.length === 0) {
        throw badRequest(`operator "${rule.operator}" requires a non-empty array value`);
      }
    } else if (rule.value === undefined || rule.value === null || rule.value === "") {
      throw badRequest(`rule for field "${rule.field}" requires a non-empty value`);
    }
  }

  return true;
}

function normalizeProfile(profile) {
  if (!profile) return null;
  return {
    favoriteCategory: profile.favoriteCategory || profile.categoryPreference || null,
    preferredSize: profile.preferredSize || profile.sizePreference || null,
    sizePreference: profile.sizePreference || profile.preferredSize || null,
    styleTag: profile.styleTag || profile.stylePreference || null,
    stylePreference: profile.stylePreference || profile.styleTag || null,
    brandPreference: profile.brandPreference || null,
  };
}

function matchesSegment(profile, targetSegment) {
  const rules = extractRules(targetSegment);
  if (rules.length === 0) {
    // Campaign applies to all buyers
    return true;
  }

  if (!profile) {
    // Targeted campaign cannot match unauthenticated or profile-less guests
    return false;
  }

  const normalized = normalizeProfile(profile);

  for (const rule of rules) {
    const buyerValue = normalized[rule.field];
    if (buyerValue === undefined || buyerValue === null) {
      return false;
    }

    const bValStr = String(buyerValue).trim().toLowerCase();

    if (rule.operator === "eq") {
      if (bValStr !== String(rule.value).trim().toLowerCase()) {
        return false;
      }
    } else if (rule.operator === "neq") {
      if (bValStr === String(rule.value).trim().toLowerCase()) {
        return false;
      }
    } else if (rule.operator === "in") {
      const allowed = rule.value.map((v) => String(v).trim().toLowerCase());
      if (!allowed.includes(bValStr)) {
        return false;
      }
    } else if (rule.operator === "nin") {
      const disallowed = rule.value.map((v) => String(v).trim().toLowerCase());
      if (disallowed.includes(bValStr)) {
        return false;
      }
    }
  }

  return true;
}

module.exports = {
  ALLOWED_FIELDS,
  ALLOWED_OPERATORS,
  validateSegmentRule,
  matchesSegment,
  extractRules,
  normalizeProfile,
};
