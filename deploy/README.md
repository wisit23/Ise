# Kubernetes สำหรับ RE-LOOP (ฝึกบนเครื่อง)

ชุดนี้เตรียมไฟล์ไว้เท่านั้น ยังไม่ได้ build image, สร้าง cluster หรือ deploy
คำสั่งด้านล่างเป็นบทเรียนให้คุณเลือกทำเมื่อพร้อม จาก PowerShell ที่โฟลเดอร์ราก repo `C:\ise\Ise`

ใช้ฐานข้อมูลชุดใหม่สำหรับเรียน ไม่ได้นำข้อมูลจาก Docker Compose เดิมเข้ามา
นี่เป็น local development: frontend ใช้ Next dev server, service ละ 1 replica,
MongoDB ไม่มี authentication, Redis เก็บข้อมูลชั่วคราว และยังไม่มี HTTPS/Ingress
ไม่ควรนำชุดนี้ไปเปิดบนอินเทอร์เน็ตโดยตรง

## 1. เข้าใจสิ่งที่ Kubernetes ทำ

Dockerfile เป็นสูตร build image ส่วน Kubernetes อ่าน YAML เพื่อรักษาระบบให้ตรงกับสิ่งที่เรากำหนด
เช่น ถ้ากำหนด gateway 1 replica แล้ว Pod หยุด ระบบจะสร้าง Pod ทดแทน

| คำศัพท์ | หน้าที่ | ตัวอย่างในโปรเจกต์ |
|---|---|---|
| Cluster | กลุ่มเครื่องที่รัน Kubernetes | cluster ชื่อ reloop-local |
| Node | เครื่องที่รัน Pod | container ของ kind ใน Docker |
| Pod | หน่วยที่รัน container | gateway หนึ่งชุด |
| Deployment | จัดการจำนวน Pod และการอัปเดต | auth-service, frontend |
| Service | ชื่อและช่องทางเชื่อมต่อที่คงที่ | http://order-service:3003 |
| StatefulSet | จัดการ Pod ที่ต้องมีชื่อและ storage คงที่ | postgres-0, mongo-0 |
| PVC | ขอพื้นที่เก็บข้อมูลถาวร | ข้อมูล DB, รูปสินค้า, ไฟล์แชต |
| ConfigMap | ค่าตั้งค่าทั่วไป | URL ของ service, port |
| Secret | ค่าที่ต้องจำกัดสิทธิ์เข้าถึง | JWT secret, รหัสฐานข้อมูล |
| Job | งานที่ทำจนสำเร็จแล้วจบ | ตั้งค่า Mongo replica set |
| Namespace | แยกกลุ่ม resource | reloop |

Secret ไม่ใช่การเข้ารหัสโดยอัตโนมัติ ต้องตั้ง encryption at rest และสิทธิ์เข้าถึงในระบบจริง

เส้นทางการเชื่อมต่อ:
Browser → frontend ที่ localhost:3000
Browser → gateway ที่ localhost:8080 → auth/product/order/chat/support
service → PostgreSQL / Redis / MongoDB ผ่านชื่อ Service ภายใน cluster

ชื่ออย่าง `postgres` ใช้ภายใน cluster; browser ต้องใช้ `localhost:8080` ตาม ConfigMap
จึงต้องเปิด port-forward ทั้ง frontend และ gateway

## 2. ไฟล์ที่เตรียมไว้

- `k8s/namespace.yaml`: namespace reloop
- `k8s/configmap.yaml`: ค่าตั้งค่าร่วม
- `secrets.example.env`: ตัวอย่างสำหรับสร้าง Secret; ไม่มีรหัสจริง
- `k8s/postgres-init.yaml`: สร้างฐานข้อมูล 4 ตัวเมื่อ PostgreSQL เริ่มด้วย volume ว่าง
- `k8s/postgres.yaml`: PostgreSQL และพื้นที่ข้อมูล 5Gi
- `k8s/mongo.yaml`: MongoDB 7, พื้นที่ 5Gi, Job ตั้ง replica set rs0
- `k8s/redis.yaml`: Redis สำหรับ local development
- `k8s/storage.yaml`: PVC สำหรับ uploads, reviews, evidence และ attachments
- `k8s/apps.yaml`: Deployment และ Service ของแอปทั้งหมด
- `k8s/kustomization.yaml`: รวม manifests เพื่อใช้กับ kubectl -k

Docker Compose เดิมใช้ MongoDB 4.4; ชุดนี้ใช้ MongoDB 7 กับ volume ใหม่
ห้ามนำ volume ของ MongoDB 4.4 มาเสียบตรง ๆ ต้องวางแผน upgrade/migration แยก
คำสั่งเริ่ม backend ถูก override เป็น prisma db push โดยไม่มี --accept-data-loss และไม่ seed อัตโนมัติ
หาก schema เปลี่ยนแบบสูญเสียข้อมูล แอปจะหยุดให้แก้ก่อน

## 3. เตรียมเครื่องเมื่อพร้อม

ต้องมี Docker Desktop (Linux containers), kubectl และ kind ติดตั้งไว้ก่อน
kind จะสร้าง Kubernetes node เป็น Docker container
ตั้ง memory ของ Docker ให้เพียงพอสำหรับหลาย service เช่นเริ่มที่ 8GB และเพิ่มหากมี OOMKilled

ลิงก์ติดตั้ง:
- [Docker Desktop สำหรับ Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [kubectl สำหรับ Windows](https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/)
- [kind quick start](https://kind.sigs.k8s.io/docs/user/quick-start/)

ตรวจเครื่องมือและสร้าง cluster เมื่อคุณพร้อมเท่านั้น:

```powershell
Set-Location C:\ise\Ise
docker version
kubectl version --client
kind version
kind create cluster --name reloop-local
kubectl config use-context kind-reloop-local
kubectl get nodes
kubectl get storageclass
```

ต้องมี default StorageClass สำหรับ PVC ถ้าไม่มี PVC จะ Pending
ตรวจ context ทุกครั้งก่อน apply เพื่อให้แน่ใจว่าเป็น cluster สำหรับเรียน

## 4. Build image และโหลดเข้า kind

Kubernetes ไม่ build Dockerfile ให้ ต้อง build ก่อน
คำสั่งนี้ใช้ Dockerfile ปัจจุบันของ repo และใส่ image tag ตรงกับ apps.yaml:

```powershell
$buildTargets = @(
  @{ Name = "gateway"; Dockerfile = "backend/gateway/Dockerfile" }
  @{ Name = "auth-service"; Dockerfile = "backend/services/auth-service/Dockerfile" }
  @{ Name = "product-service"; Dockerfile = "backend/services/product-service/Dockerfile" }
  @{ Name = "order-service"; Dockerfile = "backend/services/order-service/Dockerfile" }
  @{ Name = "chat-service"; Dockerfile = "backend/services/chat-service/Dockerfile" }
  @{ Name = "support-service"; Dockerfile = "backend/services/support-service/Dockerfile" }
  @{ Name = "frontend"; Dockerfile = "frontend/Dockerfile" }
)
foreach ($target in $buildTargets) {
  $localImage = "reloop/" + $target.Name + ":local"
  docker build -t $localImage -f $target.Dockerfile .
  if ($LASTEXITCODE -ne 0) { throw "Build failed: $localImage" }
  kind load docker-image $localImage --name reloop-local
  if ($LASTEXITCODE -ne 0) { throw "Load failed: $localImage" }
}
```

imagePullPolicy: Never หมายถึงใช้ image ที่โหลดเข้า node เท่านั้น
ถ้าเห็น ErrImageNeverPull แสดงว่าลืมโหลด image หรือชื่อ/tag ไม่ตรง
Dockerfile เดิมยังใช้ Node 22 แต่ root package.json ระบุ Node 24; หาก build มี engine error
ต้องปรับ Dockerfile/runtime ให้ตรงกันก่อน ชุดนี้ยังไม่ได้ทดสอบ build

## 5. เตรียม Secret

```powershell
Copy-Item deploy/secrets.example.env deploy/secrets.local.env
```

เปิด secrets.local.env แล้วเปลี่ยน CHANGE_ME ทุกตัว:
รหัส POSTGRES_PASSWORD ต้องตรงกับรหัสใน PostgreSQL URLs ทั้ง 4 ตัว
JWT access, refresh และ internal token ใช้ค่าคนละตัว
ใช้รหัส URL-safe หรือ encode รหัสใน URL
ไฟล์ secrets.local.env ถูก ignore; อย่า commit รหัสจริง

จากนั้นสร้าง namespace และ Secret:

```powershell
kubectl apply -f deploy/k8s/namespace.yaml
kubectl -n reloop create secret generic reloop-secrets --from-env-file=deploy/secrets.local.env
kubectl -n reloop apply -f deploy/k8s/configmap.yaml
```

ถ้ามี Secret ชื่อนี้อยู่แล้วและต้องการอัปเดต:

```powershell
kubectl -n reloop create secret generic reloop-secrets --from-env-file=deploy/secrets.local.env --dry-run=client -o yaml | kubectl apply -f -
```

อัปเดต Secret/ConfigMap แล้ว env ของ Pod เดิมจะไม่เปลี่ยนจน restart
เปลี่ยน POSTGRES_PASSWORD ภายหลังไม่เปลี่ยนรหัสในฐานข้อมูลที่สร้างแล้ว
ต้องเปลี่ยนรหัสใน PostgreSQL ด้วย ไม่ควรแก้ Secret อย่างเดียว

## 6. เริ่มฐานข้อมูลก่อน

```powershell
kubectl -n reloop apply -f deploy/k8s/postgres-init.yaml
kubectl -n reloop apply -f deploy/k8s/postgres.yaml
kubectl -n reloop apply -f deploy/k8s/mongo.yaml
kubectl -n reloop apply -f deploy/k8s/redis.yaml
kubectl -n reloop rollout status statefulset/postgres --timeout=300s
kubectl -n reloop wait --for=condition=complete job/mongo-init --timeout=600s
kubectl -n reloop rollout status statefulset/mongo --timeout=300s
kubectl -n reloop rollout status deployment/redis --timeout=300s
kubectl -n reloop get pvc
```

ต้องรอฐานข้อมูลพร้อมก่อนขั้นต่อไป เพราะ Kubernetes ไม่มี depends_on แบบ Compose
MongoDB ต้องเป็น replica set เพื่อให้ Prisma ใช้ transaction ได้
Job init จะตรวจว่าตั้งค่าแล้วหรือยัง และไม่ reset replica set เดิม

PostgreSQL init SQL ทำงานเฉพาะครั้งแรกที่ volume ว่าง
แก้ SQL ใน ConfigMap ภายหลังจะไม่สร้าง/แก้ฐานข้อมูลเดิมให้เอง

## 7. เริ่มแอป

```powershell
kubectl apply -k deploy/k8s
kubectl -n reloop get pods
kubectl -n reloop rollout status deployment/auth-service --timeout=600s
kubectl -n reloop rollout status deployment/product-service --timeout=600s
kubectl -n reloop rollout status deployment/order-service --timeout=600s
kubectl -n reloop rollout status deployment/chat-service --timeout=600s
kubectl -n reloop rollout status deployment/support-service --timeout=600s
kubectl -n reloop rollout status deployment/gateway --timeout=600s
kubectl -n reloop rollout status deployment/frontend --timeout=600s
```

kubectl apply สร้าง/อัปเดต resource ตาม YAML
startupProbe ให้เวลาเริ่มระบบ ส่วน readinessProbe ตรวจว่า Pod พร้อมรับ request หรือยัง
/health ของแอปอาจเป็นเพียงการตรวจ process; ต้องลอง flow จริงก่อนสรุปว่าทั้งระบบใช้งานได้

หากต้องการข้อมูล demo ให้ seed หลัง backend พร้อม (ไม่จำเป็นหากจะสมัครและสร้างสินค้าเอง):

```powershell
kubectl -n reloop exec deployment/auth-service -- npx prisma db seed
kubectl -n reloop exec deployment/product-service -- npx prisma db seed
kubectl -n reloop exec deployment/order-service -- npx prisma db seed
kubectl -n reloop exec deployment/support-service -- npx prisma db seed
```

seed มีบัญชี demo และข้อมูลสำหรับทดสอบ ใช้เฉพาะ cluster สำหรับเรียน

## 8. เปิดเว็บ

เปิด PowerShell แยก 2 หน้าต่าง และปล่อยคำสั่งทำงานไว้:

หน้าต่างแรก:
```powershell
kubectl -n reloop port-forward service/frontend 3000:3000
```

หน้าต่างที่สอง:
```powershell
kubectl -n reloop port-forward service/gateway 8080:8080
```

เข้า http://localhost:3000 และลอง API health ที่ http://localhost:8080/health
ถ้า port ชน Docker Compose เดิม ให้หยุดระบบเดิมก่อนเมื่อพร้อม
หากเปลี่ยน gateway port ต้องแก้ NEXT_PUBLIC_API_URL และ restart frontend ด้วย
NEXT_PUBLIC_* ของ production build จะถูกฝังตอน build; ชุด dev นี้อ่านเมื่อเริ่ม dev server

ลองสมัคร/ล็อกอิน สร้างสินค้า สั่งซื้อ และเปิดแชตเพื่อยืนยันการเชื่อมต่อจริง
port-forward เป็นทางเข้าเพื่อฝึก ไม่ใช่การเปิดเว็บไซต์สาธารณะ
ถ้า Pod ถูกแทนที่ การ forward อาจหลุด ให้รันคำสั่ง forward ใหม่

## 9. ดูปัญหาและอัปเดตโค้ด

```powershell
kubectl -n reloop get pods,svc,pvc
kubectl -n reloop logs deployment/order-service --tail=100
kubectl -n reloop logs deployment/order-service --previous --tail=100
kubectl -n reloop describe pod <ชื่อ-pod>
kubectl -n reloop get events --sort-by=.metadata.creationTimestamp
kubectl -n reloop logs job/mongo-init
```

- Pending: ตรวจ PVC, default StorageClass และ CPU/RAM
- ErrImageNeverPull: build และ kind load image ให้ครบ
- CrashLoopBackOff: อ่าน logs; ตรวจ Secret, DB readiness และ Prisma schema
- OOMKilled: เพิ่ม memory limit และตรวจ memory ของ Docker
- เว็บเปิดได้แต่ API ไม่ได้: ตรวจ gateway port-forward และ NEXT_PUBLIC_API_URL
- schema push ปฏิเสธ data loss: ทบทวน migration และสำรองข้อมูลก่อน ห้ามใส่ --accept-data-loss เพื่อข้ามโดยไม่ตรวจ

ตัวอย่างแก้ order-service แล้ว rebuild/load/restart (ทำเองเมื่อพร้อม):

```powershell
docker build -t reloop/order-service:local -f backend/services/order-service/Dockerfile .
# ทำบรรทัดถัดไปเฉพาะเมื่อ build สำเร็จ
kind load docker-image reloop/order-service:local --name reloop-local
kubectl -n reloop rollout restart deployment/order-service
kubectl -n reloop rollout status deployment/order-service --timeout=600s
```

ในชุดนี้ใช้ Recreate กับ 1 replica จึงมีช่วงหยุดให้บริการระหว่างอัปเดต
PVC เป็น ReadWriteOnce และไฟล์ยังอยู่บน disk จึงยังไม่เหมาะกับการเพิ่ม replica ของ service ที่ใช้ไฟล์
ก่อน scale ต้องออกแบบ object storage, งาน background และ migration ให้รองรับหลาย instance

## 10. หยุดแอปและการล้างข้อมูล

หยุด port-forward ด้วย Ctrl+C
หากต้องการพักแอปโดยเก็บ DB/PVC ไว้:

```powershell
kubectl -n reloop scale deployment gateway auth-service product-service order-service chat-service support-service frontend --replicas=0
```

DB และ Redis ยังทำงาน หากต้องการเปิดแอปอีกครั้งให้ใช้คำสั่งเดิมเปลี่ยนเป็น --replicas=1

คำสั่งต่อไปนี้เป็นการล้าง cluster สำหรับเรียน และอาจทำให้ข้อมูลบน local volumes หาย
ใช้เฉพาะเมื่อไม่ต้องการข้อมูลแล้วหรือสำรองไว้เรียบร้อย:

```powershell
kind delete cluster --name reloop-local
```

อย่าใช้ delete namespace หรือ delete -k เป็นคำสั่งพักระบบ เพราะมี PVC ที่อาจถูกลบไปด้วย

## 11. ก่อนใช้งานจริง

ต้องทำ production images (Node ตาม engines, Next build/start), migration Jobs แทน db push ตอน startup,
registry พร้อม immutable tags/digests, HTTPS/Ingress หรือ Gateway API,
authentication ของ DB/Redis, Secret management, backup/restore,
RBAC/NetworkPolicy, monitoring และ object storage สำหรับไฟล์
แยก production overlay และปรับจำนวน replica/ทรัพยากรตาม load ที่วัดจริง

เอกสารอ้างอิงทางการ:
- [Kubernetes basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- [ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/)
- [StatefulSet](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
