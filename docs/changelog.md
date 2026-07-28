# RE-LOOP Changelog

> ไฟล์นี้เก็บประวัติว่าโครงการเปลี่ยนอะไร เมื่อใด และเพราะอะไร  
> สถานะล่าสุดของแต่ละ Task ให้อ่านจาก [`progress.md`](progress.md)

## วิธีอ่าน

- แต่ละรายการเรียงตามเวลาที่เกิดขึ้น
- Task ID บอกว่างานนั้นเชื่อมกับ Task ใดในแผน
- ข้อความ `APPROVED`, `CHANGES REQUESTED` และผล Verification ต้องมาจากหลักฐานจริง
- การมีรายการใน Changelog ไม่ได้แปลว่า Task เสร็จ ให้ยึดสถานะใน `progress.md`

## 2026-07-28

### สร้างสถานะตั้งต้นของโครงการ

**Task ที่เกี่ยวข้อง:** `DISC-001`, `DOC-001`

**รายละเอียด:** สร้าง Baseline จากหลักฐานใน Repository โดยยังไม่มี Production Task ใดผ่านเกณฑ์ใหม่ ตอนนั้นระบุ `DISC-001` เป็นงานถัดไปและ `DOC-001` เป็นงานที่กำลังทำ

**สรุป:** ได้จุดเริ่มต้นสำหรับติดตามงาน แต่ยังไม่มี Task ที่นับว่าเสร็จ

### ทำ `FOUND-001` รอบแรก

**Task ที่เกี่ยวข้อง:** `FOUND-001`

**รายละเอียด:** กำหนดเวอร์ชัน Node.js และ npm, สร้าง Lockfile, เพิ่ม ESLint และ Prettier, เพิ่ม `.dockerignore`, เพิ่ม `requireEnv()` ให้ `gateway` และ `auth-service` ตรวจ Environment Variable ก่อนเริ่มทำงาน และเพิ่มคำสั่งใน `README.md`

Lint พบปัญหาเดิมใน Application Code ซึ่งไม่ได้แก้ใน Task นี้เพราะอยู่นอกขอบเขตของการตั้งค่าเครื่องมือตรวจ สถานะจึงถูกเก็บเป็น `รอตรวจสอบ` แทน `เสร็จแล้ว`

**สรุป:** Implementation รอบแรกถูกทำแล้ว แต่ยังต้องผ่าน Reviewer และเกณฑ์หลักฐานครบถ้วน

### Independent AI Review รอบที่ 1

**Task ที่เกี่ยวข้อง:** `FOUND-001`

**Reviewer:** Independent AI reviewer (Opus 5)

**ผล Review:** `Partially verified` และ `CHANGES REQUESTED`

**รายละเอียด:** Reviewer ตรวจ Acceptance Criteria และรันคำสั่งใหม่ด้วยตนเอง แทนการเชื่อรายงานของผู้ทำงาน พบประเด็นดังนี้:

1. `npm run lint` ยังออกด้วย Exit Code 1 เพราะมีปัญหาเดิมใน Application Code 7 จุด จึงบันทึกไว้ให้ `FOUND-002` ปิดงาน
2. Prettier ทำให้ตำแหน่ง Comment สำหรับปิดกฎ ESLint ใน `backend/shared/src/errors.js` เปลี่ยนและเกิด Lint error ใหม่ จึงแก้เป็น `eslint-disable-next-line`
3. `.nvmrc` และ `engines` กำหนด Node.js 22 แต่ Dockerfile ทั้ง 7 ไฟล์ยังใช้ Node.js 20 จึงปรับเป็น Node.js 22 และทดลอง Build `auth-service` กับ `frontend`
4. เอกสารเขียนว่า `package-lock.json` ถูก Commit แล้ว ทั้งที่ยังเป็นไฟล์ใหม่ใน Working Tree จึงแก้คำอธิบายให้ตรงกับความจริง
5. หลักฐานเดิมเขียนว่า `node --check` ครอบคลุม 31 ไฟล์ แต่จริง ๆ ไม่ได้ตรวจ Frontend ES modules 7 ไฟล์ จึงแก้เป็น Backend CommonJS 24 ไฟล์ และระบุว่า Frontend ใช้ ESLint ตรวจ Parsing
6. เพิ่มคำอธิบายการส่งค่า `DATABASE_URL_AUTH` ไปเป็น `DATABASE_URL` ใน Compose
7. บันทึกความเสี่ยงว่า `INTERNAL_SERVICE_TOKEN` อาจผ่านเมื่อไม่ได้ตั้งค่าทั้งสองฝั่ง แม้ปัจจุบัน Middleware นี้ยังไม่ถูกใช้งาน
8. บันทึกช่องโหว่ระดับสูงจาก `npm audit` 8 รายการโดยยังไม่แก้ เพราะต้องพิจารณาผลกระทบของ Dependency
9. แก้ ESLint config ที่เคยมองไฟล์ `frontend/*.config.js` เป็น ES module ทั้งที่เป็น CommonJS

Reviewer ยังตรวจว่าไม่มี Secret ถูก Commit และไม่มี Application Logic เปลี่ยนนอกเหนือจากการเพิ่ม `requireEnv()`

**สรุป:** ผู้ทำแก้ข้อค้นพบจาก Review รอบแรกแล้ว แต่ยังต้องตรวจซ้ำ

### Independent AI Review รอบที่ 2

**Task ที่เกี่ยวข้อง:** `FOUND-001`

**Reviewer:** Independent AI reviewer คนเดิม

**ผล Review:** ตรวจข้อแก้ไขได้ `11/12` รายการ แต่ผลรวมยังเป็น `Partially verified` และ `CHANGES REQUESTED`

**รายละเอียด:** Reviewer รันคำสั่งใหม่ทั้งหมด, Build `auth-service` และ `frontend` image จากศูนย์, ตรวจ Node.js version ภายใน Container และทดลองกรณี Environment Variable หาย

พบประเด็นใหม่ `R1`: `package-lock.json` ควบคุม Dependency ตอนติดตั้งบนเครื่องผู้พัฒนา แต่ Dockerfile ยังไม่ Copy Lockfile และยังไม่ใช้ `npm ci` ดังนั้นคำสั่ง `docker compose up --build` ยังอาจเลือก Dependency รุ่นใหม่จากช่วงเวอร์ชันใน `package.json` ได้ ประเด็นนี้ถูกบันทึกเป็น Technical debt และแก้ข้อความใน `deployment.md` ไม่ให้กล่าวเกินหลักฐาน

Acceptance Criteria ที่ยังไม่ครบมีสองส่วน:

1. Lint check ยังไม่ผ่านเพราะมีปัญหาเดิม 7 จุด
2. Container build ยังไม่ได้ล็อก Dependency ด้วย Lockfile

สองส่วนนี้ถูกส่งต่อให้ `FOUND-002` หรือ `INFRA-001` ตามขอบเขตที่เกี่ยวข้อง

**สรุป:** AI Reviewer เห็นว่าหลักฐานเพียงพอสำหรับส่งให้มนุษย์พิจารณา แต่ Human Reviewer ยังต้องตัดสิน `APPROVED` หรือ `CHANGES REQUESTED` สถานะของ `FOUND-001` จึงยังเป็น `รอตรวจสอบ`
