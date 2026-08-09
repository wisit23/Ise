# Seller Feature Teach Me

## Round 0 — Listing data flow

```text
frontend/app/sell/page.js
→ uploadFiles() / POST /uploads
→ POST /api/products
→ productController.create()
→ productModel.create()
→ products + photos/videos
```

ปัจจุบัน API normalize media แต่ยังไม่บังคับภาพอย่างน้อย 4 มุม และ upload volume เป็น public
product media จึงห้ามใช้เก็บ KYC งาน KYC ต้องอยู่ private storage และ short-lived Admin access

**Teach-back:** เพราะเหตุใด Product media กับ KYC file ต้องใช้ policy/storage boundary คนละชุด?

## Round 1 — ProductVideo เป็น provider ข้าม Feature

Source ที่ pull มาให้ Seller สร้าง `ProductVideo` ของสินค้าตนเองและให้ Buyer เปิด public feed
ได้ แต่ provider contract ยังมีสองจุดต้องตัดสินใจ: feed ควรรวม `reserved`/`sold` หรือไม่ และ
ชื่อผู้ขายควรมาจาก identity/profile service แทน request body หรือไม่

**Teach-back:** เหตุใด ownership check ของ Product ผ่านแล้ว แต่ client-supplied `sellerName`
ยังไม่ใช่ trusted identity?
