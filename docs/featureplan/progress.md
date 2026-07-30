# RE-LOOP Combined Feature Progress

> อัปเดตล่าสุด: 2026-07-30

## สถานะรวม

**Not started — planning package prepared, implementation ยังไม่เริ่มตาม Feature plans ใหม่**

| Feature          | Owner     | Core        | Extended    | Next action                         |
| ---------------- | --------- | ----------- | ----------- | ----------------------------------- |
| Buyer            | วิศิษฏ์   | Not started | Not started | Review Product/Order contract       |
| Seller           | เอกตระการ | Not started | Not started | Review listing/KYC boundary         |
| Customer Service | อชิรวินท์ | Not started | Not started | Freeze Chat/Case contract           |
| Admin            | สิรดนัย   | Not started | Not started | Start `ADM-001` RBAC contract       |
| Marketing        | ศิวกร     | Not started | Not started | Freeze Campaign contract            |
| Executive        | อัสนัย    | Not started | Not started | Freeze read-only metric definitions |

## Confirmed current evidence

- Repository มี Auth, Product, Order และ Review implementation/prototype บางส่วน
- Buyer/Seller UI, pagination, upload, seller dashboard และ seller reviews มีหลักฐานใน
  `docs/progress.md`
- Chat service ยังมีเพียง health endpoint
- Admin, Marketing และ Executive ยังไม่มี Feature module/UI ที่รับ requirement ของตนเองครบ

หลักฐานเดิมเป็น input สำหรับตรวจรับช่วง ไม่เปลี่ยนสถานะ Feature ใหม่เป็น Done

## Current blocker

Gate 0 ยังไม่ผ่าน: multi-role permission, error envelope, status transitions และ event envelope
ยังต้องได้รับ review จากทั้งหก Feature

## Next action

สิรดนัยเริ่ม `ADM-001`; Owner คนอื่น review `integration.md` และเตรียม failing contract tests
