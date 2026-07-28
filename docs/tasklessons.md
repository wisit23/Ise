# RE-LOOP Task Lessons

เอกสารนี้บันทึกเฉพาะบทเรียนจาก Task ที่ลงมือทำจริง โดยแยกเนื้อหาทีละ Task

## Task `FOUND-001` — สร้างมาตรฐานการติดตั้งและตรวจโครงการ

### Task นี้ทำอะไร

Task นี้ทำให้สมาชิกทีมติดตั้งและตรวจโครงการด้วยเครื่องมือพื้นฐานชุดเดียวกัน ลดปัญหาเครื่องของแต่ละคนใช้ Node.js หรือ Dependency คนละรุ่น และทำให้ Service แจ้งข้อผิดพลาดทันทีเมื่อการตั้งค่าไม่ครบ

### สิ่งที่ทำจริง

1. กำหนด Node.js 22 และ npm 10 ขึ้นไปสำหรับเครื่องพัฒนา
2. ปรับ Dockerfile ทั้ง 7 ไฟล์ให้ใช้ Node.js 22
3. สร้าง `package-lock.json` สำหรับ npm workspace
4. เพิ่ม ESLint และ Prettier พร้อมคำสั่งตรวจจาก Root
5. เพิ่ม `.dockerignore`
6. เพิ่ม `requireEnv()` ให้ `gateway` และ `auth-service`
7. เขียนวิธีติดตั้งและคำสั่งตรวจไว้ใน `README.md`
8. แก้ข้อค้นพบจาก AI Review รอบแรกและให้ Reviewer ตรวจซ้ำรอบที่สอง

### ระบบตรวจ Environment Variable ทำงานอย่างไร

ตัวอย่างของ `auth-service`:

1. ผู้พัฒนาหรือ Docker เริ่ม Service
2. `server.js` เรียก `requireEnv()`
3. ระบบตรวจ `DATABASE_URL`, `JWT_ACCESS_SECRET` และ `JWT_REFRESH_SECRET`
4. ถ้าค่าใดหาย ระบบหยุดพร้อมแจ้งชื่อค่าที่ขาดก่อนเปิด Port
5. เมื่อค่าครบ Service จึงเริ่มรับ Request

วิธีนี้เรียกว่า **fail fast** คือหยุดทันทีเมื่อการตั้งค่าผิด แทนการเปิดระบบแบบไม่สมบูรณ์แล้วค่อยพังภายหลัง

### ปัญหาที่พบและวิธีแก้

#### Node.js บนเครื่องพัฒนาและ Docker ไม่ตรงกัน

- อาการ: เครื่องพัฒนาถูกกำหนดให้ใช้ Node.js 22 แต่ Dockerfile ยังใช้ Node.js 20
- สาเหตุ: การกำหนด Version ถูกแก้เพียงเส้นทางเดียว
- วิธีแก้: ปรับ Dockerfile ทั้ง 7 ไฟล์เป็น Node.js 22 แล้ว Build `auth-service` และ `frontend` เพื่อตรวจจริง
- บทเรียน: ต้องตรวจ Version แยกทุกเส้นทางที่ใช้รันระบบ เช่น เครื่องพัฒนา, Container และ CI

#### Prettier ทำให้คำสั่งปิดกฎ ESLint อยู่ผิดตำแหน่ง

- อาการ: หลัง Format เกิด Lint error ใหม่ใน `backend/shared/src/errors.js`
- สาเหตุ: Comment เดิมไม่ได้ควบคุมบรรทัดที่ต้องการหลังถูกจัดรูปแบบ
- วิธีแก้: เปลี่ยนเป็น `eslint-disable-next-line` และวางไว้เหนือบรรทัดที่ต้องการ
- บทเรียน: หลังใช้ Formatter ต้องรัน Lint หรือ Test ซ้ำเสมอ

#### Lockfile ไม่ได้ควบคุมทุกเส้นทาง

- สิ่งที่ตรวจพบ: `package-lock.json` ควบคุมการติดตั้งของ npm workspace บนเครื่องพัฒนา แต่ Dockerfile ใช้ `npm install` จาก `package.json`
- บทเรียน: การมี Lockfile ไม่ได้แปลว่าทุก Environment ใช้ Dependency ชุดเดียวกัน ต้องตรวจคำสั่งติดตั้งจริงของแต่ละเส้นทาง

### ผลการตรวจที่เกิดขึ้นจริง

- `docker compose config --quiet` ผ่าน
- `npm ci --dry-run` ยืนยันว่า Lockfile ตรงกับ workspace manifests
- `npm run format:check` ผ่าน
- Backend CommonJS ผ่าน `node --check` 24/24 ไฟล์
- ESLint อ่านและตรวจ Frontend ES modules ได้ 7 ไฟล์
- Build image ของ `auth-service` และ `frontend` สำเร็จ
- Container ของ `auth-service` ใช้ Node.js `v22.23.1`
- เมื่อไม่ใส่ Environment Variable ที่จำเป็น `auth-service` หยุดก่อนเปิด Port ตามที่ออกแบบ
- `npm run lint` พบปัญหาเดิมใน Application Code 7 จุด
- `npm audit --audit-level=high` พบช่องโหว่ระดับสูงจาก Dependency ทางอ้อม 8 รายการ
- AI Reviewer ตรวจงาน 2 รอบ โดยรอบแรกพบ 12 ประเด็นและรอบสองตรวจซ้ำหลังแก้

### สรุปบทเรียน

การทำให้โครงการติดตั้งซ้ำได้ไม่ได้จบแค่การระบุ Version หรือสร้าง Lockfile ต้องตรวจเส้นทางที่ใช้จริงทั้งหมดด้วย Task นี้ทำให้มาตรฐานบนเครื่องพัฒนาและ Container ใกล้กันขึ้น เพิ่มเครื่องมือตรวจจาก Root และทำให้ Service หยุดอย่างชัดเจนเมื่อการตั้งค่าไม่ครบ

รายละเอียดผลตรวจและลำดับการแก้อยู่ใน [`progress.md`](progress.md) และ [`changelog.md`](changelog.md)

## Task `FOUND-002` — สร้างระบบตรวจคุณภาพอัตโนมัติ (Test/Lint/Scan/CI)

> สถานะ: **Partially verified** — AI Reviewer อิสระอนุมัติแล้ว (APPROVED) แต่ยังมี 4 เงื่อนไขที่เปิดไว้โดยตั้งใจ โดยเฉพาะ Branch Protection บน `main` ที่ยังไม่มีใครยืนยันว่าเปิดใช้จริง (ต้องทำโดยมนุษย์ที่มีสิทธิ์ Admin) — ห้ามอ่านว่า Task นี้ "เสร็จสมบูรณ์"

### Task นี้ทำอะไร

Task นี้สร้าง "ผู้ตรวจอัตโนมัติ" ให้โครงการ: ทุกครั้งที่มีคน Push โค้ดขึ้น GitHub ระบบจะรัน Lint, ตรวจรูปแบบ, สแกนหา Secret รั่ว, รัน Test, Build Frontend, และตรวจ Docker Compose เองโดยอัตโนมัติ แล้วรายงานว่าผ่านหรือไม่ผ่านให้เห็นชัด

### สิ่งที่ทำจริง

1. เพิ่ม Test Framework: `node:test` (มากับ Node.js อยู่แล้ว) สำหรับ Backend, Jest + Testing Library สำหรับ Frontend
2. เขียน Test "หนึ่งชุดต่อชั้น" เป็นหลักฐานว่าต่อสายถูก: Unit (JWT), Integration ต่อฐานข้อมูลจริงแบบทิ้งได้ (Register/Login), Component (หน้า Home), Smoke (Health check ของ Gateway และ Auth-service)
3. แยก `backend/gateway/src/server.js` เป็น `app.js` (ตัว Express App) กับ `server.js` (ตัวเปิด Port) เพื่อให้ Test เรียก App ตรงๆ ได้โดยไม่ต้องเปิด Port จริง
4. เขียน `scripts/secretScan.js` สแกนไฟล์ในโปรเจกต์หารูปแบบ Secret รั่ว (Private Key, AWS Key, GitHub Token, รหัสผ่านที่เผลอฝัง) แบบไม่พึ่ง Library ภายนอก
5. เพิ่ม `.github/workflows/ci.yml` ให้รันทุกอย่างข้างต้นอัตโนมัติบน GitHub ทุกครั้งที่ Push หรือเปิด Pull Request
6. ระหว่างทำพบว่า 4 ใน 7 จุดที่ `FOUND-001` เคยบันทึกว่า "Lint error เดิม" จริงๆ เป็น False Positive ของ Config เอง (ไม่รู้จัก Component ที่ใช้ผ่าน JSX) แก้ที่ Config แทนการลบ Import ที่ใช้งานจริง — ตอนนี้ `npm run lint` ผ่านสนิท

### ทำไม Secret Scanner ถึงพลาดได้ ทั้งที่มี Test ของตัวเอง

1. `scripts/secretScan.js` มีรูปแบบ (Regex) ที่รู้จัก เช่น Private Key, AWS Key, และคำที่ขึ้นต้นด้วย `SECRET`/`TOKEN`/`PASSWORD`
2. Reviewer ตรวจพบว่า Regex เดิมต้องการให้คำเหล่านี้ "ขึ้นต้น" ชื่อตัวแปรเท่านั้น
3. แต่ชื่อตัวแปรจริงของโปรเจกต์นี้ เช่น `JWT_ACCESS_SECRET` หรือ `POSTGRES_PASSWORD` มีคำนั้นอยู่ "ท้าย" ชื่อ ไม่ใช่ต้น
4. ผลคือถ้ามีคนเผลอใส่รหัสผ่านจริงแทนค่าตัวอย่างใน `.env.example` แล้ว Commit, Scanner จะไม่จับเลย
5. แก้โดยเปลี่ยน Regex ให้จับคำเหล่านี้ได้ไม่ว่าจะอยู่ตำแหน่งไหนของชื่อตัวแปร แล้วเขียน Test เพิ่มยืนยันด้วยชื่อจริงของโปรเจกต์

บทเรียน: การมี Unit Test ของเครื่องมือตรวจสอบเอง ไม่ได้แปลว่าเครื่องมือนั้นครอบคลุมทุกกรณีจริง ต้องมีคนอื่นมาลองคิดว่า "มันพลาดอะไรได้บ้าง" ไม่ใช่แค่ตรวจว่า "มันทำสิ่งที่ตั้งใจให้ทำหรือเปล่า"

### ปัญหาที่พบและวิธีแก้

#### CI Run จริงล้มเหลว 2 ครั้งติดต่อกัน ทั้งที่จำลองด้วยมือผ่านหมดแล้ว

- อาการรอบแรก: `npm run secret-scan` ผ่านตอนทดสอบบนเครื่อง แต่ CI Run จริงบน GitHub ล้มเหลวที่ขั้นตอนเดียวกัน
- สาเหตุ: `scripts/secretScan.test.js` เป็นไฟล์ที่จงใจใส่ Secret ปลอมไว้ทดสอบตัว Scanner เอง แต่ Scanner กลับสแกนไฟล์นี้เป็นส่วนหนึ่งของ Repository ด้วย จึง Flag ตัวเอง และ Password ทดสอบในไฟล์ Integration Test ก็ถูก Flag ผิดเช่นกัน
- วิธีแก้: ยกเว้นไฟล์ Fixture ของ Scanner เองออกจากการสแกน Repository (เหตุผลเดียวกับที่ `.env.example` ได้รับการยกเว้น) และข้ามกฎเดาแบบหลวมๆ (แต่ไม่ข้ามกฎที่มั่นใจสูงอย่าง Private Key) สำหรับไฟล์ Test
- อาการรอบสอง (หลังแก้รอบแรก): CI Run จริงผ่านเกือบหมด เหลือ Fail ที่ขั้นตอน "ตรวจ Docker Compose config"
- สาเหตุ: `docker-compose.yml` ต้องการให้ไฟล์ `.env` มีอยู่จริงบน Disk ซึ่ง `.env` ถูก Gitignore ไว้ถูกต้องอยู่แล้ว เครื่อง CI ที่เพิ่ง Checkout ใหม่จึงไม่มีไฟล์นี้ ในขณะที่เครื่องพัฒนาทุกคนมีอยู่แล้ว (สร้างจาก `cp .env.example .env` ตาม README) จึงไม่เคยเจอปัญหานี้ตอนทดสอบบนเครื่อง
- วิธีแก้: เพิ่ม Step `cp .env.example .env` ใน CI ก่อนตรวจ Compose — ใช้ขั้นตอนเดียวกับที่ README บอกนักพัฒนาใหม่อยู่แล้ว
- บทเรียนสำคัญที่สุดของ Task นี้: **การจำลอง CI ด้วยมือบนเครื่องตัวเอง ไม่เท่ากับ CI Run จริง 100%** เพราะเครื่องพัฒนามักมีไฟล์หรือสถานะที่ CI ไม่มี ต้องเห็น CI Run จริงผ่านทุก Step อย่างน้อยหนึ่งครั้งก่อนถือว่า Pipeline "ใช้งานได้จริง"

#### `mkdir -p` ใช้ไม่ได้เมื่อ npm เรียกผ่าน cmd.exe บน Windows

- อาการ: คำสั่ง `npm test` ที่มี `mkdir -p coverage && node --test ...` รันไม่ผ่านบนเครื่องนี้ ทั้งที่รันตรงผ่าน Bash เองได้ปกติ
- สาเหตุ: เมื่อ `npm run` เรียก Script บน Windows มันใช้ `cmd.exe` เป็นค่าเริ่มต้น ซึ่งไม่รู้จัก Flag `-p` ของ `mkdir` แบบ Unix
- วิธีแก้: เปลี่ยนไปใช้ `pretest` Hook ที่เรียก `node -e "fs.mkdirSync(...)"` แทน เพราะ Node API ทำงานเหมือนกันทุก OS ไม่ผูกกับ Shell ใดๆ
- บทเรียน: คำสั่งใน `package.json` Script ไม่ใช่ Bash Script — ต้องเขียนให้ไม่ผูกกับ Shell เฉพาะเจ้าใดเจ้าหนึ่ง โดยเฉพาะทีมที่มีทั้งเครื่อง Windows และ Linux/Mac ปนกัน

### ผลการตรวจที่เกิดขึ้นจริง

- `npm run lint` ผ่านสนิท (Exit 0) — แก้ทั้ง False Positive ของ Config และปัญหาจริง
- `npm test` ผ่านครบ รวม Integration Test ที่ทดสอบกับ Postgres จริงที่สร้างและลบทิ้ง (ยืนยัน Register → Login → ปฏิเสธรหัสผิด ทำงานถูกต้อง แล้วลบข้อมูลทดสอบของตัวเองออกหมด)
- `npm run test:frontend` ผ่าน (Render หัวข้อ + เมนูสำหรับผู้ใช้ที่ยังไม่ Login)
- CI Run จริงบน GitHub Actions ผ่านครบทุก Step (Lint, Format, Secret scan, Audit, Test Backend/Frontend, Build Frontend, Upload Coverage, ตรวจ Compose) — ยืนยันผ่าน GitHub API ตรงๆ ไม่ใช่แค่คาดเดา
- AI Reviewer อิสระตรวจ 2 รอบ: รอบแรกพบ 9 ประเด็น (3 ข้อต้องแก้ก่อนอนุมัติ) รอบสองยืนยันว่าแก้ครบและ **APPROVED**

### สรุปบทเรียน

การสร้างระบบตรวจอัตโนมัติไม่ได้จบตอนเขียน Test หรือไฟล์ CI เสร็จ — ต้อง**เห็น CI Run จริงผ่านจริง** อย่างน้อยหนึ่งครั้งก่อนเชื่อว่ามันทำงาน เพราะเครื่องพัฒนากับเครื่อง CI ไม่เหมือนกันเสมอไป และเครื่องมือตรวจสอบเอง (เช่น Secret Scanner) ก็ต้องมีคนอื่นมาช่วยคิดว่ามันพลาดอะไรได้บ้าง ไม่ใช่แค่เชื่อว่ามัน Test ตัวเองผ่านแล้วจะครอบคลุมทุกกรณีจริง

รายละเอียดผลตรวจและลำดับการแก้อยู่ใน [`progress.md`](progress.md) และ [`changelog.md`](changelog.md)
