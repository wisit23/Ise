# Buyer Feature Teach Me

## Round 0 — Request flow ที่มีอยู่

```text
frontend/app/products/page.js
→ frontend/lib/api.js
→ gateway /api/products
→ productController.search()
→ productModel.list()
→ Prisma
→ reloop_product
```

ตะกร้าปัจจุบันสร้าง Order ก่อนแล้วเรียก Product ให้เป็น `reserved` แบบสองขั้นตอน จึงยังมีช่อง
double-sale/partial failure งาน `BUY-002` ต้องย้าย correctness ไปไว้ใน contract ที่ atomic
หรือ recoverable ไม่แก้ด้วยการซ่อนปุ่มฝั่ง UI

**Teach-back:** ถ้า Order ถูกสร้างแต่ Product lock ล้มเหลว ระบบต้องมี rollback/reconciliation
แบบใด และเหตุใดการเช็ค `available` ก่อนเขียนจึงยังไม่พอ?
