const SIMPLE_UPDATE_FIELDS = [
  "title",
  "description",
  "price",
  "category",
  "brand",
  "condition",
  "size",
  "location",
];

function normalizeMedia(media) {
  if (!Array.isArray(media)) return [];

  return media
    .filter((item) => item && typeof item.url === "string" && item.url)
    .map((item) => ({
      url: item.url,
      type: item.type === "video" ? "video" : "image",
    }));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .filter((tag) => typeof tag === "string" && tag.trim())
        .map((tag) => tag.trim().toLowerCase()),
    ),
  ].slice(0, 20);
}

function buildCreateProductData(sellerId, body) {
  return {
    sellerId,
    title: body.title,
    description: body.description || "",
    price: body.price,
    category: body.category,
    brand:
      typeof body.brand === "string" ? body.brand.trim() : body.brand || "",
    condition: body.condition || "Good",
    size: body.size || "Free size",
    tags: normalizeTags(body.tags),
    media: normalizeMedia(body.media),
    location: body.location || "",
  };
}

function buildProductPatch(body) {
  const patch = {};

  for (const field of SIMPLE_UPDATE_FIELDS) {
    if (body[field] !== undefined)
      patch[field] =
        field === "brand" && typeof body[field] === "string"
          ? body[field].trim()
          : body[field];
  }

  if (body.tags !== undefined) patch.tags = normalizeTags(body.tags);
  if (body.media !== undefined) patch.media = normalizeMedia(body.media);

  return patch;
}

module.exports = {
  buildCreateProductData,
  buildProductPatch,
};
