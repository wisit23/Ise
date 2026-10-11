require("dotenv").config();
const {spawnSync}=require("node:child_process"),path=require("node:path");
const prisma=require("../src/models/prismaClient");
const BASELINE="20261011000000_unified_order_baseline";
async function main(db = prisma){
 if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
 const tables=await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`;
 const names=new Set(tables.map(row=>row.table_name));
 let known=false;
 if(names.has("_prisma_migrations")){const applied=await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE migration_name=${BASELINE} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;known=applied.length>0;}
 if(!known && names.size>0)throw new Error("Order cutover BLOCKED: existing database requires a reviewed, complete mapping of address IDs, payment history and dispute types, preserving every legacy record. Do not baseline or db push this database. Use a new empty database for migration rehearsal.");
 await db.$disconnect();
 const result=spawnSync(process.execPath,[require.resolve("prisma/build/index.js"),"migrate","deploy"],{cwd:path.resolve(__dirname,".."),stdio:"inherit"});
 if(result.error)throw result.error;if(result.status!==0)throw new Error("Order migration deploy failed");
}
if(require.main===module)main().catch(error=>{console.error("[order-migrate]",error.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
module.exports={main};
