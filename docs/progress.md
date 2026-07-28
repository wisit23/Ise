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

## อัปเดตล่าสุด

2026-07-29 (Asia/Bangkok)
