// Run only when authoring a NEW migration. Never rewrite an applied migration.
const fs = require("node:fs");
const path = require("node:path");
const { REFERENCE_MODELS } = require("../backend/shared/src/referenceCodes");
const ROOT = path.resolve(__dirname, "..");
const MIGRATION = "20261024150000_add_reference_codes";

function migrationSql(entries) {
  return `-- Additive reference IDs: primary keys, tokens and foreign keys are unchanged.
-- Reservations and the entity insert share the caller's transaction. ON CONFLICT
-- retries without aborting it; deleted entities do not make their codes reusable.
CREATE TABLE "_reference_codes" (
  "code" TEXT PRIMARY KEY,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION reloop_allocate_reference(prefix TEXT) RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  positions CONSTANT INTEGER[] := ARRAY[0,1,2,3,4,5,9,10,11,12,13,14];
  entropy BYTEA;
  body TEXT;
  candidate TEXT;
  claimed TEXT;
  attempt INTEGER;
  i INTEGER;
BEGIN
  FOR attempt IN 1..5 LOOP
    entropy := uuid_send(gen_random_uuid());
    body := '';
    -- Exclude the UUID version/variant bytes. Each selected byte is uniform;
    -- modulo 32 is unbiased because 32 divides 256 exactly (60 random bits).
    FOR i IN 1..12 LOOP
      body := body || substr(alphabet, (get_byte(entropy, positions[i]) % 32) + 1, 1);
    END LOOP;
    candidate := prefix || '-' || substr(body,1,4) || '-' || substr(body,5,4) || '-' || substr(body,9,4);
    claimed := NULL;
    INSERT INTO "_reference_codes" (code) VALUES (candidate)
      ON CONFLICT DO NOTHING RETURNING code INTO claimed;
    IF claimed IS NOT NULL THEN RETURN claimed; END IF;
  END LOOP;
  RAISE EXCEPTION 'Reference code allocation exhausted' USING ERRCODE = 'P0001';
END;
$$;
CREATE FUNCTION reloop_assign_reference() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Ignore externally supplied codes: only this database assigns identity.
    NEW.reference_code := reloop_allocate_reference(TG_ARGV[0]);
  ELSIF OLD.reference_code IS NULL THEN
    NEW.reference_code := reloop_allocate_reference(TG_ARGV[0]);
  ELSIF NEW.reference_code IS DISTINCT FROM OLD.reference_code THEN
    RAISE EXCEPTION 'reference_code is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
${entries
  .map(
    ({ table, prefix }) => `
ALTER TABLE "${table}" ADD COLUMN "reference_code" TEXT;
CREATE UNIQUE INDEX "${table}_reference_code_key" ON "${table}"("reference_code");
ALTER TABLE "${table}" ADD CONSTRAINT "${table}_reference_code_format"
  CHECK (reference_code ~ '^${prefix}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$');
CREATE TRIGGER "${table}_assign_reference" BEFORE INSERT OR UPDATE ON "${table}"
  FOR EACH ROW EXECUTE FUNCTION reloop_assign_reference('${prefix}');
`,
  )
  .join("")}`;
}

function main() {
  for (const [service, models] of Object.entries(REFERENCE_MODELS)) {
    const dir = path.join(
      ROOT,
      "backend/services",
      `${service}-service/prisma`,
    );
    const schemaPath = path.join(dir, "schema.prisma");
    let schema = fs.readFileSync(schemaPath, "utf8");
    const entries = [];
    for (const [model, prefix] of Object.entries(models)) {
      const expression = new RegExp(
        `model ${model} \\{([\\s\\S]*?)\\n\\}`,
        "g",
      );
      let found = false;
      schema = schema.replace(expression, (block, fields) => {
        found = true;
        const table = /@@map\("([^"]+)"\)/.exec(fields)?.[1] || model;
        entries.push({ model, table, prefix });
        if (/\breferenceCode\s/.test(fields))
          throw new Error(`${model} already has referenceCode`);
        const field =
          service === "chat"
            ? '  referenceCode String? @map("reference_code")'
            : '  referenceCode String? @unique @default(dbgenerated()) @map("reference_code")';
        return `model ${model} {\n${field}${fields}\n}`;
      });
      if (!found) throw new Error(`Missing model ${model}`);
    }
    if (service !== "chat") {
      const migrationDir = path.join(dir, "migrations", MIGRATION);
      fs.mkdirSync(migrationDir, { recursive: true });
      const sqlPath = path.join(migrationDir, "migration.sql");
      fs.writeFileSync(sqlPath, migrationSql(entries), { flag: "wx" });
      schema +=
        '\n// Allocated atomically by the reference-code triggers; never reuse deleted codes.\nmodel ReferenceCodeAllocation {\n  code String @id\n  createdAt DateTime @default(now()) @map("created_at")\n  @@map("_reference_codes")\n}\n';
    }
    fs.writeFileSync(schemaPath, schema);
    console.log(`${service}: ${entries.length} reference-code models`);
  }
}
if (require.main === module) main();
module.exports = { migrationSql };
