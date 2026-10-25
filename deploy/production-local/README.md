# Kubernetes production-local บนเครื่องเดียว

ชุดนี้ใช้ **production images และขั้นตอน migration แยกจาก startup** และอ่าน **`.env` ที่ root**
เหมือนชุด `production-cloud` ไม่ต้องมี `secrets.local.env` อีกชุด
แอปทำงานใน kind บน Docker Desktop; deploy เปิดทางเข้าเฉพาะ localhost ตามพอร์ตใน `.env` ให้โดยอัตโนมัติ
ไม่ต้องเปิด Terminal รัน port-forward ค้างไว้ และไม่เปิดพอร์ตฐานข้อมูลออกมาที่เครื่อง
สามารถใช้กับงานจริงที่เข้าจากเครื่องเดียวได้เมื่อเตรียม backup/restore และยอมรับข้อจำกัดด้านล่าง
**ไม่ได้หมายความว่าพร้อมเปิดอินเทอร์เน็ตทันที**: การเปิดสาธารณะต้องเตรียม reverse proxy/HTTPS,
เครือข่ายที่แยกฐานข้อมูล และ storage/backup ที่ผ่านการทดสอบก่อน
ไม่ใช้ `deploy.sh` ที่ root และไม่เปลี่ยน Docker Compose หรือชุด dev ใน `deploy/k8s`

## สิ่งที่แยกจากระบบเดิม

- cluster: `reloop-production-local`
- context: `kind-reloop-production-local` (ทุกคำสั่งในสคริปต์ระบุ context ชัดเจน)
- namespace: `reloop-production-local`
- image: `reloop/production-local-<service>:<timestamp>-<random>` ไม่ใช้ tag เดิมซ้ำ
- Secret: `reloop-secrets` ภายใน namespace ใหม่นี้
- DB/PVC: สร้างใหม่ใน cluster ใหม่ ไม่มีการนำ Compose volumes หรือข้อมูลเดิมเข้ามา
  **การใช้ `.env` เดียวกันไม่ใช่การย้ายข้อมูลจาก Compose/Cloud**
- artifacts: `deploy/production-local/.state/<image-tag>/` ถูก ignore ทั้ง Git และ Docker build

ใช้ Node 24, root `package-lock.json` และ `npm ci` สำหรับ image ชุดนี้เท่านั้น
Frontend ใช้ `next build`/`next start`; backend เริ่มด้วย `node src/server.js`
แอปรันเป็น non-root และมี PVC สำหรับ KYC, uploads, reviews, evidence และ attachments

## 1. เตรียมเครื่องและ Secret

ต้องมี Docker Desktop แบบ Linux containers, `kubectl` และ PowerShell 5.1 ขึ้นไป
เปิด Docker Desktop และจัด CPU/RAM ให้เพียงพอ (เริ่มที่ RAM 8GB แล้วตรวจการใช้จริง)
cluster ต้องมี default StorageClass เช่น local-path ที่ kind เตรียมไว้
ไม่ต้องกด Create cluster ในหน้า Kubernetes ของ Docker Desktop

สคริปต์จัดการ `kind` ให้ก่อน deploy:
- ถ้ามีแล้ว ใช้เวอร์ชันเดิม ไม่ติดตั้งหรืออัปเกรดซ้ำ
- ถ้าเพิ่งติดตั้งแต่ terminal ยังไม่เห็น จะอ่าน PATH ล่าสุดมาใช้ โดยเก็บ PATH เฉพาะ session เดิมไว้ด้วย
- ถ้ายังไม่มี จะติดตั้ง `Kubernetes.kind` จาก WinGet สำหรับบัญชีปัจจุบัน แล้ว refresh PATH และตรวจ `kind version` เพื่อทำงานต่อใน process เดิม
- การติดตั้งใช้ `--accept-source-agreements --accept-package-agreements --disable-interactivity` จึงยอมรับข้อตกลงของ source/package โดยไม่ถามซ้ำ
- ถ้าไม่มี WinGet (App Installer), ติดตั้งไม่สำเร็จ หรือ Docker ไม่พร้อม จะหยุด ไม่ deploy ต่อ และไม่ติดตั้ง Docker/kubectl ให้อัตโนมัติ
- ตรวจไฟล์ Secret และ Docker ให้พร้อมก่อน จึงจะติดตั้ง `kind`; ไม่ต้องปิดเปิด PowerShell สำหรับขั้นตอนภายในสคริปต์

หากต้องการติดตั้งเอง ใช้ https://kind.sigs.k8s.io/docs/user/quick-start/
การติดตั้ง `kind` ไม่ได้สร้าง cluster: ยังต้องระบุ `-CreateCluster` และ `-Migrate` ตามขั้นตอนด้านล่าง

จาก root repo:

```powershell
if (Test-Path .env) { throw '.env already exists; edit it without overwriting.' }
Copy-Item -LiteralPath .env.example -Destination .env -ErrorAction Stop
```

คำสั่งคัดลอกด้านบนต้องรันเฉพาะเมื่อยังไม่มี `.env` เท่านั้น ตรวจไฟล์ก่อนด้วย `Test-Path .env`
แก้ค่าใน `.env` ก่อน deploy:
- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_SERVICE_TOKEN`
  ต้องยาวอย่างน้อย 32 ตัวอักษร และไม่ใช่รหัสตัวอย่าง/dev; JWT access/refresh/internal ต้องไม่ซ้ำกัน
- สคริปต์ไม่สร้างรหัสใหม่หรือหมุนรหัสฐานข้อมูลเดิมให้อัตโนมัติ
  ถ้าระบบเดิมใช้รหัสสั้น ต้องวางแผนหมุนรหัสใน DB และ config ให้ตรงกันก่อน
- `POSTGRES_PASSWORD` ต้องตรงกับ password ใน PostgreSQL URLs ทั้ง 4 ตัว และ username เป็น `reloop`
- ใช้ password แบบ URL-safe หรือ URL-encode เมื่อใส่ใน URL
- URLs ต้องชี้ `postgres:5432/reloop_auth`, `reloop_product`, `reloop_order`, `reloop_support`
- Mongo URL ใช้ `mongodb://mongo:27017/reloop_chat?replicaSet=rs0&directConnection=true`
- JWT access, refresh และ internal token ใช้ค่าสุ่มแยกกัน แนะนำอย่างน้อย 32 bytes
- `REDIS_URL=redis://redis:6379`; `APP_BASE_URL`, `NEXT_PUBLIC_API_URL`, `MAIL_FROM`, `MAIL_TRANSPORT` ต้องมีค่า
- URL ที่ไม่ใช่ loopback ต้องเป็น HTTPS และใช้ `MAIL_TRANSPORT=smtp` พร้อม `SMTP_HOST`
  ถ้า SMTP ต้องยืนยันตัวตน ให้ตั้ง `SMTP_USER` และ `SMTP_PASS` คู่กัน
- ไม่ต้องส่งค่า secret ในแชตหรือ commit `.env`

ไฟล์ local รองรับ `KEY=value`, `export KEY=value`, ค่าครอบด้วย single/double quote และ comment
ไม่รองรับ multiline, dotenv interpolation (`$VAR`, `${VAR}`) หรือ backslash escape:
สคริปต์จะหยุดแทนการแปลค่าต่างจาก Compose ให้ใช้ค่าตรง ๆ และ URL-encode รหัสใน DB URL
ชื่อ key รองรับตัวเลข เช่นกัน; ค่า quote ใน `MAIL_FROM` จะถูกถอดก่อนสร้าง Kubernetes Secret
ค่าจาก `.env` ใช้ทั้ง runtime และ build ของ frontend (`NEXT_PUBLIC_API_URL` และ report settings)
สคริปต์คง `NODE_ENV=production`, พอร์ตภายใน, service DNS และ private-storage paths ของ cluster
ไม่ใช้ค่าพอร์ต host ของ Compose มาเปลี่ยนพอร์ต Pod

ถ้าต้องเลือกไฟล์อื่น ใช้ `-EnvFile <path>` (`-SecretsFile` เดิมยังใช้ได้)
ค่า `.env` ไม่ถูกแสดงหรือเขียนเป็น Secret manifest ใน `.state`

Secret ใช้ชื่อ DNS ภายใน แต่ cluster และ namespace แยกกัน จึงไม่ชี้ไปฐานข้อมูล Compose เดิม
สคริปต์ปฏิเสธ URL ฐานข้อมูลภายนอกและการเปลี่ยน PostgreSQL password ผ่าน Secret อย่างเดียว

## 2. Deploy ครั้งแรก

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/production-local/deploy.ps1 -CreateCluster -Migrate
```

`-CreateCluster` สร้างเฉพาะ cluster ชื่อใหม่เมื่อยังไม่มี ไม่ลบหรือสร้างทับ cluster เก่า
สคริปต์ไม่เปลี่ยน current context เอง แต่ `kind create cluster` อาจเปลี่ยน context ตามพฤติกรรมของ kind
ตรวจ `kubectl config current-context` หลังสร้างหากต้องการกลับไปใช้ context เดิม

ลำดับการทำงาน:
1. ตรวจ Docker/kubectl, Secret และ URL ฐานข้อมูล; ตรวจ Docker พร้อมใช้งาน แล้วติดตั้ง kind ถ้าขาด จากนั้นตรวจ namespace marker และล็อกไม่ให้สคริปต์บน checkout นี้รันซ้อน
2. ตรวจ hash ของไฟล์ Prisma และ infra DB เทียบกับ deploy สำเร็จล่าสุด; ครั้งแรก/เมื่อเปลี่ยนต้องใช้ `-Migrate`
3. Build 7 images และโหลดเข้า kind ขณะที่แอปเดิม (ถ้ามี) ยังทำงาน
4. Render overlay, เก็บ Deployment เดิมสำหรับอ้างอิง, apply namespace/Secret/infra และรอ DB/Redis พร้อม
5. ถ้าใช้ `-Migrate`: scale แอปลง 0, รอ Pod หยุด, backup PostgreSQL/MongoDB แล้วรัน Jobs ทีละ service
6. PostgreSQL ใช้ `node prisma/migrate.js` เดิมของแต่ละ service; Mongo ใช้ `prisma db push --skip-generate`
7. ตรวจ `prisma migrate status` ของ PostgreSQL ทั้ง 4 services ด้วย Jobs ก่อนเปิดแอป
8. Apply Deployments, รอ rollout, ตรวจ frontend production และเรียก product feed ผ่าน gateway
9. เมื่อผ่านเท่านั้นจึงบันทึก schema hash และ image tag ใน ConfigMap `deployment-state`

อย่า deploy ด้วย `kubectl apply -k deploy/production-local` โดยตรง: overlay ใช้ tag `unbuilt`
เพื่อไม่เผลอใช้ development images สคริปต์จะเปลี่ยนเป็น tag ที่เพิ่ง build/load ก่อน apply

ไม่ seed, ไม่ใช้ `--accept-data-loss`, ไม่ล้าง volume และไม่ย้อน schema อัตโนมัติ
Jobs ไม่ retry หลังล้มเหลว และมีเวลาสูงสุด 600 วินาที เก็บ Job หลังจบประมาณ 1 วัน
สคริปต์เก็บ Job logs ลงเครื่องก่อน และปฏิเสธการรันซ้ำเมื่อพบ database Job เดิมยัง active

## 3. เปิดเว็บ

หลัง deploy สำเร็จ เข้า http://localhost:3000 และ http://localhost:8080/health ได้เลย
โดยค่าเริ่มต้นใน `.env`:

```dotenv
FRONTEND_PORT=3000
GATEWAY_PORT=8080
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8080
```

**ถ้า deploy ไปแล้วด้วยสคริปต์รุ่นเก่า** รันแค่คำสั่งนี้จาก root repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/production-local/expose.ps1
```

คำสั่งนี้ปรับเฉพาะ Service frontend/gateway และ container ทางเข้าที่เป็นเจ้าของของชุดนี้
ไม่ rebuild แอป ไม่รัน migration ไม่สร้าง/ลบ cluster และไม่แตะฐานข้อมูล/PVC
เลือก env อื่นได้ด้วย `-EnvFile <path>` เหมือน deploy

การเชื่อมต่อ: `127.0.0.1:<พอร์ตใน .env>` → Docker container `reloop-production-local-access`
→ NodePort ของ kind (`frontend=30080`, `gateway=30081`) → Pod ของแอป
พอร์ตภายในยังเป็น 3000/8080 แม้เลือกพอร์ตภายนอกอื่น เช่น 13000/18080
สคริปต์ตรวจ HTTP ผ่านพอร์ตบนเครื่องจริงก่อนรายงานสำเร็จ ไม่ตรวจแค่ใน Pod
ตัว proxy ส่งต่อ TCP ตรง ๆ จึงรองรับ WebSocket/streaming โดยไม่เปลี่ยน HTTP headers

container ทางเข้ารับแค่ `127.0.0.1`, ใช้ image gateway ที่ build ไว้บน Docker Desktop แล้ว
และ mount `port-proxy.cjs` แบบ read-only ไม่รับ secrets หรือ mount Docker socket
ใช้ restart policy `unless-stopped`: ไม่ผูกอายุการทำงานกับ Terminal หรือ agent session
ต้องเปิด Docker Desktop ไว้; หลัง reboot ให้รอ Docker/cluster/แอปพร้อม
ถ้า container ถูก stop ด้วยมือ ให้รัน `expose.ps1` อีกครั้ง
อย่าลบหรือย้ายไฟล์ repo ขณะใช้งาน เพราะ proxy mount ไฟล์จาก repo นี้

ถ้าพอร์ตชน Compose/dev หรือ port-forward เดิม สคริปต์จะหยุด ไม่ kill process ที่ชนให้
หยุด Terminal port-forward เดิมด้วย Ctrl+C หรือเลือกพอร์ตว่างใน `.env` แล้วรันใหม่
`FRONTEND_PORT`/`GATEWAY_PORT` ต้องเป็นคนละพอร์ต และ URL localhost ต้องตรงกับพอร์ตเหล่านั้น
API URL ฝังใน frontend ตอน build จาก `NEXT_PUBLIC_API_URL`: เปลี่ยน API URL แล้วต้อง deploy เพื่อ rebuild
`expose.ps1` ไม่เปลี่ยน image หรือ Secret ของแอปที่รันอยู่

ถ้าต้องพักเฉพาะทางเข้า ใช้ `docker stop reloop-production-local-access` (ข้อมูลยังอยู่)
ไม่ต้องใช้ `kind delete cluster` หรือ `kubectl delete namespace`
สำหรับ reverse proxy ให้ตั้ง URL เป็น HTTPS ที่ผู้ใช้เข้าถึงได้จริง และ proxy ไปยังพอร์ต localhost เดิม

ลองสมัคร/ล็อกอิน สร้างสินค้า สั่งซื้อ และแชตเพิ่มด้วยตนเอง
smoke ที่สคริปต์ตรวจไม่ใช่การพิสูจน์ทุก business flow
ถ้าเลือก `MAIL_TRANSPORT=log` จะอนุญาตเฉพาะ URL แบบ loopback:
ลิงก์ยืนยัน/รีเซ็ตรหัสผ่านจะแสดงใน auth logs จึงต้องจำกัดสิทธิ์อ่าน logs
การเปิดให้ผู้ใช้อื่นเข้าถึงต้องใช้ SMTP และตรวจการส่งอีเมลจริง

## 4. อัปเดตและ migration

Redis ชุดใหม่ใช้ PVC `redis-data` และ AOF (`appendfsync everysec`), ไม่ใช่ cache ที่ทิ้งได้
AOF อาจสูญเสียการเขียนล่าสุดประมาณ 1 วินาทีเมื่อเครื่องเสีย และไม่แทน off-machine backup
หากมี deployment เก่าที่ Redis ไม่ได้ใช้ PVC นี้ที่ `/data` พร้อม AOF สคริปต์จะหยุด **ก่อน build/apply**:
ต้องหยุด writers, บันทึกและสำรอง Redis, ตรวจ restore และแปลงเป็น AOF บน PVC แล้วจึงเปลี่ยน deployment ด้วยตนเอง
ห้ามคัดลอกแค่ `dump.rdb` แล้วเริ่มด้วย `appendonly=yes`: Redis อาจไม่โหลดข้อมูลจาก RDB
ต้องใช้ขั้นตอนแปลง AOF ที่ตรวจแล้วและยืนยันว่าข้อมูล/คิวครบก่อนเปลี่ยน startup
อย่าลบ Redis/namespace หรือสร้าง Redis ว่างเพื่อข้าม guard; session และคิวงานเดิมจะสูญหาย
ขั้นตอนย้าย Redis เก่ายังไม่ได้ทำอัตโนมัติในสคริปต์นี้

ไม่มีการ fetch/merge Git อัตโนมัติ: ผู้ใช้เลือกโค้ดที่จะทดสอบใน checkout ก่อน
สคริปต์ build จากไฟล์ใน checkout รวมถึงการแก้ที่ยังไม่ commit และใช้ image tag ใหม่ทุกรอบ

```powershell
# โค้ดเปลี่ยน แต่ไฟล์ฐานข้อมูลไม่เปลี่ยน
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/production-local/deploy.ps1

# ตรวจ migration แล้ว พร้อม downtime และ backup ก่อนแก้ schema
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/production-local/deploy.ps1 -Migrate
```

ชุดนี้ยังใช้ 1 replica และ Recreate จึงมี downtime แม้อัปเดตแบบไม่ migrate
`-Migrate` หยุดแอปทั้งหมดก่อน backup รวมถึง background workers ใน Pod เหล่านั้น
การเปลี่ยน schema ที่สูญเสียข้อมูลจะถูกปฏิเสธโดย Mongo db push; ต้องออกแบบ migration แยก ไม่ใส่ flag ข้าม
PostgreSQL init SQL ทำงานเฉพาะ volume ว่าง การแก้ init SQL ไม่ใช่ migration ของ DB เดิม
การเปลี่ยน Secret/ConfigMap จะใช้กับแอปชุดใหม่ เพราะแต่ละรอบใช้ image tag ใหม่และสร้าง Pod ใหม่

## 5. เมื่อล้มเหลวและการกู้คืน

ตรวจ artifacts ที่สคริปต์รายงาน:
- `deploy.log`: transcript ของการ build/deploy (เริ่มเก็บหลัง preflight)
- `*.log`: output ของ database Jobs
- `infra.rendered.yaml`, `apps.rendered.yaml`: manifests ของรอบนั้น ไม่มีค่า Secret
- `previous-deployments.json`: สถานะ Deployments ก่อนรอบนั้น ไม่ใช่สคริปต์ rollback อัตโนมัติ
- `postgres.sql`, `mongo.archive.gz`: มีเฉพาะรอบ `-Migrate` ที่ backup สำเร็จ

**ไฟล์ backup มีข้อมูลอ่อนไหว** เก็บโฟลเดอร์ `.state` บน disk ที่จำกัดสิทธิ์ผู้ใช้ ไม่ sync หรือเผยแพร่
backup นี้ไม่รวมไฟล์จาก application PVC และยังไม่แทนการทดสอบ restore ครบระบบ
ไม่มีการลบ backup หรือ image เก่าอัตโนมัติ ตรวจพื้นที่ disk เป็นระยะ

```powershell
kubectl --context kind-reloop-production-local -n reloop-production-local get pods,jobs,pvc
kubectl --context kind-reloop-production-local -n reloop-production-local logs deployment/auth-service --tail=100
# แทนชื่อ Job ด้วยชื่อจาก get jobs
kubectl --context kind-reloop-production-local -n reloop-production-local logs job/<ชื่อ-job>
kubectl --context kind-reloop-production-local -n reloop-production-local get events --sort-by=.metadata.creationTimestamp
```

ถ้าล้มเหลวระหว่าง migration แอปอาจยังหยุดอยู่; ถ้า rollout ล้มเหลวอาจมีแอปเก่า/ใหม่ปนกัน
อย่าเปิดแอปหรือ rollback image โดยเดาว่า schema ยังเข้ากันได้ ให้ตรวจ logs และ schema ก่อน
หาก Job จากรอบที่ขาดการเชื่อมต่อยัง active ต้องตรวจจนทราบสถานะก่อน rerun
Job ใหม่ใช้ชื่อรอบใหม่ ไม่ลบ Job เก่าทิ้งเพื่อซ่อนปัญหา
การ restore DB/ไฟล์และ rollback ต้องทำด้วยตนเองหลังตรวจความเข้ากันได้ ไม่รวมในสคริปต์นี้

หยุดเฉพาะ port-forward ด้วย Ctrl+C จะไม่หยุดแอปใน cluster
**อย่าใช้ `delete namespace`, `delete -k` หรือ `kind delete cluster` เป็นการพักระบบ** เพราะข้อมูล PVC อาจหาย

## 6. ตรวจไฟล์โดยไม่ deploy

```powershell
kubectl kustomize deploy/production-local
node --test deploy/production-local/deploy.test.cjs deploy/production-local/port-proxy.test.cjs
```

Tests ต้องมี `kubectl` และ dependencies จาก root `npm ci` (ใช้ js-yaml ที่มีใน dependency tree ของ ESLint)
บน Windows จะทดสอบสคริปต์ด้วย mocks: Docker ไม่พร้อม, namespace guard, active-Job guard, schema gate,
build failure, migration-status failure, normal update และการสร้าง migration Jobs ทั้ง 5 services
รวมทั้งการอ่าน `.env`, การถอด quote, การส่ง API URL ตอน build, รหัสตัวอย่าง/รหัสซ้ำ,
HTTPS/SMTP validation, guard Redis เก่าที่ไม่มี PVC และ bootstrap kind: มีอยู่แล้ว, PATH เก่า, ติดตั้งสำเร็จ, ไม่มี WinGet, ติดตั้งล้มเหลว,
หา kind ไม่พบหลังติดตั้ง, ระบบที่ไม่ใช่ Windows และ kind เดิมรันไม่ได้ โดยไม่ติดตั้งจริงใน tests
คำสั่ง mutating ทั้งหมดถูก mock; การ render kustomize ทำจริงโดยไม่ติดต่อ cluster
การทดสอบนี้ไม่ใช่หลักฐานว่า backup/restore หรือ migrations ทำงานกับ DB จริงแล้ว

## ขอบเขตก่อนเปิดสาธารณะ

ยังใช้ MongoDB ไม่มี authentication และ PVC อยู่ภายใน kind/Docker Desktop บนเครื่องเดียว
การลบ kind cluster, reset Docker Desktop หรือ disk เสีย อาจทำให้ข้อมูลทั้งหมดหาย
Redis มี PVC แล้ว แต่ backup ใน `-Migrate` ยังครอบคลุมเฉพาะ PostgreSQL/MongoDB:
ต้องสำรอง Redis และ application PVC เพิ่มนอกเครื่อง พร้อมทดสอบ restore ก่อนรับข้อมูลจริง
ไม่มีการ mount Kubernetes service-account token อัตโนมัติให้ workloads/Jobs
ยังไม่มี HTTPS/Ingress, registry/digests สำหรับหลายเครื่อง, managed secrets, NetworkPolicy,
monitoring, automatic rollback, object storage หรือ autoscaling
kind networking เริ่มต้นไม่ใช่หลักฐานว่ามี NetworkPolicy enforcement:
อย่าเปิดฐานข้อมูลหรือแอปสาธารณะจนกว่าจะจัด network isolation และตรวจจากเครือข่ายภายนอก
หากต้องการบริการที่เปิดใช้งานต่อเนื่องบน VM ให้ใช้ `../production-cloud/README.md`
image frontend ยังมี build tooling ติดมาด้วย ไม่ใช่ hardened/minimal production image
ควรตรวจ dependency vulnerabilities ที่ npm รายงานและทดสอบ restore ก่อนวางแผน production จริง
