# Kubernetes production-local บน kind

ชุดนี้ใช้ **production images และขั้นตอน migration แยกจาก startup** สำหรับทดสอบในเครื่อง
ไม่ใช่ชุด production ที่เปิดใช้งานบนอินเทอร์เน็ต และไม่ใช้ `deploy.sh` ที่ root
Docker Compose และชุด dev ใน `deploy/k8s` ไม่ถูกเปลี่ยน

## สิ่งที่แยกจากระบบเดิม

- cluster: `reloop-production-local`
- context: `kind-reloop-production-local` (ทุกคำสั่งในสคริปต์ระบุ context ชัดเจน)
- namespace: `reloop-production-local`
- image: `reloop/production-local-<service>:<timestamp>-<random>` ไม่ใช้ tag เดิมซ้ำ
- Secret: `reloop-secrets` ภายใน namespace ใหม่นี้
- DB/PVC: สร้างใหม่ใน cluster ใหม่ ไม่มีการนำ Compose volumes หรือข้อมูล dev เข้ามา
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
Copy-Item deploy/secrets.example.env deploy/production-local/secrets.local.env
```

แก้ค่า `CHANGE_ME` ในไฟล์ใหม่ทุกค่าที่ใช้งาน:
- ใช้รหัสใหม่สำหรับการทดสอบนี้ ไม่ใช้รหัสจาก production จริง
- `POSTGRES_PASSWORD` ต้องตรงกับ password ใน PostgreSQL URLs ทั้ง 4 ตัว และ username เป็น `reloop`
- ใช้ password แบบ URL-safe หรือ URL-encode เมื่อใส่ใน URL
- URLs ต้องชี้ `postgres:5432/reloop_auth`, `reloop_product`, `reloop_order`, `reloop_support`
- Mongo URL ใช้ `mongodb://mongo:27017/reloop_chat?replicaSet=rs0&directConnection=true`
- JWT access, refresh และ internal token ใช้ค่าสุ่มแยกกัน แนะนำอย่างน้อย 32 bytes
- ไม่ต้องส่งค่า secret ในแชตหรือ commit ไฟล์นี้

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

เปิด PowerShell แยก 2 หน้าต่างและปล่อยทำงานไว้:

```powershell
kubectl --context kind-reloop-production-local -n reloop-production-local port-forward service/frontend 3000:3000
```

```powershell
kubectl --context kind-reloop-production-local -n reloop-production-local port-forward service/gateway 8080:8080
```

เข้า http://localhost:3000 และ http://localhost:8080/health
port-forward ใช้ localhost โดยค่าเริ่มต้น อย่าเปลี่ยนไป bind ทุก network interface
ถ้า port ชน Compose/dev ให้เลือกหยุด port-forward หรือระบบเดิมด้วยตนเองก่อน สคริปต์ไม่หยุดให้
API URL ฝังใน frontend ตอน build เป็น `http://localhost:8080`; การเปลี่ยนพอร์ตต้อง rebuild พร้อม build arg ที่ตรงกัน

ลองสมัคร/ล็อกอิน สร้างสินค้า สั่งซื้อ และแชตเพิ่มด้วยตนเอง
smoke ที่สคริปต์ตรวจไม่ใช่การพิสูจน์ทุก business flow
อีเมลใช้ log transport เพราะ URL เป็น localhost: ลิงก์ยืนยัน/รีเซ็ตรหัสผ่านจะแสดงใน auth logs

## 4. อัปเดตและ migration

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
node --test deploy/production-local/deploy.test.cjs
```

Tests ต้องมี `kubectl` และ dependencies จาก root `npm ci` (ใช้ js-yaml ที่มีใน dependency tree ของ ESLint)
บน Windows จะทดสอบสคริปต์ด้วย mocks: Docker ไม่พร้อม, namespace guard, active-Job guard, schema gate,
build failure, migration-status failure, normal update และการสร้าง migration Jobs ทั้ง 5 services
รวมทั้ง bootstrap kind: มีอยู่แล้ว, PATH เก่า, ติดตั้งสำเร็จ, ไม่มี WinGet, ติดตั้งล้มเหลว,
หา kind ไม่พบหลังติดตั้ง, ระบบที่ไม่ใช่ Windows และ kind เดิมรันไม่ได้ โดยไม่ติดตั้งจริงใน tests
คำสั่ง mutating ทั้งหมดถูก mock; การ render kustomize ทำจริงโดยไม่ติดต่อ cluster
การทดสอบนี้ไม่ใช่หลักฐานว่า backup/restore หรือ migrations ทำงานกับ DB จริงแล้ว

## ขอบเขตก่อนเปิดสาธารณะ

ยังใช้ MongoDB ไม่มี authentication, Redis ชั่วคราว และ local PVC เหมือนชุดฝึก
ยังไม่มี HTTPS/Ingress, registry/digests สำหรับหลายเครื่อง, managed secrets, NetworkPolicy,
monitoring, automatic rollback, object storage หรือ autoscaling
image frontend ยังมี build tooling ติดมาด้วย ไม่ใช่ hardened/minimal production image
ควรตรวจ dependency vulnerabilities ที่ npm รายงานและทดสอบ restore ก่อนวางแผน production จริง
