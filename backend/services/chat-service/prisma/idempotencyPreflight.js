require("dotenv").config();
const {PrismaClient}=require("../src/generated/prisma-client");
async function preflight(db,{apply=false}={}){
 const result=await db.$runCommandRaw({aggregate:"Message",pipeline:[{$match:{idempotencyKey:{$type:"string"}}},{$group:{_id:"$idempotencyKey",count:{$sum:1}}},{$match:{count:{$gt:1}}},{$count:"duplicateGroups"}],cursor:{batchSize:1}});
 const duplicateGroups=result.cursor.firstBatch[0]?.duplicateGroups || 0;
 const missingQuery={$or:[{idempotencyKey:{$exists:false}},{idempotencyKey:null}]};
 const missingCount=(await db.$runCommandRaw({count:"Message",query:missingQuery})).n;
 if(duplicateGroups){const error=new Error("Chat cutover blocked: duplicate idempotency keys require an explicit mapping; existing messages are preserved");error.summary={missingKeys:missingCount,duplicateGroups:duplicates.length};throw error;}
 if(apply)await db.$runCommandRaw({update:"Message",updates:[{q:missingQuery,u:[{$set:{idempotencyKey:{$concat:["legacy-message:",{$toString:"$_id"}]}}}],multi:true}]});
 return {missingKeys:missingCount,duplicateGroups:0,applied:apply,readyForIndex:apply || missingCount===0};
}
if(require.main===module){const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL_CHAT || process.env.DATABASE_URL}}});preflight(db,{apply:process.argv.includes("--apply")}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);if(e.summary)console.error(JSON.stringify(e.summary));process.exitCode=1;}).finally(()=>db.$disconnect());}
module.exports={preflight};
