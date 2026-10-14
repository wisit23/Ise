function groupSizesByCategory(products) {
  const groups = new Map();
  for (const product of products) {
    const size = product.size?.trim();
    if (!size) continue;
    const categories = new Set(
      [
        product.category,
        ...(product.categoryLinks || []).map((link) => link.category?.name),
      ].filter(Boolean),
    );
    for (const name of categories) {
      const category = name.trim();
      if (!category) continue;
      if (!groups.has(category)) groups.set(category, new Set());
      groups.get(category).add(size);
    }
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, sizes]) => ({
      category,
      values: [...sizes].sort((a, b) => a.localeCompare(b)),
    }));
}

module.exports = { groupSizesByCategory };
