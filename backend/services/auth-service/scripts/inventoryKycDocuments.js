const fs = require("node:fs");
const path = require("node:path");

const prisma = require("../src/models/prismaClient");
const { STORAGE_DIR, absolutePath } = require("../src/features/kyc/kycStorage");

async function walkFiles(root, current = root) {
  const result = [];
  for (const entry of await fs.promises.readdir(current, {
    withFileTypes: true,
  })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(root, fullPath)));
    else if (entry.isFile()) result.push(path.relative(root, fullPath));
  }
  return result;
}

function safeSourcePath(sourceDir, storageKey) {
  const resolved = path.resolve(sourceDir, storageKey);
  if (!resolved.startsWith(path.resolve(sourceDir) + path.sep)) {
    throw new Error(`unsafe storage key: ${storageKey}`);
  }
  return resolved;
}

async function main() {
  const sourceFlag = process.argv.indexOf("--copy-from");
  const sourceDir =
    sourceFlag >= 0 && process.argv[sourceFlag + 1]
      ? path.resolve(process.argv[sourceFlag + 1])
      : null;
  const applications = await prisma.kycApplication.findMany({
    select: { id: true, userId: true, storageKey: true },
  });
  const expected = applications.filter(
    (application) => application.storageKey !== "THAI_ID_METHOD",
  );

  const copied = [];
  if (sourceDir) {
    for (const application of expected) {
      const destination = absolutePath(application.storageKey);
      if (fs.existsSync(destination)) continue;
      const source = safeSourcePath(sourceDir, application.storageKey);
      if (!fs.existsSync(source)) continue;
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.copyFile(
        source,
        destination,
        fs.constants.COPYFILE_EXCL,
      );
      copied.push(application.storageKey);
    }
  }

  const files = await walkFiles(STORAGE_DIR);
  const fileSet = new Set(files);
  const keySet = new Set(expected.map((item) => item.storageKey));
  const missing = expected.filter((item) => !fileSet.has(item.storageKey));
  const orphanFiles = files.filter((file) => !keySet.has(file));

  process.stdout.write(
    `${JSON.stringify(
      {
        storageDir: STORAGE_DIR,
        databaseDocuments: expected.length,
        filesOnDisk: files.length,
        copied,
        missing,
        orphanFiles,
      },
      null,
      2,
    )}\n`,
  );
  if (missing.length > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
