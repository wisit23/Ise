const { badRequest, forbidden, notFound } = require("@reloop/shared");
const helpModel = require("./helpModel");

const AGENT_ROLES = new Set(["SUPPORT", "ADMIN"]);

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

async function publish({ role, id }) {
  if (!AGENT_ROLES.has(role)) {
    throw forbidden("only support agents can publish help articles");
  }
  const article = await helpModel.publish(id);
  if (!article) throw notFound("help article not found");
  return article;
}

module.exports = { searchPublic, listForAgent, createDraft, publish };
