const { badRequest, forbidden, notFound, conflict } = require("@reloop/shared");
const helpModel = require("./helpModel");

const AGENT_ROLES = new Set(["CUSTOMER_SERVICE", "ADMIN", "TRUST_AND_SAFETY"]);

function slugify(title) {
  return (
    title
      .trim()
      .toLowerCase()
      // \p{M} keeps combining marks (Thai vowel/tone signs attach to the
      // preceding consonant as separate codepoints) — without it every Thai
      // title gets shredded into single-consonant fragments split by dashes.
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
  );
}

async function searchPublic({ q, category, skip, take }) {
  return helpModel.search({ q, category, skip, take });
}

async function listForAgent({ role, status, skip, take }) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can manage help articles");
  }
  return helpModel.listAll({ status, skip, take });
}

async function createDraft({ role, authorId, title, body, category }) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can write help articles");
  }
  if (!title?.trim() || !body?.trim() || !category?.trim()) {
    throw badRequest("title, body and category are required");
  }

  return helpModel.create({
    slug: `${slugify(title)}-${Date.now().toString(36)}`,
    title: title.trim(),
    body: body.trim(),
    category: category.trim(),
    authorId,
    status: "DRAFT",
  });
}

async function publish({ role, id, version }) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can publish help articles");
  }
  if (!Number.isInteger(version)) throw badRequest("version is required");
  const article = await helpModel.publish(id, version);
  if (!article) throw conflict("help article was modified concurrently");
  return article;
}

async function updateArticle({ role, id, version, title, body, category }) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can edit help articles");
  }
  if (!Number.isInteger(version)) throw badRequest("version is required");
  if (!title?.trim() || !body?.trim() || !category?.trim()) {
    throw badRequest("title, body and category are required");
  }
  const article = await helpModel.update({
    id,
    version,
    data: { title: title.trim(), body: body.trim(), category: category.trim() },
  });
  if (!article) throw conflict("help article was modified concurrently");
  return article;
}

async function unpublish({ role, id, version }) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can unpublish help articles");
  }
  if (!Number.isInteger(version)) throw badRequest("version is required");
  const article = await helpModel.update({
    id,
    version,
    data: { status: "DRAFT", publishedAt: null },
  });
  if (!article) throw conflict("help article was modified concurrently");
  return article;
}

module.exports = {
  searchPublic,
  listForAgent,
  createDraft,
  updateArticle,
  publish,
  unpublish,
};
