const test = require("node:test");
const assert = require("node:assert/strict");
const productModel = require("../models/productModel");
const productController = require("../controllers/productController");
const prisma = require("../models/prismaClient");

test("Product view counting logic (count_views)", async (t) => {
  const dummyProducts = [
    {
      id: "prod-avail-1",
      sellerId: "seller-1",
      title: "Available Shirt",
      status: "available",
      price: 250,
      category: "เสื้อผ้า",
      tags: [],
      media: [],
    },
    {
      id: "prod-sold-1",
      sellerId: "seller-1",
      title: "Sold Shirt",
      status: "sold",
      price: 300,
      category: "เสื้อผ้า",
      tags: [],
      media: [],
    },
    {
      id: "prod-reserved-1",
      sellerId: "seller-1",
      title: "Reserved Shirt",
      status: "reserved",
      price: 350,
      category: "เสื้อผ้า",
      tags: [],
      media: [],
    },
  ];

  const dummyCountViews = [];

  const originalFindUnique = prisma.product.findUnique;
  const originalCreateMany = prisma.countView.createMany;
  const originalCount = prisma.countView.count;
  t.after(() => {
    prisma.product.findUnique = originalFindUnique;
    prisma.countView.createMany = originalCreateMany;
    prisma.countView.count = originalCount;
  });

  prisma.product.findUnique = async ({ where }) => {
    return dummyProducts.find((p) => p.id === where.id) || null;
  };

  prisma.countView.createMany = async ({ data, skipDuplicates }) => {
    assert.equal(skipDuplicates, true);
    let count = 0;
    for (const view of data) {
      if (!dummyCountViews.some(
        (cv) => cv.viewerId === view.viewerId && cv.productId === view.productId,
      )) {
        dummyCountViews.push({ ...view });
        count += 1;
      }
    }
    return { count };
  };

  prisma.countView.count = async ({ where }) => {
    return dummyCountViews.filter((cv) => cv.productId === where.productId).length;
  };

  // 1. Initial count for available product should be 0
  const initialCount = await productModel.getViewCount("prod-avail-1");
  assert.equal(initialCount, 0);

  // 2. Buyer views available product -> MUST count!
  const buyer1Counted = await productModel.recordView("prod-avail-1", "buyer-1");
  assert.equal(buyer1Counted, true);
  assert.equal(await productModel.getViewCount("prod-avail-1"), 1);

  // 3. Repeat visits from the same buyer must not count again.
  assert.equal(await productModel.recordView("prod-avail-1", "buyer-1"), false);
  assert.equal(await productModel.getViewCount("prod-avail-1"), 1);

  // 4. Another buyer views -> count increments
  await productModel.recordView("prod-avail-1", "buyer-2");
  assert.equal(await productModel.getViewCount("prod-avail-1"), 2);

  // 5. Guest visitor views -> MUST count!
  const guestCounted = await productModel.recordView("prod-avail-1", "guest-session-123");
  assert.equal(guestCounted, true);
  assert.equal(await productModel.getViewCount("prod-avail-1"), 3);

  // 6. SELLER views their own product -> MUST NOT count!
  const sellerCounted = await productModel.recordView("prod-avail-1", "seller-1");
  assert.equal(sellerCounted, false);
  // View count must remain unchanged at 3!
  assert.equal(await productModel.getViewCount("prod-avail-1"), 3);

  // 7. Any user (buyer/guest) views a SOLD product -> MUST NOT count (already bought)!
  const soldCounted = await productModel.recordView("prod-sold-1", "buyer-1");
  assert.equal(soldCounted, false);
  assert.equal(await productModel.getViewCount("prod-sold-1"), 0);

  // 8. Buyer views product before it is bought -> MUST count!
  const buyerViewsUnsold = await productModel.recordView("prod-reserved-1", "buyer-3");
  assert.equal(buyerViewsUnsold, true);
  assert.equal(await productModel.getViewCount("prod-reserved-1"), 1);

  // 9. Seller views reserved product -> MUST NOT count!
  const sellerViewsUnsold = await productModel.recordView("prod-reserved-1", "seller-1");
  assert.equal(sellerViewsUnsold, false);
  assert.equal(await productModel.getViewCount("prod-reserved-1"), 1);

  // 10. Controller tests
  // Mock productModel.findById
  t.mock.method(productModel, "findById", async (id) => {
    const p = dummyProducts.find((x) => x.id === id);
    if (!p) return null;
    return { ...p, viewCount: await productModel.getViewCount(id) };
  });

  // Test productController.getOne with buyer
  let responseData = null;
  const mockRes = {
    json: (data) => {
      responseData = data;
    },
  };

  // Buyer viewing available product via getOne
  await productController.getOne(
    {
      params: { id: "prod-avail-1" },
      userId: "buyer-99",
      headers: {},
      query: {},
    },
    mockRes,
    (err) => { throw err; },
  );
  assert.equal(responseData.id, "prod-avail-1");
  // Total was 3, buyer-99 made it 4
  assert.equal(responseData.viewCount, 4);

  // The account identity takes priority over a different browser visitor ID.
  await productController.getOne(
    {
      params: { id: "prod-avail-1" },
      userId: "buyer-99",
      headers: { "x-visitor-id": "another-browser" },
      query: {},
    },
    mockRes,
    (err) => { throw err; },
  );
  assert.equal(responseData.viewCount, 4);

  // Seller viewing available product via getOne -> view count should NOT increase
  await productController.getOne(
    {
      params: { id: "prod-avail-1" },
      userId: "seller-1",
      headers: {},
      query: {},
    },
    mockRes,
    (err) => { throw err; },
  );
  assert.equal(responseData.id, "prod-avail-1");
  // Total should stay 4 (seller was excluded)
  assert.equal(responseData.viewCount, 4);

  // Viewing sold product via getOne -> view count should NOT increase
  await productController.getOne(
    {
      params: { id: "prod-sold-1" },
      userId: "buyer-1",
      headers: {},
      query: {},
    },
    mockRes,
    (err) => { throw err; },
  );
  assert.equal(responseData.id, "prod-sold-1");
  // Sold product count remains 0
  assert.equal(responseData.viewCount, 0);

  // Viewing with ?noTrack=1 -> view count should NOT increase
  await productController.getOne(
    {
      params: { id: "prod-avail-1" },
      userId: "buyer-100",
      headers: {},
      query: { noTrack: "1" },
    },
    mockRes,
    (err) => { throw err; },
  );
  assert.equal(responseData.viewCount, 4);

  // Test productController.recordView endpoint
  let recordViewRes = null;
  const mockRecordRes = {
    json: (data) => {
      recordViewRes = data;
    },
  };

  // Buyer calls recordView on available product
  await productController.recordView(
    {
      params: { id: "prod-avail-1" },
      userId: "buyer-post-1",
      headers: {},
    },
    mockRecordRes,
    (err) => { throw err; },
  );
  assert.equal(recordViewRes.success, true);
  assert.equal(recordViewRes.counted, true);
  assert.equal(recordViewRes.viewCount, 5);

  // GET then POST for the same account must share the same unique view.
  await productController.recordView(
    { params: { id: "prod-avail-1" }, userId: "buyer-99", headers: {} },
    mockRecordRes,
    (err) => { throw err; },
  );
  assert.equal(recordViewRes.counted, false);
  assert.equal(recordViewRes.viewCount, 5);

  // A stable guest identity is also counted once.
  await productController.recordView(
    { params: { id: "prod-avail-1" }, headers: { "x-visitor-id": "guest-session-123" } },
    mockRecordRes,
    (err) => { throw err; },
  );
  assert.equal(recordViewRes.counted, false);
  assert.equal(recordViewRes.viewCount, 5);

  // Seller calls recordView on own product
  await productController.recordView(
    {
      params: { id: "prod-avail-1" },
      userId: "seller-1",
      headers: {},
    },
    mockRecordRes,
    (err) => { throw err; },
  );
  assert.equal(recordViewRes.success, true);
  assert.equal(recordViewRes.counted, false);
  assert.equal(recordViewRes.viewCount, 5);

  // Buyer calls recordView on sold product
  await productController.recordView(
    {
      params: { id: "prod-sold-1" },
      userId: "buyer-1",
      headers: {},
    },
    mockRecordRes,
    (err) => { throw err; },
  );
  assert.equal(recordViewRes.success, true);
  assert.equal(recordViewRes.counted, false);
  assert.equal(recordViewRes.viewCount, 0);
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => productModel.recordView("prod-avail-1", "concurrent-buyer")),
  );
  assert.equal(concurrent.filter(Boolean).length, 1);
  assert.equal(await productModel.getViewCount("prod-avail-1"), 6);

  // Old rows can have inflated counts; both reads still count unique viewers.
  dummyCountViews[0].count = 100;
  assert.equal(await productModel.getViewCount("prod-avail-1"), 6);
  assert.equal(productModel.toApiShape({
    ...dummyProducts[0],
    countViews: dummyCountViews.filter((cv) => cv.productId === "prod-avail-1"),
  }).viewCount, 6);

});
