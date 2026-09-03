# RE-LOOP UI Conventions

เอกสารนี้เป็นกติกาของฝั่ง Frontend หลังงาน `UI-SYSTEM-001` — เขียนไว้ให้คนที่มาต่อ
ทำตามได้โดยไม่ต้องเดา ถ้าจะแตกจากกติกาในนี้ ให้เขียนคอมเมนต์กำกับว่าเพราะอะไร

---

## 1. Design Token

Token อยู่ที่ [`frontend/app/globals.css`](../frontend/app/globals.css) เป็น channel
triplet (เช่น `5 150 105`) ไม่ใช่ hex เพราะต้องให้ Tailwind ใส่ opacity modifier ได้
(`bg-brand-600/10`) แล้ว map เข้า `theme.extend.colors` ที่
[`frontend/tailwind.config.js`](../frontend/tailwind.config.js)

| กลุ่ม    | Token                                           | ใช้กับ                             |
| -------- | ----------------------------------------------- | ---------------------------------- |
| Brand    | `brand-50` … `brand-900`                        | CTA, ราคา, active state, ลิงก์เน้น |
| Semantic | `success` `warning` `danger` `info` (+ `-soft`) | สถานะ, Alert, Toast, Badge         |
| Surface  | `surface` `surface-subtle` `surface-panel`      | พื้นหลัง                           |
| Border   | `line` `line-strong`                            | เส้นขอบ                            |
| Text     | `ink` `ink-muted` `ink-subtle`                  | ตัวอักษร                           |

**คลาส `emerald-*` / `gray-*` เดิมยังใช้ได้** ไม่ได้ถูกลบทิ้ง — Token เป็นคำศัพท์สำหรับ
**โค้ดใหม่และโค้ดที่กำลัง Refactor** เพื่อให้วันหนึ่งเปลี่ยนแบรนด์ได้ที่ไฟล์เดียว ไม่ใช่ 37 ไฟล์

### ทำไมไม่มี Token ที่เทียบเท่า `gray-400`

`text-gray-400` วัดได้ **2.85:1** บนพื้นขาว และ `text-slate-400` ได้ **2.6:1** —
ไม่ผ่านเกณฑ์ WCAG AA (4.5:1 สำหรับตัวอักษร, 3:1 สำหรับ non-text ที่สื่อความหมาย)
`ink-subtle` = `gray-500` (4.8:1) จึงเป็นโทนที่จางที่สุดที่มีให้ใช้ — **ตั้งใจไม่มีอะไรจางกว่านี้**

ข้อยกเว้นเดียวคือ **ตัวอักษรสว่างบนพื้นดำ** (หน้า `/swipe` และการ์ดในนั้น) ซึ่งกลับด้านกัน
และถูกต้องอยู่แล้ว

---

## 2. โทนสีเทา: `gray` หรือ `slate`

ทั้งสองตัวเป็นคนละ hue (`gray` เป็นกลาง, `slate` อมฟ้า) ก่อนหน้านี้ปนกันในหน้าเดียวกัน
กติกาคือแยกตามโลก:

| โลก            | หน้า                                                                                                      | โทน     |
| -------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| **Storefront** | `/`, `/products`, `/cart`, `/orders`, `/sell`, `/swipe`, `/auctions`, `/store/*`, `/seller/*`, `/profile` | `gray`  |
| **Backoffice** | `/workspace`, `/executive`, `/marketing`, `/support/*`, `/admin/*`                                        | `slate` |

---

## 3. Stacking Order (z-index)

ห้ามใส่ `z-[100]` มั่วอีก ใช้ชื่อที่ประกาศไว้ใน `tailwind.config.js`:

```
z-nav (30)  <  z-dropdown (60)  <  z-drawer (100)  <  z-modal (200)  <  z-toast (300)
```

เคยมีบั๊กจริงจากเรื่องนี้: `ConfirmDialog` (z-50) เปิดขึ้นมา **อยู่ใต้** Case Drawer (z-[100])
ทำให้กดปุ่มยืนยันไม่ได้

---

## 4. UI Primitive — `frontend/components/ui/`

Import ผ่าน barrel: `import { Button, Input, Modal } from "../components/ui";`

| Component                   | ใช้แทน                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `Button`                    | ปุ่มทุกชนิด — `variant` primary/secondary/ghost/danger, `size` sm/md/lg, `loading`, `icon`, `href` |
| `Input` `Select` `Textarea` | ช่องกรอกทุกชนิด — ผูก `label` / `hint` / `error` / `aria-*` ให้เอง                                 |
| `Modal`                     | Dialog ทุกชนิด — Esc, click backdrop, focus trap, คืน focus, ล็อก body scroll                      |
| `ConfirmDialog`             | **แทน `window.confirm` / `window.prompt`** — รับเหตุผลแบบ required/optional ได้                    |
| `ToastProvider` `useToast`  | **แทน `alert()`** — mount Provider ที่ root ของหน้า แล้วเรียก `useToast().success(...)`            |
| `Alert`                     | ข้อความ error/warning/info/success ในหน้า                                                          |
| `EmptyState`                | ผลลัพธ์ว่าง — **ต้องมีทางออกให้ผู้ใช้เสมอ** (ปุ่มล้างตัวกรอง ฯลฯ)                                  |
| `ErrorState`                | โหลดข้อมูลไม่สำเร็จ — มีปุ่ม "ลองใหม่"                                                             |
| `Skeleton`                  | `Skeleton.Card` `Skeleton.CardGrid` `Skeleton.Row` `Skeleton.Text`                                 |
| `DataTable`                 | ตารางใน Backoffice — รับ `columns` เป็น data, จัดการ loading/empty ให้                             |

`frontend/components/panel/ui/` (`Badge`, `KpiCard`, `ChartCard`, `DropdownFilter`)
เป็นของ Backoffice โดยเฉพาะ อยู่ที่เดิม ไม่ได้ย้าย

### ห้ามใช้

- `alert()` / `confirm()` / `prompt()` — บล็อกทั้งแท็บ, จัดสไตล์ไม่ได้, แปลไม่ได้
- `.catch(() => {})` — ถ้าเป็นข้อมูลหลักใช้ `ErrorState`, ถ้าเป็นข้อมูลเสริมให้
  `console.error("...ไม่สำเร็จ:", err)` อย่างน้อยต้องรู้ว่าพัง

---

## 5. State ที่ทุกหน้าต้องมีครบ

หน้าไหนที่ดึงข้อมูล ต้องตอบได้ทั้ง 4 สถานะ:

1. **Loading** — `Skeleton` ที่มีรูปทรงเหมือนของจริง ไม่ใช่ `<p>กำลังโหลด...</p>` (มันทำให้
   layout กระโดดตอนข้อมูลมา)
2. **Error** — `ErrorState` พร้อมปุ่มลองใหม่
3. **Empty** — `EmptyState` พร้อม action
4. **Success** — ของจริง

---

## 6. Accessibility

- ทุก field ต้องมี `label` ที่มองเห็น — **placeholder ไม่ใช่ label** เพราะหายทันทีที่พิมพ์
- ปุ่มที่มีแต่ไอคอน หรือปุ่มที่ label ถูกซ่อนบนจอเล็ก ต้องมี `aria-label`
- อย่าใช้ `<div onClick>` เป็นปุ่ม — คีย์บอร์ดเข้าไม่ถึง ใช้ `<button type="button">`
- Focus ring ใช้คลาส `.focus-ring` (เป็น `:focus-visible` จึงไม่ค้างตอนคลิกเมาส์)
- Dropdown / Modal ต้องปิดด้วย Esc ได้ และคืน focus ให้ตัวที่เปิดมัน
- เคารพ `prefers-reduced-motion` — มี global rule ใน `globals.css` แล้ว

---

## 7. ฟอนต์และไอคอน

- **ฟอนต์:** Noto Sans Thai ผ่าน `next/font` ใน `app/layout.js` — self-host ตอน build
  ไม่ต้องต่อเน็ตตอน runtime และไม่มี layout shift
- **ไอคอน:** Material Symbols Outlined เท่านั้น ประกาศครั้งเดียวใน `layout.js` head
  **ห้ามใช้ emoji เป็นไอคอน** (เคยเป็นแบบนั้น แล้ว migrate ออกไปแล้วใน `d98e8a1`)
- ใส่ `aria-hidden="true"` ที่ span ของไอคอนเสมอเมื่อมี label ข้างๆ อยู่แล้ว

### กับดัก: ห้ามใส่ display utility ที่ span ของไอคอนโดยตรง

stylesheet ของ Material Symbols จาก Google **โหลดทีหลัง** `layout.css` ของ Next
(ตรวจแล้วด้วย `document.styleSheets` — index 0 คือ Tailwind, index 1 คือ Google)
และมันตั้ง `display` ให้ `.material-symbols-outlined` เอง specificity เท่ากัน (0,1,0)
ตัวที่มาทีหลังจึงชนะ

แปลว่า `hidden` / `sm:inline` / `flex` / `block` ที่ใส่บน span ไอคอน **ไม่ทำงาน
และไม่มี error อะไรบอก**

```jsx
// ❌ hidden ไม่ทำงาน — Google เขียนทับ
<span className="material-symbols-outlined hidden sm:inline">search</span>

// ✅ ใส่ที่ตัวห่อแทน
<span className="hidden sm:inline">
  <span className="material-symbols-outlined">search</span>
</span>
```

utility อื่น (`text-[20px]`, สี, `leading-none`) ใส่ที่ไอคอนได้ตามปกติ —
มีปัญหาเฉพาะ property `display`

---

## 8. ยังไม่ทำ (Backlog)

- **Backoffice บนมือถือ** — sidebar เป็น `hidden sm:flex` และไม่มี drawer มาแทน
  จอต่ำกว่า 640px จึงสลับ section ไม่ได้ (ตกลงกันว่าเลื่อนไปก่อน)
- **Dark mode** — `globals.css` pin `bg-white` ไว้โดยตั้งใจ กันเบราว์เซอร์ auto-dark
- **แปลง `emerald-*` / `gray-*` เดิมทั้งหมดเป็น Token** — ทำเฉพาะไฟล์ที่แตะ
