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

  const origFindUnique = prisma.product.findUnique;
  const origCountViewUpsert = prisma.countView.upsert;
  const origCountViewAggregate = prisma.countView.aggregate;

  t.after(() => {
    prisma.product.findUnique = origFindUnique;
    prisma.countView.upsert = origCountViewUpsert;
    prisma.countView.aggregate = origCountViewAggregate;
  });

  prisma.product.findUnique = async ({ where }) => {
    return dummyProducts.find((p) => p.id === where.id) || null;
  };

  prisma.countView.upsert = async ({ where, update, create }) => {
    const { viewerId, productId } = where.viewerId_productId;
    const existing = dummyCountViews.find(
      (cv) => cv.viewerId === viewerId && cv.productId === productId,
    );
    if (existing) {
      if (update.count?.increment) {
        existing.count += update.count.increment;
      }
      return existing;
    }
    const item = {
      viewerId,
      productId,
      count: create.count || 1,
    };
    dummyCountViews.push(item);
    return item;
  };

  prisma.countView.aggregate = async ({ where, _sum }) => {
    const filtered = dummyCountViews.filter((cv) => cv.productId === where.productId);
    const sum = filtered.reduce((acc, cv) => acc + (cv.count || 0), 0);
    return {
      _sum: { count: sum || null },
    };
  };

  // 1. Initial count for available product should be 0
  const initialCount = await productModel.getViewCount("prod-avail-1");
  assert.equal(initialCount, 0);

  // 2. Buyer views available product -> MUST count!
  const buyer1Counted = await productModel.recordView("prod-avail-1", "buyer-1");
  assert.equal(buyer1Counted, true);
  assert.equal(await productModel.getViewCount("prod-avail-1"), 1);

  // 3. Same buyer views again -> count increments
  await productModel.recordView("prod-avail-1", "buyer-1");
  assert.equal(await productModel.getViewCount("prod-avail-1"), 2);

  // 4. Another buyer views -> count increments
  await productModel.recordView("prod-avail-1", "buyer-2");
  assert.equal(await productModel.getViewCount("prod-avail-1"), 3);

  // 5. Guest visitor views -> MUST count!
  const guestCounted = await productModel.recordView("prod-avail-1", "guest-session-123");
  assert.equal(guestCounted, true);
  assert.equal(await productModel.getViewCount("prod-avail-1"), 4);

  // 6. SELLER views their own product -> MUST NOT count!
  const sellerCounted = await productModel.recordView("prod-avail-1", "seller-1");
  assert.equal(sellerCounted, false);
  // View count must remain unchanged at 4!
  assert.equal(await productModel.getViewCount("prod-avail-1"), 4);

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
    () => {},
  );
  assert.equal(responseData.id, "prod-avail-1");
  // Total was 4, buyer-99 made it 5
  assert.equal(responseData.viewCount, 5);

  // Seller viewing available product via getOne -> view count should NOT increase
  await productController.getOne(
    {
      params: { id: "prod-avail-1" },
      userId: "seller-1",
      headers: {},
      query: {},
    },
    mockRes,
    () => {},
  );
  assert.equal(responseData.id, "prod-avail-1");
  // Total should stay 5 (seller was excluded)
  assert.equal(responseData.viewCount, 5);

  // Viewing sold product via getOne -> view count should NOT increase
  await productController.getOne(
    {
      params: { id: "prod-sold-1" },
      userId: "buyer-1",
      headers: {},
      query: {},
    },
    mockRes,
    () => {},
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
    () => {},
  );
  assert.equal(responseData.viewCount, 5);

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
    () => {},
  );
  assert.equal(recordViewRes.success, true);
  assert.equal(recordViewRes.counted, true);
  assert.equal(recordViewRes.viewCount, 6);

  // Seller calls recordView on own product
  await productController.recordView(
    {
      params: { id: "prod-avail-1" },
      userId: "seller-1",
      headers: {},
    },
    mockRecordRes,
    () => {},
  );
  assert.equal(recordViewRes.success, true);
  assert.equal(recordViewRes.counted, false);
  assert.equal(recordViewRes.viewCount, 6);

  // Buyer calls recordView on sold product
  await productController.recordView(
    {
      params: { id: "prod-sold-1" },
      userId: "buyer-1",
      headers: {},
    },
    mockRecordRes,
    () => {},
  );
  assert.equal(recordViewRes.success, true);
  assert.equal(recordViewRes.counted, false);
  assert.equal(recordViewRes.viewCount, 0);
});
