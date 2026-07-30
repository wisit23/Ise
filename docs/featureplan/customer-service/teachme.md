# Customer Service Feature Teach Me

## Round 0 — Proxy ไม่เท่ากับ Feature

`backend/gateway/src/app.js` ส่ง `/api/chat` ไป Chat service และเปิด WebSocket option แล้ว
แต่ `backend/services/chat-service/src/app.js` ตอบได้เพียง health check จึงยังไม่มี Chat feature

Chat ต้องตรวจสมาชิกห้องที่ server ทุกครั้ง Staff access ต้องมีเหตุผล/audit และห้ามเปิดให้ CS
ค้นบทสนทนาของทุกคนโดยไม่มี case ที่ได้รับมอบหมาย

**Teach-back:** การมี `ws: true` ใน Gateway พิสูจน์ได้เพียงอะไร และยังไม่พิสูจน์อะไร?
