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

## อัปเดตล่าสุด

2026-07-29 (Asia/Bangkok)
