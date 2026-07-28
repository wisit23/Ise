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
> สถานะตามหลักฐาน: ลงมือทำและตรวจสอบเองครบ (จำลอง CI Pipeline ทั้งหมดด้วย Postgres จริงที่สร้างและลบทิ้ง) รอ AI Reviewer ตรวจอิสระ (ตามรอบของ `FOUND-001`) ก่อนถือว่าเสร็จ
>
> หมายเหตุ: สถานะนี้ไม่ใช่การยืนยันว่า Acceptance Criteria ผ่านครบทุกข้อ — ยังไม่มี Coverage Threshold (ตั้งใจ ดูเหตุผลด้านล่าง) และ Test ที่เขียนไว้เป็นเพียง "หนึ่งชุดต่อชั้น" ตาม Scope ไม่ใช่ Test ครอบคลุมทุกกรณี (นั่นคืองานของ `TEST-001`/`TEST-002`)

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
| `npm run secret-scan`                                                       | 0 พบ จาก 82 ไฟล์ที่ Track                                                           |
| `npm test` (Backend: jwt/gateway/auth-service/scripts)                      | ผ่านทั้งหมด (ไม่มี Database: Integration Test Skip อย่างชัดเจน)                     |
| `npm test` พร้อม Postgres Container จริงที่สร้าง-ทดสอบ-ลบทิ้ง               | ผ่านทั้งหมดรวม Integration Test (Register→Login→Reject รหัสผิด ต่อฐานข้อมูลจริง)    |
| `npm run test:frontend`                                                     | ผ่าน 2/2 (Render Heading + Guest Nav Links)                                         |
| จำลองขั้นตอน CI ทั้งหมดจาก Root ตามลำดับเดียวกับ `.github/workflows/ci.yml` | ผ่านทุกขั้นตอนโดยไม่มีการแก้ไขเพิ่มหลังจำลองครั้งสุดท้าย                            |
| ทดสอบ Test ที่ตั้งใจให้ Fail                                                | รายงาน File/Line/Expected/Actual ชัดเจน, Exit Code 1 — ลบออกและยืนยัน Exit 0 กลับมา |
| YAML Syntax ของ `.github/workflows/ci.yml`                                  | ผ่าน (ตรวจด้วย `js-yaml`)                                                           |

### ผลลัพธ์ปัจจุบัน

- มี Test อัตโนมัติจริงครอบคลุม "หนึ่งชุดต่อชั้น" ตามที่ Scope ของ Task กำหนด ไม่ใช่ Test ครอบคลุมทุก Feature
- Lint Gate ผ่านจริงเป็นครั้งแรกของโปรเจกต์ (ไม่ใช่แค่ตั้งเครื่องมือไว้เฉยๆ)
- มี Secret Scanner ที่ทดสอบแล้วว่าจับ Secret ปลอมได้จริงและไม่ก่อ False Positive กับโค้ดปกติ
- มี CI Pipeline พร้อมใช้งานจริงใน `.github/workflows/ci.yml` (ผู้ใช้อนุมัติให้ Push แล้ว)
- ยังไม่มี Coverage Threshold บังคับ (ตัดสินใจไว้ตรงๆ ไม่ใช่ลืม)
- ยังไม่ผ่านการตรวจจาก AI Reviewer อิสระเหมือน `FOUND-001` — เป็นขั้นตอนถัดไป

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
