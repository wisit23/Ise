# Chat Platform Feature Teach Me

## Round `CHAT-001` — "Healthy" ไม่เท่ากับ "ใช้งานได้"

Docker Compose healthcheck ของ Mongo เดิมทีตั้งใจแค่เช็คว่า `mongod` process รับ connection ได้
(`mongosh --eval "db.runCommand('ping').ok"`) แต่ mongod ตอบ ping ได้ **ตั้งแต่ก่อน
`rs.initiate()` รัน** — ถ้าใช้ healthcheck นั้น `chat-service` จะเริ่มต่อ Mongo ก่อนที่ replica
set จะมี primary จริง แล้ว write แรกจะพังด้วย "not primary" ทั้งที่ container สถานะ "healthy"

แก้โดยเปลี่ยน healthcheck เป็น `rs.status().ok` แทน — คำสั่งนี้คืน error (ไม่ใช่ `false`) จนกว่า
replica set จะ initiate แล้วมี primary จริง ทำให้ "healthy" แปลว่า "usable" จริง ๆ

**Teach-back:** ทำไม `db.runCommand('ping').ok` ถึงไม่พอที่จะพิสูจน์ว่า Mongo พร้อมรับ write
จากแอปแล้ว?

## Round `CHAT-001` — GitHub Actions `services:` ทำ post-start command ไม่ได้

Postgres ใน CI ใช้ `services:` block ของ GitHub Actions ได้ตรง ๆ เพราะไม่ต้องมี setup อะไรหลัง
container start (`pg_isready` healthcheck พอ) แต่ Mongo replica set ต้องมีคนสั่ง `rs.initiate()`
**หนึ่งครั้งหลัง** container พร้อม ซึ่ง `services:` schema ของ GitHub Actions ไม่มีช่องให้ระบุ
post-start command เลย (มีแค่ `image`/`env`/`ports`/`options` สำหรับ `docker create` flags)

ทางแก้ที่ใช้ได้จริงคือไม่ใช้ `services:` สำหรับ Mongo แต่รัน `docker run -d` เป็น step ปกติแทน
แล้ว `docker exec` สั่ง `rs.initiate()` ต่อในอีก step — เสียความสวยงามของ `services:` (auto
lifecycle, auto networking ผ่าน `localhost`) แต่ยังใช้ `localhost:27017` ได้เพราะ `docker run -p`
publish port แบบเดียวกับ `services:` ทำให้

**Teach-back:** ทำไม container ที่ต้องมี setup step หลัง start (เช่น replica set init, seed
data ที่ผูกกับ runtime state) ถึงไม่เหมาะกับ GitHub Actions `services:` block?

## Round `CHAT-001` — Health check ที่ไม่ ping จริง คือ health check ปลอม

`chat-service`/health เดิม (ก่อน `CHAT-001`) ตอบ `{status:"ok"}` แบบไม่แตะฐานข้อมูลเลย เหมือน
ทุก service อื่นในระบบตอนเริ่มต้น (`support-service`/health ก็ทำแบบนี้ และ test ของมันบอกตรง ๆ
ว่า "returns 200 ok **without needing a database**") ซึ่งใช้ได้สำหรับ service ที่ผ่านการพิสูจน์
DB connectivity ด้วย integration test ชุดอื่นอยู่แล้ว

แต่ `CHAT-001` **คือ** งานพิสูจน์ DB connectivity เอง — ถ้า health check ไม่ ping Mongo จริง จะไม่มี
ทางรู้เลยว่า replica set/`directConnection` URL ถูกต้องจนกว่าจะไปเจอตอน `CHAT-002` เขียน endpoint
แรกแล้วพัง เปลี่ยนให้ `/health` เรียก `prisma.$runCommandRaw({ping:1})` จริง แล้วคืน `503` เมื่อพัง
ทำให้ Docker healthcheck ของ `chat-service` เองก็พลอยตรวจ Mongo connectivity ไปด้วยในตัว

**Teach-back:** เมื่อไหร่ health check "ตอบ ok เสมอ" ถึงเป็นทางเลือกที่ดี และเมื่อไหร่ถึงเป็นการ
ซ่อนปัญหา?

## Round `CHAT-003` — `field: null` ใน Prisma MongoDB ไม่เหมือน `null` ใน MongoDB ดิบ

`Message.deletedAt` เป็น `DateTime?` (optional) โดยไม่มี `@default` เมื่อสร้าง Message โดยไม่ระบุ
`deletedAt` เลย Prisma **ไม่เขียน field นั้นลง document เลย** (ไม่ใช่เขียนเป็น BSON `null`) —
ตรวจสอบด้วย `$runCommandRaw({find: ...})` แล้วเห็น document ที่ไม่มี key `deletedAt` อยู่จริง

แต่ทุก read path (`listPage`, `countUnread`) filter ด้วย `deletedAt: null` เพื่อไม่เอาข้อความที่
ถูกลบ ปัญหาคือ Prisma's MongoDB connector แปล filter `field: null` เป็น "field มีอยู่จริงและ
เท่ากับ null" ไม่ใช่ "field ไม่มีอยู่เลย OR เท่ากับ null" แบบที่ MongoDB query ดิบทำ (raw Mongo
`{field: null}` match ทั้งสองกรณี) ผลคือ **ข้อความทุกอันมองไม่เห็นตัวเองทันทีหลังสร้าง** — ส่ง
สำเร็จ (`201`) แต่ list กลับมา 0 รายการ

แก้โดยเขียน `deletedAt: null` ชัดเจนตอน `create()` เสมอ ไม่พึ่ง schema default

**Teach-back:** ทำไม field ที่ "ไม่ได้ใส่ค่า" กับ field ที่ "ใส่ค่าเป็น null ชัดเจน" ถึงเป็นคนละ
เรื่องกันใน MongoDB และทำไม Prisma's MongoDB connector ถึงเลือกไม่ทำให้สองอย่างนี้เหมือนกัน
(ต่างจาก Prisma's PostgreSQL connector ที่ column ที่ไม่ใส่ค่ากับ `NULL` เป็นเรื่องเดียวกันเสมอ)?

## Round `CHAT-003` — Concurrency test ต้องมี Index จริงถึงจะพิสูจน์อะไรได้

ระหว่างรัน test suite ทั้งชุดกับฐานข้อมูลใหม่ (สร้างเพื่อทดสอบเท่านั้น ไม่เคยรัน
`npx prisma db push`) test "สร้างห้องพร้อมกัน 2 request ต้องได้ห้องเดียว" **fail** — สอง request
ได้ id คนละอัน ตรวจสอบแล้วพบว่าฐานข้อมูลนั้นไม่มี unique index บน `contextKey` เลย (เพราะไม่เคย
push schema) MongoDB เลยยอมให้มี document ซ้ำ `contextKey` สองอัน โค้ด application (การจับ
`P2002` แล้ว fallback ไปหา existing) ไม่เคยถูกเรียกเลยเพราะไม่มี error เกิดขึ้นตั้งแต่แรก

พอ `db push` ให้ index จริงแล้วรันซ้ำ — ผ่านทันที นี่คือเหตุผลเดียวกับที่ `CHAT-001`'s Dockerfile
`CMD` และ CI ต้องรัน `prisma db push` **ก่อน** server เริ่มทำงานหรือก่อนรัน test เสมอ — ไม่ใช่
แค่ "ทำความสะอาด" แต่เป็นเงื่อนไขที่ correctness ของ concurrency logic พึ่งพาอยู่จริง

**Teach-back:** ทำไม test ที่ "ผ่าน" กับฐานข้อมูลที่ไม่มี schema/index ถึงไม่ได้พิสูจน์อะไรเกี่ยวกับ
ความถูกต้องของโค้ดเลย แม้ assertion จะเขียนถูกต้องทุกอย่าง?

## Round `CHAT-004` — Mock ที่คืนค่าใหม่ทุกครั้งทำให้ effect loop เงียบ ๆ

`chat.test.js` mock `next/navigation`'s `useRouter` แบบ `useRouter: () => ({push: mockPush})` —
สร้าง object literal **ใหม่ทุกครั้ง** ที่ถูกเรียก หน้า `/chat` มี `useEffect(..., [router])` ที่พึ่ง
`router` เป็น dependency พอ router เป็น object ใหม่ทุก render → effect คิดว่า dependency เปลี่ยน
→ รันซ้ำทุก render → เรียก `listConversations` ซ้ำ → ใช้ `mockResolvedValueOnce` ที่ตั้งไว้ครั้งเดียว
หมดตั้งแต่รอบแรก → รอบสองได้ `undefined` แทน Promise → `.then` พังทันที

Test error message ("Cannot read properties of undefined (reading 'then')") ชี้ไปที่โค้ด
`listConversations(token).then(...)` แต่ปัญหาจริงอยู่ที่ **mock** ไม่ใช่ implementation — ยืนยันด้วย
debug script แยกที่เรียก `listConversations` ตรง ๆ กับ mock เดียวกันแล้วทำงานถูกต้อง (เพราะไม่มี
React effect loop มาเกี่ยวข้อง) แก้โดยยก `mockRouter` เป็น object คงที่นอกฟังก์ชัน (Next.js ของจริง
`useRouter()` คืน reference เดิมเสมอ ปัญหานี้เกิดเฉพาะใน test เท่านั้น)

**Teach-back:** ทำไม mock ที่ "ดูเหมือนถูกต้อง" (คืนค่าที่ shape ตรงกับของจริงทุกอย่าง) ถึงยังทำให้
component พังได้ ถ้า reference identity ของมันไม่เสถียร?

## Round `CHAT-004` — Component ที่รับ callback prop ต้องกัน rejection เอง

`MessageComposer`'s `submit()` เรียก `await onSend(trimmed)` โดยไม่มี `catch` — ถ้า `onSend` ที่
Caller ส่งมา reject (เช่น network error) exception จะหลุดออกจาก async function โดยไม่มีใครจับ
กลายเป็น unhandled rejection ทั้งที่ Composer ควรจะทนต่อความล้มเหลวของ Caller ได้ ไม่ใช่พังตาม

จริง ๆ แล้วหน้า `/chat/[id]` (Caller ตัวจริง) จับ error ไว้เองอยู่แล้วใน `handleSend` ไม่เคย throw
กลับมา — แต่นั่นคือรายละเอียดการ implement ของ Caller **หนึ่งเดียว** ไม่ใช่ contract ที่ Component
Reusable ควรพึ่งพา วันหนึ่งมีคนเอา `MessageComposer` ไปใช้ที่อื่นแล้วลืม catch เอง ก็จะพังทันที
แก้โดยให้ Component จับ error ของตัวเองเสมอ ไม่ว่า Caller จะทำพลาดหรือไม่

**Teach-back:** ทำไม Component ที่รับ callback prop (`onSend`, `onSubmit`, ฯลฯ) ถึงไม่ควรเชื่อว่า
Caller จะจัดการ error ให้เสมอ แม้ Caller ตัวเดียวที่มีอยู่ตอนนี้จะทำแบบนั้นจริง ๆ?

## Round `CHAT-005` — "Trusted Caller" ไม่ได้แปลว่า "ใช้กฎเดียวกับ Public"

Internal API's `sendMessage` เขียนข้อความโดย**ไม่เช็ค** participant หรือสถานะ `LOCKED` เลย ในขณะที่
Public API's `sendMessage` เช็คทั้งคู่เข้มงวด นี่ไม่ใช่ความสะเพร่า — เป็นการตัดสินใจที่ตั้งใจ:
SYSTEM message (เช่น "จัดส่งแล้ว") ต้องส่งเข้าห้องได้เสมอแม้ Admin จะล็อกห้องนั้นไว้เพราะมีการ
Report เพราะ `LOCKED` มีไว้บล็อก**คนคุยกันเอง**ไม่ให้ส่งข้อความเพิ่มระหว่างตรวจสอบ ไม่ได้มีไว้บล็อก
Notification จาก Order/Support ที่เป็นข้อเท็จจริงของระบบ

แต่ "Internal ไม่เช็คอะไรเลย" ก็อันตรายถ้าคิดผิดทาง — สิ่งที่ทำให้ปลอดภัยไม่ใช่การไม่เช็ค แต่เป็น
**ชั้นที่มาก่อนมัน**: `requireInternalToken` middleware บล็อกทุกอย่างที่ไม่มี Token ถูกต้องไว้ตั้งแต่
ก่อนถึง Controller และ Internal API ไม่ได้ต่อผ่าน Gateway เลย (ไม่มี Proxy Route ให้ยิงจาก
ภายนอก) — Trust Boundary อยู่ที่ "ใครเรียกได้" ไม่ใช่ "เรียกแล้วทำอะไรได้" การเช็ค 2 ชั้นนี้เป็นคนละ
เรื่องกัน และ `sendMessage` ฝั่ง Internal พึ่งชั้นแรกเต็มที่แทนที่จะพึ่งชั้นที่สอง

**Teach-back:** ทำไม "Endpoint นี้เชื่อถือ Caller ได้ ไม่ต้องเช็ค Authorization ซ้ำ" ถึงต้องพิสูจน์
ว่า Endpoint นั้น**เข้าถึงไม่ได้จากที่ไม่น่าเชื่อถือเลย** ก่อน ไม่ใช่แค่ "เรามี Header ลับ" เพียงอย่าง
เดียว?

## Round `CHAT-006` — "chat-service ทุก Test ผ่าน" ไม่เท่ากับ "Feature ใช้งานได้"

Backend ของ `CHAT-006` (Socket.IO server, Redis adapter, presence, broadcast) ทำเสร็จและมี
Integration Test ผ่านครบ 74 ตัวก่อนหน้านี้ในรอบทำงานเดียวกัน — แต่ตรวจดู `frontend/lib/chat.js`
แล้วพบว่า **ไม่มีโค้ด Socket เลยแม้แต่บรรทัดเดียว** หน้าห้องแชทยังเป็น Polling 4 วินาทีจาก
`CHAT-004` เหมือนเดิมทุกอย่าง Step 6 ของแผน ("Frontend เปลี่ยนจาก polling เป็น socket") ถูก
ข้ามไปโดยไม่มีใครสังเกตเพราะ Backend Test เขียวหมดแล้วดูเหมือนงานเสร็จ

Test ของ Backend พิสูจน์ได้แค่ว่า "ถ้ามีคนต่อ Socket เข้ามาถูกต้อง ระบบจะทำงานถูก" — มันพิสูจน์
ไม่ได้เลยว่า **มีใครต่อ Socket จริง** จาก Client ฝั่งที่ผู้ใช้จริงเห็น การเช็คไฟล์ตาม "Files" List
ของ Task ใน `plan.md` ทีละไฟล์ (ไม่ใช่แค่เช็คว่า Test สีเขียว) คือสิ่งที่จับ Gap นี้ได้

**Teach-back:** ทำไม Backend Integration Test ที่ผ่านครบ 100% ถึงไม่ใช่หลักฐานว่า Feature ที่ผู้ใช้
สัมผัสได้ทำงานจริง และควรเช็คอะไรเพิ่มถึงจะรู้ว่า Frontend ต่อกับ Backend ที่สร้างไว้จริง ๆ?

## Round `CHAT-006` — เปรียบเทียบ "ผ่าน" กับ "ผ่านผ่าน Gateway" คือคนละการทดสอบ

`socket.io-client` ต่อตรงไปที่ `chat-service` (ข้าม Gateway) รองรับ 2 Client พร้อมกันได้สมบูรณ์แบบ
ทุกครั้ง — ถ้าหยุดตรวจแค่ตรงนี้ก็จะสรุปผิดว่า Realtime Layer "ใช้งานได้แล้ว" ทั้งที่ระบบจริงต้อง
วิ่งผ่าน Gateway เสมอ (Path การเชื่อมต่อจริงของผู้ใช้) พอทดสอบผ่าน Gateway ถึงเจอว่า Proxy Library
เองมีปัญหาเรื่อง Concurrency ที่ chat-service ไม่มีส่วนเกี่ยวข้องเลย

บทเรียนคือ: **ต้องทดสอบ Path เดียวกับที่ผู้ใช้จริงจะเดิน ไม่ใช่ Path ที่ทดสอบง่ายที่สุด** ถ้า
Component A คุยกับ B ผ่าน Proxy/Gateway เสมอในระบบจริง การทดสอบ A↔B ตรง ๆ (ข้าม Proxy) พิสูจน์ได้
แค่ว่า A กับ B ถูกต้อง ไม่ได้พิสูจน์ว่าทั้งระบบถูกต้อง

**Teach-back:** ทำไมการทดสอบสอง Component ที่ "คุยกันตรง ๆ ได้ถูกต้อง" ถึงไม่พอที่จะสรุปว่า
ระบบทั้งชุดที่มี Proxy/Gateway คั่นกลางจะทำงานถูกต้องด้วย?

## Round `CHAT-006` — Library ที่นิยมใช้กันทั่วไป ก็ยังมี Concurrency Bug ได้

`http-proxy-middleware` เป็น Library มาตรฐานที่ใช้ทำ Reverse Proxy ใน Node.js กันแพร่หลายมาก และ
`http-proxy` (ที่มันครอบอยู่) ก็เป็น Library เก่าแก่ที่คนใช้กันเป็นสิบปี — แต่ทั้งคู่ทำ Response
เสียหายเมื่อ Proxy WebSocket Upgrade สองอันพร้อมกันไปยัง Target เดียวกัน ในสถานการณ์ที่ค่อนข้าง
ธรรมดา (สอง Client ต่อพร้อมกัน) ซึ่งเป็นสิ่งที่ระบบแชทของจริงต้องเจอตลอดเวลา

เมื่อ Library มาตรฐานพังในจุดที่ควรจะเป็นเรื่องพื้นฐาน ทางแก้ที่ปลอดภัยที่สุดไม่ใช่ไล่หา Library
ตัวใหม่ไปเรื่อย ๆ (ลองไปแล้ว 3 แบบ) แต่คือการเข้าใจว่า WebSocket Proxy ที่ Layer ต่ำสุดคืออะไร —
มันคือการเปิด TCP Connection ใหม่ไปยัง Target แล้ว Forward Byte ไปกลับ ซึ่งเขียนเองด้วย Node's
`net` module ได้ไม่กี่สิบบรรทัด และเมื่อเขียนเอง **ไม่มี Shared State ให้ Concurrency ทำลาย** —
ทุก Upgrade ได้ Connection อิสระของตัวเอง

**Teach-back:** เมื่อไหร่ที่ "เขียนเองแทนใช้ Library" เป็นทางเลือกที่สมเหตุสมผล และอะไรคือสัญญาณ
บอกว่าถึงเวลานั้นแล้ว?

## Round `CHAT-006` — Anonymous Docker Volume บัง node_modules ใหม่หลัง Rebuild

เพิ่ม `socket.io-client` ใน `frontend/package.json` แล้ว `docker compose up -d --build frontend`
— Build สำเร็จ (เห็น `npm install` รันใหม่ใน Build Log) แต่ Container ที่รันจริงกลับไม่มี
`socket.io-client` ใน `node_modules` เลย ทำให้ Next.js Error "Module not found"

สาเหตุ: `docker-compose.yml`'s `frontend` Service มี Anonymous Volume
`- /app/frontend/node_modules` (มีไว้กัน Bind Mount `./frontend:/app/frontend` ทับ
`node_modules` ที่ Build ไว้ใน Image) แต่ Anonymous Volume **อยู่ข้าม Container Recreation** —
พอ Rebuild Image ใหม่ Docker Compose สร้าง Container ใหม่แต่ยังใช้ Volume **เก่า** ที่มี
`node_modules` จากการ Build ครั้งก่อนอยู่ ทำให้ของใหม่ใน Image ถูกซ่อนไปเลย

แก้ด้วย `docker compose up -d --build --force-recreate -V frontend` — Flag `-V` สั่งให้ Renew
Anonymous Volume ของ Container ที่ถูก Recreate ด้วย ไม่ใช่แค่ `--build` เฉย ๆ

**Teach-back:** ทำไม Anonymous Volume ถึง "อยู่รอด" ข้าม `docker compose up --build` ทั้งที่
Image ถูก Build ใหม่ทั้งก้อน และเมื่อไหร่ที่ Pattern การกัน Bind-Mount-ทับ-node_modules แบบนี้
จะกลายเป็นดาบสองคม?
