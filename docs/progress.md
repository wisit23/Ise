# RE-LOOP Progress

เอกสารนี้แสดงเฉพาะ Task ที่ลงมือทำแล้วและมีหลักฐานอยู่ใน Repository โดยแยกเนื้อหาทีละ Task

## Task `FOUND-001` — สร้างมาตรฐานการติดตั้งและตรวจโครงการ

> วันที่ทำ: 2026-07-28
>
> สถานะตามหลักฐาน: ลงมือทำและตรวจด้วย AI Reviewer แล้ว 2 รอบ
>
> หมายเหตุ: สถานะนี้ไม่ใช่การยืนยันว่า Acceptance Criteria ผ่านครบทุกข้อ

### งานที่ทำ

1. กำหนดให้โครงการใช้ Node.js 22 และ npm 10 ขึ้นไปผ่าน `.nvmrc`, `.npmrc` และ `package.json`
2. ปรับ Dockerfile ทั้ง 7 ไฟล์จาก Node.js 20 เป็น Node.js 22
3. สร้าง `package-lock.json` สำหรับล็อก Dependency ของ npm workspace บนเครื่องพัฒนา
4. เพิ่ม ESLint และ Prettier พร้อมคำสั่ง `lint`, `lint:fix`, `format` และ `format:check`
5. เพิ่ม `.dockerignore` เพื่อตัดไฟล์ที่ไม่จำเป็นออกจาก Docker build context
6. เพิ่ม `requireEnv()` และเชื่อมกับ `gateway` และ `auth-service` เพื่อให้ Service หยุดก่อนเปิด Port เมื่อค่าที่จำเป็นหาย
7. อัปเดต `README.md` และ `.env.example` ให้ตรงกับวิธีติดตั้งและคำสั่งที่เพิ่ม
8. แก้ข้อค้นพบจาก AI Review รอบแรกและส่งให้ Reviewer ตรวจซ้ำรอบที่สอง

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                     | ผลที่เกิดขึ้นจริง                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `docker compose config --quiet`                             | ผ่าน                                                                                                 |
| `npm ci --dry-run`                                          | Lockfile ตรงกับ npm workspace manifests                                                              |
| `npm run format:check`                                      | ผ่าน                                                                                                 |
| `node --check` สำหรับ Backend CommonJS 24 ไฟล์              | ผ่าน 24/24                                                                                           |
| ESLint parse สำหรับ Frontend ES modules 7 ไฟล์              | อ่านและตรวจไฟล์ได้                                                                                   |
| `npm run lint`                                              | ทำงานสำเร็จ แต่คืน Exit 1 เพราะพบ Lint error ใน Application Code เดิม 7 จุด                          |
| Build image `auth-service`                                  | สำเร็จ                                                                                               |
| Build image `frontend`                                      | สำเร็จ                                                                                               |
| ตรวจ Node.js ใน Container                                   | ได้ `v22.23.1`                                                                                       |
| รัน `auth-service` โดยไม่ใส่ Environment Variable ที่จำเป็น | Service หยุดก่อนเปิด Port และแจ้งชื่อค่าที่ขาด                                                       |
| `npm audit --audit-level=high`                              | พบช่องโหว่ระดับสูงจาก Dependency ทางอ้อม 8 รายการ                                                    |
| AI Review รอบที่ 1                                          | พบ 12 ประเด็น และมีการแก้ตามข้อค้นพบ                                                                 |
| AI Review รอบที่ 2                                          | ตรวจซ้ำข้อค้นพบเดิม 12 ข้อ โดยยืนยันได้ 11 ข้อ และพบข้อจำกัดเรื่อง Lockfile ใน Container เพิ่ม 1 ข้อ |

### ผลลัพธ์ปัจจุบัน

- เครื่องพัฒนาและ Dockerfile ระบุ Node.js รุ่นหลักตรงกัน
- npm workspace มี Lockfile สำหรับติดตั้ง Dependency ซ้ำ
- ทีมมีคำสั่งตรวจ Lint และ Format จาก Root ของ Repository
- `gateway` และ `auth-service` ตรวจค่าที่จำเป็นก่อนเริ่มรับ Request
- Docker build context ไม่รวมไฟล์ที่ไม่จำเป็นตาม `.dockerignore`
- หลักฐานและข้อค้นพบจากการตรวจถูกบันทึกไว้ใน [`changelog.md`](changelog.md)
- Commit `a0dc070` (2026-07-28) — ผู้ใช้สั่งให้ Commit และ Push ขึ้น `origin/main` หลังเห็นผล AI Review ทั้งสองรอบ ถือเป็นการอนุมัติของมนุษย์ตามที่ Task Contract กำหนด (ไม่มี Reviewer มนุษย์คนอื่นแยกต่างหาก เพราะเป็นทีมคนเดียว + AI ในขณะนี้)
- **แก้ไขภายหลัง (ระหว่างทำ `FOUND-002`):** ข้อค้นพบ Lint เดิม 7 จุดที่บันทึกไว้ว่า "Pre-existing" จริงๆ แล้วมีแค่ 3 จุดที่เป็นปัญหาจริง (`catch (err)` ไม่ได้ใช้ `err`) ส่วนอีก 4 จุด (`Link`/`NavBar` import) เป็น False Positive จาก `eslint.config.js` เองที่ยังไม่รู้จัก JSX Component Usage — แก้ที่ Config ด้วย `eslint-plugin-react` แทนการลบ Import ที่ใช้งานจริง ตอนนี้ `npm run lint` ผ่านสนิท (Exit 0) ดูรายละเอียดที่ Task `FOUND-002` ด้านล่าง

### ไฟล์หลักที่เป็นหลักฐาน

- `.nvmrc`
- `.npmrc`
- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `.prettierignore`
- `.dockerignore`
- `backend/shared/src/env.js`
- `backend/gateway/src/server.js`
- `backend/services/auth-service/src/server.js`
- Dockerfile ทั้ง 7 ไฟล์
- `README.md`
- `.env.example`
- `docs/changelog.md`

## Task `FOUND-002` — สร้างระบบตรวจคุณภาพอัตโนมัติ (Test/Lint/Scan/CI)

> วันที่ทำ: 2026-07-28
>
> สถานะตามหลักฐาน: ลงมือทำ, จำลอง CI Pipeline ด้วยมือครบ, ยืนยันด้วย CI Run จริงบน GitHub Actions, ตรวจโดย AI Reviewer อิสระ 2 รอบ (รอบ 1 พบ 9 ประเด็น, รอบ 2 ยืนยันว่าแก้ครบตามที่ต้อง) — **ผลตรวจล่าสุด: APPROVED, สถานะหลักฐาน `Partially verified`**
>
> หมายเหตุ: `Partially verified` ไม่ใช่ `Verified` เพราะยังมี 4 ข้อที่เปิดไว้โดยตั้งใจ (ดูหัวข้อ Review รอบ 2): ยังไม่ยืนยันว่า Branch Protection เปิดใช้บังคับจริงบน `main` (ต้องมีสิทธิ์ Admin, Reviewer แนะนำว่าเป็นขั้นตอนสำคัญที่สุดที่เหลือ), ยังไม่มี Coverage Threshold บังคับ (ตัดสินใจไว้ตรงๆ ไม่ใช่ลืม), Secret Scanner ยังมีจุดบอดกับไฟล์ `.test.js`, และ `--experimental-test-coverage` ยังเป็น Flag ทดลองของ Node.js — Test ที่เขียนไว้ก็เป็นเพียง "หนึ่งชุดต่อชั้น" ตาม Scope ไม่ใช่ Test ครอบคลุมทุกกรณี (นั่นคืองานของ `TEST-001`/`TEST-002`)

### งานที่ทำ

1. เพิ่ม Test Framework: `node:test` (Built-in, ไม่มี Dependency เพิ่ม) สำหรับ Backend; Jest + Testing Library (ผ่าน `next/jest`) สำหรับ Frontend
2. เขียน Test "หนึ่งชุดต่อชั้น" เป็นหลักฐานว่าระบบต่อสายถูก: Unit (`backend/shared/src/jwt.test.js`), Integration ต่อฐานข้อมูลจริงแบบ Disposable (`backend/services/auth-service/test/register-login.integration.test.js`), Component (`frontend/app/page.test.js`), Smoke (`backend/gateway/src/app.test.js`, `backend/services/auth-service/src/app.test.js`)
3. แยก `backend/gateway/src/server.js` เป็น `app.js` (สร้าง Express App, Export ได้) กับ `server.js` (เรียก `requireEnv` แล้ว Listen) เพื่อให้ Test เรียก App ตรงๆ ได้โดยไม่ต้องเปิด Port จริง (Pattern เดียวกับ Service อื่นที่มีอยู่แล้ว)
4. เขียน `scripts/secretScan.js` (ไม่มี Dependency ภายนอก) สแกนไฟล์ที่ Track ใน Git หารูปแบบ Secret จริง พร้อม Test ของตัวมันเอง (`scripts/secretScan.test.js`) ที่ป้อน Secret ปลอมแล้วเช็คว่าจับได้ — ระหว่างเขียนพบ False Positive ของตัวเอง (จับ `token: refreshToken` ซึ่งเป็นแค่ชื่อตัวแปรว่าเป็น Secret) แก้แล้วก่อนใช้งานจริง
5. เพิ่ม Coverage Reporting: `node --test --experimental-test-coverage` (Backend), `jest --coverage` (Frontend) — ไม่ได้ตั้ง Coverage Threshold แบบบังคับ เพราะ Coverage จริงตอนนี้ยังต่ำ (Business Logic ส่วนใหญ่ยังไม่มี Test) การตั้ง Threshold ตอนนี้จะหลอกตัวเองหรือไม่ก็ต้องตั้งต่ำจนไม่มีความหมาย — ปล่อยให้ `TEST-001`/`TEST-002` เป็นคนตั้งเมื่อ Coverage มีความหมายจริง
6. เพิ่ม `.github/workflows/ci.yml` — รัน Lint, Format check, Secret scan, `npm audit` (ไม่บังคับผ่าน — เป็น Debt ที่รู้ตัวแล้วจาก `FOUND-001`), Backend/Frontend test พร้อม Coverage, และ `docker compose config --quiet` ทุกครั้งที่ Push/PR เข้า `main` โดยสร้าง Postgres Service Container แยกต่างหากสำหรับ Test เท่านั้น (ไม่แตะข้อมูล Dev/Prod)
7. **แก้ Lint Gate ให้ผ่านจริง:** ระหว่างทำพบว่า 4 ใน 7 ข้อค้นพบเดิมจาก `FOUND-001` เป็น False Positive ของ ESLint Config เอง (ไม่รู้จักการใช้ Component ผ่าน JSX) แก้ที่ Config ด้วย `eslint-plugin-react`; อีก 3 ข้อที่เหลือเป็นปัญหาจริง (`catch (err)` ไม่ได้ใช้ตัวแปร) แก้เป็น `catch` เฉยๆ — ผลคือ `npm run lint` Exit 0 แล้วตอนนี้ (เดิมทำนายไว้ว่าจะเป็นภาระของ `FOUND-002`)
8. อัปเดต `.gitignore`, `.prettierignore`, `.dockerignore` ให้ยกเว้นโฟลเดอร์ `coverage/` ที่ Test สร้างขึ้น

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                     | ผลที่เกิดขึ้นจริง                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run lint`                                                              | **Exit 0** (แก้ครบทั้ง False Positive และปัญหาจริง)                                 |
| `npm run format:check`                                                      | ผ่าน                                                                                |
| `npm run secret-scan` (Local, ก่อน Commit)                                  | 0 พบ จาก 82 ไฟล์ที่ Track                                                           |
| CI Run จริงครั้งที่ 1 (`4d754ce`, ตรวจผ่าน GitHub Actions API)              | **Fail ที่ขั้น Secret scan** — เจอ False Positive จริง 6 จุด (ดูรายละเอียดด้านล่าง) |
| CI Run จริงครั้งที่ 2 (`de7b652`, แก้แล้ว)                                  | ดูผลจริงในหัวข้อ "การแก้ไขหลัง CI Run จริงล้มเหลว" ด้านล่าง (บันทึกทันทีที่ทราบผล)  |
| `npm test` (Backend: jwt/gateway/auth-service/scripts)                      | ผ่านทั้งหมด (ไม่มี Database: Integration Test Skip อย่างชัดเจน)                     |
| `npm test` พร้อม Postgres Container จริงที่สร้าง-ทดสอบ-ลบทิ้ง               | ผ่านทั้งหมดรวม Integration Test (Register→Login→Reject รหัสผิด ต่อฐานข้อมูลจริง)    |
| `npm run test:frontend`                                                     | ผ่าน 2/2 (Render Heading + Guest Nav Links)                                         |
| จำลองขั้นตอน CI ทั้งหมดจาก Root ตามลำดับเดียวกับ `.github/workflows/ci.yml` | ผ่านทุกขั้นตอนโดยไม่มีการแก้ไขเพิ่มหลังจำลองครั้งสุดท้าย                            |
| ทดสอบ Test ที่ตั้งใจให้ Fail                                                | รายงาน File/Line/Expected/Actual ชัดเจน, Exit Code 1 — ลบออกและยืนยัน Exit 0 กลับมา |
| YAML Syntax ของ `.github/workflows/ci.yml`                                  | ผ่าน (ตรวจด้วย `js-yaml`)                                                           |

### ผลลัพธ์ปัจจุบัน

- มี Test อัตโนมัติจริงครอบคลุม "หนึ่งชุดต่อชั้น" ตามที่ Scope ของ Task กำหนด ไม่ใช่ Test ครอบคลุมทุก Feature
- Lint Gate ผ่านจริงเป็นครั้งแรกของโปรเจกต์ (ไม่ใช่แค่ตั้งเครื่องมือไว้เฉยๆ)
- มี Secret Scanner ที่ทดสอบแล้วว่าจับ Secret ปลอมได้จริง — เจอ False Positive ของตัวเองผ่าน CI Run จริงครั้งแรก (ไม่ใช่ตอนทดสอบ Local) แก้ไขแล้วและยืนยันผ่าน CI Run จริงครั้งที่ 3 (`e929750`) ว่า Secret scan ผ่านสะอาด
- **CI Pipeline ที่ `.github/workflows/ci.yml` ผ่าน CI Run จริงครบทุก Step แล้ว (Run #3, Commit `e929750`, `id 30370166025`)** — ไม่ใช่แค่จำลองด้วยมือหรือคาดเดา: Checkout, Setup Node, Install, Lint, Format check, Secret scan, Dependency audit (Non-blocking ตามออกแบบ), Prisma generate/db push, Backend test, Frontend test, Compose config — เขียวทั้งหมด ตรวจผ่าน GitHub public API โดยตรง (`https://api.github.com/repos/wisit23/Ise/actions/runs/30370166025`)
- กว่าจะถึงจุดนี้ CI Run จริงล้มเหลว **2 ครั้งติดต่อกัน** ด้วยสาเหตุที่ Local Simulation จับไม่ได้ทั้งคู่ (ดูหัวข้อถัดไป) — เป็นหลักฐานว่าการจำลอง CI ด้วยมือไม่เท่ากับ CI Run จริง 100% (Run #4, Commit `949228c` แก้เฉพาะ Docs ก็ยัง Rerun และผ่านเขียวซ้ำ ยืนยันว่า Run #3 ไม่ใช่ความบังเอิญ)
- ยังไม่มี Coverage Threshold บังคับ (ตัดสินใจไว้ตรงๆ ไม่ใช่ลืม)
- ยังไม่ผ่านการตรวจจาก AI Reviewer อิสระเหมือน `FOUND-001` — เป็นขั้นตอนถัดไป

### การแก้ไขหลัง CI Run จริงล้มเหลว

CI Run จริงครั้งแรก (Commit `4d754ce`) **ล้มเหลวที่ขั้นตอน Secret scan** ทั้งที่ Local ก่อน Commit รายงานผ่าน — ตรวจสอบผ่าน GitHub public API (`gh` CLI ไม่มีในเครื่องนี้) เพราะไม่มีสิทธิ์ Admin ดึง Log เต็มได้ จึง Reproduce ปัญหาโดยรัน `node scripts/secretScan.js` ซ้ำ Local ทันที และเจอ False Positive จริง 6 จุดตรงกับที่ CI น่าจะเจอ:

1. `scripts/secretScan.test.js` เอง (ไฟล์ Fixture ที่จงใจใส่ Secret ปลอมทุกแบบเพื่อทดสอบว่า Scanner จับได้) ถูก Scanner สแกนตัวเองแล้ว Flag ตัวเอง
2. `backend/services/auth-service/test/register-login.integration.test.js` มี Password ทดสอบ (`"correct-horse-battery-staple"`, `"wrong-password"`) ที่ตรงรูปแบบ Generic Password Pattern ทั้งที่เป็นข้อมูลทดสอบ ไม่ใช่ Secret จริง

**แก้ไข:** ยกเว้น `scripts/secretScan.test.js` ออกจากการสแกนทั้ง Repository โดยเฉพาะ (เหตุผลเดียวกับที่ `.env.example` ได้รับการยกเว้น — เป็นไฟล์ตัวอย่างที่จงใจใส่ค่าปลอม) และข้าม Generic Pattern (แต่ไม่ข้าม Pattern ความมั่นใจสูงอย่าง Private Key/AWS Key) สำหรับไฟล์ที่ลงท้าย `.test.js` หรืออยู่ใน `test/` เพราะ Test จริงมีเหตุผลที่ต้องสร้าง String รูปแบบรหัสผ่านเพื่อทดสอบ

Commit `de7b652` แก้ไขแล้ว ยืนยันด้วย Unit Test 6 ข้อผ่านทั้งหมด และ Local Scan กลับมา 0 พบจาก 92 ไฟล์

**CI Run จริงครั้งที่ 2** (Commit `de7b652`, ตรวจผ่าน GitHub API เช่นกัน): Lint, Format check, **Secret scan (ผ่านแล้ว)**, Dependency audit, Prisma generate/db push, Backend test, Frontend test — **ผ่านหมด** เหลือ Fail จุดเดียวคือ **"Verify Docker Compose config"**

Root Cause: `docker-compose.yml` ใช้ `env_file: .env` ทุก Service ซึ่ง Docker Compose ต้องการให้ไฟล์ `.env` มีอยู่จริงบน Disk (ไม่ใช่แค่ตัวแปรข้างในว่างได้) — `.env` ถูก Gitignore ไว้ถูกต้องอยู่แล้ว (ไม่ควร Commit) จึงไม่มีในเครื่อง CI ที่เพิ่ง Checkout ใหม่ ส่วน Local ของผู้พัฒนาทุกคนมี `.env` อยู่แล้ว (สร้างจาก `cp .env.example .env` ตาม README) จึงไม่เคยเจอปัญหานี้ตอน Local — Reproduce สำเร็จโดยย้าย `.env` ออกชั่วคราวแล้วรัน `docker compose config --quiet` ซ้ำ ได้ Error ตรงกัน

**แก้ไข:** เพิ่ม Step `cp .env.example .env` ใน `.github/workflows/ci.yml` ก่อน Step ตรวจ Compose config — เป็นขั้นตอนเดียวกับที่ README บอกนักพัฒนาใหม่ให้ทำอยู่แล้ว ไม่ใช่ Hack ใหม่ ยืนยัน Local ว่าแก้ปัญหาจริงโดยจำลองสภาพไม่มี `.env` แล้วรัน `cp .env.example .env` ตามด้วย `docker compose config --quiet` ได้ Exit 0

**บทเรียนสำคัญ (ยืนยันซ้ำสองครั้ง):** การจำลอง CI ด้วยมือ (Local Simulation) แม้จะรันคำสั่งเดียวกันทุกคำสั่งก็ยังไม่เท่ากับ CI Run จริง 100% เพราะเครื่อง Local ของผู้พัฒนามักมีไฟล์/สถานะที่ CI ไม่มี (เช่น `.env`) — ต้องดู CI Run จริงอย่างน้อยหนึ่งครั้งที่ **ผ่านทุก Step จริง** ก่อนถือว่า Pipeline นี้ "ใช้งานได้จริง" ยังไม่ถือว่าจบจนกว่าจะเห็น CI Run ล่าสุดเขียวทั้งหมด

### การตรวจโดย AI Reviewer อิสระ (รอบที่ 1)

Reviewer (Opus 5, คนเดียวกับที่ตรวจ `FOUND-001`) ตรวจ `FOUND-002` แบบไม่เชื่อคำอธิบายของผู้ทำ — สร้าง Postgres แยกเอง, รัน Test ซ้ำ, เขียน Test ที่ตั้งใจให้ Fail เอง, และตรวจ CI History ผ่าน GitHub API เอง (ไม่ใช้ `gh` CLI เพราะไม่มีในเครื่อง) ยืนยันว่าเรื่องราว CI Fail 2 ครั้งด้านบนตรงกับความจริงทุกจุด

**คำตัดสิน: Partially verified, CHANGES REQUESTED** พบ 9 ประเด็น (S1–S9) 3 ข้อสำคัญที่ต้องแก้ก่อนอนุมัติ:

- **S1 (สำคัญ):** Regex ของ Generic Pattern (`\b(?:SECRET|TOKEN|...)`) ต้องการให้ Keyword ขึ้นต้นชื่อตัวแปรเท่านั้น แต่ Env Var จริงของโปรเจกต์นี้ (`JWT_ACCESS_SECRET`, `POSTGRES_PASSWORD`, `INTERNAL_SERVICE_TOKEN`) มี Keyword อยู่ท้ายชื่อ — ถ้ามีคนเผลอใส่รหัสผ่านจริงแทน Placeholder ใน `.env.example` แล้ว Commit, Scanner จะไม่จับ **แก้แล้ว:** เปลี่ยน Regex ให้ Keyword อยู่ตรงไหนของชื่อตัวแปรก็ได้ เพิ่ม `"ci-test"` เป็น Placeholder Marker (กัน False Positive กับ Secret ปลอมใน CI เอง) และเพิ่ม Test 2 ข้อยืนยัน (`JWT_ACCESS_SECRET=...`, `POSTGRES_PASSWORD=...`) — Reviewer จำลอง Regex ใหม่กับทุกไฟล์ใน Repo ก่อนแนะนำ ยืนยันว่าไม่เกิด False Positive ใหม่
- **S3 (สำคัญ):** Acceptance Criteria ของ Task ระบุตรงๆ ว่า CI ต้องรัน "install, lint/static, tests, **build**, scans" แต่ `.github/workflows/ci.yml` ไม่มี Build Step เลย (`docker compose config --quiet` แค่ตรวจ YAML ไม่ได้ Compile อะไร) **แก้แล้ว:** เพิ่ม Step `npm --workspace frontend run build` ต่อจาก Frontend Test
- **S4 (ปานกลาง):** Evidence ที่ Task ต้องการระบุ "Coverage Artifact" แต่ CI ไม่เคยอัปโหลดอะไรเลย (`coverage/` อยู่ใน `.gitignore` ด้วย) **แก้แล้ว:** เพิ่ม `actions/upload-artifact@v4` เก็บ `coverage/` และ `frontend/coverage/`; เปลี่ยน Backend Test ให้เขียน `coverage/lcov.info` จริงด้วย `--test-reporter=lcov` (ไม่ใช่แค่พิมพ์ตาราง Console) — ระหว่างทำเจอ Bug คนละเรื่อง: `mkdir -p coverage` ใน `package.json` Script รันไม่ผ่านตอนเรียกผ่าน `npm test` บนเครื่องนี้ (Windows เรียก Script ผ่าน `cmd.exe` ซึ่งไม่รู้จัก `-p`) แก้เป็น `pretest` Hook ที่ใช้ `node -e "fs.mkdirSync(...)"` แทน เพื่อไม่ผูกกับ Shell ใดๆ

ประเด็นที่ตอบตรงๆ ตามที่ผู้ทำถามเอง:

- **S2:** การยกเว้น `*.test.js` จาก Generic Pattern เป็นช่องโหว่จริง (Secret จริงที่แปะในไฟล์ Test จะไม่ถูกจับ) แต่ Reviewer เห็นว่าเป็นช่องโหว่ที่เล็กกว่า S1 และการแก้แบบถูกต้อง (Inline Allowlist Comment ต่อบรรทัด แบบ `gitleaks`) เป็นงานที่ควรทำทีหลังเมื่อมีไฟล์ Test มากขึ้น ไม่ Block — บันทึกเป็น Debt
- **S6:** การไม่ตั้ง Coverage Threshold เป็นการตัดสินใจที่ถูกต้อง ไม่ใช่ข้ออ้าง เพราะ Threshold ที่ตรงกับตัวเลขวันนี้ (Backend ~63%, Frontend ~44%, บาง File ต่ำถึง 16-20%) จะ "ดูเหมือนมาตรฐานคุณภาพ" ทั้งที่ไม่ได้ป้องกันอะไรจริง — ตรงกับคำว่า "non-deceptive" ใน Task Card เป๊ะ Reviewer แนะนำ (ไม่บังคับ) ให้ทำ Ratchet Floor ต่ำกว่าปัจจุบันเล็กน้อยเพื่อกัน Coverage ไหลลงเงียบๆ — ยังไม่ทำ บันทึกเป็นแนวทางในอนาคต
- **S7:** การแก้ ESLint Config (False Positive ของ `FOUND-001`) ไม่ใช่ Scope Creep เพราะ Scope ของ `FOUND-002` เองระบุ "lint/static ... scans, PR gate" ตรงๆ — Gate ที่ยังแดงอยู่บังคับเป็น Required Check ไม่ได้ นี่คือ Reviewer แก้ไขคำตัดสินของตัวเองจากรอบตรวจ `FOUND-001` (ตอนนั้นเชื่อคำอธิบายของผู้ทำโดยไม่ได้ทดสอบว่า Tool พูดถูกไหม) เป็นตัวอย่างว่า Reviewer เองก็ต้องพร้อมแก้คำตัดสินเมื่อเจอหลักฐานใหม่

ประเด็นที่ไม่ Block แต่บันทึกเป็น Technical Debt (ดูหัวข้อด้านล่าง): **S8** (Branch Protection เปิดใช้จริงหรือยังตรวจไม่ได้ ต้องใช้สิทธิ์ Admin), **S9** (`--experimental-test-coverage` ยังเป็น Experimental Flag ของ Node.js)

**แก้ไขหลัง Review รอบ 1:** ทำครบ S1, S3, S4 (Blocking) และ S5 (ทำเพิ่มเพราะราคาถูกและตรงกับ DoD "no false tested claim" ตรงๆ) ยืนยัน Local ด้วย Postgres จริงอีกครั้ง (สร้าง-ทดสอบ Register/Login/REQUIRE_INTEGRATION แล้ว Container ลบทิ้ง) ก่อน Commit

**ยืนยันด้วย CI Run จริงหลังแก้ (Commit `9e22670`, `id 30372362430`):** ผ่านทุก Step รวม Step ใหม่ทั้งสอง — "Frontend production build" และ "Upload coverage reports" ตรวจ Artifact ผ่าน API ตรงๆ (`https://api.github.com/repos/wisit23/Ise/actions/runs/30372362430/artifacts`) พบไฟล์ `coverage-reports` ขนาด 30,698 Bytes จริง ไม่ใช่แค่ Step ไม่ Error

### การตรวจโดย AI Reviewer อิสระ (รอบที่ 2 — Spot-check หลังแก้)

Reviewer คนเดิมตรวจซ้ำเฉพาะส่วนที่แก้ (ไม่ตรวจใหม่ทั้งหมด) โดยรัน Probe เดิม 10 ชุดซ้ำกับ Regex ใหม่ (ผ่านครบ รวมกรณีสำคัญที่สุดคือ "แทนค่าจริงใน `.env.example`" ซึ่งตอนนี้จับได้แล้ว), ตรวจ CI Run จริงผ่าน API เอง, ดาวน์โหลดและตรวจ Artifact จริง, และรัน `REQUIRE_INTEGRATION=1` ทั้งกรณีมี/ไม่มี Database เพื่อยืนยันพฤติกรรมทั้งสองด้าน

**คำตัดสินสุดท้าย: APPROVED, สถานะหลักฐาน `Partially verified`** — S1, S3, S4, S5 ยืนยันแล้วว่า `Verified` ทั้งหมด (S5 มีผลพลอยได้คือพิสูจน์ย้อนหลังว่า Integration Test เคยรันจริงใน CI Run รอบก่อนๆ ด้วย ไม่ใช่แค่อนุมาน) เหตุผลที่ยังไม่ใช่ `Verified` เต็มคือ 4 ข้อที่เปิดไว้โดยตั้งใจ: S2 (จุดบอด `.test.js`), S6 (ไม่มี Coverage Threshold), **S8 (ยังไม่ยืนยันว่า Branch Protection บังคับ Gate นี้จริงบน `main` — Reviewer ระบุว่าเป็นขั้นตอนที่มีค่าที่สุดที่เหลืออยู่ ต้องทำโดยมนุษย์ที่มีสิทธิ์ Admin ของ Repository)**, S9 (Flag ทดลอง) — คำพูด Reviewer ตรงๆ: "everything is built and working, but at the moment passing it is still voluntary"

**ขั้นตอนถัดไปสำหรับมนุษย์ (AI ทำแทนไม่ได้):** เปิด Branch Protection Rule บน `main` ใน GitHub Repository Settings ให้ Required Status Check คือ Job `quality-gate` จาก `.github/workflows/ci.yml`

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/shared/src/jwt.test.js`
- `backend/gateway/src/app.js`, `backend/gateway/src/app.test.js`, `backend/gateway/src/server.js`
- `backend/services/auth-service/src/app.test.js`
- `backend/services/auth-service/test/register-login.integration.test.js`
- `frontend/jest.config.js`, `frontend/jest.setup.js`, `frontend/app/page.test.js`
- `scripts/secretScan.js`, `scripts/secretScan.test.js`
- `.github/workflows/ci.yml`
- `eslint.config.js` (เพิ่ม `eslint-plugin-react` และ Jest globals)
- `package.json` (Script `test`, `test:frontend`, `secret-scan`, `audit`)

## Task `MOCK-TRADE-001` — Mockup ระบบซื้อขาย (Catalog + Order) แบบ In-memory MVC

> วันที่ทำ: 2026-07-28
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test และรัน Manual Smoke Test จริงผ่าน Browser
>
> หมายเหตุ: **นี่ไม่ใช่ `DB-002`/`DB-003`/`API-002`/`API-003`/`CUST-002`/`CUST-004` ตัวจริงตาม `planmain.md`** งานนี้เป็น Mockup ตามคำขอผู้ใช้โดยตรง ("mockup ก่อนยังไม่ต้องเชื่อม database จริง") — Model เป็น In-memory Array ไม่ใช่ Prisma/Postgres, ไม่มี Migration, ไม่มี Concurrency/Idempotency Test ตามที่ `DB-003` กำหนด (ป้องกัน Double-sale ของจริงยังไม่ได้ทำ), และยังไม่ผ่าน AI Review อิสระเหมือน `FOUND-001`/`FOUND-002` งานนี้มีไว้ให้ทีมเห็นรูปแบบ UI/API ครบวงจรก่อน แล้วค่อยเปลี่ยน Model เป็น Database จริงตาม Task Card ที่กำหนดไว้ทีหลัง

### งานที่ทำ

1. เติม `product-service` และ `order-service` (เดิมมีแค่ `/health`) ด้วยรูปแบบ MVC เดียวกับ `auth-service`: `models/` (In-memory Mock Model) → `controllers/` → `routes/` → `app.js`
2. `productModel.js`: Mock สินค้ามือสอง 5 รายการ (ตั้งชื่อ Field ให้ตรงกับแผน `DB-002` ที่บันทึกไว้ล่วงหน้าใน `planmain.md` — `sellerId`, `condition`, `category`, `status` — เพื่อให้สลับเป็น Prisma จริงทีหลังง่ายขึ้น) พร้อม `list/findById/create/update/remove`
3. `productController.js` + `productRoutes.js`: `GET /feed`, `GET /search?q=`, `GET /mine` (Seller ของตัวเอง), `GET /:id`, `POST /` (ลงขาย, ต้อง Login), `PATCH /:id` / `DELETE /:id` (เจ้าของเท่านั้น), และ `PATCH /:id/internal-status` (Internal Token เท่านั้น — ให้ `order-service` เรียกเปลี่ยนสถานะสินค้า)
4. `orderModel.js` + `orderController.js` + `orderRoutes.js`: `POST /` (ซื้อสินค้า — ตรวจสถานะสินค้าจาก `product-service` จริงก่อนสร้าง Order ป้องกันซื้อสินค้าตัวเอง/สินค้าที่ขายไปแล้วในระดับ Mockup), `GET /mine`, `GET /:id`, `PATCH /:id/status` (`cancelled` คืนสถานะสินค้าเป็น `available`, `completed` เปลี่ยนเป็น `sold`)
5. `productClient.js` ใน `order-service`: Service-to-service HTTP Client เรียก `product-service` ด้วย `fetch` ในตัว Node.js เอง (ไม่เพิ่ม Dependency) พร้อม `x-internal-token`
6. แก้ `backend/gateway/src/app.js`: เพิ่ม Path `^/api/products/[^/]+$` เข้า `PUBLIC_PATHS` เพื่อให้ดูรายละเอียดสินค้าได้โดยไม่ต้อง Login (Route เขียน/ลบสินค้าที่ใช้ Path เดียวกันยังปลอดภัยเพราะ `product-service` เองมี `requireAuth` ซ้ำอยู่แล้ว — Pattern เดียวกับที่ `authMiddleware.js` ออกแบบไว้ตั้งแต่ `FOUND-001`)
7. Frontend (Next.js App Router, Client Component ตาม Pattern เดิมของ `login`/`register`): `/products` (รายการ+ค้นหา), `/products/[id]` (รายละเอียด+ปุ่มซื้อ), `/sell` (ฟอร์มลงขาย), `/orders` (คำสั่งซื้อของฉัน) และเพิ่มลิงก์ใน `NavBar.js` กับปุ่ม CTA ในหน้าแรก
8. เขียน Smoke Test (`node:test` + `supertest`) ให้ทั้งสอง Service ตาม Pattern เดียวกับ `auth-service/src/app.test.js`: `product-service/src/app.test.js` (5 Test: health, feed กรองเฉพาะ available, search, 404, 401) และ `order-service/src/app.test.js` (3 Test: health, 401 สองเส้นทาง)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                                                                                                          | ผลที่เกิดขึ้นจริง                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                                                                                                                   | Exit 0                                                                                                                                                                                                                                                                                                      |
| `npm run format:check` (หลัง `prettier --write` ไฟล์ที่แก้/เพิ่ม)                                                                                                                                | ไฟล์ที่แก้ไขในงานนี้ผ่านสะอาด (ไฟล์เดิมทั้ง Repo ที่ไม่ได้แตะยัง Flag เพราะ `core.autocrlf=true` บนเครื่องนี้ทำให้ Checkout เป็น CRLF — ปัญหา Pre-existing ของ Environment ไม่เกี่ยวกับงานนี้ ไม่ได้แก้เพราะนอก Scope)                                                                                      |
| `npm test` (Backend, หลัง `prisma generate`)                                                                                                                                                     | 24/24 ผ่าน รวม Test ใหม่ 8 ข้อของ `product-service`/`order-service`                                                                                                                                                                                                                                         |
| `npm run test:frontend`                                                                                                                                                                          | 2/2 ผ่าน (ของเดิม ไม่กระทบจาก `NavBar.js`/`page.js` ที่แก้)                                                                                                                                                                                                                                                 |
| Manual Smoke Test จริงผ่าน Browser (ไม่ใช้ Docker เพราะ Docker Desktop ไม่ได้เปิดอยู่บนเครื่องนี้ตอนทดสอบ — รัน `product-service`/`order-service`/`gateway`/`next dev` ตรงด้วย `node`/`npx` แทน) | `GET /api/products/feed` ผ่าน Gateway คืนสินค้า Mock ที่ `status=available` เท่านั้น (4 จาก 5 ชิ้น, ตัดชิ้นที่ `sold` ออกถูกต้อง); หน้า `/products` และ `/products/p1` Render ข้อมูลจริงจาก API; กดปุ่ม "ซื้อสินค้านี้" ตอนยังไม่ Login ยืนยันด้วย `window.location.pathname` ว่า Redirect ไป `/login` จริง |

### ผลลัพธ์ปัจจุบัน

- มี Buy/Sell Flow แบบ Mockup ที่ทำงานจริงผ่าน Gateway → Service ครบวงจร (เห็นของ, ค้นหา, ลงขาย, ซื้อ, ดูคำสั่งซื้อ) แต่ข้อมูลหายเมื่อ Restart Service เพราะเป็น In-memory
- ยังไม่ได้ทดสอบ Login→Buy แบบ End-to-end จริงในรอบนี้ เพราะต้องมี Postgres สำหรับ `auth-service` (Docker ไม่ได้เปิดอยู่ตอนทดสอบ) — ทดสอบเฉพาะฝั่ง Guest→Redirect และ 401 Gate ด้วย Automated Test แทน
- ยังไม่มี Concurrency Guard ของจริง (สองคนกด "ซื้อ" พร้อมกันอาจแย่งสินค้าชิ้นเดียวกันได้ใน Mockup นี้ — ของจริงต้องรอ `DB-003`/`API-003`)
- ยังไม่ผ่าน AI Reviewer อิสระ และยังไม่มี CI Run จริงสำหรับงานนี้โดยเฉพาะ (แต่ผ่าน CI Step เดิมทั้งหมดตอนจำลอง Local: Lint, Format ของไฟล์ที่แก้, Backend/Frontend Test)
- ขั้นตอนถัดไปที่ตรงกับ Roadmap: แทนที่ `productModel.js`/`orderModel.js` ด้วย Prisma จริงตาม `DB-002`/`DB-003`, เพิ่ม Reservation Expiry และ Concurrency Test ตาม `API-003`, และส่งให้ AI Review อิสระตรวจก่อนนับเป็นหลักฐาน `Verified`

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/product-service/src/models/productModel.js`, `controllers/productController.js`, `routes/productRoutes.js`, `app.js`, `app.test.js`
- `backend/services/order-service/src/models/orderModel.js`, `controllers/orderController.js`, `routes/orderRoutes.js`, `services/productClient.js`, `app.js`, `app.test.js`
- `backend/gateway/src/app.js`
- `frontend/app/products/page.js`, `frontend/app/products/[id]/page.js`, `frontend/app/sell/page.js`, `frontend/app/orders/page.js`
- `frontend/components/NavBar.js`, `frontend/app/page.js`

## Task `MOCK-TRADE-002` — Cart ล็อกสินค้าก่อนชำระเงิน + แยกหน้าตาม Role + สมัครบัญชีผู้ขาย

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend 29 ข้อ/Frontend 2 ข้อ ผ่านหมด) และรัน End-to-end จริงผ่าน Docker Compose + Browser ครบ Flow (สมัครผู้ขาย → ลงขาย → สมัครผู้ซื้อ → เพิ่มลงตะกร้า → ชำระเงิน → ตรวจแดชบอร์ดผู้ขาย)
>
> หมายเหตุ: ต่อยอดจาก `MOCK-TRADE-001` ยังเป็น Mockup เหมือนเดิม (Product/Order Model ยัง In-memory) ต่างจากรอบก่อนตรงที่รอบนี้ **Auth ต่อ Postgres จริงแล้ว** (Docker Compose รันอยู่) จึงทดสอบ Register/Login จริงได้ ไม่ใช่แค่ Mock ฝั่ง Auth

### งานที่ทำ

1. `authService.register` (`backend/services/auth-service/src/services/authService.js`): รับ `role` (`BUYER`/`SELLER`, Default `BUYER`) และ `shopName` — ถ้าสมัครเป็น `SELLER` ต้องมี `shopName` และสร้าง `SellerProfile` แนบไปกับ `User` ในทีเดียว (Schema `Role`/`SellerProfile` มีอยู่แล้วใน `prisma/schema.prisma` ตั้งแต่ต้น แต่ Register เดิมไม่เคยใช้ Field เหล่านี้)
2. `productController.create` (`product-service`): เพิ่มเช็ค `req.userRole` ต้องเป็น `SELLER`/`ADMIN` เท่านั้น ไม่งั้นคืน 403 — บังคับที่ Backend จริง ไม่ใช่แค่ซ่อนปุ่มฝั่ง UI (ทดสอบยืนยันด้วย `fetch` ตรงจาก Browser ว่าบัญชีผู้ซื้อยิง API ลงขายเองก็โดน 403 เหมือนกัน)
3. Cart-as-Lock: `POST /api/orders` (เดิมมีอยู่แล้ว) คือ "เพิ่มลงตะกร้า" — สร้าง Order สถานะ `pending` และสั่งให้ `product-service` เปลี่ยนสถานะสินค้าเป็น `reserved` ทันที (ล็อกไม่ให้คนอื่นซื้อซ้ำ) ตรงตาม Requirement ที่ขอ
4. เพิ่ม `PATCH /api/orders/:id/pay` (`order-service`) — ขั้นตอนชำระเงินแยกจากการเพิ่มลงตะกร้า เฉพาะผู้ซื้อเจ้าของ Order และต้องเป็นสถานะ `pending` เท่านั้น เปลี่ยนเป็น `completed` และสั่งสินค้าเป็น `sold`
5. เพิ่ม `GET /api/orders/selling` (`order-service`) — คำสั่งซื้อฝั่งผู้ขาย (กรองด้วย `sellerId`) สำหรับหน้าแดชบอร์ดผู้ขาย
6. Frontend แยกตาม Role:
   - `frontend/app/register/page.js`: เพิ่ม Toggle "สมัครเป็นผู้ซื้อ/ผู้ขาย" และช่อง "ชื่อร้านค้า" เมื่อเลือกผู้ขาย
   - `frontend/components/NavBar.js`: เมนูต่างกันตาม `user.role` — ผู้ซื้อเห็น "ตะกร้า", ผู้ขายเห็น "ลงขายสินค้า"/"แดชบอร์ดผู้ขาย" แทน พร้อม Badge บอก Role
   - `frontend/app/sell/page.js`: กันไว้ที่ UI ด้วย — ถ้า Role ไม่ใช่ `SELLER` แสดงข้อความ "บัญชีนี้เป็นบัญชีผู้ซื้อ...ต้องสมัครด้วยบัญชีผู้ขายก่อน" พร้อมลิงก์ไปสมัคร แทนที่จะโชว์ฟอร์ม
   - `frontend/app/cart/page.js` (ใหม่): รายการสินค้าที่ล็อกไว้ (`pending`) พร้อมปุ่ม "ชำระเงิน" ทีละชิ้น, "ยกเลิก" (คืนสถานะสินค้าเป็น `available`), และ "ชำระเงินทั้งหมด" พร้อมยอดรวม
   - `frontend/app/seller/dashboard/page.js` (ใหม่): สรุปยอดขาย/จำนวนสินค้า/คำสั่งซื้อของผู้ขาย, รายการสินค้าของตัวเอง (`GET /api/products/mine`), รายการคำสั่งขาย (`GET /api/orders/selling`)
   - `frontend/app/orders/page.js`: ปรับ Label สถานะให้สื่อความหมายชัดขึ้น (`pending` = "อยู่ในตะกร้า (ล็อกไว้)" พร้อมลิงก์ไปตะกร้า)
7. เพิ่ม Test ใหม่ในทั้งสอง Service (เซ็น JWT จริงด้วย `signAccessToken` จาก `@reloop/shared` แทนการ Mock เพื่อทดสอบ Role Gate จริง): `product-service` เพิ่ม 2 ข้อ (Buyer โดน 403, Seller สร้างสำเร็จ), `order-service` เพิ่ม 2 ข้อ (401 ของ `/selling` และ `/:id/pay`)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                  | ผลที่เกิดขึ้นจริง                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                           | Exit 0                                                                                                                        |
| `npm run format:check` (เฉพาะไฟล์ที่แก้ในงานนี้)                                                         | สะอาด                                                                                                                         |
| `npm test` (Backend)                                                                                     | 29 Test, ผ่าน 28 (Integration Test 1 ข้อ Skip เพราะไม่ได้ตั้ง `REQUIRE_INTEGRATION`), Fail 0 — รวม Test ใหม่ 4 ข้อของงานนี้   |
| `npm run test:frontend`                                                                                  | 2/2 ผ่าน (ของเดิม ไม่กระทบ)                                                                                                   |
| `docker compose up -d --build`                                                                           | ทุก Container ขึ้นและ Healthy (Postgres จริง, Redis, ทั้ง 7 Service, Frontend)                                                |
| E2E จริงผ่าน Browser: สมัครบัญชีผู้ขาย (`seller1@example.com`, `role=SELLER`, `shopName` มีจริง)         | สมัครสำเร็จ, `localStorage` มี `role: "SELLER"` จริงจาก Response ของ Backend                                                  |
| ลงขายสินค้าใหม่ (`p6`) ด้วยบัญชีผู้ขาย                                                                   | POST `/api/products` คืน 201 พร้อม `sellerId` ตรงกับผู้ขาย                                                                    |
| สมัครบัญชีผู้ซื้อ (`buyer1@example.com`) แล้วกด "เพิ่มลงตะกร้า" สินค้า `p6`                              | สินค้าเปลี่ยนสถานะเป็น "อยู่ในตะกร้าคนอื่น (ล็อกแล้ว)" ทันที — ยืนยัน Lock ทำงานจริง                                          |
| หน้า `/cart` แสดงสินค้าที่ล็อกพร้อมยอดรวม แล้วกด "ชำระเงิน"                                              | Order เปลี่ยนเป็น `completed`, ตะกร้าว่างทันที, หน้า `/orders` แสดง "ชำระเงินสำเร็จ"                                          |
| สลับกลับไป Login ด้วยบัญชีผู้ขาย แล้วเปิด `/seller/dashboard`                                            | เห็นยอดขายจริง ฿259, สินค้าสถานะ "ขายแล้ว", คำสั่งขายสถานะ "ขายสำเร็จ" — ตรงกับที่ฝั่งผู้ซื้อชำระเงินไป                       |
| ทดสอบ Backend Role Gate ตรงๆ ด้วย `fetch` จาก Browser (บัญชีผู้ซื้อยิง `POST /api/products` เอง ข้าม UI) | คืน `403 {"error":"only seller accounts can list products for sale"}` — ยืนยันว่า Gate อยู่ที่ Backend จริง ไม่ใช่แค่ซ่อนปุ่ม |
| ทดสอบบัญชีผู้ซื้อเปิด `/sell` ตรงๆ                                                                       | เห็นข้อความปฏิเสธพร้อมลิงก์สมัครผู้ขาย ไม่เห็นฟอร์ม                                                                           |

### ผลลัพธ์ปัจจุบัน

- Flow ล็อกสินค้าก่อนชำระเงิน (Cart → Pay) ทำงานจริงและตรวจสอบซ้ำผ่าน Backend สองชั้น (Product ต้อง `available` ก่อนเพิ่มลงตะกร้า, Order ต้อง `pending` และเป็นของผู้ซื้อคนนั้นก่อนจ่ายได้)
- การลงขายถูกจำกัดเฉพาะบัญชีที่สมัคร Role `SELLER` เท่านั้น ยืนยันทั้ง UI Gate และ Backend Gate แยกกัน
- ยังไม่มี Concurrency Test ของจริง (สองคนกด "เพิ่มลงตะกร้า" พร้อมกันในหน่วยเวลาเดียวกันยังมีช่องเสี่ยง Race Condition เพราะ In-memory Array ไม่มี Lock — ของจริงต้องรอ `DB-003`/`API-003`)
- ยังไม่มีการเปลี่ยนเจ้าของสินค้ากลับเป็น "ผู้ซื้อ" ได้ในบัญชีเดียว (Role เป็น Field เดี่ยวตาม Schema เดิม — ผู้ใช้ที่สมัครเป็น `SELLER` ยังซื้อของคนอื่นได้ปกติ เพราะฝั่งซื้อไม่เช็ค Role แต่จะไม่สามารถ "ลงขาย" ได้ถ้าสมัครเป็น `BUYER`)
- ยังไม่ผ่าน AI Reviewer อิสระ เหมือนเดิม

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/auth-service/src/services/authService.js`
- `backend/services/product-service/src/controllers/productController.js`, `src/app.test.js`
- `backend/services/order-service/src/controllers/orderController.js`, `src/models/orderModel.js`, `src/routes/orderRoutes.js`, `src/app.test.js`
- `frontend/app/register/page.js`, `frontend/app/sell/page.js`, `frontend/app/products/[id]/page.js`, `frontend/app/orders/page.js`
- `frontend/app/cart/page.js`, `frontend/app/seller/dashboard/page.js` (ใหม่)
- `frontend/components/NavBar.js`

## Task `MOCK-TRADE-003` — ต่อ Product/Order เข้า Database จริง + UI แบบ Shopee/Amazon (มินิมอล)

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend Integration Test ใหม่ผ่านกับ Database จริง) และ E2E จริงผ่าน Docker Compose + Browser ครบ Flow ซื้อ-ขายรอบใหม่หลังเปลี่ยน Backing Store
>
> หมายเหตุ: จุดสำคัญที่สุดของรอบนี้คือ `product-service` และ `order-service` **เลิกเป็น In-memory Mock แล้ว** ต่อ Prisma เข้า Postgres จริง (`reloop_product`, `reloop_order` ที่มีอยู่แล้วใน `infra/postgres/init-databases.sql` ตั้งแต่ `FOUND-001` แต่ไม่เคยถูกใช้งาน) — ข้อมูลอยู่รอดข้าม Container Restart แล้วจริงๆ ยืนยันด้วยการ Rebuild Container แล้วเช็คว่าสินค้าที่สร้างไว้ก่อนหน้ายังอยู่

### งานที่ทำ

**Backend — ย้าย Model จาก In-memory เป็น Prisma จริง**

1. เพิ่ม `backend/services/product-service/prisma/schema.prisma` (Model `Product`) และ `backend/services/order-service/prisma/schema.prisma` (Model `Order`) — Field ตรงกับที่ In-memory Mock เดิมใช้ (`sellerId`, `status`, `condition` ฯลฯ) เพื่อให้ Controller ไม่ต้องแก้ Signature
2. **พบและแก้ Bug จริงระหว่างทำ:** โปรเจกต์นี้เป็น npm Workspace ที่ Hoist Dependency ไป `node_modules` ร่วมกัน — ถ้าใช้ Prisma Client Output Path Default (`node_modules/@prisma/client`) เหมือน `auth-service` เดิม การรัน `prisma generate` ของ `product-service` จะ **เขียนทับ Client ของ `auth-service` เงียบๆ** (ยืนยันแล้วจริงๆ: หลังรัน `prisma generate` ของ product-service ตรวจ `node_modules/.prisma/client/schema.prisma` พบว่าเหลือแค่ Model `Product` ตัวเดียว Model `User` ของ auth-service หายไป) แก้โดยตั้ง `generator client { output = "../src/generated/prisma-client" }` แยกกันทั้ง `product-service` และ `order-service` ให้แต่ละ Service มี Client เป็นของตัวเอง ไม่ชนกัน — เพิ่ม `backend/services/*/src/generated/` เข้า `.gitignore`, `.dockerignore`, `.prettierignore`, และ `eslint.config.js` ignores
3. เขียน `productModel.js`/`orderModel.js` ใหม่ทั้งหมดให้เรียก Prisma แทน Array ในหน่วยความจำ (`list`, `findById`, `create`, `update`, `remove` ฯลฯ) — จัดการกรณี Update/Delete ไม่เจอแถวด้วยการดัก Prisma Error Code `P2025` แล้วคืน `null`/`false` แทนการโยน Error ตรงๆ เพื่อให้ Contract เดิมของ Controller ไม่เปลี่ยน
4. แก้ Controller ทั้งสอง Service ให้เป็น `async`/`await` ครบทุก Endpoint ที่แตะ Model (`feed`, `search`, `getOne`, `create`, `update`, `remove`, `mine`, `markStatusInternal`, `pay`, `selling` ฯลฯ)
5. เพิ่ม `prisma/seed.js` (product-service) — Seed สินค้าตัวอย่าง 5 ชิ้นแบบ Idempotent (Upsert ด้วย ID คงที่ `p1`-`p5` กัน Duplicate เวลา Container Restart ซ้ำ)
6. แก้ Dockerfile ทั้งสอง Service ให้ตรงรูปแบบ `auth-service` เดิม: ติดตั้ง `openssl` (Prisma Engine ต้องการ), `npx prisma generate` ตอน Build, และ `npx prisma db push --skip-generate && npx prisma db seed && node src/server.js` (product) / `... && node src/server.js` (order) ตอน Start
7. เพิ่ม `requireEnv(["DATABASE_URL"])` ใน `server.js` ทั้งสอง Service (Pattern เดียวกับ `auth-service` — หยุดก่อนเปิด Port ถ้าค่าที่จำเป็นหาย)
8. แก้ Validation ราคาใน `productController.create` จาก `typeof price === "number"` เป็น `Number.isInteger(price)` เพราะ Schema กำหนด `price Int` (Postgres Int ไม่รับทศนิยม) — ฝั่ง Frontend (`sell/page.js`) ปัดเศษด้วย `Math.round()` ก่อนส่งเพื่อไม่ให้ผู้ใช้เจอ 400 จากค่าทศนิยมที่พิมพ์เผลอ

**Backend — Test**

9. แยก Test ที่แตะ Database จริงออกจาก `app.test.js` (Smoke Test เดิม เหลือแค่ 401/403 ที่ไม่ต้องมี Database) ไปเป็น `backend/services/product-service/test/product-crud.integration.test.js` ตาม Pattern เดียวกับ `register-login.integration.test.js` ของ `auth-service` — Skip อัตโนมัติถ้าไม่มี `DATABASE_URL`/Database เข้าถึงไม่ได้, และ Fail แข็งถ้า `REQUIRE_INTEGRATION=1` (ใช้ค่าเดียวกับที่ CI ตั้งไว้)
10. ยืนยัน Integration Test ผ่านจริงกับ Database จริง (ไม่ใช่แค่ Local Simulation): รัน `npx prisma db push` ตรงไปที่ `reloop_product`/`reloop_order` ผ่าน `localhost:5432` (Port ที่ Docker Compose Expose ไว้) แล้วรัน Test ด้วย `REQUIRE_INTEGRATION=1` — ผ่าน (สร้าง อ่าน ค้นหา ลบข้อมูลทดสอบตัวเองสำเร็จ)

**Frontend — ปรับ UI แนว Shopee/Amazon สไตล์มินิมอล**

11. `frontend/components/NavBar.js` เปลี่ยนจาก Nav แถบเดียวเป็น Header 3 ชั้นแบบ Marketplace จริง: แถบบน (Logo + ช่องค้นหากลาง + เมนู/ตะกร้า/User Menu) + แถบหมวดหมู่ (Category Chip เลื่อนแนวนอน) — เพิ่ม Cart Badge นับจำนวนสินค้าที่ยังไม่ชำระเงิน (เฉพาะบัญชีผู้ซื้อ), User Menu แบบ Dropdown เล็กๆ แทนปุ่ม "ออกจากระบบ" ลอยเดี่ยว
12. เพิ่ม `frontend/components/ProductCard.js` (การ์ดสินค้ามาตรฐานใช้ซ้ำได้) และ `frontend/components/Footer.js` (Footer มินิมอลใช้ทุกหน้า) และ `frontend/lib/constants.js` (`CATEGORIES`/`CONDITIONS` ใช้ร่วมกันแทนที่จะประกาศซ้ำในแต่ละหน้า)
13. หน้าแรก (`app/page.js`): เพิ่ม Hero + Grid หมวดหมู่ + "สินค้าล่าสุด" (ดึงจาก Feed จริง) แทนหน้า Static เดิม
14. `app/products/page.js`: เพิ่ม Sidebar หมวดหมู่ (Desktop) + Chip เลื่อน (Mobile), เชื่อม Query Param (`q`, `category`) กับ URL ผ่าน `useSearchParams` ให้ Header Search เชื่อมกับหน้านี้ได้ (ค้นหาจากหน้าไหนก็มาโผล่ที่นี่)
15. `app/products/[id]/page.js`: เพิ่ม Breadcrumb, ปุ่มคู่แบบ Shopee ("เพิ่มลงตะกร้า" กับ "ซื้อเลย" — ปุ่มหลังเพิ่มลงตะกร้าแล้ว Redirect ไป `/cart` ทันที)
16. `app/cart/page.js`: เพิ่ม Checkbox เลือกรายการ (Shopee-style) พร้อม "เลือกทั้งหมด", แถบสรุปยอด+ปุ่มชำระเงินแบบ Sticky ติดล่างจอ (จ่ายเฉพาะรายการที่เลือกได้ ไม่บังคับจ่ายทั้งตะกร้า)
17. `app/orders/page.js`: เปลี่ยนจาก List แบนเป็น Tab ตามสถานะ (ทั้งหมด/รอชำระเงิน/สำเร็จ/ยกเลิก) แบบ Shopee
18. `app/sell/page.js`, `app/login/page.js`, `app/register/page.js`: จัดหน้าใหม่เป็น Card กลางจอสไตล์มินิมอล มี Label ชัดเจนทุกช่อง

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                                                                                                                                                      | ผลที่เกิดขึ้นจริง                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                                                                                                                                                               | Exit 0                                                                                                                        |
| `npm run format:check` (เฉพาะไฟล์ที่แก้ในงานนี้)                                                                                                                                                                                             | สะอาด                                                                                                                         |
| `npm test` (Backend)                                                                                                                                                                                                                         | 26 Test: ผ่าน 24, Skip 2 (Integration Test Skip เพราะรอบนี้รันจาก Root ไม่ได้ตั้ง `DATABASE_URL`), Fail 0                     |
| `DATABASE_URL=...reloop_product REQUIRE_INTEGRATION=1 node --test .../product-crud.integration.test.js`                                                                                                                                      | **ผ่านจริงกับ Database จริง** (สร้าง/อ่าน/ค้นหา/ลบ Fixture ของตัวเองสำเร็จ)                                                   |
| `npm run test:frontend`                                                                                                                                                                                                                      | 2/2 ผ่าน                                                                                                                      |
| `npx prisma db push` กับ `reloop_product`/`reloop_order` ผ่าน `localhost:5432`                                                                                                                                                               | Schema Sync สำเร็จทั้งสอง Database                                                                                            |
| `docker compose up -d --build` (Rebuild ทุก Service รวม Prisma Client ใหม่)                                                                                                                                                                  | ทุก Container Healthy รวม `product-service`/`order-service` ที่เพิ่ง Build ใหม่                                               |
| `curl http://localhost:8080/api/products/feed` หลัง Rebuild                                                                                                                                                                                  | คืนสินค้าที่ Seed ไว้ก่อนหน้า (`p1`-`p4`, `status=available`) — **ยืนยันข้อมูลรอดจาก Container Restart จริง** ไม่ใช่แค่คาดเดา |
| E2E จริงผ่าน Browser (รอบใหม่หลังเปลี่ยน Backing Store): สมัครผู้ขาย (`seller2@example.com`) → ลงขายสินค้าใหม่ (ได้ UUID จริงจาก Postgres ไม่ใช่ `p6` แบบ In-memory เดิม) → สมัครผู้ซื้อ (`buyer2@example.com`) → กด "ซื้อเลย" ที่หน้าสินค้า | Redirect ไป `/cart` ทันที, Cart Badge ที่ Header ขึ้น "1", Checkbox เลือกไว้ล่วงหน้า, แถบสรุปยอด Sticky แสดง ฿450 ถูกต้อง     |
| กด "ชำระเงิน (1)" ที่ตะกร้า                                                                                                                                                                                                                  | ชำระสำเร็จ, ตะกร้าว่างทันที, Cart Badge หายไป, หน้า `/orders` Tab "สำเร็จ" แสดงรายการถูกต้อง                                  |
| สลับ Login เป็นบัญชีผู้ขาย เปิด `/seller/dashboard`                                                                                                                                                                                          | ยอดขายสำเร็จ ฿450 ตรงกับที่ผู้ซื้อจ่ายจริง, สินค้าสถานะ "ขายแล้ว" — ข้อมูลทั้งหมดมาจาก Postgres จริงผ่าน Prisma ไม่ใช่ Mock   |

### ผลลัพธ์ปัจจุบัน

- `product-service`/`order-service` ต่อ Database จริงแล้ว ("mockup" เดิมใน `MOCK-TRADE-001`/`002` ตอนนี้ล้าสมัยไปแล้วสำหรับสอง Service นี้ — เหลือแค่ตัว UI Flow/Role Gate ที่ยัง Valid)
- UI ทุกหน้าหลัก (หน้าแรก/รายการสินค้า/รายละเอียด/ตะกร้า/คำสั่งซื้อ/ลงขาย/แดชบอร์ดผู้ขาย/Login/Register) ปรับเป็นแนว Shopee/Amazon แบบมินิมอลแล้ว ใช้ Component ร่วม (`ProductCard`, `Footer`, `NavBar`) แทนการเขียนซ้ำ
- **ยังไม่ทำ:** Concurrency Guard ระดับ Database (ยังไม่มี Transaction/Row Lock ป้องกันสองคนกด "เพิ่มลงตะกร้า" สินค้าเดียวกันพร้อมกันในหน่วย Millisecond เดียวกัน — Race Window แคบลงมากเพราะเป็น Real DB Query แล้ว แต่ยังไม่ได้ทดสอบ Concurrency จริงแบบที่ `DB-003` กำหนด/500 Concurrent Request), Image Upload จริง (ยังเป็น URL ที่พิมพ์เอง), Order/Product ยังไม่มี Migration History (ใช้ `db push` ซึ่งเหมาะกับ Dev แต่ Production ต้องใช้ `prisma migrate` ที่มี Migration File เก็บประวัติ), Cart Badge ไม่ Re-fetch อัตโนมัติหลัง Checkout (ต้อง Reload หน้าถึงจะอัปเดต — Cosmetic ไม่กระทบข้อมูลจริง)
- ยังไม่ผ่าน AI Reviewer อิสระ และยังไม่มี CI Run จริงสำหรับงานนี้โดยเฉพาะ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/product-service/prisma/schema.prisma`, `prisma/seed.js`, `src/models/prismaClient.js`, `src/models/productModel.js`, `Dockerfile`, `package.json`
- `backend/services/order-service/prisma/schema.prisma`, `src/models/prismaClient.js`, `src/models/orderModel.js`, `Dockerfile`, `package.json`
- `backend/services/product-service/test/product-crud.integration.test.js`
- `.gitignore`, `.dockerignore`, `.prettierignore`, `eslint.config.js` (exclude `**/generated/**`)
- `frontend/components/NavBar.js`, `ProductCard.js` (ใหม่), `Footer.js` (ใหม่)
- `frontend/lib/constants.js` (ใหม่)
- `frontend/app/page.js`, `frontend/app/products/page.js`, `frontend/app/products/[id]/page.js`, `frontend/app/cart/page.js`, `frontend/app/orders/page.js`, `frontend/app/sell/page.js`, `frontend/app/login/page.js`, `frontend/app/register/page.js`

## Task `MOCK-TRADE-004` — Schema เต็มรูปแบบ (tags/media/location) + Upload ไฟล์จริง + Avatar Dropdown + ร้านค้า/โปรไฟล์

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend 26 ข้อ/Frontend 2 ข้อ ผ่านหมด) และ E2E จริงผ่าน Docker + Browser รวมถึง Upload ไฟล์จริงขึ้น Disk ผ่าน API จริง (ไม่ใช่ Mock)
>
> หมายเหตุ: งานนี้ตอบ Requirement ที่ผู้ใช้ระบุ Data Schema ตรงๆ (id, title, description, price, condition enum, category, tags[], media[], location, seller_id, created_at) และ UI แบบ Navbar+Dropdown ตามสเปกละเอียด — เปลี่ยน `Product.condition` จาก Free-text ภาษาไทยเป็น Enum ที่ Validate ในโค้ด (`New`/`Like New`/`Good`/`Fair`) และเพิ่ม `tags`/`media`/`location` เป็น Column จริงใน Postgres (ไม่ใช่ Mock)

### งานที่ทำ

**Backend — Schema และ API**

1. แก้ `backend/services/product-service/prisma/schema.prisma`: เพิ่ม `tags String[]`, `media Json @default("[]")` (Array ของ `{url, type}`), `location String` — เปลี่ยน `condition` Default เป็น `"Good"` (Validate ใน Controller กับ `['New', 'Like New', 'Good', 'Fair']` แทนการทำ Prisma Enum จริง เพราะ `"Like New"` มีช่องว่าง ไม่ใช่ Identifier ที่ถูกต้องสำหรับ Prisma Enum)
2. Push Schema ใหม่เข้า `reloop_product` จริงด้วย `prisma db push --accept-data-loss` (ยอมรับ Data Loss เฉพาะ Column `images` เดิมที่เปลี่ยนชื่อเป็น `media` — เป็น Dev Database ที่มีแต่ข้อมูลทดสอบของตัวเอง)
3. เพิ่ม Endpoint จริง: `POST /uploads` (product-service, `multer` เขียนไฟล์ลง Disk จริงที่ `uploads/` ซึ่งมี Docker Volume `product_uploads` Mount ไว้แล้วตั้งแต่แรกแต่ไม่เคยถูกใช้งาน) — Validate MIME Type (เฉพาะ JPG/PNG/WEBP/GIF/MP4/MOV), จำกัด 8 ไฟล์ 20MB/ไฟล์, ต้องเป็นบัญชี SELLER/ADMIN (เช็คด้วย `requireRole` **ก่อน** Multer ประมวลผลไฟล์ เพื่อไม่ให้เขียนไฟล์ลง Disk ก่อนรู้ผล Authorization)
4. **พบและแก้ Bug จริงระหว่างทำ:** Gateway มี Proxy `/uploads` อยู่ก่อนแล้ว (Scaffold ไว้ตั้งแต่ต้นแต่ไม่เคยมี Endpoint ให้ Proxy จริง) — พบว่า Express Strip Path Prefix ก่อนส่งต่อให้ Proxy โดยอัตโนมัติ (Mechanism เดียวกับที่ทำให้ `/api/products/feed` ทำงานได้อยู่แล้ว) ทำให้ `POST /uploads` ถูกส่งไป product-service เป็น `POST /` ซึ่งชนกับ `POST /` ของ `productRoutes` (สร้างสินค้า) เกิด Error "title, price, category are required" ผิดที่ผิดทาง — แก้ด้วย `pathRewrite: (path) => `/uploads${path}`` ใน Proxy Config เพื่อคืน Prefix กลับก่อนส่งต่อ ยืนยันแก้แล้วด้วยการอัปโหลดไฟล์ PNG จริงผ่าน `fetch` ตรงและได้ URL ที่โหลดกลับมาเป็นรูปได้จริง (`Content-Type: image/png`, 200)
5. เพิ่ม `GET /api/products/by-seller/:sellerId` (Public, กรอง `status=available`) สำหรับหน้าร้านค้า
6. เพิ่ม `GET /api/auth/users/:id/public` (Public, auth-service) — คืนเฉพาะ `firstName/lastName/shopName/memberSince` ของบัญชี Role `SELLER` เท่านั้น (404 ถ้าไม่ใช่ผู้ขาย) ไม่มี Email/Phone รั่วออกไป
7. เพิ่ม `PATCH /api/auth/me` (auth-service) แก้ไข `firstName/lastName/phone` ของตัวเอง สำหรับหน้า "ตั้งค่าโปรไฟล์"
8. อัปเดต Gateway `PUBLIC_PATHS` เพิ่ม `/api/auth/users/*/public`, `/api/products/by-seller/*`, และ `/uploads/*` (GET ดูรูปไม่ต้อง Login, POST ยังโดน `requireAuth`/`requireRole` ที่ product-service เหมือนเดิม)
9. ย้าย Test ที่แตะ Database ออกจาก Smoke Test เดิม เพิ่ม Test ใหม่ยืนยัน Role Gate ด้วย JWT จริง

**Frontend — Component ใหม่และ UI ตามสเปก**

10. `frontend/components/MediaUploader.js` (ใหม่): Dropzone ลากไฟล์วางได้จริง + คลิกเลือกไฟล์, Preview Grid พร้อมปุ่ม [×] ลบ และปุ่ม "ตั้งเป็นภาพหลัก" ย้ายลำดับ Cover Image ได้ — อัปโหลดไฟล์ขึ้น Backend จริงทันทีที่เลือก ไม่ใช่รอตอนกด "ลงขาย"
11. `frontend/components/TagInput.js` (ใหม่): พิมพ์คำแล้วกด Enter/Space/Comma สร้าง Badge แท็ก, Backspace ตอนช่องว่างลบแท็กล่าสุด, ปุ่ม × ลบทีละอัน
12. `frontend/components/MediaGallery.js` (ใหม่): Gallery/Carousel สำหรับหน้ารายละเอียดสินค้า รองรับทั้งรูปและวิดีโอ (`<video controls>` เล่นได้จริง) พร้อม Thumbnail Strip กดสลับได้
13. `frontend/components/NavBar.js`: ปรับ Layout เป็น Logo กลางซ้าย + ช่องค้นหากลาง + **เฉพาะ Avatar วงกลม** ด้านขวา (ไม่มีข้อความ/ลิงก์ลอยแยกแล้วเหมือนก่อนหน้า) — คลิก Avatar เปิด Dropdown Menu มีครบ 6 รายการตามสเปก: ลงขายสินค้า (Highlight เขียว + ไอคอน +), แดชบอร์ดผู้ขาย (เฉพาะ Seller), คำสั่งซื้อของฉัน, ร้านค้าของฉัน (เฉพาะ Seller, ลิงก์ไป `/store/{ตัวเอง}`), ตั้งค่าโปรไฟล์, ออกจากระบบ — เพิ่ม "ตะกร้า" (พร้อม Badge จำนวน) เป็นรายการเสริมสำหรับ Buyer เพราะ Spec ไม่ได้ระบุแต่ตัดออกจะทำให้กลับไปที่ตะกร้าไม่ได้เลยนอกจาก Flow ซื้อโดยตรง
14. `frontend/app/sell/page.js`: เขียนใหม่ทั้งหมดใช้ `MediaUploader`/`TagInput`, เปลี่ยนหมวดหมู่จาก `<select>` เป็น `<input list>` + `<datalist>` (พิมพ์อิสระได้ตาม Spec แต่ยังมี Suggestion), เพิ่มช่อง "สถานที่ตั้งสินค้า", เปลี่ยนสภาพสินค้าเป็น Dropdown ค่า `New/Like New/Good/Fair` (แสดง Label ไทยแต่ค่าที่ส่งเป็นภาษาอังกฤษตรงสเปก)
15. `frontend/app/products/[id]/page.js`: ใช้ `MediaGallery`, แสดง Tag Badge, การ์ดข้อมูลผู้ขาย (Avatar อักษรแรก, ชื่อร้าน/ชื่อผู้ขาย, "ยังไม่มีรีวิว") พร้อมปุ่ม "ดูร้านค้า" สีเขียวไปหน้า `/store/[sellerId]`
16. `frontend/app/store/[sellerId]/page.js` (ใหม่): Header ร้านค้า (Avatar, ชื่อร้าน, จำนวนสินค้า) + Grid สินค้าของผู้ขายคนนั้น
17. `frontend/app/profile/page.js` (ใหม่): ฟอร์มแก้ไข ชื่อ/นามสกุล/เบอร์โทร เชื่อม `PATCH /api/auth/me` จริง อัปเดต `localStorage` Session ให้ตรงกับข้อมูลใหม่ทันที
18. `frontend/lib/constants.js`: เปลี่ยน `CONDITIONS` เป็น `{value, label}` คู่ (Value ตรง Backend Enum เป๊ะ, Label เป็นภาษาไทยสำหรับ UI) เพิ่ม `CONDITION_LABEL` Lookup Map
19. `frontend/lib/api.js`: เพิ่ม `uploadFiles()` (ส่ง `FormData`, **ห้าม**ตั้ง `Content-Type` เองเพราะ Browser ต้องเป็นคนใส่ Multipart Boundary) และ `mediaUrl()` (Helper แปลง Path สัมพัทธ์ `/uploads/...` เป็น URL เต็ม)
20. ยืนยันสี: Primary/Accent ที่ผู้ใช้ระบุ (`#059669`, `#D1FAE5`, `#F9FAFB`) ตรงกับ Tailwind `emerald-600`/`emerald-100`/`gray-50` ที่ใช้อยู่แล้วทั้งเว็บตั้งแต่รอบก่อน ไม่ต้องเปลี่ยน Theme ใหม่

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                                                | ผลที่เกิดขึ้นจริง                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                                                         | Exit 0                                                                                                                                                                                                                             |
| `npm test` (Backend)                                                                                                                   | 26 Test: ผ่าน 24, Skip 2 (ไม่ได้ตั้ง `DATABASE_URL` ตอนรันจาก Root), Fail 0                                                                                                                                                        |
| `DATABASE_URL=...reloop_product REQUIRE_INTEGRATION=1 node --test` (Integration Test กับ Schema ใหม่)                                  | ผ่านจริงกับ Database จริงหลัง Migrate                                                                                                                                                                                              |
| `npm run test:frontend`                                                                                                                | 2/2 ผ่าน                                                                                                                                                                                                                           |
| อัปโหลดไฟล์ PNG จริงผ่าน `fetch` ตรงไป Gateway `/uploads`                                                                              | `201 Created` คืน `{media:[{url,type:"image"}]}`, โหลดไฟล์กลับมาดูได้จริงที่ URL นั้น `200 OK` `Content-Type: image/png`                                                                                                           |
| ทดสอบ `MediaUploader` ผ่าน Browser จริง (จำลองเลือกไฟล์ผ่าน `<input type="file">` เพราะ Browser Automation สั่ง OS File Picker ไม่ได้) | ไฟล์อัปโหลดสำเร็จ, Preview แสดง Badge "ภาพหลัก" ถูกต้อง                                                                                                                                                                            |
| กรอกฟอร์มลงขายครบ (Media, Title, Price, Condition=Like New, Category พิมพ์อิสระ, Location, Tags 3 อัน ผ่าน `TagInput`) แล้ว Submit     | สร้างสินค้าสำเร็จ, หน้ารายละเอียดแสดง Breadcrumb/Gallery/Tag Badge/Location/Condition Label ภาษาไทยถูกต้องครบทุกจุด                                                                                                                |
| กด "ดูร้านค้า"                                                                                                                         | ไปหน้า `/store/[sellerId]` แสดงชื่อร้าน "ร้านวิชัยแฟชั่น" (จาก `SellerProfile.shopName` จริง) และสินค้าของร้านนั้นถูกต้อง                                                                                                          |
| เปิด Avatar Dropdown                                                                                                                   | เห็นครบ 6 รายการตามสเปก พร้อมชื่อ-นามสกุล และ Role Badge ในหัว Dropdown                                                                                                                                                            |
| แก้ไขเบอร์โทรที่ `/profile` แล้วเช็คผ่าน `GET /api/auth/me`                                                                            | เบอร์โทรอัปเดตจริงในฐานข้อมูล ยืนยัน Persist ข้าม Request                                                                                                                                                                          |
| พยายามลบข้อมูลเก่าที่ Schema เปลี่ยนแล้วยังไม่ได้ Migrate (Bulk `deleteMany`)                                                          | ถูก Auto-mode Safety Classifier **บล็อกจริง** เพราะเป็นคำสั่งลบข้อมูลจำนวนมาก — ไม่ได้พยายามหาทางเลี่ยง ปล่อยข้อมูลเดิมทิ้งไว้ (สินค้าเก่าก่อน Schema นี้จะมี `tags`/`media` ว่างเปล่า เป็นข้อมูลสาธิตที่ไม่สมบูรณ์ แต่ไม่ใช่ Bug) |

### ผลลัพธ์ปัจจุบัน

- Schema ตรงตามที่ผู้ใช้ระบุครบ: `tags[]`, `media[]` (object จริงมี `url`/`type`), `location`, `condition` Enum ที่ Validate จริง
- Upload ไฟล์เป็นของจริง (เขียนลง Disk ผ่าน Docker Volume ที่มีอยู่แล้ว) ไม่ใช่แค่ให้พิมพ์ URL เหมือนรอบก่อน
- Navbar/Dropdown ตรงสเปกที่ให้มาทุกจุด (ยกเว้นเพิ่ม "ตะกร้า" เป็นรายการเสริมที่ไม่ได้ขอ แต่จำเป็นเพื่อไม่ให้ผู้ซื้อกลับไปตะกร้าไม่ได้)
- หน้าร้านค้า (`/store/[sellerId]`) และหน้าตั้งค่าโปรไฟล์ (`/profile`) เป็นหน้าใหม่ที่ใช้งานได้จริง ไม่ใช่ Placeholder
- **ข้อมูลสินค้าเก่า (`p1`-`p5` และสินค้าทดสอบก่อนหน้านี้) ยังมี `tags`/`media` ว่างเปล่า** เพราะ Schema Migration ใหม่กว่าข้อมูลเดิม และคำสั่งลบข้อมูลเพื่อ Reseed ถูกบล็อกโดย Safety Classifier — ไม่กระทบ Function ใดๆ (สินค้าเก่ายังซื้อขายได้ปกติ) แค่ไม่มีรูป/แท็กให้โชว์เป็นตัวอย่าง สินค้าที่สร้างใหม่หลังจากนี้จะมีข้อมูลครบ
- ยังไม่มี Rating/Review จริง ("ยังไม่มีรีวิว" เป็นข้อความ Static เพราะ `review-service` ยังไม่มี Endpoint ให้เรียก)
- ยังไม่ผ่าน AI Reviewer อิสระ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/product-service/prisma/schema.prisma`, `prisma/seed.js`
- `backend/services/product-service/src/middleware/upload.js` (ใหม่), `src/controllers/uploadController.js` (ใหม่), `src/routes/uploadRoutes.js` (ใหม่)
- `backend/services/product-service/src/controllers/productController.js`, `src/models/productModel.js`, `src/routes/productRoutes.js`, `src/app.js`
- `backend/services/auth-service/src/services/authService.js`, `src/controllers/authController.js`, `src/routes/authRoutes.js`
- `backend/gateway/src/app.js`
- `frontend/components/MediaUploader.js`, `TagInput.js`, `MediaGallery.js` (ใหม่ทั้งหมด), `NavBar.js`
- `frontend/app/sell/page.js`, `frontend/app/products/[id]/page.js`, `frontend/app/store/[sellerId]/page.js` (ใหม่), `frontend/app/profile/page.js` (ใหม่)
- `frontend/lib/constants.js`, `frontend/lib/api.js`

## Task `MOCK-TRADE-005` — ปรับ Schema ให้ตรง ER Diagram + ย้ายค่าที่ฝังในโค้ดลง Database

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend 26 ข้อ/Frontend 2 ข้อ ผ่านหมด, Integration Test ยืนยัน Category ใหม่ที่ Insert อัตโนมัติจริง) และทดสอบผ่าน Docker + Browser จริง (สร้างสินค้าด้วยหมวดหมู่ใหม่ที่ไม่เคยมีมาก่อน แล้วยืนยันว่าไปโผล่ใน Database จริง)
>
> หมายเหตุ: อ่าน `docs/erdatabase.png` (ER Diagram ต้นฉบับของโปรเจกต์) ตรงๆ เพื่อจัดโครงสร้างให้ใกล้เคียงของจริง — พบว่า ER มี `Photo`/`Video` เป็น Entity แยกกัน (ไม่ใช่ Field เดียวแบบ JSON ที่ทำไว้ก่อนหน้า) และไม่มี `Category`/`Condition` เป็น Entity เลย (Product มีแค่ Field `Type` อิสระ) — งานนี้เลยเป็นทั้ง "ทำตาม ER ที่มีอยู่" (Photo/Video) และ "เพิ่ม Table ใหม่ที่ ER ไม่มี" (Category/Condition) พร้อมบันทึกเหตุผลของทุกจุดที่ต่างจาก ER ไว้ใน `database/ER-changes.md` ตาม Rule เดิมของโปรเจกต์ (ห้ามตัด Table ของ ER แต่เพิ่มได้ถ้าบันทึกเหตุผล)

### งานที่ทำ

**Backend — Schema**

1. แก้ `backend/services/product-service/prisma/schema.prisma`: ลบ Field `media Json` เดิม เปลี่ยนเป็น 2 Table จริงตาม ER คือ `Photo` (`Photo_ID`, `URL`, `Product_ID` + `position` ที่เพิ่มเองเพื่อรักษาลำดับ/ภาพหลัก) และ `Video` (`Video_ID`, `Caption`, `CreatedAt`, `URL`, `Product_ID` + `position`) — ทั้งคู่ `onDelete: Cascade` เมื่อลบสินค้า
2. เพิ่ม `Category` Table (`id`, `name` unique) — ไม่มีใน ER แต่เพิ่มเพื่อย้ายรายการหมวดหมู่ที่เคย Hardcode ไว้ใน `frontend/lib/constants.js` ให้เป็นข้อมูลจริงใน Database — `products.category` ยังเป็น String ธรรมดา (ไม่ใช่ FK บังคับ) เพื่อให้ผู้ขายยังพิมพ์หมวดหมู่ใหม่ได้อิสระตามที่เคยขอไว้ก่อนหน้า โดยชื่อที่ไม่เคยมีมาก่อนจะถูก Insert เข้า `categories` อัตโนมัติ (`productModel.ensureCategory`)
3. เพิ่ม `Condition` Table (`id`, `value`, `label`, `sort_order`) — ย้าย Enum ที่เคย Hardcode ไว้ทั้งใน Controller และ Frontend ให้เป็นข้อมูลจริง Seed ไว้ 4 แถว (`New`/`Like New`/`Good`/`Fair`)
4. เขียน `productModel.js` ใหม่ทั้งหมด: เพิ่ม `toApiShape()` แปลง `photos`/`videos` Relations กลับเป็น `media[]` (Shape เดิมที่ Frontend คุ้นเคย เพื่อไม่ต้องแก้ Frontend เยอะ), `mediaToNestedCreate()` แยก `media[]` ที่รับมาเป็น Nested Create ของ `photos`/`videos` ตาม `position`, และฟังก์ชันใหม่ `listCategories`/`ensureCategory`/`listConditions`
5. `update()` ของ Product ใช้ `prisma.$transaction` ลบ `photos`/`videos` เดิมทั้งหมดแล้วสร้างใหม่เมื่อมีการส่ง `media` มาแก้ไข (Replace-all แทน Merge เพื่อความง่ายและถูกต้อง — ยังไม่มีหน้าแก้ไขสินค้าในระบบตอนนี้ ความเสี่ยงต่ำ)
6. เพิ่ม Endpoint `GET /api/products/categories` และ `GET /api/products/conditions` (Public) ให้ Frontend ดึงไปแสดงแทนของที่เคย Hardcode
7. Validate `condition` ที่ส่งมาตอนสร้าง/แก้ไขสินค้า กับข้อมูลจริงใน Table `conditions` แทนการเทียบกับ Array Hardcode ในโค้ด
8. อัปเดต `prisma/seed.js`: Seed `categories` (5 แถว) และ `conditions` (4 แถว) ก่อน Seed สินค้าตัวอย่าง, เปลี่ยนสินค้าตัวอย่างให้ใช้ Nested Create ของ `photos` แทน `media` Array เดิม

**Backend — Test**

9. เพิ่ม Assertion ใน `product-crud.integration.test.js`: สร้างสินค้าพร้อม `condition`/`tags`/`media` (ทั้งรูปและวิดีโอ) แล้วตรวจว่า Response กลับมาตรงตาม Shape เดิม (`media[]` มี `type` ถูกต้องทั้งสองแบบ), เพิ่มการยิง `GET /categories` และ `GET /conditions` ตรวจว่าคืนข้อมูลจริงจาก Database

**Frontend — ย้ายจาก Hardcoded Array เป็น Fetch จริง**

10. เพิ่ม `frontend/lib/catalog.js`: `fetchCategories()`/`fetchConditions()` แบบ Cache ที่ Promise level (เรียกพร้อมกันจากหลาย Component ยิง Request จริงแค่ครั้งเดียว)
11. **ลบ `frontend/lib/constants.js` ทิ้งทั้งไฟล์** (ไม่มีอะไรอ้างอิงเหลืออยู่แล้ว) — แก้ทุกจุดที่เคย Import `CATEGORIES`/`CONDITIONS`/`CONDITION_LABEL` ให้ดึงจาก `lib/catalog.js` แทน: `app/page.js` (Category Tile หน้าแรก), `app/products/page.js` (Sidebar + Mobile Chips), `app/sell/page.js` (Category Datalist + Condition Dropdown), `components/ProductCard.js` และ `app/products/[id]/page.js` (Condition Label สำหรับ Badge)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                                                | ผลที่เกิดขึ้นจริง                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                                                         | Exit 0                                                                                                                                                          |
| `npm test` (Backend)                                                                                                                   | 26 Test: ผ่าน 24, Skip 2, Fail 0                                                                                                                                |
| `DATABASE_URL=...reloop_product REQUIRE_INTEGRATION=1 node --test` (Schema ใหม่)                                                       | ผ่านจริงกับ Database จริง รวม Assertion ใหม่เรื่อง Category/Condition/Media แยกรูป-วิดีโอ                                                                       |
| `npm run test:frontend`                                                                                                                | 2/2 ผ่าน                                                                                                                                                        |
| `prisma db push --accept-data-loss` (ยอมรับเฉพาะการลบ Column `media` เดิมที่เปลี่ยนเป็น Table แยก) แล้ว `docker compose up -d --build` | ทุก Container Healthy รวม product-service ที่ Build ใหม่พร้อม Schema/Seed ใหม่                                                                                  |
| `curl /api/products/categories` และ `/api/products/conditions` หลัง Rebuild                                                            | คืนข้อมูลจริงจาก Database (5 หมวดหมู่, 4 สภาพสินค้า) ไม่ใช่ค่าที่เคย Hardcode                                                                                   |
| E2E จริงผ่าน Browser: Login บัญชีผู้ขายเดิม แล้วลงขายสินค้าใหม่ด้วยหมวดหมู่ที่ไม่เคยมีมาก่อน ("หนังสือ")                               | สร้างสินค้าสำเร็จ, หน้ารายละเอียดแสดง Breadcrumb "สินค้า / หนังสือ / ..." ถูกต้อง                                                                               |
| `curl /api/products/categories` หลังสร้างสินค้าหมวดใหม่                                                                                | รายการหมวดหมู่มี `"หนังสือ"` เพิ่มเข้ามาจริง — ยืนยันว่า "พิมพ์อิสระ" ยังใช้ได้ และข้อมูลถูกบันทึกลง Database จริงแทนที่จะหายไปเป็นแค่ String ในสินค้าชิ้นเดียว |

### ผลลัพธ์ปัจจุบัน

- Schema ของ `product-service` ใกล้เคียง ER Diagram ต้นฉบับมากขึ้น (`Photo`/`Video` เป็น Table จริงแยกกันตาม ER) พร้อมบันทึกทุกจุดที่ต่างจาก ER ไว้ใน `database/ER-changes.md` ตาม Rule เดิมของโปรเจกต์
- ค่าที่เคย Hardcode ในโค้ด (หมวดหมู่สินค้า, สภาพสินค้า) ย้ายลง Database ครบแล้วทั้งฝั่ง Backend และ Frontend — ไม่มี Array แบบ Static เหลืออยู่ใน Frontend อีกต่อไป
- `database/schema.md` และ `database/ER-changes.md` อัปเดตให้ตรงกับ Schema จริงล่าสุด รวม `order-service` ที่ยังไม่เคยถูกบันทึกไว้ในเอกสารนี้มาก่อน (ทำจาก Task ก่อนหน้าแต่ลืมอัปเดต Doc)
- ยังไม่มี Migration History แบบ `prisma migrate` (ยังใช้ `db push` เหมือนเดิม เหมาะกับ Dev ไม่เหมาะกับ Production)
- ยังไม่ได้ทำ Category เป็น FK บังคับ (เป็น String Denormalized ตั้งใจ เพื่อรักษาความสามารถพิมพ์อิสระของผู้ขาย) — ถ้าจะทำ Analytics/Filter ที่แม่นยำระดับ Category ในอนาคต อาจต้องพิจารณาใหม่
- ยังไม่ผ่าน AI Reviewer อิสระ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/product-service/prisma/schema.prisma`, `prisma/seed.js`
- `backend/services/product-service/src/models/productModel.js`, `src/controllers/productController.js`, `src/routes/productRoutes.js`
- `backend/services/product-service/test/product-crud.integration.test.js`
- `frontend/lib/catalog.js` (ใหม่) — แทนที่ `frontend/lib/constants.js` (ลบทิ้ง)
- `frontend/app/page.js`, `frontend/app/products/page.js`, `frontend/app/sell/page.js`, `frontend/app/products/[id]/page.js`, `frontend/components/ProductCard.js`
- `database/schema.md`, `database/ER-changes.md`, `database/product-service.prisma` (ใหม่), `database/order-service.prisma` (ใหม่)

## Task `MOCK-TRADE-006` — แดชบอร์ดผู้ขายแบบ Bento Grid พร้อมกราฟจริง

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Frontend/Backend เดิมยังผ่านหมด) และตรวจสอบ Layout/Chart จริงผ่าน Browser (Desktop + Mobile Viewport)
>
> หมายเหตุ: เรียกใช้ Skill `dataviz` ภายในของระบบก่อนสร้างกราฟ เพื่อให้ทำตามขั้นตอนที่ถูกต้อง (เลือกรูปแบบกราฟตาม "งาน" ของข้อมูลก่อน แล้วค่อยใส่สี, ใช้ Palette ที่ผ่านการ Validate มาแล้วสำหรับ CVD/Contrast แทนการเดาสีเอง) ไม่ได้เพิ่ม Chart Library ใหม่ (เช่น Recharts/Chart.js) เพราะข้อมูลและ Layout ไม่ซับซ้อนพอที่จะคุ้มกับ Dependency เพิ่ม — เขียน SVG Chart เองแบบเบาๆ 3 ตัวแทน

### งานที่ทำ

1. เพิ่ม `frontend/components/charts/palette.js` — สี Categorical 8 ตัวและสี Sequential (Blue) ที่ผ่านการ Validate มาจาก Skill `dataviz` แล้ว (CVD-safe, Contrast ผ่าน) ไม่ใช่สีที่เดาเอง
2. เพิ่ม `frontend/components/charts/Sparkline.js` — เส้นแนวโน้มเล็กๆ 12 จุดสำหรับ Stat Tile (ไม่มีแกน/Tooltip ตาม Spec เพราะเป็นแค่ Context ประกอบตัวเลขหลัก ไม่ใช่กราฟหลัก)
3. เพิ่ม `frontend/components/charts/TrendBarChart.js` — กราฟแท่งรายวัน (Single Series, งาน "แนวโน้มตามเวลา") มี Hover Tooltip ต่อแท่ง, Bar ตาม Spec (มุมโค้ง 4px, สูงสุด 24px, Baseline เดียว)
4. เพิ่ม `frontend/components/charts/CategoryBarChart.js` — กราฟแท่งแนวนอนสำหรับเทียบขนาดข้ามหมวดหมู่ (สถานะคำสั่งซื้อ, สถานะสินค้า, หมวดหมู่สินค้า) ใช้สี Categorical ตามลำดับคงที่ Label ตรงบนแท่งเลย (ไม่ต้องมี Legend แยกเพราะ Label กำกับ Identity อยู่แล้วตาม Rule ของ Skill), พับหมวดที่เกิน 8 ช่องเป็น "อื่นๆ" อัตโนมัติ
5. เขียน `frontend/app/seller/dashboard/page.js` ใหม่ทั้งหมดเป็น Bento Grid (`grid-cols-4` ผสมขนาด Card ไม่เท่ากัน): การ์ด Hero ยอดขายรวม (2×2, ตัวเลขใหญ่ + Sparkline + % เทียบ 7 วันก่อนหน้า), Stat Tile 4 ช่อง (คำสั่งซื้อทั้งหมด/สินค้าพร้อมขาย/รอชำระเงิน/ขายแล้ว), กราฟยอดขายรายวัน 14 วันเต็มความกว้าง, กราฟสถานะคำสั่งซื้อ/สถานะสินค้า/หมวดหมู่สินค้า (คำนวณจากข้อมูลจริงด้วย `useMemo` ไม่ใช่ Mock), คำสั่งซื้อล่าสุด 5 รายการ, รายการสินค้าทั้งหมด — Responsive ยุบเป็นคอลัมน์เดียวบนมือถือ

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                  | ผลที่เกิดขึ้นจริง                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                           | Exit 0                                                                                                                                                                                                                                                                                                          |
| `npm test` (Backend, ไม่กระทบเพราะงานนี้แก้ Frontend ล้วน)               | 26 Test: ผ่าน 24, Skip 2, Fail 0                                                                                                                                                                                                                                                                                |
| `npm run test:frontend`                                                  | 2/2 ผ่าน                                                                                                                                                                                                                                                                                                        |
| เปิด `/seller/dashboard` ผ่าน Browser จริงด้วยบัญชีผู้ขายที่มีข้อมูลจริง | Hero แสดง ฿539 ถูกต้อง, Stat Tile ตรงกับข้อมูลจริง (คำสั่งซื้อ 2, พร้อมขาย 1, ขายแล้ว 2), กราฟรายวันมี Label วันที่ 7 จุด, กราฟหมวดหมู่/สถานะแสดงข้อมูลจริงจาก Backend ไม่ใช่ Mock                                                                                                                              |
| ตรวจ DOM จริง                                                            | Bento Grid มี 11 การ์ดตามที่ออกแบบ, Hero มี Class `lg:col-span-2 lg:row-span-2` ถูกต้อง, SVG กราฟรายวันมี 28 `<rect>` (14 วัน × แท่งจริง + Hit Target โปร่งใส) ตรงตาม Implementation                                                                                                                            |
| ทดสอบ Responsive ที่ Viewport มือถือ (375px)                             | ไม่มี Horizontal Overflow, การ์ด Hero ยุบเป็นเต็มความกว้างคอลัมน์เดียวถูกต้อง                                                                                                                                                                                                                                   |
| ทดสอบ Hover Tooltip ผ่าน Synthetic PointerEvent                          | ยิง Event ไม่ Error แต่ State ไม่เปลี่ยนที่เห็นได้ — ตรงกับข้อจำกัดเดิมที่เจอตอนทดสอบ Drag-and-Drop (Synthetic PointerEvent ที่ยิงเองไม่ครบ Property เท่า Event จริงจาก OS) ไม่ใช่ Bug ของ Component เพราะ `onPointerEnter`/`onPointerLeave` เป็น React Event มาตรฐานที่ใช้งานได้ปกติกับการ Hover จริงของผู้ใช้ |

### ผลลัพธ์ปัจจุบัน

- แดชบอร์ดผู้ขายมีกราฟและข้อมูลจริงครบตามที่ขอ ไม่ใช่แค่ตัวเลขนิ่งๆ 3 ช่องแบบเดิม
- สีทุกกราฟผ่านการ Validate มาจาก Skill `dataviz` แล้ว (Categorical Order คงที่, ไม่ใช่สีสุ่ม)
- Tooltip แบบ Hover ยืนยันได้แค่ว่าไม่ Error จาก Automated Test เท่านั้น ยังไม่ได้ยืนยันด้วยการเห็นจริงเพราะข้อจำกัดของเครื่องมือทดสอบอัตโนมัติ (ควรให้มนุษย์ลองเล่นจริงเพื่อยืนยัน UX จุดนี้)
- ยังไม่มี Filter ช่วงเวลา (เช่นเลือกดู 7/30/90 วัน) ตามที่ Skill `dataviz` แนะนำสำหรับ Dashboard เต็มรูปแบบ — ตอนนี้ Fix ไว้ที่ 14 วันเสมอ เป็นการตัดสินใจลดขอบเขตเพื่อไม่ให้งานใหญ่เกินไป
- ยังไม่ผ่าน AI Reviewer อิสระ

### ไฟล์หลักที่เป็นหลักฐาน

- `frontend/components/charts/palette.js`, `Sparkline.js`, `TrendBarChart.js`, `CategoryBarChart.js` (ใหม่ทั้งหมด)
- `frontend/app/seller/dashboard/page.js`

## Task `MOCK-TRADE-007` — Pagination ทั่วระบบ + ระบบรีวิว/ให้คะแนนร้านค้าหลังซื้อขาย

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend 31 ข้อ/Frontend 2 ข้อ ผ่านหมด) และ E2E จริงผ่าน Docker + Browser ครบ Flow (ซื้อ→ครบกำหนดชำระ→รีวิว→เห็นคะแนนที่หน้าร้านค้าและหน้าสินค้า) รวมถึงทดสอบ Backend Validation ตรงๆ (กันรีวิวซ้ำ, กันรีวิว Order ที่ไม่มีจริง)
>
> หมายเหตุ: เพราะสินค้าเป็นของมือสองชิ้นเดียว ขายแล้วหมด รีวิวจึงให้คะแนน **ร้านค้า (ผู้ขาย)** ไม่ใช่ตัวสินค้า — Design ตรงตามที่ผู้ใช้อธิบายไว้ตรงๆ ("ให้คะแนนร้านค้านะเพราะสินค้ามันมือ2 มีชิ้นเดียวขายแล้วออกเลย")

### งานที่ทำ

**Backend — Pagination**

1. เพิ่ม `backend/shared/src/pagination.js`: `parsePagination(query, defaultLimit)` แปลง Query Param `page`/`limit` เป็น Prisma `skip`/`take` (Clamp ค่าสูงสุด 50 ต่อหน้า กัน Abuse) และ `paginatedResponse(items, total, pagination)` คืน Shape มาตรฐาน `{items, page, limit, total, totalPages}` ใช้ร่วมกันทุก Service
2. เพิ่ม Pagination จริง (Query + Count คู่กันผ่าน `Promise.all`) ให้: `GET /api/products/feed`, `/search`, `/mine`, `/by-seller/:id` (product-service), `GET /api/orders/mine`, `/selling` (order-service, เพิ่ม Filter `status` ด้วยเพราะ Tab ในหน้า UI ต้องกรองที่ Server ไม่ใช่กรองเฉพาะหน้าที่โหลดมา — ถ้ากรองฝั่ง Client อย่างเดียวจะเห็นแค่ Order ที่ตรง Filter ในหน้าปัจจุบัน ไม่ใช่ทั้งหมด), `GET /api/reviews/by-seller/:id` (review-service)
3. **จุดที่ตั้งใจไม่ใส่ Pagination:** หน้าแดชบอร์ดผู้ขาย (Stat/กราฟต้องเห็นข้อมูลกว้างพอจะคำนวณถูก, ผสม Pagination เข้ากับ Aggregate จะขัดกันเอง) และตะกร้า (ต้องเห็นสินค้าที่ล็อกไว้ทั้งหมดเพื่อเลือก Checkout พร้อมกัน) — ทั้งสองจุดนี้ใช้ `limit=100` เป็น Cap แทนที่จะทำ Pagination UI จริงๆ

**Backend — ระบบรีวิว (Service ใหม่ทั้งหมด)**

4. สร้าง `review-service` เต็มรูปแบบ (เดิมมีแค่ Health Check Stub): `prisma/schema.prisma` (Model `Review`: `orderId` Unique กันรีวิวซ้ำ, `buyerId`, `sellerId`, `rating`, `comment`), `models/reviewModel.js`, `controllers/reviewController.js`, `routes/reviewRoutes.js`, `services/orderClient.js` (เรียก order-service แบบ Service-to-Service)
5. เพิ่ม `GET /:id/internal` (requireInternalToken) ใน order-service ให้ review-service เรียกตรวจสอบ Order จริง (`buyerId`, `sellerId`, `status`) ก่อนอนุญาตให้รีวิว
6. Validate ที่ `POST /api/reviews`: ต้องเป็นเจ้าของ Order เอง (`buyerId` ตรง), Order ต้องเป็น `status=completed` เท่านั้น, ห้ามรีวิวซ้ำ Order เดิม (409 Conflict) — ทดสอบยืนยันทั้งสามเงื่อนไขจริงผ่าน `fetch` ตรงจาก Browser ไม่ใช่แค่ Trust Frontend
7. เพิ่ม `GET /api/reviews/by-seller/:id` (Public, มี Pagination + คำนวณ `averageRating` ด้วย Prisma `aggregate`) และ `GET /api/reviews/by-seller/:id/summary` (Public, แบบเบา สำหรับหน้าที่ต้องการแค่ตัวเลขไม่ต้องการ List เต็ม เช่น การ์ดผู้ขายในหน้าสินค้า)
8. อัปเดต Gateway: เพิ่ม `pathRewrite` และ Public Path สำหรับ `/api/reviews/by-seller/*`

**Frontend**

9. เพิ่ม `frontend/components/Pagination.js` (ปุ่มก่อนหน้า/ถัดไป + เลขหน้าแบบมี "…" ตอนหน้าเยอะ) และ `frontend/components/StarRating.js` (`StarDisplay` อ่านอย่างเดียว รองรับค่าทศนิยม, `StarInput` กดให้คะแนน 1-5 ดาว)
10. `app/orders/page.js`: เพิ่ม Pagination จริง + เปลี่ยน Tab ให้ส่ง `status` ไป Server แทนกรองฝั่ง Client, เพิ่มปุ่ม "ให้คะแนนร้านค้า" บน Order ที่ `status=completed` และยังไม่เคยรีวิว (เช็คจาก `GET /api/reviews/mine` ที่โหลดมาล่วงหน้า) กดแล้วเปิดฟอร์มรีวิวแบบ Inline ในบรรทัดเดียวกัน
11. `app/store/[sellerId]/page.js`: แสดงคะแนนเฉลี่ย+จำนวนรีวิวที่ Header ร้าน, รายการรีวิวพร้อม Pagination แยกจาก Pagination ของสินค้า
12. `app/products/[id]/page.js`: การ์ดผู้ขายเปลี่ยนจากข้อความ Static "ยังไม่มีรีวิว" เป็นดึงคะแนนจริงจาก `/summary`
13. `app/products/page.js`: เพิ่ม Pagination จริงสำหรับผลการค้นหา/รายการสินค้า
14. อัปเดตจุดที่เรียก `/api/orders/mine` เดิม (Cart, NavBar Badge) ให้ส่ง `status=pending&limit=100` ชัดเจน เพราะ Endpoint นี้ Paginate เป็น Default (`limit=10`) แล้ว — ถ้าไม่ระบุจะเห็นตะกร้าไม่ครบถ้าเผลอมี Pending เกิน 10 ชิ้น; Badge จำนวนตะกร้าเปลี่ยนไปใช้ `total` จาก Response แทนการนับจาก `items.length` (แม่นยำกว่า ไม่ขึ้นกับ Limit)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                                                   | ผลที่เกิดขึ้นจริง                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                                                                            | Exit 0                                                                                                  |
| `npm test` (Backend)                                                                                                                      | 31 Test: ผ่าน 28, Skip 3, Fail 0                                                                        |
| `DATABASE_URL=...reloop_review REQUIRE_INTEGRATION=1 node --test`                                                                         | ผ่านจริงกับ Database จริง (Aggregate คะแนนเฉลี่ยถูกต้อง)                                                |
| `npm run test:frontend`                                                                                                                   | 2/2 ผ่าน                                                                                                |
| `docker compose up -d --build`                                                                                                            | ทุก Container Healthy รวม `review-service` ที่เพิ่ง Build ครั้งแรกพร้อม Schema ใหม่                     |
| E2E จริงผ่าน Browser: Login ผู้ซื้อ → หน้า `/orders` เห็นปุ่ม "ให้คะแนนร้านค้า" บน Order ที่สำเร็จแล้ว → กรอกดาว 4 + คอมเมนต์ → ส่งสำเร็จ | ปุ่มหายไป กลายเป็นดาว+คอมเมนต์แสดงแทนทันที                                                              |
| เปิดหน้าร้านค้าของผู้ขายคนนั้นหลังรีวิว                                                                                                   | Header แสดง "4.0 (1 รีวิว)" ถูกต้อง, รายการรีวิวด้านล่างมีคอมเมนต์ที่พิมพ์ไปจริง                        |
| เปิดหน้าสินค้าอื่นของร้านเดียวกัน                                                                                                         | การ์ดผู้ขายแสดง "4.0 (1 รีวิว)" ตรงกัน (ดึงจาก Endpoint เดียวกัน)                                       |
| ยิง `POST /api/reviews` ซ้ำ Order เดิมตรงจาก Browser Console (ข้าม UI)                                                                    | `409 {"error":"this order has already been reviewed"}` — ยืนยันกันซ้ำที่ Backend จริง ไม่ใช่แค่ซ่อนปุ่ม |
| ยิง `POST /api/reviews` ด้วย `orderId` ปลอม                                                                                               | `404 {"error":"order not found"}`                                                                       |

### ผลลัพธ์ปัจจุบัน

- Pagination ใช้งานจริงในทุกจุดที่เป็นรายการเปิดกว้าง/โตไม่จำกัด (สินค้าทั้งหมด, สินค้าของร้าน, คำสั่งซื้อของผู้ซื้อ, รีวิวของร้าน) — จุดที่ตั้งใจไม่ใส่ (แดชบอร์ด, ตะกร้า) มีเหตุผลบันทึกไว้ชัดเจน ไม่ใช่ลืม
- ระบบรีวิวให้คะแนน "ร้านค้า" ตามที่ตั้งใจ ไม่ใช่ให้คะแนนสินค้ารายชิ้น ตรงกับธรรมชาติของ Marketplace มือสองที่สินค้าขายครั้งเดียวหมด
- คะแนนร้านค้าแสดงสอดคล้องกันทั้ง 2 จุด (หน้าร้านค้า, การ์ดผู้ขายในหน้าสินค้า) — ยังไม่ได้เพิ่มใน `ProductCard`/Listing Grid เพราะจะต้องยิง Request คะแนนแยกทุกใบในหน้า List ซึ่งจะเพิ่ม Request จำนวนมาก ตัดสินใจไม่ทำในรอบนี้
- Backend Validate ครบ 3 เงื่อนไขสำคัญของรีวิว (เจ้าของ Order เท่านั้น, ต้อง Completed เท่านั้น, ห้ามซ้ำ) ไม่ใช่แค่ Trust หน้าบ้าน
- ยังไม่มี Endpoint แก้ไข/ลบรีวิว (Buyer พิมพ์ผิดแล้วต้องขอให้ Admin แก้แทน — Scope Cut ตั้งใจ)
- ยังไม่ผ่าน AI Reviewer อิสระ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/shared/src/pagination.js`, `src/index.js`
- `backend/services/review-service/` ทั้งโฟลเดอร์ (ใหม่ทั้งหมด: `prisma/schema.prisma`, `src/models/`, `src/controllers/`, `src/routes/`, `src/services/orderClient.js`, `src/app.js`, `src/server.js`, `test/review-crud.integration.test.js`)
- `backend/services/order-service/src/controllers/orderController.js`, `src/models/orderModel.js`, `src/routes/orderRoutes.js` (Internal Endpoint + Pagination + Status Filter)
- `backend/services/product-service/src/controllers/productController.js`, `src/models/productModel.js` (Pagination)
- `backend/gateway/src/app.js`
- `frontend/components/Pagination.js`, `StarRating.js` (ใหม่ทั้งคู่)
- `frontend/app/products/page.js`, `frontend/app/orders/page.js`, `frontend/app/store/[sellerId]/page.js`, `frontend/app/products/[id]/page.js`, `frontend/components/NavBar.js`, `frontend/app/cart/page.js`, `frontend/app/seller/dashboard/page.js`

## Task `MOCK-TRADE-008` — ผสาน Branch `ball_test` (ระบบปัดดูสินค้า/Swipe Feed)

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend 33 ข้อ/Frontend 2 ข้อ ผ่านหมด) และ E2E จริงผ่าน Docker + Browser (ดู Feed แบบไม่ Login, อัปโหลดคลิปจริงในฐานะผู้ขาย, เห็นคลิปใหม่ขึ้น Feed พร้อมชื่อผู้ขายจริง, บัญชีผู้ซื้อโดนกันทั้ง UI และ Backend)
>
> หมายเหตุ: `git fetch origin` เจอ Branch `ball_test` (เพื่อนร่วมทีมชื่อ "ball" Push ไว้) แตกออกจาก Commit `db4c2a4` — เก่ากว่า Schema/Controller ของ product-service ที่ถูกเขียนใหม่ทั้งหมดในรอบ `MOCK-TRADE-004`/`005` (Category/Condition/Photo/Video Tables, Pagination) จึง**Merge ตรงๆ ไม่ได้** ต้องย้าย Logic ของ Feature ไปใส่บน Schema/Pattern ปัจจุบันเอง ไม่ใช่ `git merge` เฉยๆ

### สิ่งที่พบใน `ball_test` และวิธีจัดการ

| ของเดิมใน `ball_test`                                                                               | ปัญหาที่พบ                                                                                                                                                                      | วิธีแก้                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma Model `ProductVideo`                                                                         | ชนกับหลักการตั้งชื่อของฉัน (`Video` มีอยู่แล้วสำหรับ Gallery)                                                                                                                   | เก็บชื่อ `ProductVideo` เดิมของ ball ไว้ (ไม่ชนจริง เป็นคนละ Model) เพิ่ม Comment อธิบายความต่างจาก `Video` ให้ชัดว่าอันไหนใช้ทำอะไร                                                                     |
| `getMyProducts` Controller ใหม่ (Mapping ทับ `/mine`)                                               | เขียนซ้ำ `mine` เดิมของฉันที่มี Pagination อยู่แล้ว — ถ้าใช้ของ ball จะเสีย Pagination ที่เพิ่งทำใน `MOCK-TRADE-007`                                                            | ไม่เอา `getMyProducts` ของ ball มา ใช้ `mine` เดิมที่มี Pagination ต่อ                                                                                                                                   |
| `req.userName \|\| req.userEmail` สำหรับ `sellerName`                                               | **Bug จริง** — JWT ของระบบนี้มีแค่ `sub`/`role` ไม่มี Name/Email ฝังอยู่ ค่าจะเป็น `undefined` เสมอ (Fallback ไป "Seller" ทุกครั้ง ไม่มีทางเห็นชื่อจริง)                        | เปลี่ยนให้ Frontend ส่ง `sellerName` มาใน Body ตอนสร้าง (ดึงจาก `getStoredUser().firstName` ที่มีอยู่แล้วใน `localStorage`) — ยืนยันด้วย Browser จริงว่าเห็นชื่อผู้ขายถูกต้อง ("@วิชัย") ไม่ใช่ Fallback |
| Gateway Regex แก้ `PUBLIC_PATHS` เป็น Negative Lookahead ซับซ้อนขึ้น                                | ไม่จำเป็น เพราะ Route "mine"/"videos" ยังมี `requireAuth` ที่ตัว Service เองอยู่แล้ว (Defense-in-depth Pattern เดิม)                                                            | ไม่เอามาทั้งดุ้น เพิ่มแค่ Public Path ใหม่เฉพาะ `/api/products/videos/feed`                                                                                                                              |
| `docker-compose.yml` เปลี่ยนจาก Bind Mount เป็น `develop.watch` (Comment Block เก่าทิ้งค้างไว้ด้วย) | ลบ Bind Mount ตัวเดิมออกจริง — ถ้าเอามาทั้งดุ้นจะทำให้ `docker compose up` (ไม่ใช่ `docker compose watch`) ไม่มี Live Reload อีกต่อไป กระทบ Workflow เดิมทั้งหมดของ Session นี้ | **ไม่เอามาเลย** เก็บ Bind Mount เดิมไว้ตามที่ใช้งานอยู่จริงมาตลอด                                                                                                                                        |
| `frontend/app/seller/videos/new/page.js` เรียก `fetch("http://localhost:8080/...")` Hardcode ตรงๆ   | ไม่ใช้ `apiFetch`/`NEXT_PUBLIC_API_URL` เหมือนหน้าอื่นทั้งหมดในระบบ, ไม่มี Role Gate แบบหน้า `/sell`                                                                            | เขียนใหม่ให้ใช้ `apiFetch`/`getAccessToken` และมี Role Gate เหมือนหน้าอื่น                                                                                                                               |
| Loading State ในหน้า Swipe ใช้ `text-white` บนพื้นหลัง `bg-[#FFFFFF]` (สีขาว)                       | **Bug จริง** — ตัวหนังสือขาวบนพื้นขาว มองไม่เห็นตอนกำลังโหลด                                                                                                                    | แก้ Layout ใหม่ให้พื้นที่วิดีโอเป็นพื้นดำจริง (`bg-black`) ข้อความ Loading ใช้สีเทาอ่อนที่มองเห็นได้                                                                                                     |

### งานที่ทำ

1. เพิ่ม Model `ProductVideo` ใน `backend/services/product-service/prisma/schema.prisma` พร้อม Comment อธิบายว่าใน ER Diagram ต้นฉบับใกล้เคียงที่สุดคือ Entity `Swipe` (ถูกนำมาปรับใช้ใหม่) — เพิ่ม Relation `reviewClips` บน `Product`
2. เพิ่ม `productModel.listVideoFeed()` (Paginate, กรองเฉพาะสินค้าที่ยังไม่ถูกลบ) และ `createVideoClip()` ตาม Pattern เดียวกับฟังก์ชันอื่นในไฟล์
3. เพิ่ม Controller `videoFeed`/`createVideoClip` — `createVideoClip` ตรวจสิทธิ์ครบ: ต้องเป็น SELLER/ADMIN, ต้องเป็นเจ้าของสินค้าที่จะแนบคลิปเท่านั้น (403 ถ้าไม่ใช่)
4. เพิ่ม Route `GET /videos/feed` (Public) และ `POST /videos` (Auth, ต้อง SELLER) ก่อน `/:id` ตาม Pattern เดิมของไฟล์ (กัน "videos" ถูกอ่านเป็น Id)
5. Gateway: เพิ่ม Public Path เฉพาะจุดสำหรับ `/api/products/videos/feed`
6. Frontend `app/swipe/page.js` (ใหม่): ปรับจากของ ball ให้ใช้ `apiFetch`/`mediaUrl` ของระบบ, แก้ Bug สีตัวอักษร, ปรับสีปุ่ม/Avatar เป็นโทน Emerald ให้ตรง Brand เดิม
7. Frontend `app/seller/videos/new/page.js` (ใหม่): เขียนใหม่ทั้งหมดด้วย `apiFetch`/`getAccessToken`, มี Role Gate เหมือนหน้า `/sell`, ส่ง `sellerName` จาก `getStoredUser()` ไปด้วยตอนสร้าง
8. `components/NavBar.js`: เพิ่มลิงก์ "🎬 ปัดดูสินค้า" ที่ Header (มองเห็นได้ทุกคนรวม Guest เพราะ Feed เป็น Public) และ "อัปโหลดคลิปรีวิว" ในเมนู Dropdown เฉพาะบัญชีผู้ขาย (สไตล์เดียวกับ "ลงขายสินค้า"/"แดชบอร์ดผู้ขาย")
9. `app/page.js`: เพิ่มปุ่ม "🎬 ปัดดูสินค้า" ในหน้าแรกคู่กับ "เลือกซื้อสินค้า"/"เริ่มขายสินค้า"
10. อัปเดต `prisma/seed.js`: Seed คลิปตัวอย่าง 2 คลิป (ใช้ Sample Video Public Domain จาก Blender Foundation ผ่าน Google Cloud Storage Bucket สาธารณะ) ผูกกับสินค้า `p1`/`p3` ที่ Seed ไว้แล้ว ให้ Feed ไม่ว่างเปล่าตั้งแต่แรกเริ่ม
11. เพิ่ม Test: Smoke Test 401/403 สำหรับ `POST /videos` ใน `app.test.js`, และ Integration Test เต็มรูปแบบใน `product-crud.integration.test.js` (สร้างคลิปสำเร็จ, คนอื่นแนบคลิปกับสินค้าไม่ใช่ของตัวเองโดน 403, คลิปโผล่ใน Feed จริง)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                  | ผลที่เกิดขึ้นจริง                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                                           | Exit 0                                                                                                                                                   |
| `npm test` (Backend)                                                                     | 33 Test: ผ่าน 30, Skip 3, Fail 0                                                                                                                         |
| `DATABASE_URL=...reloop_product REQUIRE_INTEGRATION=1 node --test`                       | ผ่านจริงกับ Database จริง รวม Video Clip Ownership Check                                                                                                 |
| `npm run test:frontend`                                                                  | 2/2 ผ่าน                                                                                                                                                 |
| `docker compose up -d --build`                                                           | ทุก Container Healthy รวม product-service ที่มี Table `product_videos` ใหม่                                                                              |
| `curl /api/products/videos/feed` (ไม่ใส่ Token)                                          | `200 OK` เห็น 2 คลิป Seed — ยืนยัน Public จริง                                                                                                           |
| เปิด `/swipe` ในฐานะ Guest ผ่าน Browser                                                  | เห็นคลิป Video จริง เล่นได้, ปุ่ม "ดูรายละเอียดสินค้า" ลิงก์ไปหน้าสินค้าถูกต้องพร้อมราคา                                                                 |
| Login บัญชีผู้ขาย → เมนู Dropdown เห็น "อัปโหลดคลิปรีวิว" → กรอกฟอร์ม → Submit           | Redirect ไป `/swipe` จริง, คลิปใหม่ขึ้นเป็นอันดับแรก (เรียงตามวันที่ใหม่สุด) พร้อมชื่อผู้ขายจริง "@วิชัย" (ไม่ใช่ Fallback "Seller" แบบโค้ดเดิมของ ball) |
| Login บัญชีผู้ซื้อ → เปิด `/seller/videos/new` ตรงๆ                                      | เห็นข้อความปฏิเสธ "บัญชีนี้เป็นบัญชีผู้ซื้อ..." พร้อมลิงก์ไปสมัครผู้ขาย ไม่เห็นฟอร์ม                                                                     |
| ยิง `POST /api/products/videos` ตรงจาก Browser Console ด้วย Token บัญชีผู้ซื้อ (ข้าม UI) | `403 {"error":"only seller accounts can upload video reviews"}` — ยืนยันกันที่ Backend จริง                                                              |

### ผลลัพธ์ปัจจุบัน

- ระบบปัดดูสินค้าทำงานร่วมกับของเดิมทั้งหมดในระบบได้ปกติ ไม่มี Route/Model ชนกัน, Pagination ที่ทำไว้ก่อนหน้าไม่เสียหาย
- แก้ Bug จริง 2 จุดที่มากับ Branch ต้นทาง (ชื่อผู้ขายไม่เคยแสดงถูกเพราะ JWT ไม่มี Field ที่อ้างถึง, ตัวหนังสือขาวบนพื้นขาวตอนโหลด) — ไม่ใช่แค่ Copy โค้ดมาแปะ
- ตั้งใจ**ไม่เอา**การเปลี่ยน `docker-compose.yml` มาด้วย เพราะจะทำให้ Bind Mount เดิมหายและ Live Reload เสีย กระทบ Workflow ที่ใช้อยู่ตลอด Session — ถ้าจะใช้ `docker compose watch` จริงต้องคุยแยกเป็นการตัดสินใจอีกเรื่องหนึ่ง ไม่ใช่ผลพลอยได้จากการ Merge Feature นี้
- Branch `ิball_test` (ชื่อมีอักขระไทยแฝงอยู่ด้านหน้า) เป็น Push รุ่นเก่ากว่า `ball_test` — ไม่ได้เอามาทำอะไรต่อ ถือเป็นข้อมูลซ้ำซ้อนที่ค้างอยู่บน Remote
- ยังไม่ผ่าน AI Reviewer อิสระ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/product-service/prisma/schema.prisma`, `prisma/seed.js`
- `backend/services/product-service/src/models/productModel.js`, `src/controllers/productController.js`, `src/routes/productRoutes.js`
- `backend/services/product-service/src/app.test.js`, `test/product-crud.integration.test.js`
- `backend/gateway/src/app.js`
- `frontend/app/swipe/page.js` (ใหม่), `frontend/app/seller/videos/new/page.js` (ใหม่)
- `frontend/components/NavBar.js`, `frontend/app/page.js`

## Task `MOCK-TRADE-009` — อัปโหลดคลิปรีวิวแบบไฟล์จริง (ไม่ใช่วาง URL) + เคลียร์/รี Seed Database ให้มีร้านค้าหลากหลาย

> วันที่ทำ: 2026-07-29
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยันด้วย Automated Test (Backend 30 ข้อผ่าน/Frontend 2 ข้อผ่าน) และ E2E จริงผ่าน Docker + Browser (Login บัญชีร้านค้าใหม่จริง, ลากไฟล์วิดีโอจริงลง Dropzone, เห็น Request `POST /uploads` และ `POST /api/products/videos` สำเร็จจริงใน Network Log, คลิปใหม่ขึ้น Feed `/swipe` ทันที)

### งานที่ทำ

**(a) เปลี่ยนอัปโหลดคลิปรีวิวจากวาง URL เป็นอัปโหลดไฟล์จากเครื่องจริง**

1. เพิ่ม `frontend/components/VideoUploader.js` (ใหม่) — Dropzone ไฟล์เดียว ลอกกลไกอัปโหลดจาก `MediaUploader.js` เดิม (ลากวางหรือคลิกเลือกไฟล์ → `uploadFiles()` → POST ตรงไป `/uploads` แบบ `multipart/form-data`) ตัดให้เหลือรับแค่ 1 ไฟล์เพราะคลิปรีวิวผูกกับสินค้าได้ทีละคลิป, จำกัด `accept="video/mp4,video/quicktime"`, มี Preview เล่นได้ + ปุ่มลบ
2. แก้ `frontend/app/seller/videos/new/page.js`: เปลี่ยนจาก `<input type="url">` เป็น `<VideoUploader />`, เพิ่ม Validation `กรุณาอัปโหลดไฟล์วิดีโอ` ถ้ายังไม่มีไฟล์, ปุ่ม Submit `disabled` เมื่อยังไม่มีไฟล์

**(b) เคลียร์ Database เดิม + Seed สินค้าใหม่หลากหลายร้านค้า**

1. เพิ่ม `backend/services/auth-service/prisma/seed.js` (ใหม่) — Seed บัญชีผู้ขายจริง 4 ร้าน (UUID คงที่ `10000000-...0001-0004`: ร้านยีนส์เดนิม/Sneaker Society/Retro & Vintage House/กระเป๋าและเครื่องประดับมือสองพรีเมียม), Upsert-Only (`update: {}`) ไม่ทับข้อมูลจริงถ้ามีคนสมัครทับ Id เดียวกัน (เป็นไปไม่ได้ในทางปฏิบัติเพราะ Id สุ่ม แต่กันไว้), Password Demo `password123` เดียวกันทุกร้าน
2. อัปเดต `auth-service/package.json` เพิ่ม `"prisma":{"seed":"node prisma/seed.js"}`, `auth-service/Dockerfile` เพิ่ม `npx prisma db seed` ต่อจาก `db push` ใน `CMD`
3. เขียนใหม่ `backend/services/product-service/prisma/seed.js` ทั้งไฟล์: 8 หมวดหมู่, 4 สภาพสินค้า, สินค้า 16 ชิ้น (p01–p16) กระจาย 4 ร้านข้างบนจริง (ไม่ใช่ Seller Id ปลอมแบบเดิม) ราคา ฿199–฿1,800 คละทำเล/ขนาด/Tag, ตั้งใจให้ 1 ชิ้น (p11) เป็น `status: "sold"` ไว้ทดสอบ UI สินค้าขายแล้ว, คลิปรีวิว Demo 2 คลิปผูกกับ p01/p05
4. ล้างข้อมูลเก่าใน `reloop_product` ด้วย Script ครั้งเดียว (ยืนยัน Authorization จากผู้ใช้ตรงๆ ก่อนรัน เพราะเป็น Bulk Delete) แล้วรัน Seed ใหม่ทั้งสองฝั่ง (Auth + Product) ทั้ง Local และใน Docker Container จริงตอน `docker compose up -d --build`

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                   | ผลที่เกิดขึ้นจริง                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                                                            | Exit 0                                                                                                                                                                   |
| `npm test` (Backend)                                                      | 33 Test: ผ่าน 30, Skip 3, Fail 0                                                                                                                                         |
| `npm run test:frontend`                                                   | 2/2 ผ่าน                                                                                                                                                                 |
| `docker compose up -d --build`                                            | ทุก Container ขึ้น Healthy (auth-service, product-service, order-service, review-service, chat-service, gateway, frontend)                                               |
| Log `auth-service` ตอน Container Start                                    | `[auth-service] seeded 4 demo seller accounts (password: "password123")` — รันผ่าน `npx prisma db seed` ใน `CMD` จริงเป็นครั้งแรก                                        |
| Log `product-service` ตอน Container Start                                 | `[product-service] seeded 8 categories, 4 conditions, 16 demo products across 4 stores, 2 demo review clips`                                                             |
| เปิด `/products` ผ่าน Browser                                             | เห็นสินค้า 16 ชิ้นจริง แบ่งหน้า 2 หน้า, หมวดหมู่/ราคา/ทำเลตรงกับ Seed                                                                                                    |
| เปิด `/store/10000000-0000-0000-0000-000000000004` ผ่าน Browser           | แสดงชื่อร้าน "กระเป๋าและเครื่องประดับมือสองพรีเมียม" จริง (ไม่ใช่ Fallback "ร้านค้า") พร้อมสินค้า 4 ชิ้นของร้านนี้ครบ                                                    |
| Login `shop.bag@example.com` / `password123`                              | เข้าระบบสำเร็จจริง, Avatar/Session เปลี่ยนเป็นบัญชีร้านนี้                                                                                                               |
| `curl -F "files=@test-clip.mp4"` ไป `/uploads` ด้วย Token ร้านนี้         | `201` คืน `{"media":[{"url":"/uploads/....mp4","type":"video"}]}` — ยืนยัน Endpoint อัปโหลดไฟล์วิดีโอทำงานจริง                                                           |
| จำลอง Drag & Drop ไฟล์ `.mp4` จริงลง Dropzone ในหน้า `/seller/videos/new` | Network Log เห็น Dropzone เรียก Upload สำเร็จ (เปลี่ยนจาก Dropzone เป็น Preview วิดีโอ + ปุ่มลบทันที ไม่มี Error)                                                        |
| กรอกรายละเอียด + กด "เผยแพร่คลิปรีวิว"                                    | Network Log: `POST /api/products/videos → 201 Created`, Redirect ไป `/swipe` จริง, คลิปใหม่ขึ้นเป็นอันดับแรกพร้อมชื่อผู้ขาย "@ต้น" และลิงก์ไปหน้าสินค้าราคา ฿990 ถูกต้อง |

### ผลลัพธ์ปัจจุบัน

- อัปโหลดคลิปรีวิวใช้กลไกไฟล์จริงเหมือนหน้าลงขายสินค้าแล้ว ไม่ใช่วาง URL อีกต่อไป
- Database ถูกล้างและ Seed ใหม่ทั้งหมดด้วยร้านค้า 4 ร้านที่เป็นบัญชีผู้ขายจริงในระบบ (Login ได้จริง), สินค้ากระจายหลากหลายครบทั้งหมวดหมู่/ราคา/สภาพ/ทำเล
- Seed ทั้งสอง Service เป็น Upsert-Only เหมือนเดิม — Restart Container ซ้ำจะไม่ทำข้อมูลจริงหาย (ถ้ามีในอนาคต)
- **ยังไม่ได้ทำ**: ยังไม่ผ่าน AI Reviewer อิสระ, บัญชี Demo ทั้ง 4 ร้านใช้รหัสผ่านเดียวกัน (`password123`) เหมาะกับ Dev/Demo เท่านั้น ไม่ควรใช้ Pattern นี้ถ้าจะขึ้น Production จริง

### ไฟล์หลักที่เป็นหลักฐาน

- `frontend/components/VideoUploader.js` (ใหม่), `frontend/app/seller/videos/new/page.js`
- `backend/services/auth-service/prisma/seed.js` (ใหม่), `backend/services/auth-service/package.json`, `backend/services/auth-service/Dockerfile`
- `backend/services/product-service/prisma/seed.js`

## Task `MOCK-TRADE-010` — แก้ Uploads Directory หายหลัง Clone + Auto-Refresh Access Token

> วันที่ทำ: 2026-08-25
>
> สถานะตามหลักฐาน: ลงมือทำและตรวจด้วย `npm test` (Frontend) แล้ว, **ยังไม่ได้ทดสอบ E2E จริงผ่าน Browser + Docker** สำหรับส่วน Auto-Refresh (จำลอง Access Token หมดอายุจริงแล้วเช็ค Network Log ยังไม่ได้ทำ)

### บริบท / อาการที่พบ

- เพื่อนร่วมทีม Clone Repo แล้วอัปโหลดรูปตอนลงขายสินค้าไม่ได้ (`500 Internal Server Error`) ตั้งแต่รันครั้งแรก
- ผู้ใช้ (Seller) ที่ Login ทิ้งไว้เกิน 15 นาทีแล้วกดอัปโหลดรูป จะเจอ Error `401` โดยไม่มีการเด้งออกจากระบบให้เห็นชัดเจน

### งานที่ทำ

**(a) แก้ `uploads/` หายหลัง Clone**

1. พบว่า `.gitignore` มี `uploads/` แบบ Ignore ทั้ง Directory โดยไม่มีไฟล์ Placeholder ค้างอยู่เลย — Clone ใหม่จึงไม่มี Directory นี้อยู่จริง
2. `backend/services/product-service/src/middleware/upload.js` ใช้ `multer.diskStorage` เขียนไฟล์ลง Directory นี้ตรงๆ แบบ Fixed Path โดยไม่เช็คว่ามีอยู่จริงก่อน → `ENOENT` → `500`
3. แก้ `.gitignore` เป็น `uploads/*` + `!uploads/.gitkeep` เพื่อให้ Track โครงสร้าง Directory ได้ แต่ไม่ Track ไฟล์ที่ผู้ใช้อัปโหลดจริง
4. เพิ่ม `backend/services/product-service/uploads/.gitkeep`
5. เพิ่ม `fs.mkdirSync(UPLOAD_DIR, { recursive: true })` ใน `upload.js` เป็น Backstop ให้ Service สร้าง Directory เองเสมอตอน Start ไม่ว่าจะรันแบบ Docker (มี Named Volume `product_uploads` อยู่แล้วซึ่งปกติไม่ชนปัญหานี้) หรือรัน `node src/server.js` ตรงๆ นอก Docker (ชนปัญหานี้แน่นอนถ้าไม่มี `.gitkeep`)

**(b) เพิ่ม Auto-Refresh Access Token**

1. พบว่า Auth Service มี Endpoint `POST /api/auth/refresh` พร้อมใช้งานเต็มรูปแบบอยู่แล้ว (`backend/services/auth-service/src/services/authService.js`) แต่ Frontend ไม่เคยเรียกใช้เลย
2. Access Token อายุ 15 นาที (`JWT_ACCESS_EXPIRES`), หมดแล้วไม่มีกลไกต่ออายุ ผู้ใช้เจอ `401` เฉยๆ โดย Session ใน `localStorage` (`reloop_user`) ยังไม่ถูกล้าง ทำให้ดู "เหมือนยัง Login อยู่" ทั้งที่ใช้งานไม่ได้แล้ว
3. เพิ่ม `setAccessToken()` ใน `frontend/lib/auth.js` สำหรับอัปเดตเฉพาะ Access Token โดยไม่กระทบ Refresh Token/User ที่เก็บไว้
4. แก้ `frontend/lib/api.js` (จุดเดียว ครอบคลุมทุกหน้าที่เรียกผ่าน `apiFetch`/`uploadFiles`): เจอ `401` → เรียก `/api/auth/refresh` ด้วย Refresh Token อัตโนมัติ → Retry Request เดิม 1 ครั้งด้วย Token ใหม่ → ถ้า Refresh ก็ยังพัง (Refresh Token หมดอายุ 7 วัน/ถูก Revoke) ค่อย `clearSession()` + Redirect ไป `/login`
5. กันเรียก `/refresh` ซ้อนกันหลายรอบพร้อมกัน (เช่น ตอนอัปโหลดรูปหลายไฟล์พร้อมกันแล้วโดน `401` พร้อมกันทุก Request) ด้วย Single-Flight Promise

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                             | ผลที่เกิดขึ้นจริง                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| จำลอง Fresh Clone (ลบ `uploads/` แล้วรัน Node ตรงๆ) | `fs.mkdirSync` สร้าง Directory คืนให้อัตโนมัติ, `fs.existsSync` คืน `true`                       |
| Grep ทั้ง `backend/` หา Pattern เขียนไฟล์ลง Disk    | เจอแค่จุดเดียวที่ `upload.js`, ไม่มีจุดอื่นเสี่ยงปัญหาเดียวกัน                                   |
| ตรวจ Route `/api/auth/refresh` ผ่าน Gateway         | ตรงกับที่ `frontend/lib/api.js` เรียกจริง (`authRoutes.js` mount `/refresh` ใต้ `/api/auth`)     |
| ตรวจ Status Code Login/Refresh ผิดพลาด              | ตอบ `400` (`badRequest`) ไม่ใช่ `401` — ยืนยันว่า Retry-on-401 Logic ไม่ชนกับ Error ทาง Business |
| `npm test` (Frontend)                               | 5/5 ผ่าน (Test ที่พาดพิง `api.js` เป็น Mock ทั้งหมด ไม่ได้ทดสอบ Refresh Logic จริง)              |

### ผลลัพธ์ปัจจุบัน

- Clone ใหม่แล้วอัปโหลดรูปตอนลงขายสินค้าได้ทันทีโดยไม่ต้องสร้าง Directory เอง
- Access Token หมดอายุระหว่างใช้งาน (เกิน 15 นาทีหลัง Login) จะต่ออายุให้อัตโนมัติแบบผู้ใช้ไม่รู้ตัว ไม่โดน Error ค้างกลางทาง
- Refresh Token ยังคงอายุตายตัว 7 วันนับจากวัน Login (ไม่มี Rotation/Sliding Session) — ครบ 7 วันต้อง Login ใหม่แน่นอนแม้ใช้งานต่อเนื่องทุกวัน เป็นการตัดสินใจที่ยอมรับไว้ ไม่ใช่ Bug
- **ยังไม่ได้ทำ**: ยังไม่ได้ทดสอบ E2E จริงผ่าน Browser (จำลอง Token หมดอายุจริงแล้วดู Network Log), ยังไม่ผ่าน AI Reviewer อิสระ, Token ยังเก็บใน `localStorage` (เสี่ยง XSS) ไม่ใช่ HttpOnly Cookie ตามที่ `docs/architecture.md` วางเป้าหมายไว้ (`ADR-003`)

### ไฟล์หลักที่เป็นหลักฐาน

- `.gitignore`, `backend/services/product-service/uploads/.gitkeep`, `backend/services/product-service/src/middleware/upload.js`
- `frontend/lib/auth.js`, `frontend/lib/api.js`

### แก้ไขเพิ่มเติม (พบระหว่างทำ CSS-000–CSS-004, 2026-08-25)

- `.gitignore` Pattern `uploads/*` + `!uploads/.gitkeep` ที่เพิ่มไว้ใน Task นี้ **ใช้งานไม่ได้จริง** — Pattern ที่มี
  `/` อยู่กลาง Pattern (ไม่ใช่ท้ายสุด) จะ Anchor กับ Root ของ Repo เท่านั้นตาม gitignore Spec ทำให้ `uploads/*`
  ที่ตั้งใจจะครอบ `backend/services/product-service/uploads/*` (Path ซ้อนลึก) ไม่ได้ครอบอะไรเลยจริงๆ —
  ยืนยันด้วย `git check-ignore -v` ตรงๆ (คืนค่า Not Ignored ทั้งที่ Pattern มีอยู่) ตอนนั้นไม่มีใครสังเกตเพราะ
  `uploads/` ในเครื่อง Dev ว่างเปล่าพอดี (ไม่เคยมี Local File ให้ทดสอบ Pattern จริง)
- แก้เป็น Path เต็มจาก Root ตรงๆ: `backend/services/product-service/uploads/*` +
  `!backend/services/product-service/uploads/.gitkeep` — ยืนยันด้วย `git check-ignore -v` กับไฟล์ทดสอบจริงแล้วว่า
  Ignore ถูกต้อง และ `.gitkeep` ยัง Track ได้ปกติ
- Pattern เดียวกันนี้ถูกใช้ซ้ำตอนสร้าง `private-evidence/` ใน `CSS-003` เลยแก้พร้อมกันทั้งคู่

## Task `MOCK-TRADE-011` — Full-Text-ish Search (Trigram) แทนที่ Title-Only Search

> วันที่ทำ: 2026-08-25
>
> สถานะตามหลักฐาน: ลงมือทำ, ตรวจกับ PostgreSQL จริงใน Container ทุกขั้น (ไม่ใช่ Mock), ยืนยัน E2E ผ่าน Browser จริงที่ `http://localhost:3000/products?q=...` เห็น Network Request `GET /api/products/search` คืนผลถูกต้อง, `npm test` ทั้ง Repo ผ่าน 44/44, `npm run lint` Exit 0

### บริบท / อาการที่พบ

- ผู้ใช้ระบุว่า Search เดิมค้นได้แค่ชื่อสินค้าแบบตรงตัว ("โง่ๆ") อยากให้ค้นได้ทั้ง Tag, รายละเอียด, ชื่อ, อื่นๆ
- ตรวจสอบก่อนแก้พบว่า Query เดิม ([productModel.js](../backend/services/product-service/src/models/productModel.js)) ค้นแค่ `title`/`description`/`category` ไม่ครอบคลุม `tags`/`location`/`condition` — ทดสอบกับข้อมูล Seed จริงแล้วค้นคำที่ตรงกับ Tag ตรงๆ เช่น `denim`, `sneakers`, `vintage` **ได้ 0 ผลลัพธ์ทั้งหมด** เพราะ Title เป็นภาษาไทยแต่ Tag เป็นภาษาอังกฤษ

### งานที่ทำ

**(a) Phase 1 — เพิ่ม Field ที่ค้นได้ทันที (ไม่แตะ Schema)**

1. เพิ่ม `location`, `condition` เข้า `OR contains` เดิม และเพิ่ม `tags: { hasSome: [q.toLowerCase()] } }` (Exact-Tag Match; Tag ถูก Normalize เป็นตัวพิมพ์เล็กอยู่แล้วตอน Save ที่ `productPayload.js`)

**(b) Phase 2 — Trigram Search แทนที่ OR-Contains เดิมทั้งหมด**

1. ตรวจกับ PostgreSQL จริงก่อนตัดสินใจ: Postgres Full-Text Search (`tsvector`/`to_tsquery`) **ใช้กับภาษาไทยไม่ได้** — `pg_ts_config` ไม่มี Config ภาษาไทย และ Config `simple` Tokenize "เสื้อยืดวินเทจ" เป็น 1 Token เดียว ค้น "เสื้อ" ไม่เจอ (ยืนยันด้วยการรัน `to_tsvector` จริง) — เลือกใช้ `pg_trgm` (Trigram) แทน เพราะทำงานระดับตัวอักษร ไม่ต้องรู้ขอบเขตคำ ใช้กับภาษาไทยได้จริงตามที่ทดสอบ (`word_similarity('เสื้อ', ...)` ได้ `0.83`, ตรงข้ามกับ `similarity()` ที่คะแนนเจือจางเมื่อข้อความยาว จึงต้องใช้ `word_similarity()`)
2. เพิ่ม `extensions = [pg_trgm]` + `previewFeatures = ["postgresqlExtensions"]` และ Field `searchText` (`@map("search_text")`) พร้อม `@@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin)` ใน `schema.prisma`
3. **ไม่ใช้ Postgres Generated Column** สำหรับ `search_text` — ทดสอบจริงแล้วพบ Error `generation expression is not immutable` เพราะ `array_to_string()`/`concat_ws()` เป็น `STABLE` ไม่ใช่ `IMMUTABLE` — ใช้ **DB Trigger** แทน (`products_set_search_text()` + `products_search_text_trigger`) ติดตั้งแบบ Idempotent (`CREATE OR REPLACE FUNCTION`/`TRIGGER`) ใน `prisma/seed.js` เพราะ Repo นี้ใช้ `prisma db push` ไม่ใช่ `prisma migrate` จึงไม่มีที่วาง Migration SQL ตามปกติ — `seed.js` เป็น Hook เดียวที่รันทุกครั้งที่ Container Start อยู่แล้ว
4. เพิ่ม Backfill (`UPDATE products SET updated_at = updated_at`) ต่อท้ายการติดตั้ง Trigger เพื่อบังคับให้ Trigger คำนวณ `search_text` ให้กับ 16 แถวเดิมที่มีอยู่ก่อน Trigger ถูกสร้าง (Idempotent, รันซ้ำได้ทุก Start)
5. เขียน `searchProducts()` ใหม่ใน `productModel.js` ด้วย `prisma.$queryRaw` (Parameterized ผ่าน `Prisma.sql` Tagged Template กัน SQL Injection): เงื่อนไข `search_text ILIKE '%'||q||'%' OR q <% search_text` (`<%` คือ Word-Similarity Operator ของ `pg_trgm`, Threshold Default 0.6) จับได้ทั้ง Substring แบบตรงตัวและ Fuzzy/Typo-Tolerant, จัดอันดับด้วย `GREATEST(word_similarity(...), similarity(...))`, แล้วดึง Media กลับผ่าน Prisma ปกติ (`findMany({ id: { in } })`) พร้อมคง Rank Order เดิม (SQL `IN` ไม่รับประกัน Order)
6. ยืนยันด้วย `EXPLAIN`/`SET enable_seqscan = off` ว่าทั้ง `ILIKE` และ `<%` ใช้ GIN Index `products_search_text_idx` จริง (Planner เลือก Seq Scan เองตอน Data มีแค่ 16 แถวเพราะเร็วกว่า ไม่ใช่ Index ใช้งานไม่ได้)
7. ลบ `searchText` ออกจาก API Response ทุก Endpoint (`toApiShape`) เพราะเป็น Field ภายในที่ซ้ำกับ `title`/`description`/`tags` อยู่แล้ว ไม่ควรรั่วออกไปที่ Frontend

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                              | ผลที่เกิดขึ้นจริง                                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `to_tsvector('simple', 'เสื้อยืดวินเทจ Nike สภาพดี')`                | Token ไทยรวมเป็นก้อนเดียว ยืนยันว่า Postgres FTS ใช้กับไทยไม่ได้                                                            |
| ค้น `denim`/`sneakers`/`vintage` ก่อนแก้                             | 0 ผลลัพธ์ทั้งหมด (Query เดิมไม่ครอบคลุม `tags`)                                                                             |
| `word_similarity('เสื้อ', full_text)` vs `similarity(...)`           | `0.83` vs `0.24` — ยืนยันต้องใช้ `word_similarity`                                                                          |
| `CREATE TABLE ... GENERATED ALWAYS AS (array_to_string(...)) STORED` | Error `generation expression is not immutable` — ยืนยันว่าต้องใช้ Trigger แทน Generated Column                              |
| `npx prisma db push` กับ Schema ใหม่                                 | สร้าง Extension, Column `search_text`, GIN Index `products_search_text_idx` สำเร็จ ไม่มี Error                              |
| รัน `seed.js` ใหม่กับ DB จริง                                        | Trigger ติดตั้งสำเร็จ, Backfill 16 แถวเดิมมี `search_text` ครบ                                                              |
| Insert แถวใหม่ตรงๆ ด้วย SQL (ไม่ผ่าน App)                            | Trigger คำนวณ `search_text` ให้อัตโนมัติ ยืนยัน Trigger Fire ทุก Insert ไม่ใช่แค่ตอน Seed                                   |
| `EXPLAIN` กับ `SET enable_seqscan=off`                               | ทั้ง `ILIKE` และ `<%` ใช้ `Bitmap Index Scan` บน `products_search_text_idx` จริง                                            |
| ค้น `denim`/`sneakers`/`vintage`/`Denim`/`เสื้อ`/`leather` หลังแก้   | เจอผลลัพธ์ถูกต้องครบทุกคำ รวมตัวพิมพ์ใหญ่เล็กและข้ามภาษา                                                                    |
| Category Filter + Search พร้อมกัน                                    | กรองถูกต้อง (`q=vintage&category=แจ็คเก็ต` เหลือแค่ 1 รายการที่ตรงทั้งสองเงื่อนไข)                                          |
| `model.create()` แล้วค้นทันที                                        | เจอสินค้าที่เพิ่งสร้างในผลค้นหาทันที, ตรวจ `Object.keys()` แล้วไม่มี `searchText` รั่วออกมาใน Response                      |
| `npm run lint` (Repo ทั้งหมด)                                        | Exit 0                                                                                                                      |
| `npm test` (Repo ทั้งหมด, ต่อ Postgres จริงใน Container)             | 44/44 ผ่าน                                                                                                                  |
| `docker compose build product-service` + `up -d`                     | Build สำเร็จ, `db push` sync, Seed+Trigger รันสำเร็จตอน Container Start จริง (ไม่ใช่แค่ Local)                              |
| เปิด `http://localhost:3000/products?q=denim` ผ่าน Browser จริง      | เห็น "กางเกงยีนส์ Levi's 501 ทรงตรง" และ "เดนิมแจ็คเก็ตวินเทจ Levi's" ถูกต้อง, Network Log `GET /api/products/search → 200` |
| เปิด `http://localhost:3000/products?q=sneakers` ผ่าน Browser จริง   | เห็น "รองเท้าผ้าใบ Converse สีขาว" ถูกต้อง (มาจาก Tag ล้วนๆ, Title ไม่มีคำนี้เลย)                                           |

### ผลลัพธ์ปัจจุบัน

- Search ค้นได้ครบ `title`/`description`/`category`/`condition`/`location`/`tags`/`size` ในคำค้นเดียว ไม่ใช่แค่ชื่อสินค้าตรงตัวอีกต่อไป
- รองรับภาษาไทยจริง (ไม่ใช่ Postgres FTS ที่ใช้ไม่ได้กับไทย), Case-Insensitive, มี Ranking ตามความเกี่ยวข้อง, Typo-Tolerant ระดับหนึ่ง (Threshold Default ของ `pg_trgm`)
- Trigger ดูแล `search_text` อัตโนมัติไม่ว่าจะสร้าง/แก้สินค้าผ่านช่องทางไหน (API, Seed, โค้ดที่จะเพิ่มในอนาคต) โดยไม่ต้องแก้ `productModel.create()`/`update()` เลย
- **ยังไม่ได้ทำ**: ยังไม่ผ่าน AI Reviewer อิสระ, `word_similarity_threshold` (Default 0.6) ยังไม่ได้ปรับแต่ง — คำที่พิมพ์ผิดเยอะ (ทดสอบ "นาิกา" สลับตัวอักษรจาก "นาฬิกา") ยังหาไม่เจอ, ยังไม่ได้ทดสอบกับข้อมูลปริมาณมาก (Seed มีแค่ 16 แถว — Planner เลือก Seq Scan อยู่ ยังไม่เห็น Index Scan ทำงานจริงตอน Query ปกติ), ยังไม่มี Debounce ที่ Frontend สำหรับ Search-As-You-Type ถ้าจะทำต่อ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/product-service/prisma/schema.prisma`, `backend/services/product-service/prisma/seed.js`
- `backend/services/product-service/src/models/productModel.js`

## Task `MOCK-TRADE-012` — แก้ Gateway ล่มทุก Authenticated Request เมื่อชื่อผู้ใช้เป็นภาษาไทย

> วันที่ทำ: 2026-08-25
>
> สถานะตามหลักฐาน: ลงมือทำ, ยืนยัน Root Cause ด้วยการจำลอง Error ตรงๆ, ยืนยัน Fix ด้วย `curl` จริงผ่าน Container ที่ Build ใหม่ (Login บัญชีชื่อไทยจริง → เรียก Endpoint ที่ต้อง Authen จริง → 200 พร้อมข้อมูลจริง, Log Gateway ไม่มี Error), `npm test` ทั้ง Repo ผ่าน 44/44

### บริบท / อาการที่พบ

- ผู้ใช้รายงานว่า Clone ไปแล้ว "แตกเหมือนเดิม" พร้อมแปะ Log จริง: `gateway-1 | TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["x-user-display-name"]` เกิดซ้ำๆ ทุกครั้งที่มี Request เข้า `/register`, `/sell` ตามหลัง

### งานที่ทำ

1. หา Root Cause: [gateway/src/app.js](../backend/gateway/src/app.js) Set `req.headers["x-user-display-name"] = payload.displayName` ตรงๆ ก่อน Proxy ต่อ — ถ้า `displayName` เป็นภาษาไทย (เช่น Seed Sellers "มานพ", "ปิยะ" หรือชื่อจริงที่ผู้ใช้สมัคร) จะ Error เพราะ HTTP Header Value ตาม Spec รับได้แค่ Latin-1 เท่านั้น ยืนยันด้วยการจำลอง Error ตรงๆ ผ่าน `http.ClientRequest.setHeader()` นอก Container ก่อนแก้ (ได้ `ERR_INVALID_CHAR` เหมือน Log ผู้ใช้เป๊ะ)
2. แก้ `gateway/src/app.js`: `encodeURIComponent(payload.displayName || "")` ก่อน Set Header
3. แก้ `shared/src/authMiddleware.js`'s `fromGatewayHeaders()` ให้ `decodeURIComponent()` กลับตอนอ่าน Header เดียวกัน (คู่กับข้อ 2 แม้ตอนนี้ยังไม่มี Route ไหนเรียกใช้ `fromGatewayHeaders()` จริง — ทุก Service อ่าน `displayName` จาก JWT Payload ตรงๆ ผ่าน `requireAuth()` แทน — แต่แก้คู่กันไว้กัน Encode/Decode ไม่ตรงกันถ้ามีคนเอาไปใช้ในอนาคต)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                           | ผลที่เกิดขึ้นจริง                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| จำลอง `setHeader('x-user-display-name', 'มานพ')` ตรงๆ ก่อนแก้                                                     | `ERR_INVALID_CHAR` ตรงกับ Log ผู้ใช้                                                   |
| `npm test` (Repo ทั้งหมด)                                                                                         | 44/44 ผ่าน (ไม่มี Test เดิมที่ Cover Header นี้โดยตรง จึงไม่มี Test แตก)               |
| `npm run lint` เฉพาะไฟล์ที่แก้                                                                                    | Exit 0                                                                                 |
| Rebuild `gateway`, `auth-service`, `product-service`, `order-service`, `chat-service`, `review-service` + `up -d` | ทุก Container ขึ้น Healthy                                                             |
| `curl` Login `shop.denim@example.com` (ชื่อจริง "มานพ เดนิม") ผ่าน Gateway จริง                                   | ได้ Access Token กลับมาปกติ                                                            |
| `curl GET /api/products/mine` พร้อม Token ข้างต้น ผ่าน Gateway จริง                                               | `200 OK` พร้อมข้อมูลสินค้าจริง 4 ชิ้น, Gateway Log **ไม่มี** `ERR_INVALID_CHAR` อีกเลย |

### ผลลัพธ์ปัจจุบัน

- ผู้ใช้ที่มีชื่อ-นามสกุลภาษาไทย (Seed Seller ทุกคนและผู้สมัครจริงส่วนใหญ่) ใช้งาน Authenticated Route ผ่าน Gateway ได้ปกติ ไม่ล่มอีก
- นี่เป็น Bug เดิมที่มาจากรอบ "ProductVideo Provider Refactor" (Task ก่อนหน้าที่เพิ่ม `displayName` ลง Signed Access Token) ไม่ใช่ผลจากงานในรอบนี้ (`MOCK-TRADE-010`/`011`) แต่ถูกจับได้และแก้ในรอบเดียวกันเพราะผู้ใช้รายงานหลัง Clone ล่าสุด
- **ยังไม่ได้ทำ**: ยังไม่มี Automated Test คลุม Header Encode/Decode คู่นี้โดยตรง (ตรวจด้วย Manual `curl` เท่านั้น), ยังไม่ผ่าน AI Reviewer อิสระ

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/gateway/src/app.js`, `backend/shared/src/authMiddleware.js`

## Task `CSS-000`–`CSS-004` — Customer Service Core (Ticket, Agent Workspace, Dispute/Refund, SLA + FAQ)

> วันที่ทำ: 2026-08-25
>
> สถานะตามหลักฐาน: ลงมือทำและยืนยันครบทุกชั้น — `REQUIRE_INTEGRATION=1` PostgreSQL Test (16 Test ใหม่),
> `npm test` ทั้ง Repo 67/67, `npm run lint`/`format:check` ผ่าน, และ E2E จริงผ่าน Browser กับ Docker Stack
> ที่ Rebuild ใหม่ทั้งหมด (ไม่ใช่แค่เรียก Express App ผ่าน `supertest`)
>
> รายละเอียดเต็มอยู่ที่ [`docs/featureplan/customer-service/progress.md`](featureplan/customer-service/progress.md)
> (Evidence Table), [`plan.md`](featureplan/customer-service/plan.md) (เหตุผล Scope Revision เป็น Ticket-first
> แทน Chat-first) และ [`changelog.md`](featureplan/customer-service/changelog.md)

### สรุปงานที่ทำ

1. สร้าง `support-service` ใหม่ทั้ง Service (Express + Prisma, `reloop_support`) ต่อเข้าทุกจุดของ Infra:
   `docker-compose.yml`, `infra/postgres/init-databases.sql`, `.env.example`, `scripts/ensurePrismaClients.js`,
   Gateway Proxy (`/api/support`), `.github/workflows/ci.yml`
2. เพิ่ม `SUPPORT` Role + Seed เจ้าหน้าที่ Demo 2 คน; ขยาย Order Lifecycle ด้วย `disputed`/`refunded` +
   `payoutHeld`/`disputedAt` โดย Endpoint `PATCH /:id/status` ทั่วไปตั้งใจไม่ให้ตั้งค่า 2 สถานะนี้ได้
   (ต้องผ่าน Dispute Decision Flow เท่านั้น)
3. **CSS-005** Ticket Core: State Machine บริสุทธิ์ (`ticketState.js`), Optimistic Lock ตอน Assign/Transition,
   โน้ตภายในที่ผู้แจ้งมองไม่เห็น, Audit Log ทุก Privileged Action
4. **CSS-002** Agent Workspace: ค้นหา Order แบบมีขอบเขต (`orderId`/`buyerId`/`sellerId` เท่านั้น — ตัดข้อกำหนด
   "ค้นด้วยชื่อ/อีเมล" ออกเพราะ `order-service` ไม่มีข้อมูลนี้จริง) และปฏิเสธการค้นแบบไม่ใส่เงื่อนไขเพื่อกัน
   Agent Dump ทั้งตาราง
5. **CSS-003** Dispute/Refund: เปิดเคส → Hold Payout แบบ Atomic (`WF-08` ข้อ 3), ตัดสินได้ครั้งเดียวด้วย
   Optimistic Lock, หลักฐานเก็บใน Private Storage แยกจาก `uploads/` สาธารณะของ Product-Service โดยสิ้นเชิง
   (Directory + Docker Volume + `.gitkeep` ของตัวเอง), ทุกการเปิดดูหลักฐานตรวจสิทธิ์และบันทึก Audit (`NFR-SP-03`)
6. **CSS-004** SLA + FAQ: `calculatePriority()`/`calculateSlaDueAt()` เป็น Pure Function, SLA Monitor Escalate
   แบบปลอดภัยแม้รันหลาย Instance (`updateMany` แบบมีเงื่อนไข ไม่ใช่ Read-Then-Write), FAQ Search ใช้ `pg_trgm`
   Pattern เดียวกับ `MOCK-TRADE-011`
7. Frontend ครบ: `/help`, `/support/tickets(+[id])`, `/support/queue`, `/support/cases(+[id])`, ปุ่มเปิด
   ข้อพิพาท + แนบหลักฐานในหน้า `/orders`, ลิงก์ใน `NavBar`
8. หลักฐาน (รูป/วิดีโอ) โหลดผ่าน `fetch` แนบ Bearer Token → `Blob` → `ObjectURL` ไม่ใช่ `<a href>`/`<img src>`
   ตรงๆ เพราะ Browser ไม่แนบ Header กำหนดเองให้กับการ Navigate ธรรมดา

### บั๊กที่เจอและแก้ระหว่างตรวจสอบจริง (Test อัตโนมัติจับไม่ได้)

| #   | บั๊ก                                                                                                                  | สาเหตุที่ Test จับไม่ได้                                                                                           | วิธีแก้                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Frontend เรียก Decision Endpoint ด้วย `PATCH` แต่ Backend Route เป็น `POST` → `404` เงียบๆ                            | Integration Test เรียก Express App ตรงๆ ผ่าน `supertest` ไม่ได้ทดสอบ Frontend Call จริง                            | แก้ Method ให้ตรงกัน + ไล่เช็ค `apiFetch` ทุกจุดเทียบกับ Route จริงด้วยมือ                                           |
| 2   | ไฟล์ Frontend ใหม่/แก้ไขแล้ว Dev Server ไม่เห็นการเปลี่ยนแปลง                                                         | Docker Desktop บน Windows กับ Bind Mount มีช่องโหว่เรื่อง File Watcher ที่รู้จักกันอยู่แล้ว                        | `docker compose restart frontend` — ถ้าใครทำงานต่อในเครื่อง Windows แล้วหน้าเว็บไม่อัปเดตตามที่แก้ ให้ลองวิธีนี้ก่อน |
| 3   | `.gitignore` Pattern `uploads/*`/`private-evidence/*` ที่ตั้งใจครอบ Path ซ้อนลึกไม่ทำงานจริง (มาจาก `MOCK-TRADE-010`) | ไม่มี Test คลุม `.gitignore` เลย ต้องเจอตอนสร้าง Evidence File จริงระหว่างทดสอบแล้วสังเกตว่า `git status` ขึ้นไฟล์ | เปลี่ยนเป็น Path เต็มจาก Root, ยืนยันด้วย `git check-ignore -v` — รายละเอียดเต็มอยู่ที่ Task `MOCK-TRADE-010` ด้านบน |

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                                                                                                                            | ผลที่เกิดขึ้นจริง                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRE_INTEGRATION=1` support-service (4 ไฟล์)                                                                                                                                                   | 16 Test ผ่านหมด (Ticket Lifecycle, SLA Escalation ×2 รอบไม่ซ้ำ, Help Content, Health)                                                    |
| `REQUIRE_INTEGRATION=1` order-service (Dispute/Support ใหม่)                                                                                                                                       | 4 Test ผ่าน (Support Lookup, Dispute Decision ×2, Evidence Access) + Test เดิม 5 ตัวยังผ่านครบ                                           |
| `npm test` (Repo ทั้งหมด)                                                                                                                                                                          | 67/67 ผ่าน                                                                                                                               |
| `npm run lint` / `npm run format:check`                                                                                                                                                            | ผ่าน                                                                                                                                     |
| Rebuild `auth-service`, `order-service`, `support-service`, `gateway` + `docker compose up -d`                                                                                                     | ทุก Container ขึ้น Healthy                                                                                                               |
| E2E ผ่าน Browser จริง: สมัคร Buyer → เปิดข้อพิพาทพร้อมเหตุผล → Login Agent → ดู Queue/Assign/Reply Ticket แยกใบ → Requester เห็น Reply แต่ไม่เห็นโน้ตภายใน → Agent เปิด Case พิจารณาอนุมัติคืนเงิน | สำเร็จทุกขั้น, `orders.status` เปลี่ยนเป็น `refunded`, `payout_held` เปลี่ยนเป็น `false` ยืนยันด้วย Query ตรงหลัง Rebuild Container ใหม่ |

### ผลลัพธ์ปัจจุบัน

- Customer Service ใช้งานได้จริงครบวงจร: ผู้ใช้เปิด Ticket/ข้อพิพาทได้, เจ้าหน้าที่รับเรื่อง/ตอบ/ตัดสินได้,
  หลักฐานปลอดภัยไม่รั่วสู่สาธารณะ, SLA คำนวณและ Escalate อัตโนมัติ, FAQ ค้นภาษาไทยได้จริง
- **Deferred**: `CSS-001` Live Chat Console (`UR-18`, `WF-06`) — ดูข้อกำหนดตอนกลับมาทำใน `plan.md`
  (ต้อง Persist ก่อน Broadcast เพราะ `UR-25` ใช้ประวัติแชทเป็นหลักฐานข้อพิพาท)
- **ยังไม่ได้ทำ**: การแจ้งเตือนหัวหน้าทีมจริงตอน SLA ใกล้ครบ (`WF-10` ข้อ 3) ตอนนี้แค่เปลี่ยนสถานะเป็น
  `ESCALATED` ยังไม่มีช่องทางแจ้งเตือนจริง, ยังไม่ผ่าน AI Reviewer อิสระ, `buyer/plan.md` → `BUY-004` ยังรอ
  ตกลงกับ Buyer Owner เรื่อง `CSS-001` ที่ถูกเลื่อน

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/support-service/` (ทั้ง Service ใหม่)
- `backend/services/order-service/src/features/{disputes,support}/`, `backend/services/order-service/prisma/schema.prisma`
- `backend/services/auth-service/prisma/schema.prisma`, `backend/services/auth-service/prisma/seed.js`
- `backend/gateway/src/app.js`, `docker-compose.yml`, `infra/postgres/init-databases.sql`, `.env.example`,
  `scripts/ensurePrismaClients.js`, `.github/workflows/ci.yml`
- `frontend/app/help/`, `frontend/app/support/`, `frontend/app/orders/page.js`, `frontend/lib/api.js`,
  `frontend/components/NavBar.js`

## Task `UI-POLISH-001` — อัปเกรดหน้า Support Panel ให้สมบูรณ์แบบ (Impeccable UI)

> วันที่ทำ: 2026-08-26
>
> สถานะตามหลักฐาน: ลงมือทำและคอมไพล์ผ่านสมบูรณ์ (Frontend React/Next.js)

### สรุปงานที่ทำ

1. **อัปเกรด UI หน้าศูนย์กลาง (Support Panel):**
   - ปรับกล่องค้นหา (Search Box) ไม่ให้บังหน้าจอ
   - เพิ่มปุ่ม Copy (Full ID) สำหรับก๊อปปี้รหัสผู้ซื้อ/ผู้ขายในตารางข้อพิพาท เพื่อใช้วางค้นหาได้ทันที
2. **ปรับปรุงระบบ FAQ (FAQ Modal):** เปลี่ยนจากการพิมพ์ข้อความลงฟอร์มในหน้าเดียวกัน เป็น Popup Modal สไตล์ Glassmorphism กลางจอ รองรับการพิมพ์ข้อความยาวๆ อย่างเป็นระบบ
3. **Slide-over Modal (Tickets & Disputes):**
   - เปลี่ยนจาก Modal ทั่วไปที่ซ้อนทับกันงงๆ เป็น Slide-over Panel ที่เลื่อนออกมาจากขอบขวาของจอสุดพรีเมียม
   - เพิ่มระบบแอนิเมชันเปิด/ปิด (`animate-in slide-in-from-right` และ `animate-out slide-out-to-right`) ครบทุกจุด
   - รองรับการคลิกนอกกรอบ (Click outside) เพื่อสไลด์ปิดหน้าต่างอย่างนุ่มนวล และแก้บั๊กปุ่มปิด (Close button) เยื้อง
4. **Disputes Panel + Chat Slide-over:**
   - ออกแบบหน้าตาบัตรรายละเอียดผู้ร้องเรียน (Buyer Contact) และแกลเลอรีรูปภาพหลักฐาน (Evidence Gallery) ใหม่
   - วางระบบ "แชท" จำลอง (UI) สำหรับข้อพิพาท เมื่อกดแล้วจะมีหน้าต่างแชทสไลด์ออกมาซ้อนจากด้านซ้ายของหน้าต่างหลัก (เปิดให้ดูรายละเอียดเคสพร้อมกับแชทได้ในจอเดียว)
5. **Tickets Panel Details:** ขยายพื้นที่ตั๋ว (Tickets) ให้เป็น `max-w-2xl` ดึงข้อมูลทั้งหมดมาจัดวางอย่างสวยงาม และมีช่องเตรียมต่อระบบแชทในอนาคต

### ผลการตรวจที่ทำแล้ว

| การตรวจ                      | ผลที่เกิดขึ้นจริง                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run build` (Frontend)   | **Exit 0** (แก้บั๊ก ESLint `no-unused-vars` และ `react/no-unescaped-entities` ผ่านทั้งหมด) |
| ตรวจสอบ UI (Visual UI Check) | แอนิเมชันตอนเปิด/ปิดลื่นไหล, เปิด UI ย่อย (แชท) ได้โดย Layout ไม่พัง                       |

### ไฟล์หลักที่เป็นหลักฐาน

- `frontend/app/support/panel/page.js`

## Task `ADM-COMPLETE-001` — ทำให้ Admin สมบูรณ์ + รวม Executive/Marketing เข้า Panel Format เดียวกัน

> วันที่ทำ: 2026-08-26
>
> สถานะตามหลักฐาน: ลงมือทำ, ทดสอบผ่าน Browser จริงกับ Docker Stack ที่ Rebuild แล้ว, ยืนยันด้วย
> `npm test` / `npm run test:frontend` / `next build` / `eslint`

### สรุปงานที่ทำ

1. **แก้บั๊ก "สถานะส่งไม้ต่อรั่วนอกเคสระดับแอดมิน":** ตัด Option `ESCALATED` ออกจาก Dropdown
   ของ Tickets ทั่วไป, ทำ Dashboard KPI ให้ Role-aware (CS เห็น "Urgent" แทน "Escalated" ที่เป็น 0
   เสมอ, Admin คลิกแล้วพาไปเคสระดับแอดมินตรง)
2. **เพิ่มความสามารถ Admin ที่ Backend มีอยู่แล้วแต่ไม่เคยมี UI เรียก:** ลบ/กู้คืนสินค้าโดยตรง
   (ไม่ต้องพึ่ง Report), อนุมัติ/ปฏิเสธคำขอเปิดประมูล (`auctionService.approve/reject` ค้างมาตั้งแต่
   รอบ Merge ก่อนหน้าโดยไม่มี Frontend เรียกใช้เลย — ยืนยันจาก Seed Data จริงที่ค้างอยู่)
3. **แก้บั๊กจริงที่พบระหว่างทดสอบผ่าน Docker Stack (ไม่ใช่แค่ตอน Dev):**
   - Report action เรียก `/action` โดยไม่เคยเรียก `/review` ก่อน → 409 ทุกครั้งที่จัดการ Report
     ที่ยังเป็น OPEN
   - `restoreProduct` ส่ง `reason: null` เข้า Field ที่ Schema บังคับ Required → Prisma 500
   - `ComplaintsSection` (Executive) สมมติ Response Shape ผิด (ไม่ Unwrap `{data, meta}`) →
     หน้าเว็บ Crash ทันทีที่กดแท็บ "ข้อร้องเรียน"
4. **เชื่อม Dispute เข้ากับ Admin Fund-hold ที่มีอยู่แล้วแต่ไม่เคยถูกลิงก์จากที่ไหน:** ตัดปุ่ม
   "ส่งเรื่องให้ Admin" ที่พังมาตั้งแต่รอบก่อน (ส่ง Decision ที่ Backend ไม่รองรับ) เพิ่มลิงก์ไปหน้า
   Hold/Release จริงที่แสดงเฉพาะ Role ADMIN
5. **รวม Executive และ Marketing เข้า Sidebar Panel Format เดียวกับ CS/Admin
   (`/workspace`):** ย้าย UI Atom กลาง (`Badge`/`KpiCard`/`ChartCard`/`DropdownFilter`) จาก
   `components/support/ui/` ไป `components/panel/ui/` ให้ทุก Panel ใช้ร่วมกัน; เชื่อม
   Executive Complaints กลับเข้าข้อมูลจริง (เดิม Hardcode Empty ไว้เพราะกลัว Seed Data
   ดูเหมือนกิจกรรมจริง — Panel อื่นในระบบไม่มีข้อกังวลนี้แล้วหลัง Consolidate); เพิ่ม Dashboard
   Overview ใหม่ให้ Marketing (เดิมไม่มี)

### ผลการตรวจที่ทำแล้ว

| การตรวจ                       | ผลที่เกิดขึ้นจริง                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test` (Backend)          | 108 tests, 84 ผ่าน, 0 fail, 24 skip (integration ต้องการ `REQUIRE_INTEGRATION`)                                                                                                            |
| `npm run test:frontend`       | 28/28 ผ่าน (8 suites รวม Test ใหม่/แก้ไขสำหรับ Complaints, Reports)                                                                                                                        |
| `next build` (Production)     | สำเร็จครบ 22 route                                                                                                                                                                         |
| `eslint`                      | สะอาดทั้ง Backend และ Frontend                                                                                                                                                             |
| Browser จริงผ่าน Docker Stack | Login ครบ ADMIN/CUSTOMER_SERVICE/EXECUTIVE/MARKETING, เดิน Flow ลบ/กู้คืนสินค้า, อนุมัติประมูล → เห็นผลฝั่ง Marketing ทันที, Report Review→Action ไม่ 409, Dispute Admin Link แสดงถูก Role |

### ไฟล์หลักที่เป็นหลักฐาน

- `frontend/app/workspace/page.js`, `frontend/app/executive/page.js`, `frontend/app/marketing/page.js`
- `frontend/components/panel/ui/`, `frontend/components/support/sections/ProductsSection.js`,
  `frontend/components/support/sections/AuctionApprovalsSection.js`
- `frontend/components/executive/sections/`, `frontend/components/marketing/sections/`
- `backend/services/auth-service/src/features/productModeration/`
- `backend/services/product-service/src/controllers/productController.js` (`adminSearch`)
- รายละเอียดเต็มแยกตามทีมที่ `docs/featureplan/admin/changelog.md`,
  `docs/featureplan/executive/changelog.md`, `docs/featureplan/marketing/changelog.md`,
  `docs/featureplan/customer-service/changelog.md`

## Task `ADM-COMPLETE-002` — Report Creation, WARN_USER Decision, Ticket Counterparty (`targetId`)

> วันที่ทำ: 2026-08-26
>
> สถานะตามหลักฐาน: ลงมือทำ, ทดสอบผ่าน Browser จริงกับ Docker Stack ที่ Rebuild แล้ว, ยืนยันด้วย
> `npm test` / `npm run test:frontend` / `eslint`

### สรุปงานที่ทำ

ผู้ใช้ตั้งข้อสังเกตสองรอบต่อเนื่องกัน: (1) `report:create` permission มีอยู่แล้วแต่ไม่มี endpoint
ไหนใช้จริง, (2) Admin มีแค่ "แบน" เป็นทางเลือกเดียว และปุ่มแบน/ตักเตือนบนตั๋วที่ Escalate ยิงไปที่
ผู้แจ้ง (`requesterId`) เสมอ — ผิดหลักการเมื่อเรื่องจริงเกี่ยวกับอีกฝ่าย

1. **เปิดทาง Report creation จริง:** `POST /api/auth/reports` endpoint ใหม่ +
   `ReportModal.js` (Reusable) + ปุ่ม "รายงาน" บนหน้าสินค้าและหน้าร้านค้า
2. **เพิ่ม `WARN_USER` เป็น Decision ที่ไม่ใช่การแบน:** ใช้ได้ทั้งกับ Report-decision flow และ
   Ticket แบบ Standalone endpoint (`POST /admin/users/:id/warn`) — บันทึก Audit แต่ไม่แตะ
   `user.status`
3. **เพิ่มคู่กรณี (`targetId`) ให้ `SupportTicket`:** Schema เพิ่ม Field ใหม่ (Soft reference แบบ
   เดียวกับ `orderId`), ฟอร์มเปิดตั๋วให้ผู้ใช้ผูก Order จริงได้ ระบบ Derive คู่กรณีอัตโนมัติจากอีกฝ่าย
   ของ Order นั้น, `AdminInboxSection.js` เพิ่มการ์ด "คู่กรณี (Target)" แยกจากการ์ดผู้แจ้งเดิม พร้อม
   ปุ่มตักเตือน/แบนของตัวเองที่ผูกกับ `targetId` ไม่ใช่ `requesterId`

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                                                                          | ผลที่เกิดขึ้นจริง                                               |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `npm test` (Backend)                                                                             | 108 tests, 84 ผ่าน, 0 fail, 24 skip (เท่าเดิม ไม่มี Regression) |
| `npm run test:frontend`                                                                          | 28/28 ผ่าน (เท่าเดิม)                                           |
| `eslint`                                                                                         | สะอาดทุกไฟล์ที่แก้                                              |
| Browser จริงผ่าน Docker Stack (Rebuild `support-service`)                                        | Login เป็น Buyer สร้างตั๋วผูก Order จริง                        |
| → Query DB ตรงยืนยัน `target_id` ตรงกับ Seller ของ Order นั้น (ไม่ใช่ผู้แจ้ง) → Escalate ตั๋ว →  |
| Login เป็น Admin เปิดเคสระดับแอดมิน เห็นการ์ด "คู่กรณี" แสดง Seller ID แยกจากการ์ดผู้แจ้งที่แสดง |
| Buyer ID ถูกต้อง — ลบข้อมูลทดสอบและคืนค่า Baseline ครบหลังยืนยันเสร็จ                            |

### ไฟล์หลักที่เป็นหลักฐาน

- `backend/services/auth-service/src/features/reports/reportService.js`,
  `reportRoutes.js`
- `backend/services/support-service/prisma/schema.prisma`,
  `src/features/tickets/ticketController.js`, `ticketService.js`
- `frontend/components/ReportModal.js`,
  `frontend/components/support/sections/AdminInboxSection.js`
- `frontend/app/support/tickets/page.js`, `frontend/app/products/[id]/page.js`,
  `frontend/app/store/[sellerId]/page.js`
- รายละเอียดเต็มแยกตามทีมที่ `docs/featureplan/admin/changelog.md`,
  `docs/featureplan/customer-service/changelog.md`

## Task `UI-SYSTEM-001` — Design Token, UI Primitive Layer และการสลาย God Component ฝั่ง Frontend

> วันที่ทำ: 2026-09-02
>
> สถานะตามหลักฐาน: ลงมือทำ, ทดสอบผ่าน Browser จริงกับ Docker Stack (postgres, gateway,
> auth, product, order, support) ด้วยบัญชี Demo Admin และ Demo Seller, ยืนยันด้วย
> `npm run lint` / `npm run format:check` / `npm run test:frontend`
>
> หมายเหตุ: สถานะนี้ไม่ใช่การยืนยันว่า Acceptance Criteria ผ่านครบทุกข้อ

### ที่มา

ผู้ใช้ขอให้ทำความเข้าใจโปรเจกต์โดยเน้น UX/UI แล้วสั่งให้แก้ทั้งหมดพร้อม Refactor ส่วนที่เป็น
God Code สิ่งที่วัดได้จากโค้ดก่อนเริ่ม:

- ปุ่ม CTA สี emerald อยู่ใน **37 ไฟล์** ด้วย padding **10 แบบที่ต่างกัน**
- input class string เดียวกันเป๊ะๆ ซ้ำ **54 ครั้ง**, Modal เขียนมือซ้ำ **5 ไฟล์**, Table ซ้ำ **5 ไฟล์**
- `alert()` **4 จุด**, `window.confirm` **1 จุด**, `window.prompt` **2 จุด** ในหน้าที่ใช้ทำงานจริง
- `.catch(() => {})` กลืน Error **17 จุด** → Backend ล่ม = ผู้ใช้เห็นหน้าว่าง ไม่มีคำอธิบาย
- `text-gray-400` **62 ครั้ง** (2.85:1 ไม่ผ่าน WCAG AA)
- ไฟล์ใหญ่สุด `AdminInboxSection.js` **887 บรรทัด** เป็นฟังก์ชันเดียวยาวรวด
- ไม่มีฟอนต์ไทย ทำให้ตัวไทยหน้าตาต่างกันในแต่ละ OS

### งานที่ทำ

1. **ปลด Quality Gate ที่เสียอยู่ก่อน (`d840b54`)** — `format:check` ที่ CI รันจริง Fail
   249 ไฟล์บน Windows เพราะ `core.autocrlf=true` ชนกับ `endOfLine: "lf"` ของ Prettier
   เพิ่ม `.prettierrc` (`endOfLine: "auto"`) แล้วพบว่ายังมี **56 ไฟล์ที่ไม่ได้ Format จริง**
   → **CI แดงอยู่บน `main`** จัดการด้วย `npm run format` และเพิ่ม `.agent/`, `.claude/`,
   `.github/skills/` เข้า eslint ignores (เคยทำให้ `npm run lint` ขึ้น 6,672 error ในเครื่อง)
2. **Design Token + ฟอนต์ + ไอคอน (`c5dbdf6`)** — Token brand/semantic/surface/line/ink
   ใน `globals.css` map เข้า Tailwind, Noto Sans Thai ผ่าน `next/font`, ย้าย Material
   Symbols จาก `useEffect` 4 จุดมาประกาศครั้งเดียวใน `layout.js`, เพิ่ม `.focus-ring`
   และ `prefers-reduced-motion`
3. **UI Primitive Layer** — `components/ui/`: `Button`, `Input`/`Select`/`Textarea`/`Field`,
   `Modal`, `ConfirmDialog`, `ToastProvider`, `Alert`, `EmptyState`, `ErrorState`,
   `Skeleton`, `DataTable` — ไม่เพิ่ม Runtime Dependency ใหม่เลย
4. **นำ Primitive ไปใช้กับ Storefront (`eed766b`)** — หน้าแรก, รายการสินค้า, Login, Register,
   NavBar, ProductCard, Footer, Pagination
5. **สลาย God Component (`5988e0d`, `d8794f0`, `52e552f`, `a2f2baf`)** — ดูตารางด้านล่าง
6. **ยกระดับ Contrast และเลิกกลืน Error (`1b8be7f`)** — 37 ไฟล์

### ผลการสลาย God Component

| ไฟล์                                    | ก่อน | หลัง | แตกออกเป็น                                                                                                                   |
| --------------------------------------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `support/sections/AdminInboxSection.js` | 887  | 338  | `admin-inbox/AdminInboxTable`, `admin-inbox/ReportCasePanel`, `case/CaseDrawer`, `case/TicketCasePanel`, `case/CaseUserCard` |
| `support/sections/DisputesSection.js`   | 789  | 240  | `disputes/DisputesTable`, `disputes/DisputeDetailPanel`, `disputes/DisputeChatPanel`, `disputes/CopyableId`                  |
| `support/sections/TicketsSection.js`    | 542  | 188  | `tickets/TicketsTable` + ใช้ `case/*` ร่วมกับ Admin Inbox                                                                    |
| `app/seller/onboarding/page.js`         | 431  | 207  | `seller/onboarding/KycForm`, `KycStatusCard`, `KycDocumentUpload`, `IdCardField`                                             |
| `app/seller/dashboard/page.js`          | 428  | 239  | `seller/dashboard/SalesSummary`, `SellerProductList`, `RecentOrderList`, `sellerStatus`                                      |

`TicketsSection` กับ `AdminInboxSection` เคยมี Markup ซ้ำกันประมาณ 250 บรรทัด (Drawer,
Info strip, การ์ดผู้แจ้ง, การ์ดเจ้าหน้าที่, Chat placeholder, แถว Action) ต่างกันแค่ CS ตักเตือน/
แบนไม่ได้ — จึงยกส่วนที่ใช้ร่วมไปไว้ที่ `case/` แล้วให้ `CaseUserCard` แสดงปุ่ม Moderation
เฉพาะเมื่อผู้เรียกส่ง Handler มาให้

### บั๊กจริงที่เจอระหว่างทาง

| บั๊ก                                                                                                                                                                                         | สถานะ                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ไอคอน NavBar 2 จุด (`ปัดดูสินค้า`, `ประมูล`) เป็น `<span aria-hidden="true"></span>` ว่าง ตกค้างจาก `d98e8a1`                                                                                | แก้แล้ว → `swipe` / `gavel`                            |
| `Modal` (z-50) เปิดขึ้นมาอยู่ **ใต้** Case Drawer (z-[100]) กดยืนยันไม่ได้                                                                                                                   | แก้แล้ว → ตั้ง Stacking Order เป็นชื่อใน Tailwind      |
| Focus trap ของ `Modal` กรอง Element ด้วย `offsetParent !== null` แต่ Panel อยู่ใน `position:fixed` ซึ่ง Descendant ทุกตัวรายงาน `offsetParent === null` แปลว่า Trap ตายทั้งในเบราว์เซอร์จริง | เจอจากการเขียน Test → แก้แล้ว                          |
| Admin ตักเตือนผู้ใช้สำเร็จ แต่หน้าจอขึ้น "you do not have access to this ticket" สีแดงใต้ Toast ที่บอกว่าสำเร็จ (GET `/tickets/:id` 403 ทั้งที่ Queue คืนตั๋วใบเดียวกันมาให้)                | ฝั่ง UI ไม่แสดงแล้ว; ต้นเหตุฝั่ง Backend **ยังไม่แก้** |
| Drop zone อัปโหลดบัตรประชาชนเป็น `<div onClick>` คีย์บอร์ดเข้าไม่ถึงเลย                                                                                                                      | แก้แล้ว → `<button>`                                   |
| Spinner ของ Evidence ใน Disputes อ้าง keyframe `spin` ที่ไม่มีใน CSS ของโปรเจกต์                                                                                                             | แก้แล้ว → `Skeleton.Text`                              |

### ผลการตรวจที่ทำแล้ว

| การตรวจ                                             | ผลที่เกิดขึ้นจริง                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run lint`                                      | ผ่าน (จากเดิม 6,672 error ในเครื่องพัฒนา)                                |
| `npm run format:check`                              | ผ่าน (จากเดิม Fail และ CI แดงอยู่บน `main`)                              |
| `npm run test:frontend`                             | 37/37 ผ่าน (เพิ่มใหม่ 9: `Modal`, `Button`, `Toast`, Error path หน้าแรก) |
| `next build`                                        | สำเร็จ ทุก Route Compile ผ่าน                                            |
| Browser: หน้าแรกตอน Backend ดับ                     | ขึ้น `ErrorState` + ปุ่มลองใหม่ (เดิมเป็นหน้าว่างเปล่า)                  |
| Browser: `/products`                                | Skeleton รูปทรงเดียวกับการ์ดจริง                                         |
| Browser: `/workspace` → เคสระดับแอดมิน (Demo Admin) | ตาราง, Report panel, Ticket panel เรนเดอร์ครบ                            |
| Browser: ตักเตือนผู้ใช้โดยไม่กรอกเหตุผล             | ถูกบล็อกพร้อม Error ในฟอร์ม (เดิมเป็น `window.prompt`)                   |
| Browser: ตักเตือนผู้ใช้พร้อมเหตุผล                  | สำเร็จ ขึ้น Toast                                                        |
| Browser: `/workspace` → Disputes (5 เคส Seed)       | ตาราง, Detail panel, Chat sub-panel เรนเดอร์ครบ                          |
| Browser: `/workspace` → Tickets (CS view)           | ใช้ Panel ร่วมกัน และ **ไม่มี** ปุ่มตักเตือน/แบน ถูกต้อง                 |
| Browser: `/workspace` → จัดการสินค้า → ลบสินค้า     | `ConfirmDialog` บอกชื่อสินค้าและผลของการลบ                               |
| Browser: `/seller/onboarding` (Demo Seller)         | ฟอร์มเรนเดอร์ครบ, ตัวนับหลักบัตรประชาชนทำงาน                             |
| Browser: `/seller/dashboard`                        | Hero, Sparkline, Charts, รายการสินค้า เรนเดอร์ครบ                        |
| Browser: `/cart` (ตะกร้าว่าง)                       | `EmptyState` พร้อมปุ่ม "เลือกซื้อสินค้า"                                 |

### ผลลัพธ์ปัจจุบัน

- ไม่มี `alert()`, `confirm()`, `prompt()` เหลืออยู่ใน Frontend
- ไม่มี `.catch(() => {})` แบบเงียบสนิทเหลืออยู่
- ไม่มี `text-gray-400` / `text-slate-400` บนพื้นสว่างเหลืออยู่
- Diff รวม 8 Commit: 133 ไฟล์, +5,810 / −3,187

### ไฟล์หลักที่เป็นหลักฐาน

- `frontend/app/globals.css`, `frontend/tailwind.config.js`, `frontend/app/layout.js`
- `frontend/components/ui/*` (14 ไฟล์ + 3 ไฟล์ Test)
- `frontend/components/support/sections/{case,admin-inbox,disputes,tickets}/*`
- `frontend/components/seller/{onboarding,dashboard}/*`
- `.prettierrc`, `eslint.config.js`
- กติกาสำหรับคนที่มาต่อ: [`docs/ui-conventions.md`](ui-conventions.md)

## อัปเดตล่าสุด

2026-09-02 (Asia/Bangkok)
