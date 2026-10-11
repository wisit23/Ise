const test=require("node:test"),assert=require("node:assert/strict");
const {main}=require("../prisma/migrate");
test("migration refuses an existing database without the canonical baseline, including a legacy ledger",async()=>{
 const previous=process.env.DATABASE_URL;process.env.DATABASE_URL="postgresql://fixture:fixture@127.0.0.1:1/guard_only";
 try{for(const tables of [["orders"],["products"],["orders","_prisma_migrations"],["_prisma_migrations"]]){
  let writes=0;const db={$queryRaw:async(strings)=>strings.join("").includes("information_schema")?tables.map(table_name=>({table_name})):[],$disconnect:async()=>{},$executeRaw:async()=>{writes++;}};
  await assert.rejects(main(db),/cutover BLOCKED/);assert.equal(writes,0);
 }}finally{if(previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous;}
});
