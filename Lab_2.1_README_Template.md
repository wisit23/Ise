# Lab 2.1: Extended ACL Basics — README Template

> วิธีใช้: กรอกข้อมูลในวงเล็บ `[ ]` และแทนข้อความ `วาง...ที่นี่` ด้วยผลจาก Packet Tracer จริง ก่อนส่งงานให้ลบคำแนะนำที่ไม่ใช้

## ข้อมูลผู้ทำ

- ชื่อ–นามสกุล: [กรอกชื่อ]
- รหัสนักศึกษา: [กรอกรหัส]
- วันที่ทำแลบ: [กรอกวันที่]
- ชื่อไฟล์ Packet Tracer ที่ส่ง: [ชื่อไฟล์.pkt]

## 1. Topology และ IP Address

| อุปกรณ์ | Interface | IP Address / Mask | Default Gateway |
|---|---|---|---|
| R1 | G0/0 | 10.0.10.1 /24 | - |
| R1 | G0/1 | 10.0.20.1 /24 | - |
| PC1 | - | 10.0.10.100 /24 | 10.0.10.1 |
| PC3 | - | 10.0.10.200 /24 | 10.0.10.1 |
| PC4 (Task 4) | - | 10.0.10.150 /24 | 10.0.10.1 |
| Server | - | 10.0.20.10 /24 | 10.0.20.1 |

ตำแหน่งที่ใส่ ACL: [เช่น R1 G0/0 ขาเข้า (in)]

เหตุผลที่เลือกตำแหน่งนี้: [อธิบายว่าทราฟฟิกจาก PC เข้าพอร์ตใด และเหตุใดจึงกรองตรงนั้น]

## 2. Baseline Test — ก่อนใส่ ACL

| การทดสอบ | ผลจริง | หมายเหตุ |
|---|---|---|
| PC1 → Server: Ping | [ผ่าน/ไม่ผ่าน] | [กรอก] |
| PC3 → Server: Ping | [ผ่าน/ไม่ผ่าน] | [กรอก] |
| PC1 → Server: HTTP | [ผ่าน/ไม่ผ่าน/ไม่มีบริการ] | [กรอก] |
| PC1 → Server: HTTPS | [ผ่าน/ไม่ผ่าน/ไม่มีบริการ] | [กรอก] |
| PC1 → Server: SSH | [ผ่าน/ไม่ผ่าน/ไม่มีบริการ] | [กรอก] |

> หากบริการใดไม่มีใน Server ที่ใช้ ให้บันทึกว่า “ไม่มีบริการให้ทดสอบ” อย่าระบุว่าถูก ACL บล็อก

## 3. Task 1 — Block HTTP from PC1

### ACL Configuration

วางเฉพาะ config ที่ใช้จริงใน Task 1:

```text
[วาง ACL configuration และคำสั่ง ip access-group ที่นี่]
```

### ผลทดสอบ

| การทดสอบ | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| PC1 → Server: Ping | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTP/80 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTPS/443 | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: SSH/22 | ALLOW | [กรอกผลจริง/ไม่มีบริการ] | [กรอก/ทดสอบไม่ได้] |

### `show access-lists` หลังทดสอบ Task 1

```text
[วาง output จริงที่นี่ รวมจำนวน matches ถ้ามี]
```

## 4. Task 2 — Block HTTPS Instead

### ACL Configuration

```text
[วาง ACL configuration ที่ใช้จริงใน Task 2]
```

### ผลทดสอบ

| การทดสอบ | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| PC1 → Server: Ping | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTP/80 | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTPS/443 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: SSH/22 | ALLOW | [กรอกผลจริง/ไม่มีบริการ] | [กรอก/ทดสอบไม่ได้] |

### `show access-lists` หลังทดสอบ Task 2

```text
[วาง output จริงที่นี่]
```

## 5. Task 3 — PC1 Blocked, PC3 Allowed

### ACL Configuration

```text
[วาง ACL configuration ที่ใช้จริงใน Task 3]
```

### ผลทดสอบ

| การทดสอบ | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| PC1 → Server: HTTP/80 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTPS/443 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC3 → Server: HTTP/80 | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC3 → Server: HTTPS/443 | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: Ping | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC3 → Server: Ping | ALLOW | [กรอกผลจริง] | [กรอก] |

เหตุใด `permit ip any any` บรรทัดสุดท้ายจึงทำให้ PC3 และทราฟฟิกอื่นผ่านได้: [เขียนคำอธิบาย]

### `show access-lists` หลังทดสอบ Task 3

```text
[วาง output จริงที่นี่]
```

## 6. Task 4 — Allow SSH to Server only from PC4

IP ของ PC4: [กรอก IP / Mask / Gateway ที่ตั้งจริง]

### ACL Configuration

```text
[วาง ACL configuration ที่ใช้จริงใน Task 4]
```

### ผลทดสอบ

| การทดสอบ | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| PC4 → Server: SSH/22 | ALLOW | [กรอกผลจริง/ไม่มีบริการ] | [กรอก/ทดสอบไม่ได้] |
| PC1 → Server: SSH/22 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC3 → Server: SSH/22 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTP/80 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC1 → Server: HTTPS/443 | BLOCK | [กรอกผลจริง] | [กรอก] |
| PC3 → Server: HTTP/80 | ALLOW | [กรอกผลจริง] | [กรอก] |
| PC3 → Server: HTTPS/443 | ALLOW | [กรอกผลจริง] | [กรอก] |

หมายเหตุเกี่ยวกับบริการ SSH บน Server: [ระบุว่ามีหรือไม่มีบริการ และใช้วิธีใดทดสอบกฎ]

### `show access-lists` หลังทดสอบ Task 4

```text
[วาง output จริงที่นี่]
```

## 7. คำตอบ Questions ในใบงาน

1. `eq 80` หมายถึงอะไร?  
   [คำตอบ]

2. ทำไม Ping ยังทำงานได้?  
   [คำตอบ]

3. ทำไมจึงต้องมี `permit ip any any`?  
   [คำตอบ]

4. ถ้าวาง `permit ip any any` ก่อนกฎ `deny` จะเกิดอะไรขึ้น?  
   [คำตอบ]

## 8. ตรวจสอบก่อนส่ง

- [ ] แนบไฟล์ Packet Tracer `.pkt`
- [ ] มี ACL configuration และ `show access-lists` ของ Task 1–4 ครบ
- [ ] ช่อง Actual มาจากการทดสอบจริง ไม่ได้คัดลอก Expected
- [ ] อธิบายตำแหน่งและทิศทางที่ใช้ ACL
- [ ] ตอบคำถาม 4 ข้อ และอธิบาย `permit ip any any` ใน Task 3
