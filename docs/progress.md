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

## อัปเดตล่าสุด

2026-07-28 (Asia/Bangkok)
