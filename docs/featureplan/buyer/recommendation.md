# Style Profile recommendations

Implemented on the homepage and the full product catalog through
`GET /api/products/recommendations?page=1&limit=8` (catalog uses limit 12).
Guests can browse; supplied bearer tokens are verified using the shared live-session middleware.
User identity comes from the verified token, never query parameters or `x-user-*` headers.
Responses use `Cache-Control: private, no-store`.

Product service reads the current customer's saved profile from Auth's
`GET /me/style-profile` using the same bearer token and a three-second timeout.
Paid purchase history comes from Order's authenticated `GET /recommendation-history`.
Only `confirmed`, `shipped`, or `completed` orders with a paid payment in the past
180 days contribute; cancelled/refunded/pending orders do not. The response contains
only product IDs and purchase timestamps. Deleted or moderated seed products are skipped.
There are no cross-service database reads.

## Ranking

Each dimension contributes once, matching trimmed values without case sensitivity:

- Category: 4 points, including both primary category and additional memberships.
- Style: 3 points, matching product tags.
- Brand: 2 points.
- Size: 5 points, requiring both a matching category and size from the same profile group.

Legacy `unassignedSizes` do not influence ranking because they have no category.
Behavior adds three capped source scores:

- Submitted searches: up to 6 points. All space-separated query terms must occur
  literally in the candidate's searchable text. This avoids inferring Nike interest
  from a fuzzy match to the condition label "Like New".
- Current swipe hearts: up to 8 points, using live `SwipeChoice` rows from the last 90 days.
  Removing a heart removes that evidence on the next catalog/recommendation request.
- Paid purchases: up to 10 points, using the last 50 eligible orders.

For hearts and purchases, similarity allocates 50% to category, 30% to brand,
and 20% to style. Each source uses its best matching seed; repeated searches or hearts
cannot add unlimited points. Evidence from the last 7 days gets full weight,
8–30 days half, and older evidence one quarter. Search history retains at most
50 distinct terms per account for 90 days and uses the latest 30 in ranking.

Scores sort descending, then creation time descending, then product ID ascending.
SQL ranks the complete eligible catalog before pagination. Only `available`,
unmoderated listings from other sellers are eligible. Eligibility is checked again
when loading product media to avoid returning listings sold or moderated during ranking.
That race can shorten a page; totals describe the initial count query.

## Response and fallback

Homepage and catalog requests include a random `seed` generated once per page visit.
Browsing without an active keyword query blends approximately 70% score-ranked
products, 15% new arrivals, and 15% discovery. Pool counts are rounded to whole
products over the eligible catalog; small catalogs cannot exactly represent the ratio.
New-arrival slots rotate within the newest candidate window. Discovery slots use a
seeded shuffle of the remaining catalog, and personal slots rank the remainder by score.
The pools are disjoint and interleaved before pagination. Each product appears once
in a browsing sequence when the catalog and scoring inputs remain unchanged.
Changing the seed on refresh rotates some selections while retries, filters and page
navigation keep the same seed. Account changes start a new sequence. Small/narrow
catalogs may still show the same products. A keyword search keeps its relevance
ordering and skips the blend. Clients without a seed keep the original ranked API.
Mixed items include `recommendation.bucket` (`personal`, `new`, `discovery`).
The first row includes personal, new, personal and discovery slots when there
are enough products in each pool. Within the personal pool, equal scores use
a seed-based tie break before creation time, so cold-start catalogs do not
keep displaying the same newest products at the top on every visit.

The normal product pagination response includes `matchedTotal`, `personalized`,
and `fallbackReason`. Each product includes `recommendation: { score, reasons }`.
Reasons are Thai display labels, derived from the dimensions actually matched.
Unmatched listings fill remaining slots in newest-first order and are labelled as new products.

Fallback reasons are `guest`, `no-profile`, `no-matches`, `profile-unavailable`,
and `non-customer`. These show newest eligible listings with an explicit explanation.
Explicit catalog filters are hard constraints. An active search keeps existing search
relevance ahead of personalization; unrelated high-scoring products cannot bypass filters.
`POST /api/products/recommendations/search-events` accepts `{query}` for authenticated
customer accounts only. The catalog records submitted queries/URL searches before fetching
results; typing and pagination do not create events. Guests receive no stored behavior.

`unavailableSources` lists profile, activity or purchase provider failures. Available
sources still personalize when another provider is unavailable.
Product database errors remain errors with a retry control; they are not hidden by fallback.
Invalid/revoked sessions remain authentication errors before profile retrieval.

The homepage and catalog refresh recommendations on authentication changes and ignore stale
responses from prior accounts. Returning home after saving Style Profile reads the new values.
This is rule-based matching of saved preferences and behavior; it does not train an ML model
or infer from passive product views.

Deployment requires Auth migration `20261015000000_multi_value_style_profile` from
the preceding Style Profile work. It was pending in the running local database and
was applied using `prisma migrate deploy` during this implementation.
Product migration `20261015010000_recommendation_searches` adds persistent account search
history; it was applied to the local database. Both updated Product and Order services
must be running for all signals to contribute.

## Verification

- `recommendation.test.js`: rules, fallback contracts, Auth client, SQL parameterization,
  live eligibility checks, pagination, bearer identity and header spoofing.
- `recommendation.integration.test.js`: real PostgreSQL ranking, category memberships,
  category-specific sizes, old matches, ties, paging and excluded product states.
  Set `DATABASE_URL_PRODUCT` and `REQUIRE_INTEGRATION=1`; fixtures always roll back.
- `RecommendedProducts.test.js`: reasons, fallback labels, empty/error/retry states,
  account changes and cancellation.
- `behavior.test.js`, `recommendationHistory.test.js`: recency, account isolation,
  paid order eligibility, source outages, event validation and provider contracts.
- `products.test.js`: personalized catalog, retained filters/page parameters,
  submitted-search recording, no recording on paging and stale account responses.
