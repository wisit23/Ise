# คำสั่ง Kubernetes สำหรับ RE-LOOP production-local

ใช้ PowerShell จากโฟลเดอร์รากโปรเจกต์:

```powershell
Set-Location C:\ise\Ise
$ctx = "kind-reloop-production-local"
$ns = "reloop-production-local"
```

ตั้ง `$ctx` และ `$ns` ใหม่ทุกครั้งที่เปิด terminal ใหม่
ทุกคำสั่งด้านล่างระบุ context ชัดเจนเพื่อไม่สั่งงานผิด cluster
คู่มือตั้งค่า secrets และข้อจำกัด: [README.md](README.md)

## 1. ตรวจเครื่องมือ

```powershell
docker info
kubectl version --client
kind version
kind get clusters
kubectl config get-contexts
```

ถ้าไม่มี `kind` สคริปต์ deploy จะติดตั้งผ่าน WinGet ให้เมื่อไฟล์ secrets และ Docker พร้อม
ถ้าติดตั้งเองแล้ว terminal ยังหาไม่เจอ ให้เปิด PowerShell ใหม่

## 2. Deploy

ต้องเตรียม `deploy/production-local/secrets.local.env` ตาม README ก่อน
อย่าคัดลอกไฟล์ตัวอย่างทับ secrets ที่ตั้งค่าแล้ว

```powershell
# ครั้งแรก: สร้าง cluster ใหม่หากยังไม่มี และรัน migration
powershell -ExecutionPolicy Bypass -File deploy/production-local/deploy.ps1 -CreateCluster -Migrate

# อัปเดตโค้ดโดยไม่มีการเปลี่ยนไฟล์ฐานข้อมูล
powershell -ExecutionPolicy Bypass -File deploy/production-local/deploy.ps1

# ตรวจ migration แล้วจึงใช้คำสั่งนี้: หยุดแอป, backup และ migrate
powershell -ExecutionPolicy Bypass -File deploy/production-local/deploy.ps1 -Migrate
```

สคริปต์ build/load image ใหม่ให้ ไม่ดึง Git และไม่ seed ข้อมูลอัตโนมัติ
ชุดนี้ใช้ Recreate และ 1 replica จึงมี downtime ระหว่างอัปเดต
ไม่มี automatic rollback หาก migration ล้มเหลว แอปอาจยังหยุดอยู่ ให้ตรวจ logs ก่อนเปิดกลับ
อย่าใช้ `kubectl apply -k deploy/production-local` โดยตรง เพราะ overlay ใช้ image tag `unbuilt`

## 3. ดูสถานะ

```powershell
kubectl --context $ctx get nodes
kubectl --context $ctx -n $ns get pods,svc,pvc,jobs
kubectl --context $ctx -n $ns get deployments,statefulsets
kubectl --context $ctx -n $ns get pods -w
```

`-w` แสดงการเปลี่ยนแปลงต่อเนื่อง หยุดดูด้วย Ctrl+C โดยไม่หยุดแอป

## 4. เปิดเว็บ

เปิด terminal แยกสองหน้าต่าง ตั้ง `$ctx` และ `$ns` ในแต่ละหน้าต่างตามด้านบน
แล้วปล่อยคำสั่ง port-forward ทำงานไว้

หน้าต่างแรก:

```powershell
kubectl --context $ctx -n $ns port-forward service/frontend 3000:3000
```

หน้าต่างที่สอง:

```powershell
kubectl --context $ctx -n $ns port-forward service/gateway 8080:8080
```

- เว็บ: http://localhost:3000
- Gateway health: http://localhost:8080/health
- ถ้าพอร์ตชน Compose/dev ต้องจัดการโปรแกรมที่ใช้พอร์ตนั้นก่อน
- หยุด forward ด้วย Ctrl+C ไม่ได้หยุดแอปใน cluster
- ถ้า Pod ถูกแทนที่และ forward หลุด ให้รัน port-forward ใหม่
- Frontend ฝัง API URL ตอน build เป็น `http://localhost:8080` อย่าเปลี่ยนพอร์ต gateway โดยไม่ rebuild ให้ตรงกัน

## 5. ดู log และหาสาเหตุ

```powershell
# เปลี่ยน order-service เป็นชื่อ service ที่ต้องการ
kubectl --context $ctx -n $ns logs deployment/order-service --tail=100
kubectl --context $ctx -n $ns logs deployment/order-service -f

# ใช้ชื่อ Pod จริงจาก get pods; อ่าน log ของ container รอบก่อนที่ล้ม
kubectl --context $ctx -n $ns logs <ชื่อ-pod> --previous --tail=100
kubectl --context $ctx -n $ns describe pod <ชื่อ-pod>

kubectl --context $ctx -n $ns get events --sort-by=.metadata.creationTimestamp
kubectl --context $ctx -n $ns get jobs
kubectl --context $ctx -n $ns logs job/<ชื่อ-job>
```

แทน `<ชื่อ-pod>` และ `<ชื่อ-job>` ด้วยชื่อจริง ไม่พิมพ์เครื่องหมาย `<` หรือ `>`
หยุดติดตาม log แบบ `-f` ด้วย Ctrl+C
Auth logs อาจมีลิงก์ยืนยันอีเมล/รีเซ็ตรหัสผ่านจาก local log transport อย่าเผยแพร่ logs โดยไม่ตรวจข้อมูลอ่อนไหว

## 6. Restart แอปหนึ่งตัว

```powershell
kubectl --context $ctx -n $ns rollout restart deployment/order-service
kubectl --context $ctx -n $ns rollout status deployment/order-service --timeout=600s
```

เปลี่ยน `order-service` เป็น service ที่ต้องการ
Restart ใช้ image เดิม ไม่ได้ build โค้ดใหม่ หากแก้โค้ดให้รันสคริปต์ deploy

## 7. พักแอปและเปิดกลับ

```powershell
# พักแอป: DB และ Redis ยังทำงาน ข้อมูล PVC ยังอยู่
kubectl --context $ctx -n $ns scale deployment gateway frontend auth-service product-service order-service support-service chat-service --replicas=0

# เปิดแอปกลับ เมื่อ DB/schema พร้อมใช้งาน
kubectl --context $ctx -n $ns scale deployment gateway frontend auth-service product-service order-service support-service chat-service --replicas=1
```

อย่าใช้คำสั่งเปิดกลับเพื่อข้าม migration ที่ล้มเหลว ต้องตรวจ Job logs และ schema ก่อน
อย่าใช้ `delete namespace`, `delete -k` หรือ `kind delete cluster` เป็นการพักระบบ เพราะข้อมูล PVC อาจหาย

## 8. ตรวจ manifests และ tests โดยไม่ deploy

```powershell
kubectl kustomize deploy/production-local
node --test deploy/production-local/deploy.test.cjs
```

Tests ต้องมี root dependencies และ kubectl; บน Windows จะใช้ PowerShell tests ด้วย
Tests ใช้ mocks สำหรับคำสั่งที่แก้ระบบ ไม่ได้พิสูจน์ว่า migration/backup ทำงานกับ DB จริงครบแล้ว
ชุด production-local นี้ยังไม่พร้อมเปิดอินเทอร์เน็ตหรือเปิด autoscaling
