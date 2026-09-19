import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/sirad/Downloads/Test_Cases4_Final_reviewed.xlsx";
const outputDir = "D:/ISE Project/Ise/outputs/test-cases4-corrected-20260915";
const outputPath = `${outputDir}/Test_Cases4_Final_corrected.xlsx`;
const previewTop = "D:/ISE Project/Ise/.codex_tmp_review_comments/corrected_top.png";
const previewMiddle = "D:/ISE Project/Ise/.codex_tmp_review_comments/corrected_middle.png";
const previewBottom = "D:/ISE Project/Ise/.codex_tmp_review_comments/corrected_bottom.png";
const fontName = "Arial";

const tests = [
  {
    id: "TC01",
    scenario: "FR-15 / UC-12\nจำนวนคำสั่งซื้อรายเดือน",
    testCase: "แสดงจำนวนคำสั่งซื้อที่สำเร็จรวมรายเดือน",
    pre: "Accounting หรือ EXECUTIVE เข้าสู่ระบบ และมีข้อมูลในช่วง [from, to)",
    steps: "1. เปิด Reports & Dashboard\n2. เลือกรายงานรายเดือน มกราคม 2026\n3. ตรวจช่วงเวลาจาก 2026-01-01 ถึงก่อน 2026-02-01\n4. เปรียบเทียบจำนวนกับข้อมูลต้นทางแยกตามสถานะ",
    data: "Timezone: Asia/Bangkok\ncompleted 120\npending 5\ncancelled 3\nrefunded 2",
    expected: "ระบบแสดงคำสั่งซื้อสำเร็จ 120 รายการ โดยนับเฉพาะ status=completed และไม่รวม pending, cancelled, refunded",
  },
  {
    id: "TC02",
    scenario: "FR-15 / UC-12\nยอดขายสุทธิตาม Metric v1",
    testCase: "คำนวณยอดขายรวมรายเดือนตามนิยามระบบ",
    pre: "ใช้ Metric Definition v1 ซึ่งนิยามยอดขายเป็น SUM(price) ของออเดอร์ status=completed",
    steps: "1. เปิดรายงานรายเดือน มกราคม 2026\n2. ตรวจรายการ completed, cancelled และ refunded\n3. รวมราคาเฉพาะ completed\n4. เปรียบเทียบกับยอดบนรายงาน",
    data: "completed: 6,000 + 4,000 บาท\nrefunded: 1,000 บาท\ncancelled: 2,000 บาท",
    expected: "ระบบแสดงยอดขาย 10,000 บาท โดยไม่รวมรายการ refunded และ cancelled ตาม Metric Definition v1",
  },
  {
    id: "TC03",
    scenario: "FR-15 / UC-12\nยอดขายแยกตามร้าน",
    testCase: "แยกจำนวนออเดอร์และยอดขายตามร้าน",
    pre: "มีออเดอร์ completed จาก 3 ร้านในช่วงเดือนเดียวกัน",
    steps: "1. เลือกรายงาน มกราคม 2026\n2. ตรวจจำนวนและยอดของแต่ละร้าน\n3. รวมผลจากทุกร้าน\n4. เปรียบเทียบกับยอดรวมรายเดือน",
    data: "STORE-001: 20 รายการ / 4,000 บาท\nSTORE-002: 30 รายการ / 6,000 บาท\nSTORE-003: 10 รายการ / 2,000 บาท",
    expected: "ระบบแสดงข้อมูลทั้ง 3 ร้านถูกต้อง และยอดรวมเท่ากับ 60 รายการ / 12,000 บาท",
  },
  {
    id: "TC04",
    scenario: "FR-15 / UC-12\nขอบเขตช่วงเดือน",
    testCase: "รวมเฉพาะธุรกรรมในช่วงเดือนที่เลือก",
    pre: "ช่วงรายงานใช้เงื่อนไข createdAt >= from และ createdAt < to",
    steps: "1. กำหนด from=2026-01-01T00:00:00+07:00\n2. กำหนด to=2026-02-01T00:00:00+07:00\n3. สร้างรายการตรงต้นช่วง ก่อนสิ้นช่วง 1 วินาที และตรงปลายช่วง\n4. เปิดรายงานและตรวจยอด",
    data: "01 ม.ค. 00:00:00 = 500 บาท\n31 ม.ค. 23:59:59 = 1,000 บาท\n1 ก.พ. 00:00:00 = 2,000 บาท",
    expected: "รายงานรวม 500 และ 1,000 บาท เป็น 1,500 บาท และไม่รวมรายการเวลา 1 ก.พ. 00:00:00",
  },
  {
    id: "TC05",
    scenario: "FR-16 / UC-12\nสร้าง Audit Log การยกเลิก",
    testCase: "บันทึก Audit Log เมื่อยกเลิกออเดอร์สำเร็จ",
    pre: "ORD-1001 มีสถานะ confirmed และผู้ดำเนินการ TS-001 มีสิทธิ์ยกเลิก",
    steps: "1. ตรึงเวลาทดสอบเป็น 2026-01-15T10:30:00+07:00\n2. เปิด ORD-1001 และเลือกยกเลิก\n3. ระบุเหตุผลและยืนยัน\n4. ค้นหา Audit Log ด้วย Order ID",
    data: "Order ID: ORD-1001\nActor: TS-001 / TRUST_AND_SAFETY\nReason: ลูกค้าขอยกเลิก",
    expected: "พบ Log ID ไม่ซ้ำ โดยมี Order ID=ORD-1001, Actor=TS-001, Role=TRUST_AND_SAFETY, เวลา 2026-01-15T10:30:00+07:00, Previous=confirmed, New=cancelled และ Reason ตรงกัน",
  },
  {
    id: "TC06",
    scenario: "FR-16 / UC-12\nบังคับระบุเหตุผล",
    testCase: "ปฏิเสธการยกเลิกออเดอร์เมื่อเหตุผลว่าง",
    pre: "ORD-1002 มีสถานะ confirmed และช่องเหตุผลเป็นข้อมูลบังคับ",
    steps: "1. เปิด ORD-1002\n2. เลือกยกเลิก\n3. เว้นเหตุผลว่าง\n4. กดยืนยัน\n5. ตรวจสถานะออเดอร์และ Cancellation Audit Log",
    data: "Order ID: ORD-1002\nReason: ค่าว่าง",
    expected: "ระบบแสดงข้อความให้ระบุเหตุผล, ORD-1002 คงสถานะ confirmed และไม่สร้าง Audit Log ประเภทการยกเลิกสำเร็จ",
  },
  {
    id: "TC07",
    scenario: "FR-16 / UC-12\nความครบถ้วนของ Audit Log",
    testCase: "สร้าง Audit Log แยกกันสำหรับทุกออเดอร์ที่ยกเลิก",
    pre: "ORD-1003, ORD-1004 และ ORD-1005 มีสถานะ confirmed",
    steps: "1. ยกเลิกทั้ง 3 ออเดอร์ด้วยเหตุผลที่กำหนด\n2. เปิด Audit Log\n3. ค้นหาทีละ Order ID\n4. เปรียบเทียบ Log ID, Actor และ Reason",
    data: "ORD-1003: ลูกค้าขอยกเลิก\nORD-1004: สินค้าหมด\nORD-1005: ร้านปิดฉุกเฉิน\nActor: TS-001",
    expected: "พบ 3 Log ID ที่ไม่ซ้ำ แต่ละรายการเชื่อมกับ Order ID และ Reason ที่ถูกต้อง และไม่มี Log ซ้ำ",
  },
  {
    id: "TC08",
    scenario: "FR-16 / UC-12\nAudit Log แก้ย้อนหลังไม่ได้",
    testCase: "ไม่แสดงคำสั่งแก้ไขหรือลบ Audit Log บนหน้าจอ",
    pre: "มี Audit Log AUD-1001 และผู้ใช้มีสิทธิ์อ่าน Audit Log",
    steps: "1. เปิดรายการ Audit Log\n2. เปิด AUD-1001\n3. ตรวจปุ่ม เมนู และช่องกรอกทั้งหมด\n4. โหลดหน้าใหม่และตรวจข้อมูลเดิม",
    data: "Audit ID: AUD-1001",
    expected: "หน้าจอแสดง AUD-1001 แบบอ่านอย่างเดียว ไม่มีปุ่มหรือช่องทางแก้ไข/ลบ และข้อมูลหลังโหลดใหม่เหมือนเดิม",
  },
  {
    id: "TC09",
    scenario: "FR-16 / UC-12\nป้องกันแก้ Audit Log ผ่าน API",
    testCase: "ปฏิเสธ PATCH ไปยัง Audit Log",
    pre: "ระบบเปิดเฉพาะ GET /api/auth/admin/audit และมี AUD-1001 อยู่แล้ว",
    steps: "1. GET AUD-1001 และบันทึกค่าก่อนทดสอบ\n2. ส่ง PATCH /api/auth/admin/audit/AUD-1001 เพื่อแก้ Reason\n3. GET AUD-1001 อีกครั้ง\n4. เปรียบเทียบข้อมูลก่อนและหลัง",
    data: "PATCH body: { reason: 'modified' }\nToken: TRUST_AND_SAFETY",
    expected: "PATCH ได้ HTTP 404, ไม่มีข้อมูลระบบภายในใน response และ GET หลังทดสอบคืนค่า AUD-1001 เหมือนเดิมทุก field",
  },
  {
    id: "TC10",
    scenario: "FR-17 / UC-12\nสูตรอัตราการยกเลิก",
    testCase: "คำนวณอัตราการยกเลิกของร้านตามช่วงเวลา",
    pre: "Test Environment กำหนดสูตร cancelled orders / all placed orders x 100 และใช้ช่วง [from, to)",
    steps: "1. เปิดรายงานอัตราการยกเลิก\n2. เลือก STORE-001 และช่วง มกราคม 2026\n3. ตรวจ numerator และ denominator\n4. เปรียบเทียบอัตราที่แสดง",
    data: "All placed orders: 100\nCancelled orders: 8\nTimezone: Asia/Bangkok",
    expected: "ระบบแสดง numerator=8, denominator=100 และ Cancellation Rate=8.00%",
  },
  {
    id: "TC11",
    scenario: "FR-17 / UC-12\nแจ้งเตือนเมื่อเกินเกณฑ์",
    testCase: "สร้าง Alert เมื่ออัตราการยกเลิกสูงกว่า 10.00%",
    pre: "Test Environment กำหนด Threshold operator เป็น > และ Threshold=10.00%",
    steps: "1. กำหนดช่วง 2026-01-01 ถึง 2026-02-01\n2. เตรียม STORE-002 ให้ยกเลิก 11 จาก 100 ออเดอร์\n3. เรียกงานตรวจจับแบบ Manual Run\n4. เรียกซ้ำด้วยข้อมูลเดิม\n5. เปิดรายการ Alert",
    data: "STORE-002: 11/100 = 11.00%\nThreshold: > 10.00%\nRule period: มกราคม 2026",
    expected: "พบ Alert ของ STORE-002 เพียง 1 รายการ โดยมี Rate=11.00%, Threshold=10.00% และช่วงเวลา มกราคม 2026; การรันซ้ำไม่สร้าง Alert ซ้ำ",
  },
  {
    id: "TC12",
    scenario: "FR-17 / UC-12\nจุดตัดของ Threshold",
    testCase: "ไม่สร้าง Alert เมื่ออัตราเท่ากับหรือต่ำกว่า 10.00%",
    pre: "Threshold operator เป็น > และ Threshold=10.00%",
    steps: "1. เตรียม STORE-003 ที่ 10.00%\n2. เตรียม STORE-004 ที่ 9.99%\n3. เรียกงานตรวจจับช่วงเดียวกัน\n4. ค้นหา Alert ของทั้งสองร้าน",
    data: "STORE-003: 1,000/10,000 = 10.00%\nSTORE-004: 999/10,000 = 9.99%",
    expected: "ระบบไม่สร้าง Alert ให้ STORE-003 และ STORE-004 เพราะอัตราไม่สูงกว่า 10.00%",
  },
  {
    id: "TC13",
    scenario: "FR-17 / UC-12\nไม่มีออเดอร์ในช่วงเวลา",
    testCase: "แสดง N/A เมื่อ denominator เป็นศูนย์",
    pre: "STORE-005 ไม่มีออเดอร์ในช่วงที่เลือก",
    steps: "1. เปิดรายงานอัตราการยกเลิก\n2. เลือก STORE-005\n3. ตรวจค่า Rate\n4. ตรวจ Alert และ error log",
    data: "All placed orders: 0\nCancelled orders: 0",
    expected: "ระบบแสดง Cancellation Rate=N/A, ไม่คำนวณเป็น 0%, ไม่เกิดข้อผิดพลาดหารด้วยศูนย์ และไม่สร้าง Alert",
  },
  {
    id: "TC14",
    scenario: "FR-18 / UC-12\nExport CSV ตาม schema",
    testCase: "ส่งออกรายงานรายเดือนเป็น CSV",
    pre: "EXECUTIVE เปิดรายงาน มกราคม 2026 สำเร็จและมีข้อมูล 31 วัน",
    steps: "1. เลือกรายงานรายเดือน มกราคม 2026\n2. กดดาวน์โหลด CSV\n3. ตรวจชื่อไฟล์ Encoding, delimiter, newline และหัวคอลัมน์\n4. เทียบจำนวนแถวกับตาราง",
    data: "Filename: reloop-executive-report-2026-01.csv\nEncoding: UTF-8 with BOM\nDelimiter: comma\nNewline: CRLF",
    expected: "ไฟล์เปิดได้และมี 32 แถวรวม header; คอลัมน์เรียงเป็น ช่วงเวลา, ยอดขาย (บาท), รายได้แพลตฟอร์ม (บาท), คำสั่งซื้อ (รายการ), ผู้ใช้งานที่ล็อกอิน (คน) และค่าตรงกับตาราง",
  },
  {
    id: "TC15",
    scenario: "FR-18 / UC-12\nการ escape ค่า CSV",
    testCase: "Escape comma, quote และ newline ในข้อมูล CSV",
    pre: "ทดสอบตัวสร้าง CSV ด้วยชุดข้อมูลสังเคราะห์",
    steps: "1. ส่งค่าที่มี comma, double quote และ newline เข้า toCsv\n2. สร้างไฟล์ CSV\n3. เปิดด้วยโปรแกรมอ่าน CSV\n4. ตรวจว่าค่ากลับมาเป็นหนึ่ง field เดิม",
    data: "Input field: รายได้, \"สุทธิ\"<newline>มกราคม\nEncoding: UTF-8 with BOM",
    expected: "Output ครอบ field ด้วย double quote, เปลี่ยน quote ภายในเป็น quote สองตัว, เก็บ newline ไว้ใน field เดียว และภาษาไทยไม่เสีย",
  },
  {
    id: "TC16",
    scenario: "FR-18 / UC-12 Extension 7a\nExport ล้มเหลว",
    testCase: "ไม่ส่งไฟล์บางส่วนเมื่อการสร้างไฟล์ล้มเหลว",
    pre: "รายงานโหลดสำเร็จ และกำหนด fault ให้ downloadCsv ล้มเหลวก่อนผู้ใช้กด Export",
    steps: "1. เปิดรายงานที่มีข้อมูล\n2. เปิด fault injection ของ downloadCsv\n3. กดดาวน์โหลด CSV\n4. ตรวจข้อความและรายการดาวน์โหลด\n5. ปิด fault และลองใหม่หนึ่งครั้ง",
    data: "Fault: downloadCsv throws EXPORT_FAILED before Blob download",
    expected: "ครั้งแรกระบบแสดง “ไม่สามารถส่งออกรายงานได้” และไม่มีไฟล์ partial/corrupt; หลังปิด fault การลองใหม่ดาวน์โหลดไฟล์สมบูรณ์เพียง 1 ไฟล์",
  },
  {
    id: "TC17",
    scenario: "FR-19 / FR-27 / UC-12\nยอดขายรวมรายวัน",
    testCase: "แสดงยอดขายรวมรายวันจากทุกร้าน",
    pre: "มีออเดอร์ completed และ cancelled จากหลายร้านในวันเดียวกัน",
    steps: "1. เปิด Dashboard รายวัน\n2. เลือกวันที่ 2026-01-15\n3. ตรวจรายการต้นทางแต่ละร้าน\n4. เปรียบเทียบยอดรวม",
    data: "STORE-001 completed 5,000 บาท\nSTORE-002 completed 7,000 บาท\nSTORE-003 cancelled 2,000 บาท",
    expected: "Dashboard แสดงยอดขายรวม 12,000 บาท และไม่รวมรายการ cancelled 2,000 บาท",
  },
  {
    id: "TC18",
    scenario: "FR-19 / UC-12\nกระแสเงินหมุนเวียน Metric v1",
    testCase: "แสดงยอดขายและรายได้แพลตฟอร์มรายวัน",
    pre: "Metric Definition v1 กำหนด Platform Revenue=round(GMV x 10%)",
    steps: "1. เปิด Dashboard รายวัน\n2. เลือกวันที่ 2026-01-16\n3. ตรวจ GMV และ Platform Revenue\n4. คำนวณซ้ำจากข้อมูลต้นทาง",
    data: "GMV จาก completed orders: 15,000 บาท\nPlatform fee rate: 10%",
    expected: "Dashboard แสดงยอดขาย 15,000 บาท และรายได้แพลตฟอร์ม 1,500 บาท",
  },
  {
    id: "TC19",
    scenario: "FR-19 / UC-12 Extension 4a\nไม่พบข้อมูล",
    testCase: "ไม่แสดงค่าค้างเมื่อวันที่เลือกไม่มีข้อมูล",
    pre: "EXECUTIVE มีสิทธิ์ และวันที่ 2026-01-20 ไม่มีธุรกรรม",
    steps: "1. เปิด Dashboard ในวันที่มีข้อมูลและจดค่าที่แสดง\n2. เปลี่ยนเป็นวันที่ 2026-01-20\n3. รอให้โหลดเสร็จ\n4. ตรวจข้อความและค่าบนการ์ด",
    data: "Selected date: 2026-01-20\nTransactions: 0",
    expected: "ระบบแสดง “ไม่พบข้อมูล” และล้างค่าจากวันที่ก่อนหน้า โดยไม่แสดงยอดเดิมหรือข้อมูลของวันอื่น",
  },
  {
    id: "TC20",
    scenario: "UC-12 Extension 2a\nสิทธิ์เข้าถึงรายงาน",
    testCase: "ปฏิเสธผู้ใช้ที่ไม่มีสิทธิ์เรียก Executive Metrics API",
    pre: "ผู้ใช้ role=SELLER เข้าสู่ระบบและมี access token ที่ยังไม่หมดอายุ",
    steps: "1. ส่ง GET /api/orders/executive/metrics พร้อม token ของ SELLER\n2. ระบุ from, to และ timezone ที่ถูกต้อง\n3. ตรวจ status และ response body",
    data: "Role: SELLER\nfrom=2026-01-01T00:00:00Z\nto=2026-02-01T00:00:00Z\ntimezone=Asia/Bangkok",
    expected: "API ตอบ HTTP 403 พร้อม error.code=FORBIDDEN และไม่มี data, GMV หรือข้อมูลทางการเงินใน response body",
  },
  {
    id: "TC21",
    scenario: "FR-21\nPIN ถูกต้อง",
    testCase: "ปลดล็อกหน้าสรุปยอดขายด้วย PIN ที่กำหนด",
    pre: "Test Environment ตั้ง PIN ของ STORE-001 เป็น 2468 และหน้าสรุปยอดขายถูกล็อก",
    steps: "1. เข้าสู่ระบบเป็นเจ้าของ STORE-001\n2. เปิดหน้าสรุปยอดขาย\n3. กรอก 2468\n4. กดยืนยัน",
    data: "Configured PIN: 2468\nInput: 2468\nStore: STORE-001",
    expected: "ระบบปลดล็อกและแสดงเฉพาะข้อมูลยอดขายของ STORE-001 โดยไม่แสดง PIN ในหน้าจอหรือ response",
  },
  {
    id: "TC22",
    scenario: "FR-21\nPIN ไม่ถูกต้อง",
    testCase: "ไม่ปลดล็อกเมื่อกรอก PIN ผิด",
    pre: "Configured PIN ของ STORE-001 คือ 2468",
    steps: "1. เปิดหน้าสรุปยอดขายที่ถูกล็อก\n2. กรอก 1111\n3. กดยืนยัน\n4. ตรวจข้อมูลที่แสดง",
    data: "Configured PIN: 2468\nInput: 1111",
    expected: "ระบบแจ้งว่า PIN ไม่ถูกต้อง, หน้ายังคงล็อก และไม่ส่งหรือแสดงข้อมูลยอดขายและ PIN ที่ถูกต้อง",
  },
  {
    id: "TC23",
    scenario: "FR-21\nPIN ว่าง",
    testCase: "ตรวจ validation เมื่อไม่กรอก PIN",
    pre: "หน้าสรุปยอดขายถูกล็อก",
    steps: "1. เปิดหน้ากรอก PIN\n2. เว้นช่อง PIN ว่าง\n3. กดยืนยัน\n4. ตรวจข้อความ validation และ network request",
    data: "Input: ค่าว่าง",
    expected: "ระบบแสดงข้อความ “กรุณากรอก PIN”, ไม่ส่งคำขอยืนยัน PIN และหน้าสรุปยอดขายยังคงล็อก",
  },
  {
    id: "TC24",
    scenario: "FR-21\nSession ยืนยัน PIN หมดอายุ",
    testCase: "บังคับยืนยัน PIN ใหม่เมื่อ Session หมดอายุ",
    pre: "ผู้ใช้เคยยืนยัน PIN แต่ PIN session หมดอายุแล้ว",
    steps: "1. เปิด URL หน้าสรุปยอดขายโดยตรง\n2. เรียก API ข้อมูลยอดขายด้วย session เดิม\n3. ตรวจหน้าจอและ response",
    data: "Store: STORE-001\nPIN session: expired\nURL: /seller/dashboard",
    expected: "หน้าเว็บกลับไปหน้ากรอก PIN และ API ตอบ HTTP 401 พร้อม error.code=PIN_REQUIRED โดยไม่ส่งข้อมูลยอดขายหรือข้อมูล cache เดิม",
  },
  {
    id: "TC25",
    scenario: "FR-26\nข้อมูลร้านสำหรับการบริหาร",
    testCase: "แสดงข้อมูลระบุตัวร้านและสถานะที่กำหนด",
    pre: "CEO มีสิทธิ์และมี STORE-001 ในระบบ",
    steps: "1. เปิดหน้าข้อมูลร้าน\n2. ค้นหา STORE-001\n3. เปิดรายละเอียด\n4. ตรวจทุก field กับข้อมูลต้นทาง",
    data: "Store ID: STORE-001\nStore Name: ร้านหนึ่ง\nOwner ID: U-SELLER-001\nStatus: Active\nContract: Valid",
    expected: "ระบบแสดง Store ID, Store Name, Owner ID, Status และ Contract ตรงกับข้อมูลต้นทาง โดยไม่แสดงรหัสผ่าน PIN หรือข้อมูลบัญชีธนาคาร",
  },
  {
    id: "TC26",
    scenario: "FR-26\nยอดขายของร้านตามช่วงเวลา",
    testCase: "แสดงยอดขายและจำนวนออเดอร์ของร้านในช่วงที่กำหนด",
    pre: "STORE-001 มีธุรกรรมตรงขอบเขตช่วงทดสอบ",
    steps: "1. เลือก STORE-001\n2. กำหนดช่วง 2026-09-01T00:00:00+07:00 ถึงก่อน 2026-09-16T00:00:00+07:00\n3. เปิดรายงานร้าน\n4. เปรียบเทียบรายการต้นทาง",
    data: "completed: 1,200 และ 800 บาท\ncancelled: 900 บาท\nTimezone: Asia/Bangkok",
    expected: "ระบบแสดง completed orders 2 รายการและยอดขาย 2,000 บาท โดยไม่รวม cancelled 900 บาท",
  },
  {
    id: "TC27",
    scenario: "FR-26\nไม่พบร้าน",
    testCase: "ไม่แสดงข้อมูลร้านเดิมเมื่อค้นหา Store ID ที่ไม่มีอยู่",
    pre: "ไม่มี Store ID=STORE-999 ในระบบ",
    steps: "1. เปิดรายละเอียด STORE-001 ก่อน\n2. ค้นหา STORE-999\n3. ตรวจข้อความและ response\n4. ตรวจว่าข้อมูล STORE-001 ถูกล้างจากหน้าจอ",
    data: "Store ID: STORE-999",
    expected: "ระบบตอบ HTTP 404 พร้อม error.code=STORE_NOT_FOUND, แสดงข้อความไม่พบร้าน และไม่แสดงข้อมูลของ STORE-001 ค้างอยู่",
  },
  {
    id: "TC28",
    scenario: "FR-27 / UC-12\nจำนวนออเดอร์สำเร็จ",
    testCase: "แสดงจำนวนคำสั่งซื้อสำเร็จตามช่วงเวลา",
    pre: "Dashboard ใช้ completedOrders ตาม Metric Definition v1",
    steps: "1. เปิด Dashboard ธุรกรรม\n2. เลือกช่วง มกราคม 2026\n3. แยกจำนวนตาม status\n4. เปรียบเทียบกับ KPI",
    data: "completed 100\ncancelled 20\npending 5",
    expected: "KPI คำสั่งซื้อแสดง 100 รายการ โดยนับเฉพาะ status=completed",
  },
  {
    id: "TC29",
    scenario: "FR-27 / UC-12\nร้านยอดขายสูงสุด",
    testCase: "จัดอันดับร้านจากยอดขาย completed orders",
    pre: "มีข้อมูลยอดขาย 3 ร้านในช่วงเดียวกันและไม่มียอดเท่ากัน",
    steps: "1. เปิด Dashboard ธุรกรรม\n2. เลือกช่วง มกราคม 2026\n3. ตรวจยอดขายแต่ละร้าน\n4. ตรวจอันดับร้านยอดขายสูงสุด",
    data: "STORE-010: 50,000 บาท\nSTORE-011: 45,000 บาท\nSTORE-012: 30,000 บาท",
    expected: "ระบบแสดง STORE-010 เป็นอันดับ 1 ด้วยยอดขาย 50,000 บาท และเรียง STORE-011, STORE-012 ตามลำดับ",
  },
  {
    id: "TC30",
    scenario: "FR-27 / UC-12\nเมนูยอดนิยม",
    testCase: "จัดอันดับเมนูจากจำนวนชิ้นใน completed orders",
    pre: "Metric เมนูยอดนิยมกำหนดจากผลรวม quantity ของออเดอร์ completed; คะแนนเท่ากันเรียง Menu ID",
    steps: "1. เปิด Dashboard ธุรกรรม\n2. เลือกช่วง มกราคม 2026\n3. ตรวจ quantity ของแต่ละเมนู\n4. ตรวจอันดับและกฎกรณีคะแนนเท่ากัน",
    data: "M-001 ข้าวกะเพรา 40 ชิ้น\nM-002 ก๋วยเตี๋ยว 30 ชิ้น\nM-003 ข้าวมันไก่ 30 ชิ้น",
    expected: "ระบบแสดง M-001 เป็นอันดับ 1 และเมื่อ M-002 กับ M-003 เท่ากันให้เรียง M-002 ก่อน M-003 ตาม Menu ID",
  },
  {
    id: "TC31",
    scenario: "FR-28 / UC-13\nสร้างร้าน",
    testCase: "สร้างร้านใหม่ด้วยข้อมูลบังคับครบถ้วน",
    pre: "CEO เข้าสู่ระบบ, STORE-020 ยังไม่มี และ Test Environment กำหนด default status=Active",
    steps: "1. เปิด FoodCourt Settings\n2. เลือกสร้างร้าน\n3. กรอกทุก mandatory field ตาม Test Data\n4. ยืนยัน\n5. โหลดหน้าใหม่และค้นหา STORE-020",
    data: "Store ID: STORE-020\nName: ร้านอาหารใหม่\nOwner ID: U-SELLER-020\nPhone: 0812345678\nEmail: store20@example.test\nContract End: 2026-12-31",
    expected: "ระบบสร้าง STORE-020 เพียง 1 รายการ, เก็บทุก field ตรงกับ Test Data และแสดง Status=Active หลังโหลดใหม่",
  },
  {
    id: "TC32",
    scenario: "FR-28 / UC-13\nแก้ไขข้อมูลร้าน",
    testCase: "แก้ไขหมายเลขโทรศัพท์ของร้าน",
    pre: "STORE-020 มี Phone=0812345678 และ CEO มีสิทธิ์แก้ไข",
    steps: "1. เปิด STORE-020\n2. เลือกแก้ไข Phone\n3. เปลี่ยนเป็น 0898765432\n4. ยืนยัน\n5. โหลดหน้าใหม่และตรวจทุก field",
    data: "Before: 0812345678\nAfter: 0898765432",
    expected: "หลังโหลดใหม่ Phone=0898765432 และ Store ID, Name, Owner ID, Email, Contract End และ Status ไม่เปลี่ยน",
  },
  {
    id: "TC33",
    scenario: "FR-28 / UC-13\nระงับสิทธิ์ร้าน",
    testCase: "ระงับสิทธิ์ร้านและบันทึกผลกระทบทางธุรกิจ",
    pre: "STORE-021 มี Status=Active, มีออเดอร์ที่กำลังดำเนินการ 1 รายการ และ CEO มีสิทธิ์",
    steps: "1. เปิด STORE-021\n2. เลือกระงับสิทธิ์\n3. ระบุเหตุผล หมดสัญญา\n4. ยืนยัน\n5. ทดลองสร้างออเดอร์ใหม่และตรวจ Audit Log",
    data: "Store: STORE-021\nReason: หมดสัญญา\nExisting order: ORD-2101 / confirmed",
    expected: "STORE-021 เปลี่ยนเป็น Suspended, ไม่รับออเดอร์ใหม่, ORD-2101 ยังอยู่เพื่อดำเนินการต่อ และ Audit Log บันทึก Actor, Reason, เวลา, Previous=Active, New=Suspended",
  },
  {
    id: "TC34",
    scenario: "FR-28 / UC-13\nStore ID ซ้ำ",
    testCase: "ปฏิเสธการสร้างร้านด้วย Store ID ที่มีอยู่แล้ว",
    pre: "มี STORE-020 อยู่ในระบบแล้ว",
    steps: "1. เลือกสร้างร้าน\n2. กรอก Store ID=STORE-020 และชื่ออื่น\n3. กดยืนยัน\n4. ค้นหา STORE-020 และนับจำนวนรายการ",
    data: "Store ID: STORE-020\nNew Name: ร้านซ้ำ",
    expected: "ระบบตอบ HTTP 409 พร้อม error.code=STORE_ID_EXISTS, ไม่สร้างรายการใหม่, มี STORE-020 เพียง 1 รายการ และข้อมูลเดิมไม่ถูกเขียนทับ",
  },
  {
    id: "TC35",
    scenario: "FR-28 / UC-13 Extension 3a\nยกเลิกการแก้ไข",
    testCase: "ยกเลิกการแก้ไขข้อมูลร้านก่อนยืนยัน",
    pre: "STORE-021 มี Phone=0800000021",
    steps: "1. เปิด STORE-021\n2. เปลี่ยน Phone ชั่วคราวเป็น 0899999999\n3. กดยกเลิกก่อนยืนยัน\n4. เปิด STORE-021 ใหม่",
    data: "Before: 0800000021\nTemporary: 0899999999",
    expected: "ระบบสิ้นสุดการแก้ไขและแสดง Phone=0800000021 เมื่อเปิดใหม่ โดยไม่มี Audit Log การแก้ไขสำเร็จ",
  },
  {
    id: "TC36",
    scenario: "FR-28 / UC-13 Extension 6a\nสิทธิ์สร้างร้าน",
    testCase: "ปฏิเสธ Store Staff ที่พยายามสร้างร้าน",
    pre: "ผู้ใช้ role=STORE_STAFF เข้าสู่ระบบแต่ไม่มีสิทธิ์ส่วนกลาง",
    steps: "1. เปิด FoodCourt Settings\n2. ส่งคำขอสร้าง STORE-030 โดยตรง\n3. ตรวจ status และ response\n4. ค้นหา STORE-030 ด้วยบัญชี CEO",
    data: "Role: STORE_STAFF\nTarget Store ID: STORE-030",
    expected: "ระบบแสดง “คุณไม่มีสิทธิ์ดำเนินการ”, API ตอบ HTTP 403 และไม่สร้าง STORE-030 หรือ Audit Log การสร้างสำเร็จ",
  },
  {
    id: "TC37",
    scenario: "FR-28 / UC-13 Extension 7a\nบันทึกข้อมูลล้มเหลว",
    testCase: "Rollback การสร้างร้านเมื่อฐานข้อมูลเขียนไม่สำเร็จ",
    pre: "CEO มีสิทธิ์, STORE-031 ยังไม่มี และเปิด DB write fault ก่อนกด Save",
    steps: "1. เปิด DB write fault\n2. กรอกข้อมูล STORE-031 ครบถ้วน\n3. กด Save\n4. ตรวจข้อความและฐานข้อมูล\n5. ปิด fault แล้วกด Retry หนึ่งครั้ง",
    data: "Store ID: STORE-031\nFault: database write fails before transaction commit",
    expected: "ครั้งแรกระบบแสดง “เกิดข้อผิดพลาดในการบันทึกข้อมูล”, ไม่มีข้อมูลร้านบางส่วนและไม่สร้าง Audit สำเร็จ; หลัง Retry มี STORE-031 และ Audit สำเร็จอย่างละ 1 รายการ",
  },
  {
    id: "TC38",
    scenario: "FR-29 / UC-13\nปิดโรงอาหาร",
    testCase: "ปิดโรงอาหารและแจ้ง Customer กับเจ้าของร้าน",
    pre: "Food Court มี Status=Open; นโยบายทดสอบกำหนดให้ออเดอร์เดิมทำต่อได้ แต่ออเดอร์ใหม่ถูกปฏิเสธ",
    steps: "1. CEO เปิด FoodCourt Settings\n2. เลือกปิดโรงอาหารและยืนยัน\n3. ตรวจสถานะ\n4. ตรวจ notification ของ Customer และเจ้าของร้าน\n5. ทดลองสร้างออเดอร์ใหม่และเปิดออเดอร์เดิม",
    data: "Food Court: FC-001\nBefore: Open\nExisting: ORD-3801 / confirmed\nRecipients: Customer, Store Owner",
    expected: "FC-001 เปลี่ยนเป็น Closed, ผู้รับแต่ละรายได้ in-app notification 1 ครั้ง, ออเดอร์ใหม่ถูกปฏิเสธ และ ORD-3801 ยังดำเนินการต่อได้",
  },
  {
    id: "TC39",
    scenario: "FR-29 / UC-13\nเปิดโรงอาหาร",
    testCase: "เปิดโรงอาหารและแจ้งผู้ใช้",
    pre: "FC-001 มี Status=Closed และ CEO มีสิทธิ์",
    steps: "1. เปิด FoodCourt Settings\n2. เลือกเปิด FC-001\n3. ยืนยัน\n4. ตรวจสถานะและ notification\n5. สร้างออเดอร์ใหม่",
    data: "Food Court: FC-001\nBefore: Closed\nRecipients: Customer, Store Owner",
    expected: "FC-001 เปลี่ยนเป็น Open, ผู้รับแต่ละรายได้ in-app notification 1 ครั้ง และระบบยอมรับออเดอร์ใหม่",
  },
  {
    id: "TC40",
    scenario: "FR-29 / UC-13\nสั่งอาหารขณะปิด",
    testCase: "ปฏิเสธคำสั่งซื้อใหม่เมื่อโรงอาหารปิด",
    pre: "FC-001 มี Status=Closed และ Customer มีสินค้าในตะกร้า",
    steps: "1. เปิดหน้า Checkout\n2. ส่งคำขอ Confirm Order โดยตรง\n3. ตรวจ response\n4. ตรวจ Order และ Payment records",
    data: "Food Court: FC-001 / Closed\nCustomer: U-CUST-001\nCart: ITEM-001 x1",
    expected: "API ตอบ HTTP 409 พร้อม error.code=FOOD_COURT_CLOSED, ไม่สร้าง Pending Order, ไม่สร้าง Payment และไม่หักยอดจากลูกค้า",
  },
  {
    id: "TC41",
    scenario: "FR-30\nยกเลิกคิว",
    testCase: "ยกเลิกคิวที่ค้างโดยไม่ลบประวัติออเดอร์",
    pre: "Q-050 มี Status=WAITING เชื่อมกับ ORD-2050 ซึ่งมี Status=confirmed และ Payment=UNPAID",
    steps: "1. CEO ค้นหา Q-050\n2. เลือกยกเลิกคิว\n3. ระบุเหตุผล Duplicate queue และยืนยัน\n4. ตรวจ Queue, Order และ Audit Log",
    data: "Queue: Q-050 / WAITING\nOrder: ORD-2050 / confirmed\nPayment: UNPAID\nReason: Duplicate queue",
    expected: "Q-050 เปลี่ยนเป็น CANCELLED, ORD-2050 เปลี่ยนเป็น cancelled, ไม่มีการคืนเงิน, ประวัติ Order ยังอยู่ และ Audit Log บันทึก Actor, Reason, Previous/New Status",
  },
  {
    id: "TC42",
    scenario: "FR-30\nปลดล็อกออเดอร์",
    testCase: "ปลดล็อก stale lock และดำเนิน Workflow ต่อ",
    pre: "ORD-LOCK-01 มี Status=confirmed, Lock Reason=stale_worker_lock และข้อมูลออเดอร์ครบ",
    steps: "1. CEO เปิด ORD-LOCK-01\n2. เลือกปลดล็อกและยืนยัน\n3. โหลดข้อมูลใหม่\n4. เปลี่ยนสถานะจาก confirmed เป็น shipped\n5. ตรวจ Audit Log",
    data: "Order: ORD-LOCK-01\nBefore Status: confirmed\nLock: stale_worker_lock\nNext Status: shipped",
    expected: "Lock ถูกล้าง, ข้อมูลออเดอร์เดิมครบ, ระบบเปลี่ยนสถานะเป็น shipped ได้ และ Audit Log บันทึกผู้ปลดล็อกกับเหตุผล",
  },
  {
    id: "TC43",
    scenario: "FR-30\nสถานะที่ปลดล็อกไม่ได้",
    testCase: "ปฏิเสธการปลดล็อกออเดอร์ที่ completed แล้ว",
    pre: "ORD-DONE-01 มี Status=completed และไม่มี active lock",
    steps: "1. ค้นหา ORD-DONE-01\n2. ส่งคำขอปลดล็อก\n3. ตรวจ response\n4. โหลดสถานะและ Audit Log ใหม่",
    data: "Order: ORD-DONE-01\nStatus: completed",
    expected: "API ตอบ HTTP 409 พร้อม error.code=ORDER_STATE_NOT_UNLOCKABLE, สถานะยังเป็น completed และไม่สร้าง Audit Log การปลดล็อกสำเร็จ",
  },
  {
    id: "TC44",
    scenario: "FR-30\nสิทธิ์ปลดล็อกออเดอร์",
    testCase: "ปฏิเสธ Store Staff ที่พยายามปลดล็อกออเดอร์",
    pre: "STORE_STAFF เข้าสู่ระบบ และ ORD-LOCK-02 มี active lock",
    steps: "1. ส่งคำขอปลดล็อก ORD-LOCK-02 ด้วย token ของ STORE_STAFF\n2. ตรวจ status และ response\n3. โหลดออเดอร์ด้วยบัญชี CEO\n4. ตรวจ Audit Log",
    data: "Role: STORE_STAFF\nOrder: ORD-LOCK-02",
    expected: "API ตอบ HTTP 403, ไม่ส่งรายละเอียดออเดอร์, lock และ status ไม่เปลี่ยน และไม่สร้าง Audit Log การปลดล็อกสำเร็จ",
  },
  {
    id: "TC45",
    scenario: "FR-32\nข้อมูลผู้ใช้และ Privacy",
    testCase: "แสดงเฉพาะข้อมูลผู้ใช้ที่อนุญาตและ mask PII",
    pre: "TRUST_AND_SAFETY มีสิทธิ์ตรวจผู้ใช้ และมี U-1001 ในระบบ",
    steps: "1. เปิดศูนย์ค้นหาข้อมูล\n2. ค้นหา U-1001\n3. ตรวจ field ที่แสดงบน UI และ response\n4. ตรวจการ mask PII",
    data: "User ID: U-1001\nStatus: ACTIVE\nRoles: BUYER\nEmail: user1001@example.test\nPhone: 0812345678",
    expected: "ระบบแสดง User ID, Status, Roles, Shop Name, KYC Status และ Safety Summary; Email/Phone/ID card/Bank Account ถูก mask และไม่มี Password, token หรือ credential ใน response",
  },
  {
    id: "TC46",
    scenario: "FR-32\nประวัติพฤติกรรมผู้ใช้",
    testCase: "แสดงเหตุการณ์ของผู้ใช้ครบและเรียงจากใหม่ไปเก่า",
    pre: "U-1001 มีเหตุการณ์ที่กำหนดไว้ 3 รายการ",
    steps: "1. เปิด U-1001\n2. เปิดประวัติเหตุการณ์\n3. ตรวจ Event ID, Timestamp, Store ID, Order ID และ Action\n4. ตรวจลำดับและ pagination",
    data: "EV-003 2026-01-03T10:00+07 STORE-003 ORD-003 REPORT\nEV-002 2026-01-02T10:00+07 STORE-002 ORD-002 WARN\nEV-001 2026-01-01T10:00+07 STORE-001 ORD-001 ORDER",
    expected: "ระบบแสดงครบ 3 รายการ เรียง EV-003, EV-002, EV-001 จากใหม่ไปเก่า ทุก field ตรงกัน และ total=3 โดยไม่มีรายการของผู้ใช้อื่น",
  },
  {
    id: "TC47",
    scenario: "FR-32\nระงับผู้ใช้",
    testCase: "ระงับผู้ใช้และบันทึก Audit Log",
    pre: "U-1001 มี Status=ACTIVE และ TS-001 มี permission admin:user:suspend",
    steps: "1. เปิด U-1001\n2. เลือก Suspend User\n3. ระบุเหตุผล พฤติกรรมผิดปกติซ้ำ\n4. ยืนยัน\n5. โหลดผู้ใช้และ Audit Log ใหม่",
    data: "POST /api/auth/admin/users/U-1001/suspend\nActor: TS-001\nReason: พฤติกรรมผิดปกติซ้ำ",
    expected: "API ตอบ HTTP 200, U-1001 เปลี่ยนเป็น SUSPENDED จนกว่าจะ Restore และ Audit Log มี action=USER_SUSPENDED, actorId=TS-001, targetId=U-1001, Reason และเวลา",
  },
  {
    id: "TC48",
    scenario: "FR-32\nสิทธิ์จัดการผู้ใช้",
    testCase: "ปฏิเสธผู้ใช้ทั่วไปที่พยายามระงับบัญชีผู้อื่น",
    pre: "ผู้ใช้ role=BUYER เข้าสู่ระบบ และ U-1001 มี Status=ACTIVE",
    steps: "1. ส่ง POST /api/auth/admin/users/U-1001/suspend ด้วย token ของ BUYER\n2. ตรวจ status และ response\n3. โหลด U-1001 ด้วยบัญชีที่มีสิทธิ์\n4. ตรวจ Audit Log",
    data: "Role: BUYER\nTarget: U-1001\nReason: unauthorized attempt",
    expected: "API ตอบ HTTP 403 พร้อม error.code=FORBIDDEN, ไม่ส่ง PII ของ U-1001, สถานะยังเป็น ACTIVE และไม่สร้าง USER_SUSPENDED Audit Log",
  },
];

if (tests.length !== 48) throw new Error(`Expected 48 tests, found ${tests.length}`);

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Test Cases");

for (const range of [
  "B8:B11", "B12:B16", "B17:B20", "B21:B23", "B24:B26", "B28:B31",
  "B32:B34", "B35:B37", "B38:B44", "B45:B47", "B48:B51", "B52:B55",
]) {
  sheet.unmergeCells(range);
}

sheet.getRange("A1").values = [["TEST CASE"]];
sheet.getRange("E3").values = [["67050611 อชิรวินท์ จรูญกีรติโรจน์"]];
sheet.getRange("B4").values = [["ระบบการเงิน ตรวจสอบ และบริหารส่วนกลาง (Financial Audit & Admin)"]];
sheet.getRange("E4").values = [["2.0"]];
sheet.getRange("B5").values = [["ตรวจสอบ FR-15-FR-19, FR-21, FR-26-FR-30, FR-32 และ UC-12/UC-13 ตาม S2G6 DIGITAL INNOVATION AND TECHNOLOGY ฉบับในโฟลเดอร์โครงการ โดยอ้างอิงพฤติกรรม Metric v1 และ RBAC จากโค้ดปัจจุบัน"]];
sheet.getRange("E5").values = [[""]];

sheet.getRange("A8:I55").values = tests.map((t) => [
  t.id,
  t.scenario,
  t.testCase,
  t.pre,
  t.steps,
  t.data,
  t.expected,
  "",
  "",
]);

sheet.showGridLines = false;
sheet.freezePanes.unfreeze();

sheet.getRange("A1:I55").format.font = { name: fontName, size: 10, color: "#111827" };
sheet.getRange("A1:I55").format.verticalAlignment = "top";
sheet.getRange("A1:I55").format.wrapText = true;

sheet.getRange("A1:I1").format.fill = "#FFFFFF";
sheet.getRange("A1:I1").format.font = { name: fontName, size: 16, bold: true, color: "#111111" };
sheet.getRange("A1:I1").format.rowHeight = 30;
sheet.getRange("A1:I1").format.verticalAlignment = "center";

sheet.getRange("A2:F5").format.fill = "#FFFFFF";
sheet.getRange("A2:F5").format.font = { name: fontName, size: 10, color: "#111111" };
for (const cell of ["A2", "D2", "A3", "D3", "A4", "D4", "A5", "D5"]) {
  sheet.getRange(cell).format.fill = "#FFD633";
  sheet.getRange(cell).format.font = { name: fontName, size: 10, bold: true, color: "#111111" };
  sheet.getRange(cell).format.verticalAlignment = "center";
}
sheet.getRange("A2:F5").format.borders = { preset: "all", style: "thin", color: "#7A7A7A" };
sheet.getRange("A2:F3").format.rowHeight = 30;
sheet.getRange("A4:F4").format.rowHeight = 44;
sheet.getRange("A5:F5").format.rowHeight = 64;
sheet.getRange("A2:F5").format.verticalAlignment = "center";

sheet.getRange("A7:I7").format.fill = "#495AA7";
sheet.getRange("A7:I7").format.font = { name: fontName, size: 10, bold: true, color: "#FFFFFF" };
sheet.getRange("A7:I7").format.horizontalAlignment = "center";
sheet.getRange("A7:I7").format.verticalAlignment = "center";
sheet.getRange("A7:I7").format.rowHeight = 38;

sheet.getRange("A8:I55").format.fill = "#FFFFFF";
sheet.getRange("A8:I55").format.font = { name: fontName, size: 10, bold: false, color: "#111827" };
sheet.getRange("A8:I55").format.borders = { preset: "all", style: "thin", color: "#9CA3AF" };
sheet.getRange("A8:I55").format.rowHeight = 112;
for (let row = 8; row <= 55; row += 2) {
  sheet.getRange(`C${row}:I${row}`).format.fill = "#F9FAFB";
}
sheet.getRange("A8:A55").format.font = { name: fontName, size: 10, bold: true, color: "#111827" };
sheet.getRange("A8:A55").format.horizontalAlignment = "center";
sheet.getRange("B8:B55").format.fill = "#E8EDF8";
sheet.getRange("B8:B55").format.font = { name: fontName, size: 10, bold: true, color: "#1E2A5A" };
sheet.getRange("B8:B55").format.horizontalAlignment = "center";
sheet.getRange("B8:B55").format.verticalAlignment = "center";
sheet.getRange("I8:I55").format.horizontalAlignment = "center";

sheet.getRange("A1:A55").format.columnWidth = 13;
sheet.getRange("B1:B55").format.columnWidth = 31;
sheet.getRange("C1:C55").format.columnWidth = 42;
sheet.getRange("D1:D55").format.columnWidth = 46;
sheet.getRange("E1:E55").format.columnWidth = 66;
sheet.getRange("F1:F55").format.columnWidth = 46;
sheet.getRange("G1:G55").format.columnWidth = 66;
sheet.getRange("H1:H55").format.columnWidth = 45;
sheet.getRange("I1:I55").format.columnWidth = 22;

const topCheck = await workbook.inspect({
  kind: "table",
  range: "Test Cases!A1:I12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 9,
  maxChars: 12000,
});
console.log(topCheck.ndjson);

const resultColumns = await workbook.inspect({
  kind: "table",
  range: "Test Cases!H8:I55",
  include: "values",
  tableMaxRows: 48,
  tableMaxCols: 2,
  maxChars: 6000,
});
console.log(resultColumns.ndjson);

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

await fs.mkdir(outputDir, { recursive: true });
for (const [range, path] of [
  ["A1:I14", previewTop],
  ["A24:I38", previewMiddle],
  ["A43:I55", previewBottom],
]) {
  const image = await workbook.render({ sheetName: "Test Cases", range, scale: 0.8, format: "png" });
  await fs.writeFile(path, new Uint8Array(await image.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({
  outputPath,
  testCount: tests.length,
  reviewer: "67050611 อชิรวินท์ จรูญกีรติโรจน์",
  actualAndExecutionBlank: true,
  frozenPanes: false,
  scenarioMerged: false,
}));
