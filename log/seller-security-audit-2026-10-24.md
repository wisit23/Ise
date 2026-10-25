# ผลตรวจระบบที่เกี่ยวข้องกับผู้ขาย — 24 ตุลาคม 2026

ตรวจ repository ที่ commit `6b585a8` และ working tree ปัจจุบัน ตรวจพบความเสี่ยงด้านความปลอดภัย ความถูกต้องของธุรกรรม และความพร้อมใช้งานตามรายการด้านล่าง **ยังไม่ได้แก้ application code หรือ deploy** สร้างเฉพาะรายงานและไฟล์หลักฐานการตรวจ

ขอบเขต: gateway/shared auth และ permissions, บัญชีผู้ขาย/KYC/ข้อมูลร้าน/บัญชีธนาคาร/ข้อความอัตโนมัติ, สินค้า/สื่อ/วิดีโอ/หน้าร้าน/รีวิว, ประมูลและการจัดสรรผู้ชนะ, cart/checkout/payment/order/shipping, dispute/hold/refund, chat/socket/notification, dashboard/revenue/live refresh, jobs, schema/migrations และ Compose/ไฟล์ deploy ที่เชื่อมกับระบบนี้

นี่เป็นการตรวจโค้ดและรันการทดสอบในเครื่อง ไม่ใช่การรับรองว่าระบบ production ปลอดภัยทุกกรณี ไม่ได้ทดสอบเจาะระบบที่เผยแพร่อยู่จริงหรือยืนยันวงจรธุรกรรมกับบริการจริงครบชุด ไม่ได้พบหลักฐานจากการตรวจนี้ว่าเป็นการจงใจฝัง backdoor; ปัญหาที่รายงานคือพฤติกรรมของโค้ดที่อาจทำให้เกิดอันตราย

## ผลการทดสอบปัจจุบัน

| การตรวจ | ผล |
|---|---|
| Frontend ทั้งหมด | 156 suites: ผ่าน 155, ไม่ผ่าน 1; 1,076 tests: ผ่าน 1,073, ไม่ผ่าน 3 |
| Frontend กลุ่ม seller/products/orders/chat/checkout/auth/payment/upload | 35 suites / 230 tests ผ่านทั้งหมด เป็น subset ของชุดเต็ม |
| Backend และ scripts ทั้งหมด รอบอนุญาต localhost | 1,166 tests: ผ่าน 1,034, ไม่ผ่าน 36, ข้าม 96 |
| กรณีจำลองยืนยันข้อค้นพบ R1–R10 | ผ่านทั้ง 10 กรณี หมายถึงจำลองพฤติกรรมเสี่ยงสำเร็จ ไม่ใช่ยืนยันว่าช่องโหว่ถูกแก้ |
| Lint repository | ไม่ผ่าน 19 errors |
| Production frontend build | compile ผ่าน แต่ build ไม่ผ่าน lint ที่ MyOrders.js:138 |
| npm advisory | ยังไม่ได้ตรวจ ผู้ใช้เลือกตรวจเฉพาะในเครื่อง |

36 failures ของ backend ไม่เท่ากับ 36 บั๊ก: มี 20 เคสประมูลติด fixture กำหนดเวลาเปิดรับสินค้าเป็นอดีต, 12 เคสติดฐานข้อมูล/URL/สิ่งแวดล้อม, 3 เคส assertion ไม่ตรงพฤติกรรมปัจจุบัน และสถานะล้มเหลวของ suite ประมูลอีก 1 รายการ ผล frontend ที่ไม่ผ่านทั้ง 3 อยู่ใน `AuctionScheduleSection.test.js` ต้องแยกแก้ fixture/UI ต่อก่อนสรุปว่าการใช้งานจริงเสีย

## รายการที่ควรแก้ก่อนเปิดใช้งานจริง

P1 = มีโอกาสกระทบบัญชี ข้อมูล หรือธุรกรรมโดยตรง ควรแก้ก่อนใช้งานจริง; P2 = มีผลต่อสิทธิ์บางส่วน ความถูกต้อง หรือการทำงาน ควรวางแผนแก้ ระดับที่มีเงื่อนไข deployment ระบุไว้แยกชัดเจน

### F01 — P1: ตัวอัปโหลดสินค้ายอมรับไฟล์ HTML และนำไปเสิร์ฟบน origin ของแอป

ตำแหน่ง: `backend/services/product-service/src/middleware/upload.js:24–35`, `src/app.js:27`, `src/routes/uploadRoutes.js:11–16`, `frontend/lib/auth.js:36–38`

เงื่อนไขปฏิเสธใช้ `!isMimeOk && !isExtOk` จึงต้องผิดทั้ง MIME และนามสกุลถึงถูกปฏิเสธ ผู้ขายส่งชื่อไฟล์ `.html` แต่ระบุ multipart MIME เป็น `image/png` ได้ ระบบเก็บนามสกุลเดิมและเปิดอ่านผ่าน `/uploads/…html` แบบ public โดย Express เลือก Content-Type ตามนามสกุล

ถ้าเปิดไฟล์นั้นผ่าน gateway ที่อยู่ origin เดียวกับหน้าเว็บ เนื้อหา HTML/JavaScript สามารถทำงานใน origin ของแอป มีความเสี่ยงขโมย access/refresh token ใน localStorage ของผู้ที่เปิดลิงก์และเรียก API แทนบุคคลนั้น ไม่ใช่การยืนยันว่าโค้ดฝั่ง server ถูก execute

**หลักฐาน R1:** เรียก fileFilter และตัวสร้างชื่อไฟล์จริง ยืนยัน `.html` + `image/png` ผ่าน และชื่อปลายทางยังลงท้าย `.html` ยังไม่ได้รัน payload ใน browser ของผู้ใช้

แนวแก้ที่เสนอ: บังคับ MIME และนามสกุลที่สอดคล้องกัน ตรวจชนิดไฟล์จากเนื้อหา แปลงภาพเมื่อเหมาะสม เสิร์ฟสื่อจาก origin แยกที่ไม่มี session และกำหนด response headers ให้เหมาะสม การเปลี่ยน `&&` เป็น `||` เพียงอย่างเดียวไม่ใช่การตรวจเนื้อหาไฟล์

### F02 — P1: คำสั่งแสดงสินค้าสามารถปลดสถานะจองหรือประมูล

ตำแหน่ง: `backend/services/product-service/src/controllers/productController.js:161–189`, `src/models/productModel.js:490–509`

`PATCH /api/products/:id/visibility` ตรวจเจ้าของแล้ว แต่ `setVisibility(id, true)` ไม่บังคับว่าต้นทางต้องเป็น `hidden` ใช้ `preRemovalStatus || "available"` กับสินค้าที่เป็น `reserved`, `auction`, `auction_action_required` ได้ ผู้ขายส่ง `visible:true` ตรงผ่าน API จึงทำให้สินค้ากลับเป็น `available` ได้

**หลักฐาน R2:** ทั้ง 3 สถานะข้างต้นเปลี่ยนเป็น `available` โดยฟังก์ชันจริงกับ persistence จำลอง เสี่ยงเปิดให้ผู้อื่นจองสินค้าที่มีออเดอร์หรือประมูลอยู่แล้ว การซ่อนสินค้าในสถานะประมูลก็ไม่มีข้อห้ามเฉพาะใน model ปัจจุบัน

แนวแก้ที่เสนอ: อนุญาตเฉพาะ transition สำหรับ visibility ที่นิยามไว้ ตรวจต้นทางใน atomic update และใช้กติกาการล็อกเดียวกับ reservation/auction ห้ามนำสถานะการค้าไปอนุมานจากค่า default ของการแสดงผล

### F03 — P1: WebSocket ไม่ตรวจ session ที่ถูก revoke/บัญชีที่ถูกระงับ

ตำแหน่ง: `backend/services/chat-service/src/realtime/socketAuth.js:11–27`, `socketServer.js:73–86`, `broadcast.js:55–91`

REST ตรวจ live session แต่ socket handshake ตรวจเฉพาะลายเซ็นและอายุ JWT ไม่มี lookup สถานะ session/account ผู้ที่ยังถือ JWT อายุไม่หมดแต่ logout ไปแล้วหรือถูกระงับจึงยัง reconnect ได้ และ socket ที่เชื่อมไว้ไม่มีการตัดเมื่อ token หมดอายุหรือ session ถูก revoke

**หลักฐาน R3:** token ที่ลายเซ็นถูกต้องแต่ไม่มี `sid` ยังผ่าน handshake ทั้งที่ REST session validation ปฏิเสธ token ลักษณะนี้ เส้นทาง socket ที่อ่านไม่มีการตรวจ session เพิ่ม ผู้ใช้ดังกล่าวอาจยังรับข้อความในห้องที่เคย join และ notification ใน user room ได้ ข้อนี้ไม่ได้หมายความว่าส่งข้อความผ่าน REST หลังถูกระงับได้

แนวแก้ที่เสนอ: ใช้ session validation ชุดเดียวกับ REST ตรวจตอนเชื่อมและเมื่อดำเนินการสำคัญ ตัด socket เมื่อหมดอายุ/revoke/suspend และควบคุมการส่งข้อมูลไปยัง connection ที่ยังได้รับอนุญาต

### F04 — P1: หลบกำหนดชำระประมูลผ่าน checkout confirm ได้

ตำแหน่ง: `backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:53–103,262–305`; เทียบ `controllers/orderController.js:241–254`

เส้นทาง `/:id/pay` ตรวจ `paymentDeadlineAt` แต่ `POST /checkout-sessions/:id/confirm` ไม่ตรวจ และ create checkout ก็ไม่ตรวจ deadline ของ auction ตรวจเพียง status/อายุ basket ซึ่ง auction ไม่มี basket

**หลักฐาน R6:** ออเดอร์ AUCTION ที่ deadline ผ่านแล้วแต่ยังเป็น `pending_payment` สร้าง checkout ใหม่และ confirm เป็น `paid` ได้ ถ้า worker ยังไม่ยกเลิกออเดอร์ ผู้ชนะเดิมมีช่องเวลาชำระหลังหมดสิทธิ์ การจำลองใช้ fixture ของ repository กับ service จริง

แนวแก้ที่เสนอ: บังคับ deadline ใน service กลางและในเงื่อนไข atomic payment claim ทั้ง create/confirm กำหนดอายุ checkout ไม่ให้ยาวกว่า deadline ของแต่ละ auction

### F05 — P1: QR checkout หมดอายุแล้วนำสินค้าประมูลกลับขายปกติอัตโนมัติ

ตำแหน่ง: `backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:164–216`, `services/productSyncService.js:39–57`, `backend/services/product-service/src/controllers/productController.js:423–433`

อายุ QR คือ 10 นาที แต่สิทธิ์ชำระประมูลมีอายุ 24 ชั่วโมง เมื่อ checkout หมดอายุหรือยกเลิก `expire()` ยกเลิกออเดอร์และสำหรับ order ที่ไม่มี basket จะสั่ง `SET_STATUS available` รวมถึง AUCTION โดยไม่มีการจัดสรรผู้ชนะลำดับถัดไปก่อนเปิดสินค้า

**หลักฐาน R7:** สร้าง checkout ของ auction ที่ยังเหลือ deadline 24 ชั่วโมง รอผ่านเวลา QR 11 นาทีด้วยนาฬิกาจำลอง พบออเดอร์ถูก cancelled และมี outbox สั่ง `available` อาจเปิดให้ buy-now แข่งกับขั้นตอนเปลี่ยนผู้ชนะหรือทำให้เสียสิทธิ์ก่อนเวลาที่ประกาศ

อีกจุดที่เชื่อมกัน: `SET_STATUS` อัปเดต product โดยไม่มี expected state/reservation/order identity หาก outbox เก่ามาถึงช้า อาจเขียนทับสถานะของธุรกรรมที่เกิดภายหลังได้ ประเด็น delayed outbox นี้ยืนยันจากเส้นทางโค้ด ยังไม่ได้จำลอง race กับ DB จริง

แนวแก้ที่เสนอ: แยก QR expiry ออกจาก auction-right expiry ส่งการปล่อย/เปลี่ยนผู้ชนะผ่าน auction settlement เท่านั้น และให้ cross-service lifecycle command ตรวจตัวตนธุรกรรมกับ version/expected state

### F06 — P1 เมื่อใช้เงินจริง: การจ่ายเงินและการรับพัสดุยังเป็น simulation โดยไม่มี production gate

ตำแหน่ง: `backend/services/order-service/src/features/checkoutSessions/checkoutSessionService.js:277–305`, `services/orderLifecycle.js:10–13`, `services/orderLifecycleService.js:157–170`, `src/server.js:28–33`

confirm checkout ที่ buyer เรียกเองสร้าง Payment `SIMULATED` และ status `paid` โดยไม่ต้องมีหลักฐานการรับเงินจริงจาก payment provider ส่วนพัสดุ `shipped` ถูก job เปลี่ยนเป็น `delivered` หลังค่าเริ่มต้น 10 วินาที โดยไม่มีข้อมูล carrier จริง แล้วเริ่มนับเวลาปิดออเดอร์/ข้อพิพาทจากข้อมูลนั้น ไม่มี gate ว่าอนุญาต simulation เฉพาะ demo

เป็นพฤติกรรมที่ตั้งใจใช้จำลองในโค้ด ไม่ใช่ข้อพิสูจน์ว่ามีการโกงเงินเกิดขึ้นแล้ว แต่หากนำชุดนี้ไปรับซื้อขายจริง ผู้ขายอาจเห็นชำระแล้วทั้งที่ยังไม่ได้รับเงิน และระบบอาจถือว่าได้รับสินค้าก่อนความเป็นจริง

แนวแก้ที่เสนอ: แยกโหมด demo ชัดเจนและปิด simulation ใน production ให้สถานะจ่ายเงินมาจาก provider callback ที่ตรวจลายเซ็น ยอดเงิน สกุลเงิน และ idempotency; สถานะส่งถึงต้องมีเหตุการณ์ที่เชื่อถือได้จาก carrier/กระบวนการยืนยันที่กำหนด

### F07 — P2: ข้อมูลสินค้าที่ซ่อนถูก broadcast ให้ผู้ใช้อื่น

ตำแหน่ง: `backend/services/product-service/src/services/realtimeClient.js:37–45`, `backend/services/chat-service/src/realtime/broadcast.js:192–202`

ทุก product update ส่ง `{product}` พร้อม `broadcastGlobal:true` ฝั่ง chat เรียก `ioInstance.emit(event,data)` ทำให้ authenticated socket ทุกบัญชีรับข้อมูลเต็มได้ รวมถึงสินค้าที่เพิ่งซ่อน เจ้าของห้องเฉพาะถูกเพิ่มให้อีกครั้ง แต่ไม่ได้จำกัด global emit

**หลักฐาน R4:** mock Socket.IO transport แล้วเรียก broadcast จริง ยืนยัน hidden product ไปที่ global namespace ส่วน guest namespace `/catalog` ได้เพียง invalidation ถือว่าทำถูกแล้ว ช่องรั่วนี้อยู่ฝั่งผู้ใช้ที่เข้าสู่ระบบ

แนวแก้ที่เสนอ: ส่งรายละเอียดของสินค้าที่ไม่ public เฉพาะเจ้าของ/ผู้ได้รับสิทธิ์ ผู้ชม catalog รับเพียง id/invalidation หรือ public projection ที่ผ่านการกรอง

### F08 — P2: การบังคับ KYC ไม่ครอบคลุมเส้นทางและอ้าง token เก่า

ตำแหน่ง: `backend/services/product-service/src/features/auctions/auctionService.js:569–662`, `controllers/productController.js:272–364,437–493`, `backend/shared/src/authMiddleware.js:51–52`, `backend/services/auth-service/src/jobs/kycExpiryJob.js:20–33`

Flow A ส่งสินค้าเดิมเข้าประมูล return ก่อนเรียก `requireVerifiedSeller` ซึ่งเรียกเฉพาะ Flow B สร้างสินค้าใหม่ การแก้ไขสินค้า/relist ก็ไม่มี gate KYC แบบ create อีกทั้ง middleware ใช้ KYC จาก JWT ส่วน live session คืนเฉพาะสถานะบัญชี/commerce restrictions ดังนั้นการทำเครื่องหมาย EXPIRED ใน DB ไม่เปลี่ยนสิทธิ์จาก JWT เดิมทันที โดยค่าเริ่มต้น token มีอายุ 15 นาที และ expiry job ตรวจเพียงรายวัน

**หลักฐาน R5:** ส่งสินค้าเดิมด้วย `kycVerified:false,kycStatus:EXPIRED` แล้วสร้าง `pending_approval` ได้ **R10:** middleware ยังใช้ VERIFIED จาก JWT แม้ validator จำลองส่งสถานะปัจจุบัน EXPIRED กลับมา

แนวแก้ที่เสนอ: กำหนด policy ของแต่ละ action ให้ชัดแล้วบังคับฝั่ง server อย่างสม่ำเสมอ สำหรับ action ที่ต้อง KYC ให้ใช้สถานะปัจจุบัน/วันหมดอายุจากแหล่งที่เชื่อถือได้ ไม่ปล่อยให้การป้องกันขึ้นกับการซ่อนปุ่มหรือรอ token refresh

### F09 — P2: Thai ID เป็น mock แต่ backend ยอมให้แทนเอกสารได้

ตำแหน่ง: `frontend/components/seller/onboarding/ThaiIdQrStep.js:11–21,70–77`, `backend/services/auth-service/src/features/kyc/kycService.js:32–55`

UI ใช้ QR และข้อมูลคงที่ จำลอง scan ด้วย timeout ขณะที่ข้อความบอกว่าเชื่อม Thai ID ฝั่ง backend เพียงรับ `verifyMethod:thai_id` ก็ยกเว้นเอกสาร ไม่มี provider proof/session verification

**หลักฐาน R8:** ข้อมูล 13 หลักพร้อม method นี้โดยไม่มีไฟล์หรือหลักฐาน provider ถูกบันทึกเป็น PENDING และ storage key `THAI_ID_METHOD` ไม่ได้เป็น VERIFIED อัตโนมัติ แต่ผู้ตรวจอาจได้รับคำขอที่ไม่มีหลักฐานตัวตนจริง

แนวแก้ที่เสนอ: ปิดวิธีนี้ในระบบจริงจนเชื่อม provider สำเร็จ ตรวจ proof ฝั่ง server และผูกกับบัญชี/session/request ที่ส่ง ห้ามใช้ค่าจาก frontend เป็นหลักฐานการยืนยัน

### F10 — P2: งานตรวจผู้ขายไม่เคลื่อนไหวอาจทำให้ผู้ขายที่เพิ่งกลับมาใช้งานหมดสิทธิ์

ตำแหน่ง: `backend/services/auth-service/src/jobs/sellerInactivityJob.js:26–45`

query ใช้ lastActiveAt เก่าทันทีถ้ามีค่า โดยไม่เทียบว่า verifiedAt เพิ่งใหม่กว่า เช่นร้านที่หยุดนานแล้วเพิ่งผ่าน KYC ใหม่ แต่ lastActiveAt ยังเก่า จะถูก expire ซ้ำได้ อีกทั้ง scan แล้ว update แยกกัน โดย update ตรวจแค่ userId ไม่ตรวจสถานะ/เวลา activity ที่อ่านมา ผู้ขายที่เพิ่งลงสินค้าในระหว่างนั้นอาจถูก expire ทับ

**หลักฐาน R9:** จำลองผล scan ที่ได้มาก่อน activity ล่าสุด พบ update ยังตั้ง `INACTIVE_EXPIRED` โดยไม่มีเงื่อนไขเวลาหรือ version ป้องกัน

แนวแก้ที่เสนอ: ใช้ effective timestamp ที่ใหม่กว่าระหว่าง activity กับ verifiedAt และตรวจเงื่อนไขเดิมซ้ำใน atomic update

### F11 — P2: หน้าประมูลผู้ขายแสดงรายการไม่ครบ

ตำแหน่ง: `frontend/app/seller/auctions/page.js:216–220,238–240`, `backend/shared/src/pagination.js:1–2`

โหลด `/auctions?limit=100` แล้วกรอง sellerId ใน frontend แต่ server จำกัดสูงสุด 50 รายการของทุกผู้ขายและ UI ไม่ไล่หน้าถัดไป รายการของร้านที่อยู่นอก 50 รายการแรกจึงหายจากหน้าจัดการ ส่วน `auction_action_required` โหลดหน้าแรกค่าเริ่มต้น 12 รายการ

แนวแก้ที่เสนอ: endpoint สำหรับผู้ขายปัจจุบัน กรองเจ้าของก่อน pagination พร้อม UI เปลี่ยนหน้า/ค้นหา ตรวจด้วยหลายร้านและสินค้าเกิน 50 รายการ

ข้อค้นพบเดิมเรื่องหน้าเลือกสินค้าอัปโหลดวิดีโอได้แค่ 50 รายการ **แก้ไปแล้วในโค้ดปัจจุบัน**: `frontend/app/seller/videos/new/page.js:39–51` มีโหลดหน้าถัดไป จึงไม่นับเป็นปัญหาปัจจุบัน

### F12 — P2: ยอดสุทธิผู้ขายอาจไม่ตรงกับสูตร backend

ตำแหน่ง: `frontend/lib/sellerRevenue.js:1–6`, `backend/services/order-service/src/features/metrics/feeConfig.js:1–32`

Frontend ล็อก 3% และปัดสุทธิต่อ order เป็นบาทเต็ม ส่วน backend ปรับ PLATFORM_FEE_RATE ได้และใช้ precision สองตำแหน่งใน metrics เช่น 101 บาท ที่ 3% frontend แสดง 98 บาทแทน 97.97 บาท; ถ้า backend เปลี่ยนเป็น 5% ยอด 100 บาทยังแสดง 97 แทน 95 บาท

นี่เป็นความคลาดเคลื่อนของรายงาน ยังไม่ใช่หลักฐานว่าเกิดการโอนเงินผิดจริง เพราะระบบ payment ปัจจุบันยังจำลอง

แนวแก้ที่เสนอ: ให้ backend เป็นเจ้าของยอดค่าธรรมเนียม/สุทธิและกติกาปัดเศษ ถ้ามี settlement ให้ยึดค่าที่บันทึก ณ ธุรกรรม

### F13 — P2: วันในกราฟและรายละเอียดไม่ใช้เขตเวลาเดียวกัน

ตำแหน่ง: `frontend/app/seller/dashboard/page.js:231`, `frontend/components/seller/dashboard/SellerDashboardCharts.js:118,174,500,551–557`

บางส่วนใช้ Asia/Bangkok แต่ date key/filter ใช้ ISO UTC `.slice(0,10)` เวลา `2026-10-22T17:30:00Z` คือ 23 ตุลาคม 00:30 น. ไทย แต่ถูกจัดเป็นวันที่ 22 ในบางรายการ กราฟ/ตัวกรองจึงอาจไม่ตรงกัน และยอด completed ยังจัดวันตาม createdAt แทนเวลาสำเร็จ

แนวแก้ที่เสนอ: date-key utility เดียวกันในเขตเวลาที่กำหนด และยืนยันว่ารายได้ใช้วันที่สร้างหรือวันที่สำเร็จ

### F14 — P2: การอัปโหลดไม่มีข้อจำกัดสะสม/cleanup ที่เพียงพอ

ตำแหน่ง: `backend/services/product-service/src/routes/uploadRoutes.js:11–16`, `src/middleware/upload.js:24–25`, `src/features/product-videos/productVideoRoutes.js:57–65`

จำกัดขนาดต่อไฟล์/ต่อคำขอ แต่ `/uploads` ตรวจเพียง SELLER/MARKETING ไม่มี commerce restriction/KYC gate, per-user quota หรือ rate limit ในเส้นทางที่ตรวจ ผู้ขายที่ยังไม่ยืนยันหรือถูกจำกัดสิทธิ์ขายยังอัปโหลดซ้ำเพื่อใช้พื้นที่ได้ ตัวอัปโหลดเก็บไฟล์ก่อนผูกสินค้า ไม่มี lifecycle cleanup ของไฟล์ orphan ในเส้นทางนี้ และการลบ clip ลบ record ไม่ได้ลบไฟล์ต้นฉบับ

มีความเสี่ยง disk เต็มและค่าเก็บสื่อเพิ่ม เป็นหลักฐานจากโค้ด ไม่ได้ทดสอบยิงโหลดหรือเติมดิสก์จริง

แนวแก้ที่เสนอ: บังคับสิทธิ์บน upload ให้ตรงการใช้งาน เพิ่ม quota/rate limit และกระบวนการเก็บกวาดไฟล์ที่ไม่ได้ถูกอ้างอิง โดยต้องออกแบบให้ไม่ลบไฟล์ที่ยังใช้ร่วมกัน

### F15 — P1 หากใช้ Compose นี้บนเครื่องที่เปิดรับภายนอก: ฐานข้อมูลถูก publish และ Mongo/Redis ไม่มี auth ในไฟล์

ตำแหน่ง: `docker-compose.yml:10–11,24–25,35–36,45–51`, `docker-compose.prod.yml:1–16`

Compose เปิด PostgreSQL 5432, Redis 6379, MongoDB 27017 และ pgAdmin โดยไม่ได้ bind เฉพาะ localhost; Mongo ใช้ `--bind_ip_all` โดยไม่มี `--auth`, Redis ไม่มีการตั้งรหัสใน command/config ที่ตรวจ ส่วน pgAdmin มีรหัส default ที่คาดเดาได้เมื่อไม่ได้กำหนดเอง ไฟล์ production override ปรับเพียง frontend และไม่ได้ยกเลิก ports/บริการเหล่านี้

หาก host firewall/network เปิดพอร์ตเหล่านี้ ข้อมูลผู้ขาย/แชต/งานคิวอาจเข้าถึงจากภายนอกได้ **ยังไม่ได้ยืนยันว่าเครื่อง production จริงเปิดพอร์ตหรือมี firewall อย่างไร** ชุด Kubernetes ระบุไว้ชัดว่าเป็น local learning จึงไม่ถือว่าทั้งชุดนั้นเป็น production deployment

แนวแก้ที่เสนอ: แยก production configuration ให้ฐานข้อมูลอยู่ private network ยกเลิก host publish ที่ไม่จำเป็น ตั้ง auth/credential ที่เหมาะสมและจำกัดสิทธิ์บริการ ไม่ควรนำ demo seeds ที่มีรหัสคงที่ไปใช้เป็นบัญชีจริง

### F16 — P2: Production build และเครื่องมือตรวจ migration ยังมีข้อผิดพลาด

ตำแหน่ง: `frontend/components/orders/MyOrders.js:138`, `backend/services/chat-service/prisma/idempotencyPreflight.js:8`

Next build หยุดที่ `catch (_) {}` จาก lint 2 errors และ lint repository รวม 19 errors ส่วน preflight กรณีพบ duplicate idempotency keys อ้าง `duplicates.length` ซึ่งไม่มีตัวแปร แทนค่า `duplicateGroups` ทำให้ได้ ReferenceError และเสีย diagnostic ที่ตั้งใจรายงาน ไม่พบว่าบรรทัดนี้ลบข้อความเก่า

แนวแก้ที่เสนอ: จัดการ catch ให้ชัดเจนและแก้ตัวแปร preflight พร้อมทดสอบกรณี duplicates ก่อนใช้ cutover จริง รายละเอียด lint อื่นอยู่ใน log

## สิ่งที่ตรวจพบว่ามีการป้องกันอยู่แล้ว

- Product write ตรวจเจ้าของ; update/delete หลักป้องกัน sold/reserved/moderated และมี atomic state claim หลายจุด ช่อง visibility ใน F02 เป็นเส้นทางที่หลุดจากกติกานี้
- REST auth ตรวจ live session และ account restrictions แบบ fail closed; gateway ลบ inbound `x-user-*` ก่อนส่งต่อ และ internal APIs ตรวจ internal token
- Order read/status ตรวจคู่สัญญาและ participant transition, หลายธุรกรรมใช้ transaction/version; shipping ตรวจเจ้าของและที่อยู่จากบัญชีผู้ซื้อ
- KYC documents/evidence/chat attachments มี storage แยกจาก public uploads และมี access checks; การตัดสิน KYC และข้อพิพาทมี audit/optimistic lock หลายจุด
- แชตตรวจ participant และสิทธิ์เคส, internal note มีการกรอง, ข้อความปกติใน UI แสดงผ่าน React text ไม่พบ `dangerouslySetInnerHTML` ในส่วน UI ผู้ขายที่ตรวจ
- Shop change request ใช้รายการฟิลด์ที่อนุญาต ตรวจค่าเดิมก่อนอนุมัติและมี pending uniqueness; auto messages จำกัดความยาว/จำนวนและตรวจเจ้าของ

การมีมาตรการข้างต้นไม่ยกเลิกข้อค้นพบ และไม่รับรองว่าทุก race ถูกครอบคลุม

## หลักฐานและการรันซ้ำ

ไฟล์ใน `log/evidence/`:

- `seller-security-20261024-reproduce.cjs` และ `seller-security-20261024-reproductions.log`: R1–R10 ใช้ฟังก์ชันแอปจริงกับ mock persistence/transport ไม่เขียนข้อมูลธุรกิจหรือเปิด listener
- `seller-security-20261024-backend-localhost.log`: ผล backend รอบอนุญาต localhost ใช้รอบนี้เป็นผลหลัก
- `seller-security-20261024-backend.log`: รอบ sandbox แรก มี localhost failures เพิ่ม ไม่ใช้สรุปจำนวนหลัก
- `seller-security-20261024-frontend-all.log`: frontend ชุดเต็ม
- `seller-security-20261024-frontend-focused.log`: subset ที่เกี่ยวกับเส้นทางผู้ขาย
- `seller-security-20261024-lint.log`, `seller-security-20261024-build.log`: lint/build
- `seller-security-20261024-dependencies.json`: บันทึกความล้มเหลว DNS ของการตรวจ advisory ครั้งแรก ไม่ใช่ผลไม่มีช่องโหว่

```powershell
# จาก repository root; audit reproductions ไม่ใช้ฐานข้อมูลจริง
node --test --test-reporter=spec log/evidence/seller-security-20261024-reproduce.cjs

# ชุด integration ควรใช้ฐานข้อมูลทดสอบแยกที่เตรียมไว้เท่านั้น
node --test --test-reporter=spec --test-concurrency=4 "backend/**/*.test.js" "scripts/*.test.js"
npm run lint

# จาก frontend
node ../node_modules/jest/bin/jest.js --runInBand --coverage=false --watchman=false
node ../node_modules/next/dist/bin/next build
```

## ข้อจำกัดและลำดับงานที่เสนอ

เสนอแก้ F01–F05 ก่อน เพราะเป็นช่องทางโค้ดที่มีผลกับบัญชี/สถานะการค้าโดยตรง ตามด้วย F06/F15 ก่อนเปิดเงินจริงหรือเปิด host ภายนอก แล้วแก้ F07–F14 และ F16 ควบคู่กับการเพิ่ม regression tests ที่ครอบคลุม API ทางเลือกและการแข่งขันระหว่าง workers

ยังต้องมี E2E บนสภาพแวดล้อมทดสอบที่ครบทุก service เพื่อยืนยันการจ่ายซ้ำ/expire/เปลี่ยนผู้ชนะ/ปล่อย reservation/outbox retry/hold-refund และการ revoke socket จริง รวมถึง browser proof ของ F01 บน origin สำหรับทดสอบโดยเฉพาะ ไม่ได้ใช้การผ่าน unit tests เป็นหลักฐานแทนการตรวจเหล่านี้

การส่ง dependency metadata ไป npm ถูก automatic approval review ปฏิเสธ เนื่องจากเป็นการส่งข้อมูลภายนอก และผู้ใช้ตอบให้ตรวจเฉพาะในเครื่องแล้ว จึงหยุดส่วนนี้ ไม่ทำ workaround และยังไม่สรุปความปลอดภัยของ dependency จากฐานข้อมูล advisory ปัจจุบัน

สถานะส่งมอบ: แจ้งข้อค้นพบครบในขอบเขตที่ตรวจได้แล้ว รอคำสั่งผู้ใช้ก่อนเริ่มแก้ application code
