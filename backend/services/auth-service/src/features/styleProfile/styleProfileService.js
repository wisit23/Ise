const { badRequest } = require("@reloop/shared");
const prisma = require("../../models/prismaClient");

const KINDS = {
  categories: "CATEGORY",
  styles: "STYLE",
  brands: "BRAND",
  sizes: "SIZE",
  unassignedSizes: "SIZE",
};
const INCLUDE = {
  preferences: {
    orderBy: [{ kind: "asc" }, { category: "asc" }, { value: "asc" }],
  },
};

function emptyProfile() {
  return {
    categories: [],
    styles: [],
    brands: [],
    sizes: [],
    unassignedSizes: [],
  };
}

function profileView(row) {
  const profile = emptyProfile();
  for (const { kind, category, value } of row?.preferences || []) {
    if (kind === "SIZE") {
      if (!category) profile.unassignedSizes.push(value);
      else {
        let group = profile.sizes.find((item) => item.category === category);
        if (!group) {
          group = { category, values: [] };
          profile.sizes.push(group);
        }
        group.values.push(value);
      }
    } else {
      const field = Object.keys(KINDS).find((key) => KINDS[key] === kind);
      if (field) profile[field].push(value);
    }
  }
  return profile;
}

function text(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 100 ||
    /\p{Cc}/u.test(value)
  ) {
    throw badRequest(
      "แต่ละตัวเลือกต้องเป็นข้อความ 1–100 ตัวอักษรและไม่มีอักขระควบคุม",
    );
  }
  return value.trim();
}

function selections(values) {
  if (!Array.isArray(values) || values.length > 100)
    throw badRequest("แต่ละช่องต้องเป็นรายการไม่เกิน 100 ตัวเลือก");
  return [...new Set(values.map(text))];
}

function normalizeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw badRequest("ข้อมูลความสนใจต้องเป็น object");
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => !Object.hasOwn(KINDS, key)))
    throw badRequest("ข้อมูลความสนใจมีช่องที่ไม่รองรับ");
  const data = {};
  for (const key of keys) {
    if (key !== "sizes") {
      data[key] = selections(input[key]);
      continue;
    }
    if (!Array.isArray(input.sizes) || input.sizes.length > 100)
      throw badRequest("ขนาดต้องเป็นรายการแยกตามหมวดสินค้า");
    const groups = new Map();
    for (const group of input.sizes) {
      if (
        !group ||
        typeof group !== "object" ||
        Array.isArray(group) ||
        Object.keys(group).some((key) => !["category", "values"].includes(key))
      )
        throw badRequest("ขนาดต้องระบุ category และ values");
      const category = text(group.category);
      const values = selections(group.values);
      const combined = [
        ...new Set([...(groups.get(category) || []), ...values]),
      ];
      if (combined.length > 100)
        throw badRequest("ขนาดแต่ละหมวดต้องไม่เกิน 100 ตัวเลือก");
      groups.set(category, combined);
    }
    data.sizes = [...groups]
      .filter(([, values]) => values.length)
      .map(([category, values]) => ({ category, values }));
  }
  return data;
}

function preferenceRows(userId, data) {
  const rows = [];
  for (const [field, values] of Object.entries(data)) {
    if (field === "sizes") {
      for (const { category, values: sizes } of values)
        for (const value of sizes)
          rows.push({ userId, kind: "SIZE", category, value });
    } else {
      for (const value of values)
        rows.push({ userId, kind: KINDS[field], category: "", value });
    }
  }
  return rows;
}

function createStyleProfileService(db) {
  async function get(userId) {
    return profileView(
      await db.buyerProfile.findUnique({ where: { userId }, include: INCLUDE }),
    );
  }

  async function update(userId, input) {
    const data = normalizeInput(input);
    return db.$transaction(async (tx) => {
      // Updating the owner row serializes simultaneous preference replacements.
      await tx.buyerProfile.upsert({
        where: { userId },
        create: { userId },
        update: { updatedAt: new Date() },
      });
      // Size groups are independent of the buyer's favorite categories.
      for (const field of Object.keys(data)) {
        await tx.buyerPreference.deleteMany({
          where: {
            userId,
            kind: KINDS[field],
            ...(field === "sizes"
              ? { category: { not: "" } }
              : field === "unassignedSizes"
                ? { category: "" }
                : {}),
          },
        });
      }
      const rows = preferenceRows(userId, data);
      if (rows.length) await tx.buyerPreference.createMany({ data: rows });
      return profileView(
        await tx.buyerProfile.findUnique({
          where: { userId },
          include: INCLUDE,
        }),
      );
    });
  }
  return { get, update };
}

module.exports = createStyleProfileService(prisma);
module.exports.createStyleProfileService = createStyleProfileService;
