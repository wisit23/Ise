# ผลตรวจระบบ โดยเน้นผู้ขาย — 23 ตุลาคม 2026

ตรวจ working tree ปัจจุบัน รวมการแก้ไขที่มีอยู่ก่อนเริ่มงาน ไม่ได้แก้ application code หรือข้อมูลธุรกิจ

## ขอบเขตและผลทดสอบ

- Frontend ที่เกี่ยวข้องกับผู้ขาย สินค้า ออเดอร์ checkout การส่งข้อความ และวิดีโอ: **27 suites / 173 tests ผ่านทั้งหมด**
- กลุ่มผู้ขายโดยตรงและ shipping modal: **10 suites / 70 tests ผ่านทั้งหมด** เป็นส่วนหนึ่งของ 173 tests ข้างต้น ไม่นับเพิ่ม
- Backend และ scripts: **1,111 tests — ผ่าน 979, ไม่ผ่าน 13, ข้าม 119**
- 13 failures แบ่งเป็น 10 เคสที่ขาดฐานข้อมูล/สิ่งแวดล้อม integration และ 3 เคสที่ assertions ไม่ตรงกับพฤติกรรมปัจจุบัน จึงไม่ใช่ 13 บั๊กของระบบ
- Lint ทั้ง repository: **19 errors**
- Production build จาก working directory `frontend`: คอมไพล์สำเร็จ แต่ **build ไม่ผ่าน** เพราะ lint ใน `components/orders/MyOrders.js:138`
- การลอง frontend ทั้งหมดพบ assertion failures 3 เคสใน `AuctionScheduleSection.test.js` แต่การรันชุดเต็มไม่ได้เสร็จครบ จึงไม่รายงานจำนวนผ่าน/ตกของ frontend ทั้งระบบ
- ไม่มี `.env` และไม่มีบริการแอป/ฐานข้อมูลเปิดบนพอร์ตที่กำหนด จึงยังไม่ได้ทดสอบผ่าน browser หรือยืนยันวงจรซื้อ–ชำระ–ส่ง–รับสินค้า บนฐานข้อมูลจริง
- การรัน backend ครั้งแรกติดข้อจำกัด localhost ของ sandbox จึงรันซ้ำโดยอนุญาต localhost แล้ว ใช้ผลรอบหลังสำหรับตัวเลขข้างต้น

## จุดที่ควรแก้ เรียงตามความสำคัญ

### 1. P1 — Production build ไม่ผ่าน

**ตำแหน่ง:** `frontend/components/orders/MyOrders.js:138`

`catch (_) {}` ทำให้เกิด `no-unused-vars` และ `no-empty` ในขั้นตรวจ lint ของ Next build แม้ขั้น compile สำเร็จแล้ว ส่งผลให้ยังสร้าง production build ตามขั้นตอนปกติไม่ได้

**ควรแก้:** จัดการ error ให้เหมาะสม หรือใช้ catch ที่ไม่มีตัวแปรพร้อมระบุเหตุผลสำหรับ error ที่ตั้งใจข้าม แล้วรัน build ซ้ำ ส่วน repository ยังมี lint อีกหลายจุด รวมถึง undefined variable ใน preflight ของ chat ที่กล่าวด้านล่าง

**หลักฐาน:** `seller-audit-build-workspace.log`, `seller-audit-lint.log`

### 2. P1 — รายการประมูลของร้านหายเมื่อข้อมูลระบบเพิ่มขึ้น

**ตำแหน่ง:** `frontend/app/seller/auctions/page.js:216`, `backend/shared/src/pagination.js:2`

หน้าเรียก `/api/products/auctions?limit=100` แล้วกรอง `sellerId` ใน frontend แต่ backend จำกัด limit สูงสุดไว้ที่ **50** และไม่มีการโหลดหน้าถัดไป ดังนั้นนี่คือ 50 รายการแรกของทุกผู้ขาย หากรายการของร้านอยู่ลำดับที่ 51 เป็นต้นไป หน้าของผู้ขายจะไม่แสดงรายการนั้น และอาจดูเหมือนไม่เคยลงประมูล

รายการสินค้าที่ต้องดำเนินการหลังประมูลเรียก `/api/products/mine?status=auction_action_required` โดยไม่กำหนด limit/page จึงเห็นเพียงหน้าแรก ค่าเริ่มต้น 12 รายการ

**ควรแก้:** ทำ endpoint สำหรับรายการของผู้ขายที่ยืนยันตัวตน กรองเจ้าของก่อนแบ่งหน้า และให้ UI มี pagination หรือโหลดครบทุกหน้า แสดง total ที่แท้จริง

**วิธียืนยัน:** สร้างรายการประมูลของหลายร้านมากกว่า 50 รายการ โดยให้รายการของร้านที่ทดสอบอยู่หน้าสอง จากนั้นเปิดหน้าประมูลของร้าน ตรวจว่ารายการนั้นแสดงและดำเนินการต่อได้

**สถานะหลักฐาน:** ยืนยันจากเส้นทางโค้ด frontend/controller/service/pagination ยังไม่ได้ seed และเปิด browser กับ DB จริง

### 3. P1 — Thai ID ยังเป็น mock และ backend รับวิธีนี้โดยไม่มีหลักฐานจากผู้ให้บริการ

**ตำแหน่ง:** `frontend/components/seller/onboarding/ThaiIdQrStep.js:11,70`, `backend/services/auth-service/src/features/kyc/kycService.js:32,55`

QR และข้อมูลบุคคลเป็นค่าจำลองคงที่ ปุ่มสแกนเพียงรอ 1.5 วินาทีแล้วส่ง `MOCK_THAI_ID_DATA` กลับ UI ขณะที่ตัวเลือกแนะนำว่าสามารถดึงข้อมูลจาก Thai ID App จริง

ฝั่ง service ยกเว้นไฟล์เอกสารเมื่อ client ส่ง `verifyMethod: "thai_id"` และใช้ `THAI_ID_METHOD` เป็น storage key โดยไม่มีการตรวจ session/proof จากผู้ให้บริการ ทดสอบ service จริงโดย mock เฉพาะ persistence พบว่าส่งข้อมูล 13 หลักทั่วไปพร้อมวิธีนี้โดยไม่มีไฟล์หรือ provider proof ก็สร้างคำขอ **PENDING** ได้

**ผลกระทบ:** ผู้ตรวจ KYC อาจได้คำขอที่ไม่มีเอกสารหรือหลักฐาน Thai ID จริง ข้อนี้ไม่ได้หมายความว่าบัญชีถูก VERIFIED อัตโนมัติ เพราะยังมีขั้นอนุมัติ

**ควรแก้:** ระหว่างยังไม่เชื่อมบริการจริง ให้ปิดตัวเลือกนี้หรือระบุชัดว่าเป็น demo และให้ server ปฏิเสธการใช้แทนหลักฐานจริง เมื่อเชื่อมแล้วต้องตรวจหลักฐานที่ผูกกับบัญชี/session ทาง server ก่อนรับคำขอ

### 4. P2 — ยอดสุทธิผู้ขายไม่อิงค่าธรรมเนียมที่ backend ตั้งไว้ และเสียความละเอียดระดับสตางค์

**ตำแหน่ง:** `frontend/lib/sellerRevenue.js:1,6`, `backend/services/order-service/src/features/metrics/feeConfig.js`, `backend/services/order-service/src/features/metrics/platformMetrics.js`

Frontend ล็อกอัตราไว้ 3% และปัดรายได้ต่อออเดอร์เป็นจำนวนเต็มด้วย `Math.round()` แต่ backend มี `PLATFORM_FEE_RATE` ที่ตั้งค่าได้ และคำนวณ metric ค่าธรรมเนียมเป็นทศนิยมสองตำแหน่ง

**กรณียืนยัน:** ยอดขาย 100 บาท ตั้งอัตรา backend เป็น 5% จะได้สุทธิ 95 บาท แต่ฟังก์ชันผู้ขายยังแสดง 97 บาท ส่วนยอด 101 บาทที่อัตรา 3% ได้ 98 บาทใน frontend แทนผลคำนวณสองตำแหน่ง 97.97 บาท

**ควรแก้:** ให้ backend ส่งยอดสุทธิและค่าธรรมเนียมตามกติกาที่ตกลงแล้ว โดยใช้ฐานยอดและหลักการปัดเศษร่วมกัน หากมี settlement จริงควรใช้ค่าที่บันทึก ณ รายการนั้น ไม่คำนวณย้อนหลังจากค่าคงที่หน้าเว็บ

**ข้อจำกัด:** ยืนยันความไม่ตรงกันของสูตร/metric ยังไม่ได้ยืนยันยอดจ่ายเงินจริงหรือระบบโอนเงิน

### 5. P2 — กราฟและรายการรายวันใช้เขตเวลาไม่ตรงกัน

**ตำแหน่ง:** `frontend/components/seller/dashboard/SellerDashboardCharts.js:172,557`, `frontend/app/seller/dashboard/page.js:227`

กราฟรายชั่วโมง/บางช่วงรายวันใช้ `Asia/Bangkok` แต่ตัวกรองรายการและบางส่วนตัดวันที่ด้วย `createdAt.slice(0, 10)` ซึ่งเป็นวันที่ UTC

**กรณียืนยัน:** ออเดอร์เวลา `2026-10-22T17:30:00.000Z` คือ **23 ตุลาคม 00:30 น. เวลาไทย** แต่เมื่อเลือกวันที่ 23 ตัวกรองคืน 0 รายการ ทั้งที่กราฟรายชั่วโมงควรนับไว้ในวันนั้น ทำให้กราฟกับรายละเอียดวันเดียวกันไม่ตรงกัน

**ควรแก้:** ใช้ฟังก์ชันสร้าง date key ของเวลาไทยร่วมกันทุกส่วน รวมทั้งค่า default ของวันที่ อีกเรื่องที่ควรตกลงคือกราฟรายได้ควรลงวันที่ `completedAt` หรือ `createdAt` เพราะปัจจุบันออเดอร์ที่สำเร็จวันนี้อาจย้อนยอดไปวันที่สร้างออเดอร์

### 6. P2 — หน้าอัปโหลดคลิปเลือกสินค้าได้เพียงหน้าแรก

**ตำแหน่ง:** `frontend/app/seller/videos/new/page.js:38`

โหลด `/api/products/mine?limit=50` ครั้งเดียว แล้วตัดสินค้าที่ขายแล้ว/ถูกลบออกภายหลัง หาก 50 รายการแรกใช้ไม่ได้ แต่สินค้าที่พร้อมขายอยู่หน้าสอง UI จะบอกว่าไม่มีสินค้าให้รีวิว ทั้งที่มีจริง และไม่สามารถเลือกสินค้าเก่าเกินหน้าแรกได้

**ควรแก้:** กรองสินค้าที่มีสิทธิ์ทาง backend ก่อนแบ่งหน้า แล้วเพิ่มค้นหาหรือ pagination ในตัวเลือกสินค้า

## ข้อสังเกตเพิ่มเติม

- **KYC วันหมดอายุไม่ถูกส่งกลับ:** `kycService.getMine()` ไม่คืน `idCardExpiry` ใน `sellerProfile` ทั้งที่หน้า onboarding อ่านฟิลด์นี้มาเติมแบบฟอร์ม จึงไม่สามารถเติมวันเดิมเมื่อส่งคำขอใหม่ได้ ควรคืนค่าให้เจ้าของบัญชีและเพิ่ม test round-trip
- **Chat migration preflight:** `backend/services/chat-service/prisma/idempotencyPreflight.js:8` ใช้ `duplicates.length` ทั้งที่ไม่มีตัวแปร `duplicates` หากพบ key ซ้ำจะเกิด ReferenceError แทนรายงานสรุปที่ตั้งใจไว้ ควรใช้ `duplicateGroups` และทดสอบกรณีพบ duplicates
- **Test expectations ที่ควรตรวจปรับ:** `reviewMedia.test.js` ยังไม่คาด `removed: false`; `demo-cs-admin.test.js` ยังคาด ADMIN แต่ข้อมูลใช้ TRUST_AND_SAFETY; test retry ใน `auctionService.test.js:4162` นับ mock requests รวมทั้ง chat กับ notification bell หลังมีการส่งสองช่องทาง จึงยังสรุปว่าแจ้งเตือนจริงซ้ำไม่ได้
- **Marketing รอบประมูล:** พบ 3 assertion failures เรื่องสร้างรอบและเลือกหมวดหมู่ใน `AuctionScheduleSection.test.js` ควรแยกตรวจ test mocks กับ UI ก่อนสรุปเป็นบั๊ก เพราะเกี่ยวข้องกับการเปิดรอบให้ผู้ขายส่งสินค้า

## หลักฐานและการรันซ้ำ

- `coverage/seller-audit/focused-results.json` — ผล Jest 173 tests
- `coverage/seller-audit/seller-results.json` — subset ผู้ขาย 70 tests
- `seller-audit-backend-unrestricted.log` — ผล backend รอบที่อนุญาต localhost
- `seller-audit-lint.log` — lint 19 errors
- `seller-audit-build-workspace.log` — build จาก frontend ตาม working directory ที่ถูกต้อง
- `seller-audit-reproductions.log` — ตัวอย่าง date/fee/KYC
- `node coverage/seller-audit/reproduce.cjs` — รันตัวอย่างยืนยัน date/fee/KYC โดยไม่เขียน DB

คำสั่งหลัก:

```powershell
# รันจาก repository root
node --test --test-reporter=spec --test-concurrency=4 "backend/**/*.test.js" "scripts/*.test.js"
npm run lint

# รันจาก frontend
node ../node_modules/jest/bin/jest.js --runInBand --coverage=false --watchman=false --testPathPatterns='seller|products|orders|chat.send|useSellerLiveRefresh|checkout|VideoUploader'
node ../node_modules/next/dist/bin/next build
```

การตรวจต่อที่ยังจำเป็นก่อนยืนยันพร้อมใช้งาน: ฐานข้อมูลทดสอบแยก, seller หลายร้านและรายการมากกว่า 50, KYC manual/expired/rejected, ชำระซ้ำ, ผู้ขายยืนยัน/ปฏิเสธ, tracking, dispute/hold/refund, การกลับเข้าระบบหลัง role/KYC เปลี่ยน และการ reconnect ของ chat โดยใช้บริการจริงครบชุด
