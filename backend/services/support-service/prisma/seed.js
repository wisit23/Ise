const prisma = require("../src/models/prismaClient");
const helpModel = require("../src/features/help-content/helpModel");
const { seedReferenceData } = require("./seedReferenceData");

const ARTICLES = require("./help-content.json");
async function main() {
  await seedReferenceData(prisma);
  // Initial editorial content is an explicit setup task, not a startup side effect.
  if (process.env.CS_SEED_HELP_CONTENT !== "1") return;
  for (const article of ARTICLES) {
    if (await prisma.helpArticle.findUnique({ where: { slug: article.slug } }))
      continue;
    const draft = await helpModel.create({
      ...article,
      authorId: "system:faq-seed",
    });
    await helpModel.publish(draft.id);
  }
  console.log(
    "[support-service] reference data and published FAQ revisions ready",
  );
}
if (require.main === module)
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
module.exports = { main };
