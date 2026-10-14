# Multi-value Style Profile

`GET` / `PATCH /api/auth/me/style-profile` belong to the authenticated customer account (Buyer or Seller). Staff accounts cannot use these routes. All preferences are optional; reads never create a profile.

```json
{
  "categories": ["เสื้อ", "รองเท้า"],
  "styles": ["minimal", "vintage"],
  "brands": ["Nike", "Uniqlo"],
  "sizes": [
    { "category": "เสื้อ", "values": ["M", "L"] },
    { "category": "รองเท้า", "values": ["40", "41"] }
  ],
  "unassignedSizes": []
}
```

PATCH replaces each supplied list; omitted lists stay unchanged. Empty lists clear selections. Size groups are independent of favorite categories: setting or removing favorite categories never clears sizes. The form always shows เสื้อ and รองเท้า with preset size options even when no products are listed, without preselecting any sizes. Additional groups are chosen from a dropdown (กางเกง, กระเป๋า, หมวก and catalog categories), not typed. Custom size labels such as 4XL or 42.5 remain optional. Additional groups persist when they contain selected sizes. Lists are trimmed and deduplicated. Names use Product Service's catalog where available, but custom groups/labels are allowed; there are no cross-database foreign keys.

`buyer_preferences` stores one selection per row, keyed by owner, kind, category and value. The owner-row update and replacements execute in one transaction. Legacy BuyerProfile scalar columns remain intact, but are not used as fallback after clearing selections.

## Deployment prerequisite

Migration `20261015000000_multi_value_style_profile` must be applied before the new API serves requests. Generate the Auth Prisma Client from the service-owned schema as usual. This change **prepares** the migration; it does not authorize applying it to a live database.

The migration atomically copies each nonblank scalar as one unsplit selection. All legacy sizes are preserved as `unassignedSizes`; the old UI did not associate size with category, so even a saved favorite category is insufficient evidence to assign it automatically. The user can assign each legacy size to a default or custom size group, independently of favorite categories, or remove it in the form.

Product Service `/api/products/filters` retains the existing flat `sizes` field and adds `sizesByCategory` with `{category, values}` groups. Only available, unmoderated listings contribute options; saved selections remain visible when a listing disappears. Deploy the Product options change with the Auth and Frontend changes. This feature does not rank recommendations.
