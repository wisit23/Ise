# Admin Feature Progress

> Owner: สิรดนัย กันหา · Reviewer: อชิรวินท์ จรูญกีรติโรจน์ · Updated: 2026-07-30

**Status:** Not started

**Confirmed evidence:** Auth schema มี `ADMIN`, `KycStatus` และ `Report` table แต่ยังไม่มี
multi-role permission model, Admin provisioning, KYC decision API, moderation API หรือ `/admin`
workspace

**Blocker:** `ADM-001` คือ Gate 0 provider ของทุก Feature

**Next action:** เขียน failing multi-role/permission tests ของ `ADM-001`
