const { badRequest, forbidden, notFound } = require("@reloop/shared");
const productVideoRepository = require("./productVideoRepository");
const chatClient = require("../auctions/chatClient");

const UPLOAD_ROLES = new Set(["SELLER", "ADMIN"]);

function requiredText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalText(value, fieldName) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw badRequest(`${fieldName} must be a string`);
  }
  return value.trim();
}

function isBuyer(user) {
  if (!user) return false;
  const roles=[...new Set([user.role,...(user.roles || [])].filter(Boolean))];
  return roles.length>0 && roles.every(role=>["BUYER","SELLER"].includes(role)) && !["SUSPENDED","RESTRICTED_BUYER","RESTRICTED_ALL_COMMERCE"].includes(user.status);
}

function listFeed({ skip, take, userId, videoId }) {
  return productVideoRepository.listAvailable({
    skip,
    take,
    ...(userId ? { userId } : {}),
    ...(videoId ? { videoId } : {}),
  });
}

function requireSeller(user) {
  if (!user?.id || !UPLOAD_ROLES.has(user.role)) throw forbidden("seller account required");
}

function listMine({ user, skip, take }) {
  requireSeller(user);
  return productVideoRepository.listMine({ sellerId: user.id, skip, take });
}

async function ownedClip(user, id) {
  requireSeller(user);
  const clip = await productVideoRepository.findById(id);
  if (!clip || clip.sellerId !== user.id) throw notFound("clip not found");
  return clip;
}

async function updateClip({ user, id, input = {} }) {
  const clip = await ownedClip(user, id);
  const data = {};
  if (input.title !== undefined) data.title = optionalText(input.title, "title");
  if (input.description !== undefined) data.description = optionalText(input.description, "description");
  if (input.videoUrl !== undefined) data.videoUrl = requiredText(input.videoUrl, "videoUrl");
  if (input.productId !== undefined) {
    data.productId = requiredText(input.productId, "productId");
  }
  const product = await productVideoRepository.findProductOwner(data.productId || clip.productId);
  if (!product) throw notFound("product not found");
  if (product.sellerId !== user.id) throw forbidden("you can only attach video clips to your own products");
  if (product.moderatedAt || product.status === "removed") throw forbidden("cannot edit a video for a moderated product");
  if (product.status === "sold") throw badRequest("cannot edit a video for a sold product");
  return productVideoRepository.updateOwned(id, user.id, data);
}

async function deleteClip({ user, id }) {
  await ownedClip(user, id);
  await productVideoRepository.deleteOwned(id, user.id);
  return { success: true };
}

/**
 * Creates one feed clip for a product owned by the authenticated user.
 * sellerName intentionally comes from the verified access token, never from
 * req.body, so a client cannot publish a clip under another seller's name.
 */
async function createClip({ user, input = {} }) {
  if (!UPLOAD_ROLES.has(user.role)) {
    throw forbidden("only seller accounts can upload video reviews");
  }

  const videoUrl = requiredText(input.videoUrl, "videoUrl");
  const productId = requiredText(input.productId, "productId");
  const description = optionalText(input.description, "description");

  const product = await productVideoRepository.findProductOwner(productId);
  if (!product) throw notFound("product not found");
  if (product.moderatedAt || product.status === "removed") {
    throw forbidden("cannot attach a video to a moderated product");
  }
  if (product.status === "sold") {
    throw badRequest("cannot attach a video to a sold product");
  }
  if (product.sellerId !== user.id) {
    throw forbidden("you can only attach video clips to your own products");
  }

  return productVideoRepository.create({
    ...(input.title !== undefined ? { title: optionalText(input.title, "title") } : {}),
    videoUrl,
    description,
    sellerId: user.id,
    sellerName: user.displayName || null,
    productId,
  });
}

/**
 * Persists a buyer's "interested" swipe on one clip (UR-11). Idempotent by
 * design (upsert on the unique [productVideoId, userId] pair) — swiping the
 * same card again just confirms the existing choice instead of erroring.
 */
async function chooseClip({ user, productVideoId }) {
  if (!isBuyer(user)) {
    throw forbidden("only buyer accounts can choose swipe cards");
  }

  const clip = await productVideoRepository.findById(productVideoId);
  if (
    !clip ||
    clip.product?.moderatedAt ||
    clip.product?.status === "removed"
  ) {
    throw notFound("swipe card not found");
  }

  const choice = await productVideoRepository.upsertChoice({
    productVideoId,
    userId: user.id,
  });

  // Notify seller if another user liked their review clip
  if (clip.sellerId && clip.sellerId !== user.id) {
    const likerName =
      user.displayName || (user.id ? `ผู้ใช้ ${user.id.slice(-6)}` : "ผู้ใช้");
    const productTitle = clip.product?.title || "สินค้า";
    chatClient
      .sendSystemNotification({
        userId: clip.sellerId,
        type: "LIKE",
        title: "มีคนถูกใจคลิปรีวิวของคุณ",
        message: `คุณ ${likerName} ได้ถูกใจคลิปรีวิวสินค้า "${productTitle}"`,
        link: `/swipe?videoId=${clip.id}`,
        metadata: {
          event: "video.liked",
          productVideoId: clip.id,
          productId: clip.productId,
          userId: user.id,
          userName: likerName,
        },
      })
      .catch((err) => {
        console.error(
          "[product-service] like notification failed:",
          err.message,
        );
      });
  }

  return {
    ...choice,
    chosen: true,
  };
}

/**
 * Removes a buyer's "interested" bookmark on one clip (unlike/unchoose).
 */
async function unchooseClip({ user, productVideoId }) {
  if (!isBuyer(user)) {
    throw forbidden("only buyer accounts can unchoose swipe cards");
  }

  const clip = await productVideoRepository.findById(productVideoId);
  if (
    !clip ||
    clip.product?.moderatedAt ||
    clip.product?.status === "removed"
  ) {
    throw notFound("swipe card not found");
  }

  await productVideoRepository.deleteChoice({
    productVideoId,
    userId: user.id,
  });
  return { chosen: false };
}

async function createComment({ user, productVideoId, input = {} }) {
  if (!isBuyer(user)) {
    throw forbidden("only buyer accounts can comment on review clips");
  }

  const text = requiredText(input.comment, "comment");
  if (text.length > 500) {
    throw badRequest("comment cannot exceed 500 characters");
  }

  const clip = await productVideoRepository.findById(productVideoId);
  if (
    !clip ||
    clip.product?.moderatedAt ||
    clip.product?.status === "removed"
  ) {
    throw notFound("swipe card not found");
  }

  const commenterName =
    user.displayName || (user.id ? `ผู้ใช้ ${user.id.slice(-6)}` : "ผู้ใช้");

  const createdComment = await productVideoRepository.createComment({
    productVideoId,
    userId: user.id,
    userName: commenterName,
    comment: text,
  });

  // Notify seller if another user commented on their review clip
  if (clip.sellerId && clip.sellerId !== user.id) {
    const productTitle = clip.product?.title || "สินค้า";
    const snippet = text.length > 50 ? `${text.slice(0, 47)}...` : text;
    chatClient
      .sendSystemNotification({
        userId: clip.sellerId,
        type: "REVIEW",
        title: "มีความคิดเห็นใหม่บนคลิปรีวิวของคุณ",
        message: `คุณ ${commenterName} ได้แสดงความคิดเห็นบนคลิปรีวิวสินค้า "${productTitle}": "${snippet}"`,
        link: `/swipe?videoId=${clip.id}`,
        metadata: {
          event: "video.commented",
          productVideoId: clip.id,
          productId: clip.productId,
          commentId: createdComment.id,
          userId: user.id,
          userName: commenterName,
        },
      })
      .catch((err) => {
        console.error(
          "[product-service] comment notification failed:",
          err.message,
        );
      });
  }

  return createdComment;
}

async function listComments(productVideoId) {
  const clip = await productVideoRepository.findById(productVideoId);
  if (
    !clip ||
    clip.product?.moderatedAt ||
    clip.product?.status === "removed"
  ) {
    throw notFound("swipe card not found");
  }
  return productVideoRepository.listComments(productVideoId);
}

module.exports = {
  listMine,
  updateClip,
  deleteClip,
  listFeed,
  createClip,
  chooseClip,
  unchooseClip,
  createComment,
  listComments,
};
