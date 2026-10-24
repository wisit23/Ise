const { randomInt } = require("node:crypto");

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
// Each entity has exactly one owner. Foreign keys and security tokens stay unchanged.
const REFERENCE_MODELS = Object.freeze({
  auth: Object.freeze({
    User: "USR",
    KycApplication: "KYC",
    Report: "RPT",
    ShopChangeRequest: "SCR",
    BulkActionRun: "BLK",
  }),
  product: Object.freeze({
    Product: "PRD",
    ProductVideo: "CLP",
    AuctionItem: "AUC",
    AuctionRound: "RND",
    Bid: "BID",
    Campaign: "CMP",
    UserVoucher: "VCH",
    Article: "ART",
    Review: "REV",
  }),
  order: Object.freeze({
    Basket: "BSK",
    Checkout: "CHK",
    Order: "ORD",
    Payment: "PAY",
    Shipping: "SHP",
    Hold: "HLD",
    DisputeCase: "DSP",
  }),
  support: Object.freeze({
    SupportTicket: "TKT",
    HelpArticle: "HLP",
    SlaPolicy: "SLA",
  }),
  chat: Object.freeze({ Conversation: "CHT" }),
});
const PREFIXES = new Set(
  Object.values(REFERENCE_MODELS).flatMap(Object.values),
);
const PATTERN =
  /^([A-Z]{3})-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4})-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4})$/;

function generateReferenceCode(prefix) {
  if (!PREFIXES.has(prefix))
    throw new TypeError("Unknown reference code prefix");
  const body = Array.from(
    { length: 12 },
    () => REFERENCE_ALPHABET[randomInt(32)],
  ).join("");
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

function normalizeReferenceCode(value, expectedPrefix) {
  if (typeof value !== "string") return null;
  const compact = value.trim().toUpperCase().replace(/-/g, "");
  if (compact.length !== 15) return null;
  const code = `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7, 11)}-${compact.slice(11)}`;
  const match = PATTERN.exec(code);
  if (
    !match ||
    !PREFIXES.has(match[1]) ||
    (expectedPrefix && match[1] !== expectedPrefix)
  )
    return null;
  return code;
}

function isReferenceCodeCollision(error) {
  const target = error?.meta?.target;
  return (
    error?.code === "P2002" &&
    /reference_?code/i.test(
      Array.isArray(target) ? target.join(",") : String(target || ""),
    )
  );
}

async function createWithReferenceCode(
  prefix,
  create,
  { generate = generateReferenceCode, attempts = 5 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await create(generate(prefix));
    } catch (error) {
      if (!isReferenceCodeCollision(error)) throw error;
      if (attempt === attempts - 1) {
        const exhausted = new Error(
          "Reference code allocation failed after bounded retries",
          { cause: error },
        );
        exhausted.code = "REFERENCE_CODE_EXHAUSTED";
        throw exhausted;
      }
    }
  }
  throw new TypeError("Reference code attempts must be positive");
}

module.exports = {
  REFERENCE_ALPHABET,
  REFERENCE_MODELS,
  generateReferenceCode,
  normalizeReferenceCode,
  isReferenceCodeCollision,
  createWithReferenceCode,
};
