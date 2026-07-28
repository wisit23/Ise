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
