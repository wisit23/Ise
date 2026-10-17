# Lab 2.2 และ 2.3: Extended ACL — Controlling Services

กรอกเฉพาะผลที่ได้จาก Packet Tracer และแทนข้อความใน `[ ]` ก่อนส่ง

## Lab 2.2

### 1. Baseline — ก่อนกำหนด ACL

| Source | Service | Expected before ACL | Actual |
|---|---|---|---|
| PC1 | Ping | SUCCESS | [กรอก] |
| PC1 | HTTP/80 | SUCCESS | [กรอก] |
| PC1 | HTTPS/443 | SUCCESS | [กรอก] |
| PC1 | SSH/22 | SUCCESS | [กรอก] |
| PC2 | Ping | SUCCESS | [กรอก] |
| PC2 | HTTP/80 | SUCCESS | [กรอก] |
| PC2 | HTTPS/443 | SUCCESS | [กรอก] |
| PC2 | SSH/22 | SUCCESS | [กรอก] |
| PC3 | Ping | SUCCESS | [กรอก] |
| PC3 | HTTP/80 | SUCCESS | [กรอก] |
| PC3 | HTTPS/443 | SUCCESS | [กรอก] |
| PC3 | SSH/22 | SUCCESS | [กรอก] |

### 2. แปลง Security Policy 6.1 เป็น ACE

ระบุ action, protocol, source, destination และ destination port ของกฎที่ต้องใช้

| Action | Protocol | Source | Destination | Destination port | ACE |
|---|---|---|---|---|---|
| [กรอก] | [กรอก] | [กรอก] | [กรอก] | [กรอก] | `[กรอก]` |
| [กรอก] | [กรอก] | [กรอก] | [กรอก] | [กรอก] | `[กรอก]` |
| [กรอก] | [กรอก] | [กรอก] | [กรอก] | [กรอก] | `[กรอก]` |

### 3. Named Extended ACL ที่ตั้งค่าจริง

```text
[วาง configuration ของ USER_ACCESS]
```

### 4. Interface และ Direction

- Interface ที่ใช้: [กรอก]
- Direction (`in` หรือ `out`): [กรอก]
- เหตุผลที่เลือกตำแหน่งนี้: [ตอบ]
- คำสั่ง `ip access-group` ที่ใช้: `[กรอก]`

### 5. ผลทดสอบ PC1

| Test | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| PC1 → Server Ping | ALLOW | [กรอก] | [กรอก] |
| PC1 → Server HTTP | ALLOW | [กรอก] | [กรอก] |
| PC1 → Server HTTPS | ALLOW | [กรอก] | [กรอก] |
| PC1 → Server SSH | ALLOW | [กรอก] | [กรอก] |

### 6. ผลทดสอบ PC2

| Test | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| PC2 → Server Ping | ALLOW | [กรอก] | [กรอก] |
| PC2 → Server HTTP | BLOCK | [กรอก] | [กรอก] |
| PC2 → Server HTTPS | ALLOW | [กรอก] | [กรอก] |
| PC2 → Server SSH | BLOCK | [กรอก] | [กรอก] |

### 7. Verify

`show access-lists` หลังทดสอบ โดยแสดง hit counts:

```text
[วาง output จริง]
```

`show ip interface g0/0`:

```text
[วาง output จริง]
```

`show ip interface g0/1`:

```text
[วาง output จริง]
```

`show running-config | section access-list`:

```text
[วาง output จริง]
```

เมื่อทดสอบซ้ำ ACE counter ใดเพิ่มขึ้น และเพราะอะไร: [ตอบ]

### 8. Analysis Questions

1. Why is this an Extended ACL rather than a Standard ACL?  
   [ตอบ]

2. Explain each part of `deny tcp host 10.0.10.100 host 10.0.20.10 eq 80`.  
   [ตอบ]

3. If `eq 80` becomes `eq 443`, what is blocked?  
   [ตอบ]

4. What is the difference between denying TCP/80 and denying all IP traffic?  
   [ตอบ]

5. Why is ACL rule order important?  
   [ตอบ]

6. What happens if `permit ip any any` is placed before a deny rule?  
   [ตอบ]

7. What is the implicit deny?  
   [ตอบ]

8. Which ACE counters should increase after testing, and why?  
   [ตอบ]

## Lab 2.3 Challenge

### 9. การเปลี่ยนจาก Policy 6.1 เป็น Policy 6.2

- กฎที่เพิ่มหรือแก้ใน ACL เดิม: [ตอบ]
- เหตุผลของการเปลี่ยน: [ตอบ]

### 10. Final ACL configuration

```text
[วาง configuration สุดท้ายของ USER_ACCESS]
```

### 11. ผลทดสอบทุก Host และบริการที่ได้รับผล

| Source | Ping: Actual / PASS-FAIL | HTTP: Actual / PASS-FAIL | HTTPS: Actual / PASS-FAIL | SSH: Actual / PASS-FAIL |
|---|---|---|---|---|
| PC1 | [กรอก] | [กรอก] | [กรอก] | [กรอก] |
| PC2 | [กรอก] | [กรอก] | [กรอก] | [กรอก] |
| PC3 | [กรอก] | [กรอก] | [กรอก] | [กรอก] |

### 12. `show access-lists` หลังทดสอบ Challenge

```text
[วาง output จริงที่มี hit counts]
```
