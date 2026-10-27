# kind บนเครื่อง: พอร์ตถาวรโดยไม่ใช้ port-forward

ชุดนี้ย้าย development cluster `reloop-local` ไปยัง `reloop-local-fixed`
โดยคง namespace `reloop`, image, configuration, Secrets และข้อมูล PVC เดิม
ใช้ Python 3.11 ขึ้นไป, PowerShell, Docker Desktop (Linux containers), kind และ kubectl

## รันตามปกติ

จาก root repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/kind-local.ps1
```

สคริปต์เริ่ม node เดิม ตรวจพอร์ตที่ตั้งไว้ และตรวจ HTTP ของหน้าเว็บ, health และ product feed
หาก Services ถูก apply กลับเป็น ClusterIP สคริปต์จะคืน NodePort ของ frontend/gateway ให้ตรงกับพอร์ตถาวร
MongoDB รอ DNS ของ replica-set hostname ก่อนเริ่มทุกครั้ง เพื่อป้องกันสถานะ REMOVED หลัง node reboot
สคริปต์ติดตั้ง startup guard นี้ถ้ายังไม่มี แล้วรอฐานข้อมูลและทุก Deployment พร้อมก่อนรายงานสำเร็จ
ไม่ build image, ไม่เปลี่ยน schema, ไม่ seed และไม่ย้ายข้อมูลซ้ำ

- เว็บ: http://localhost:3000
- API: http://localhost:8080
- Context: `kind-reloop-local-fixed`
- Namespace: `reloop`

ทางเข้าเป็น Windows port → kind node port → Kubernetes NodePort → Pod
node ผูก `127.0.0.1:3000` → `30080` และ `127.0.0.1:8080` → `30081`
ไม่มี proxy container เพิ่ม และไม่ต้องมี terminal หรือ `kubectl port-forward` ค้างไว้
Docker node ใช้ restart policy `unless-stopped`; ต้องเปิด Docker Desktop หลังเปิดเครื่อง
หากหยุด node ด้วยมือ ให้รันคำสั่งด้านบนเพื่อเริ่มใหม่

## ย้ายจาก cluster เดิมครั้งเดียว

หยุด port-forward เดิมที่ใช้พอร์ต 3000/8080 ก่อน สคริปต์จะไม่ kill process ให้

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/kind-local.ps1 -Migrate
```

1. ตรวจ cluster ต้นทางแบบหนึ่ง node, PVC ที่ Bound, images บน Docker และพอร์ตว่าง
2. บันทึก resources พร้อมจำนวน replicas เดิมใน `.deploy-state/kind-local/<timestamp>/`
3. หยุด Deployments และรอ Pod หายก่อนหยุดฐานข้อมูล เพื่อคัดลอก PVC ขณะไม่มีผู้เขียน
4. สำรอง PVC ทุกตัวเป็น tar พร้อม SHA-256 แล้วหยุด node เดิม
5. สร้าง node ใหม่โดยใช้ kind image รุ่นเดียวกับต้นทาง พร้อม extraPortMappings
6. โหลด application images รุ่นที่ต้นทางใช้อยู่ สร้าง Services และ PVC ใหม่
7. คืนไฟล์ PVC พร้อมเจ้าของ/permissions และตรวจ tar checksum จากปลายทางก่อนเปิดแอป
8. รอฐานข้อมูลและแอปพร้อม ตรวจ HTTP ผ่าน localhost จริง

ข้อมูล Redis ของชุด development เดิมเป็นข้อมูลชั่วคราว ไม่มี PVC จึงไม่ถูกย้าย
cluster/volume ต้นทางไม่ถูกลบ และยังคงหยุดอยู่เพื่อไม่ให้มีข้อมูลสองชุดถูกเขียนพร้อมกัน
สำรองมี Secrets และข้อมูลส่วนตัว อยู่ใน `.deploy-state/` ที่ Git ignore ไว้ ห้ามเผยแพร่
สคริปต์ปฏิเสธการย้ายถ้ามี target cluster อยู่แล้ว เพื่อไม่เขียนทับข้อมูลปลายทาง
อย่า apply `deploy/k8s` กลับลง cluster ต้นทางเพื่อเปิดใช้งานข้อมูลเก่าคู่กัน

## หากย้ายไม่สำเร็จ

เก็บ backup และทั้งสอง cluster ไว้ ตรวจข้อความผิดพลาดก่อน ห้ามลบ PVC หรือ cluster เพื่อแก้ปัญหา
หากหยุดระหว่างคืน PVC และยังไม่ได้สร้าง Deployment/StatefulSet ปลายทาง สามารถทำต่อจาก backup ได้:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/kind-local.ps1 -ResumeBackup .deploy-state/kind-local/<timestamp>
```

คำสั่งนี้ปฏิเสธถ้าต้นทางยังรัน หรือปลายทางมี workloads แล้ว เพื่อไม่เขียนทับข้อมูลที่อาจเปลี่ยนไป
เมื่อยืนยันว่าต้องย้อนกลับ (ข้อมูลที่เขียนใหม่หลังย้ายจะไม่อยู่ในต้นทาง):

1. หยุด node ปลายทางถ้ามี: `docker stop reloop-local-fixed-control-plane`
2. เริ่มต้นทาง: `docker start reloop-local-control-plane`
3. อ่านไฟล์ `resources.json` ใน backup ล่าสุด แล้วคืน replicas ของ Deployment/StatefulSet ตามค่าที่บันทึก
   ด้วย `kubectl --context kind-reloop-local -n reloop scale <kind>/<name> --replicas=<value>`
4. รอฐานข้อมูลและแอปพร้อม แล้วเปิด port-forward แบบเดิมชั่วคราว

## ตรวจสอบ

```powershell
kubectl --context kind-reloop-local-fixed -n reloop get pods,svc,pvc
docker inspect reloop-local-fixed-control-plane --format '{{json .HostConfig.PortBindings}}'
python -m unittest discover -s deploy -p test_kind_local.py
```

การย้ายนี้รักษา development manifests เดิม ไม่ใช่การเปลี่ยนเป็น production deployment
