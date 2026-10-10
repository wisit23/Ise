const { badRequest } = require("@reloop/shared");

// Initial Thai word list approved for TC17. Match literal roots, not fuzzy
// spellings, and keep the original comment unchanged for storage/display.
const PROHIBITED_WORDS = ["เหี้ย", "สัส", "ควย", "เย็ด"];

function assertReviewCommentAllowed(comment) {
  if (typeof comment !== "string") throw badRequest("comment must be a string");
  const comparable = comment.normalize("NFKC").replace(/\p{Cf}/gu, "");
  if (PROHIBITED_WORDS.some((word) => comparable.includes(word))) {
    throw badRequest("พบคำไม่เหมาะสมในรีวิว กรุณาแก้ไข");
  }
}

module.exports = { assertReviewCommentAllowed };
