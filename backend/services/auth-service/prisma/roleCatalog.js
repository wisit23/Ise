const ROLE_CATALOG = Object.freeze([
  ["role-buyer", "BUYER"],
  ["role-seller", "SELLER"],
  ["role-customer-service", "CUSTOMER_SERVICE"],
  ["role-admin", "ADMIN"],
  ["role-trust-and-safety", "TRUST_AND_SAFETY"],
  ["role-marketing", "MARKETING"],
  ["role-executive", "EXECUTIVE"],
]);

async function seedRoleCatalog(prisma) {
  await Promise.all(
    ROLE_CATALOG.map(([id, code]) =>
      prisma.roleDefinition.upsert({
        where: { code },
        update: {},
        create: { id, code },
      }),
    ),
  );
}

module.exports = { ROLE_CATALOG, seedRoleCatalog };
